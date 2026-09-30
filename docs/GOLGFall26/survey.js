export const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];
// Row r is the half hour starting 30r minutes after 8:00 am. Stored responses use
// these ids, so the 9 am–5 pm window lists rows 2–17 rather than renumbering them.
export const rows = Array.from({ length: 16 }, (_, i) => i + 2);
export const blocks = [{ day: 2, row: 12, span: 2 }]; // Wednesday 2–3 pm
export const blockAt = (day, row) => blocks.find(b => b.day === day && row >= b.row && row < b.row + b.span);
export const slots = rows.flatMap(row => days.map((_, day) => ({ id: `${day}-${row}`, day, row }))).filter(s => !blockAt(s.day, s.row));
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
  return slots.filter(s => validSlots.has(`${s.day}-${s.row + 1}`)).map(s => ({
    label: slotLabel(s.id, 2), day: s.day, row: s.row,
    count: responses.filter(r => r.slots.includes(s.id) && r.slots.includes(`${s.day}-${s.row + 1}`)).length
  })).filter(s => s.count > 0).sort((a, b) => b.count - a.count || a.day - b.day || a.row - b.row);
}
