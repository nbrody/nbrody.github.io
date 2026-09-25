export const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];
export const slots = Array.from({ length: 120 }, (_, i) => ({ id: `${i % 5}-${Math.floor(i / 5)}`, day: i % 5, row: Math.floor(i / 5) }));
const validSlots = new Set(slots.map(s => s.id));
export function time(row) {
  const minutes = 480 + row * 30, hour = Math.floor(minutes / 60);
  return `${hour % 12 || 12}:${minutes % 60 ? '30' : '00'} ${hour < 12 ? 'am' : 'pm'}`;
}
export function slotLabel(id, length = 1) {
  const [day, row] = id.split('-').map(Number);
  return `${days[day]} ${time(row)}–${time(row + length)}`;
}
export function normalizeResponses(data) {
  return Object.values(data || {}).filter(r => r && typeof r.name === 'string' && r.name.trim()).map(r => ({ name: r.name.slice(0, 80), flexible: r.flexible === true, slots: [...new Set((Array.isArray(r.slots) ? r.slots : []).filter(s => validSlots.has(s)))] }));
}
export function bestWindows(responses) {
  return slots.filter(s => s.row < 23).map(s => ({
    label: slotLabel(s.id, 2), day: s.day, row: s.row,
    count: responses.filter(r => r.slots.includes(s.id) && r.slots.includes(`${s.day}-${s.row + 1}`)).length
  })).filter(s => s.count > 0).sort((a, b) => b.count - a.count || a.day - b.day || a.row - b.row);
}
