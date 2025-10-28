const { spawn } = require('node:child_process');
const os = require('node:os');

const config = require('../config');

const REQUEST_TIMEOUT_PATTERNS = [/Request timed out/i, /Esgotado o tempo/i, /Timed out/i];

const parseLatencyToken = (token) => {
  if (!token) {
    return null;
  }
  const trimmed = token.trim();
  if (trimmed === '*') {
    return null;
  }
  if (trimmed.startsWith('<')) {
    return 0;
  }
  const numericToken = trimmed.replace(/[^0-9.]/g, '');
  if (!numericToken) {
    return null;
  }
  const numeric = Number(numericToken);
  if (Number.isNaN(numeric)) {
    return null;
  }
  return Math.round(numeric);
};

const isTimeoutMessage = (segment) => {
  if (!segment) {
    return false;
  }
  return REQUEST_TIMEOUT_PATTERNS.some((pattern) => pattern.test(segment));
};

const extractIp = (segment) => {
  if (!segment || isTimeoutMessage(segment)) {
    return null;
  }
  const bracketMatch = segment.match(/\[([^\]]+)\]/);
  if (bracketMatch) {
    return bracketMatch[1];
  }
  const ipMatch = segment.match(/((?:\d{1,3}\.){3}\d{1,3}|[0-9a-f:]+)$/i);
  if (ipMatch) {
    return ipMatch[1];
  }
  return null;
};

const parseTracerouteOutput = (output) => {
  const hops = [];
  if (!output) {
    return hops;
  }
  const lines = output
    .split(/\r?\n/)
    .map((line) => line.trimEnd())
    .filter((line) => line.trim().length > 0);

  for (const line of lines) {
    const hopMatch = line.match(/^\s*(\d+)\s+(.*)$/);
    if (!hopMatch) {
      continue;
    }
    const hopNumber = Number(hopMatch[1]);
    if (!Number.isInteger(hopNumber)) {
      continue;
    }
    const rest = hopMatch[2];
    const rtts = [];
    const rttRegex = /(?:(?:<\d+)|\d+(?:\.\d+)?)\s*ms|\*/gi;
    let match;
    let lastIndex = 0;
    while ((match = rttRegex.exec(rest)) !== null && rtts.length < 3) {
      rtts.push(parseLatencyToken(match[0]));
      lastIndex = rttRegex.lastIndex;
    }
    while (rtts.length < 3) {
      rtts.push(null);
    }
    const ipSegment = rest.slice(lastIndex).trim();
    const hopEntry = {
      hop: hopNumber,
      rtt1_ms: rtts[0],
      rtt2_ms: rtts[1],
      rtt3_ms: rtts[2],
      ip: extractIp(ipSegment),
    };
    hops.push(hopEntry);
  }

  return hops;
};

const clampMaxHops = (value) => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) {
    return config.traceroute.maxHops;
  }
  const floored = Math.floor(numeric);
  return Math.max(1, Math.min(floored, config.traceroute.maxHops));
};

const resolveTimeout = (value) => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) {
    return config.traceroute.timeoutMs;
  }
  return Math.min(Math.floor(numeric), config.traceroute.timeoutMs);
};

const buildCommand = (target, maxHops, timeoutMs) => {
  const command = config.traceroute.command || (os.platform() === 'win32' ? 'tracert' : 'traceroute');
  if (command.toLowerCase() === 'tracert') {
    const perHopTimeout = Math.max(1000, Math.floor(timeoutMs / Math.max(maxHops, 1)));
    return {
      command: 'tracert',
      args: ['-d', '-h', String(maxHops), '-w', String(perHopTimeout), target],
    };
  }
  if (command.toLowerCase() === 'traceroute') {
    const secondsTimeout = Math.max(1, Math.round(timeoutMs / 1000));
    return {
      command: 'traceroute',
      args: ['-n', '-m', String(maxHops), '-w', String(secondsTimeout), target],
    };
  }
  return { command, args: [target] };
};

const runTraceroute = async (target, options = {}) => {
  const sanitizedTarget = typeof target === 'string' && target.trim().length > 0
    ? target.trim()
    : config.traceroute.defaultTarget;

  const maxHops = clampMaxHops(options.maxHops);
  const timeoutMs = resolveTimeout(options.timeoutMs);

  const { command, args } = buildCommand(sanitizedTarget, maxHops, timeoutMs);

  const ts = Date.now();
  const result = {
    ts,
    target: sanitizedTarget,
    success: 0,
    hops: [],
  };

  try {
    const child = spawn(command, args, {
      windowsHide: true,
    });

    let stdout = '';
    let stderr = '';
    let spawnError = null;

    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');

    child.stdout.on('data', (chunk) => {
      stdout += chunk;
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk;
    });
    child.on('error', (error) => {
      spawnError = error;
    });

    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill();
    }, timeoutMs).unref();

    const exitCode = await new Promise((resolve) => {
      let settled = false;
      const finish = (code) => {
        if (!settled) {
          settled = true;
          resolve(code);
        }
      };
      child.on('exit', finish);
      child.on('close', finish);
      child.on('error', () => finish(null));
    });

    clearTimeout(timer);

    result.hops = parseTracerouteOutput(stdout);

    if (!timedOut && !spawnError && (exitCode === 0 || (stdout && result.hops.length > 0))) {
      result.success = 1;
    }

    if (timedOut || spawnError) {
      result.success = 0;
    }

    if (!result.success && stderr) {
      result.success = 0;
    }
  } catch (error) {
    result.success = 0;
  }

  return result;
};

module.exports = {
  runTraceroute,
  parseTracerouteOutput,
};
