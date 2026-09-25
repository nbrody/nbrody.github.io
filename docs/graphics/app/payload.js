// JSON payloads use control selectors as keys and primitive values.
export function normalizePayload(value = {}) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Payload must be a JSON object.');
  const result = {};
  for (const [key, entry] of Object.entries(value)) {
    const v = entry && typeof entry === 'object' && 'value' in entry ? entry.value : entry;
    if (!['string', 'number', 'boolean'].includes(typeof v) || (typeof v === 'number' && !Number.isFinite(v)))
      throw new Error(`Invalid value for ${key}. Use a string, number, or boolean.`);
    result[key] = v;
  }
  return result;
}
export function normalizeItem(item) {
  return { vizId: item.vizId, duration: Number(item.duration) > 0 ? Number(item.duration) : null,
    payload: normalizePayload(item.payload ?? item.state ?? {}) };
}
