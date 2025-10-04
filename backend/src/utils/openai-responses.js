const TEXTUAL_TYPES = new Set(['text', 'output_text']);

const pickFirstString = (value) => {
  if (typeof value === 'string' && value.trim().length > 0) {
    return value.trim();
  }

  return null;
};

const extractFromEntry = (entry) => {
  if (!entry || typeof entry !== 'object') {
    if (typeof entry === 'string') {
      return pickFirstString(entry);
    }

    return null;
  }

  const { type } = entry;
  if (typeof type !== 'string' || !TEXTUAL_TYPES.has(type)) {
    return null;
  }

  const candidates = [entry.text, entry.data, entry.output_text, entry.value, entry.content];

  for (const candidate of candidates) {
    const text = pickFirstString(candidate);
    if (text) {
      return text;
    }
  }

  return null;
};

const extractTextFromResponses = (response) => {
  if (!response || typeof response !== 'object') {
    return null;
  }

  const directOutput = pickFirstString(response.output_text);
  if (directOutput) {
    return directOutput;
  }

  if (Array.isArray(response.output)) {
    const parts = [];

    for (const chunk of response.output) {
      if (!chunk || !Array.isArray(chunk.content)) {
        continue;
      }

      for (const entry of chunk.content) {
        const extracted = extractFromEntry(entry);
        if (extracted) {
          parts.push(extracted);
        }
      }
    }

    if (parts.length > 0) {
      return parts.join('\n\n').trim();
    }
  }

  return null;
};

module.exports = {
  extractTextFromResponses,
};

