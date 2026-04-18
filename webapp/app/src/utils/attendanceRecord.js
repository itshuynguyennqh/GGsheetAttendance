export function hasAttendanceRecord(rec) {
  if (!rec) return false;
  return !!(String(rec.value || '').trim() || String(rec.note || '').trim());
}
