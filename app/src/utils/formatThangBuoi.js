/**
 * DB / nhãn buổi: thang = YYYY.MM, cột lưới = YYYY.MM-BB (sort tăng = thời gian tăng).
 */
export function parseThang(thang) {
  if (thang == null || thang === '') return null;
  const parts = String(thang).trim().split(/[.\/]/);
  if (parts.length < 2) return null;
  const a = parseInt(parts[0], 10);
  const b = parseInt(parts[1], 10);
  if (Number.isNaN(a) || Number.isNaN(b)) return null;
  let month;
  let year;
  if (a >= 1000) {
    year = a;
    month = b;
  } else {
    month = a;
    year = b;
  }
  if (month < 1 || month > 12) return null;
  return { month, year };
}

export function formatThangBuoiLabel(thang, buoi) {
  const hasT = thang != null && String(thang).trim() !== '';
  const buNum = Number(buoi);
  const hasB = buoi != null && String(buoi).trim() !== '' && !Number.isNaN(buNum);
  if (!hasT && !hasB) return null;

  if (hasT && hasB) {
    const p = parseThang(thang);
    if (!p) {
      const t = String(thang || '').trim();
      return `${t}-B${String(buNum).padStart(2, '0')}`;
    }
    const t = `${p.year}.${String(p.month).padStart(2, '0')}`;
    return `${t}-B${String(buNum).padStart(2, '0')}`;
  }

  if (hasT) {
    const p = parseThang(thang);
    if (p) return `${p.year}.${String(p.month).padStart(2, '0')} (chưa buổi)`;
    return `${String(thang).trim()} (chưa buổi)`;
  }

  return `Buổi ${String(buNum).padStart(2, '0')} (chưa tháng)`;
}

/** So sánh hai nhãn YYYY.MM-BB (hoặc legacy MM.YYYY-BB) */
export function compareThangBuoiLabel(a, b) {
  const parse = (key) => {
    const m = String(key).match(/^(\d{4})\.(\d{2})-B(\d+)$/);
    if (m) return { y: +m[1], mo: +m[2], bu: +m[3] };
    const m2 = String(key).match(/^(\d{2})\.(\d{4})-B(\d+)$/);
    if (m2) return { y: +m2[2], mo: +m2[1], bu: +m2[3] };
    const parts = String(key).split('-B');
    const th = parts[0].split('.');
    const a0 = +(th[0] || 0);
    const a1 = +(th[1] || 0);
    if (a0 >= 1000) return { y: a0, mo: a1, bu: +(parts[1] || 0) };
    return { y: a1, mo: a0, bu: +(parts[1] || 0) };
  };
  const pa = parse(a);
  const pb = parse(b);
  if (pa.y !== pb.y) return pa.y - pb.y;
  if (pa.mo !== pb.mo) return pa.mo - pb.mo;
  return pa.bu - pb.bu;
}
