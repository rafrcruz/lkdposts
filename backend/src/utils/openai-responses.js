const TEXTUAL_TYPES = new Set(['text', 'output_text', 'summary_text', 'refusal']);

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

  const candidates = [
    entry.text,
    entry.data,
    entry.output_text,
    entry.summary_text,
    entry.refusal,
    entry.value,
    entry.content,
  ];

  for (const candidate of candidates) {
    const text = pickFirstString(candidate);
    if (text) {
      return text;
    }
  }

  return null;
};

const gatherOutputContent = (output) => {
  if (!Array.isArray(output)) {
    return [];
  }

  return output
    .flatMap((chunk) => (chunk && Array.isArray(chunk.content) ? chunk.content : []))
    .map((entry) => extractFromEntry(entry))
    .filter(Boolean);
};

const extractTextFromResponses = (response) => {
  if (!response || typeof response !== 'object') {
    return null;
  }

  const directOutput = pickFirstString(response.output_text);
  if (directOutput) {
    return directOutput;
  }

  const parts = gatherOutputContent(response.output);
  if (parts.length === 0) {
    return null;
  }

  return parts.join('\n\n').trim();
};

module.exports = {
  extractTextFromResponses,
};

