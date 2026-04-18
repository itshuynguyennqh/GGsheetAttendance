/**
 * Parse Excel for attendance import. Kiểu dài (7 cột): Mã HV, Họ tên, Tên, Lớp, Tháng, Buổi, Điểm danh.
 */

import * as XLSX from 'xlsx';

const VALID_VALUES = new Set(['X', 'B', 'M', 'P', '', '-']);
const MA_HV_HEADERS = ['mã hv', 'mã học viên', 'ma hv', 'ma hoc vien', 'mahv'];
const HO_TEN_HEADERS = ['họ tên', 'ho ten', 'họ và tên', 'ho va ten', 'hoten'];
const TEN_HEADERS = ['tên', 'ten'];
const LOP_HEADERS = ['lớp', 'lop', 'class'];
const THANG_HEADERS = ['tháng', 'thang'];
const BUOI_HEADERS = ['buổi', 'buoi'];
const DIEM_DANH_HEADERS = ['điểm danh', 'diem danh', 'điem danh'];

export async function parseExcelFile(file) {
  const buffer = await file.arrayBuffer();
  const data = new Uint8Array(buffer);
  const workbook = XLSX.read(data, { type: 'array' });
  const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(firstSheet, { header: 1, defval: '' });
  return rows;
}

/**
 * Detect 7-column long format: Mã HV, Họ tên, Tên, Lớp, Tháng, Buổi, Điểm danh.
 * Returns { format: 'long', maHVCol, hoTenCol, tenCol, lopCol, thangCol, buoiCol, diemDanhCol } or null.
 */
function detectLongFormatMapping(headers) {
  const normalized = (headers || []).map(h => String(h ?? '').trim().toLowerCase());
  if (normalized.length < 7) return null;
  let maHVCol = -1;
  let hoTenCol = -1;
  let tenCol = -1;
  let lopCol = -1;
  let thangCol = -1;
  let buoiCol = -1;
  let diemDanhCol = -1;
  for (let i = 0; i < normalized.length; i++) {
    const h = normalized[i];
    if (MA_HV_HEADERS.some(k => h === k || h.includes(k))) maHVCol = i;
    else if (HO_TEN_HEADERS.some(k => h === k || h.includes(k))) hoTenCol = i;
    else if (TEN_HEADERS.some(k => h === k || h.includes(k)) && hoTenCol !== i) tenCol = i;
    else if (LOP_HEADERS.some(k => h === k || h.includes(k))) lopCol = i;
    else if (THANG_HEADERS.some(k => h === k || h.includes(k))) thangCol = i;
    else if (BUOI_HEADERS.some(k => h === k || h.includes(k))) buoiCol = i;
    else if (DIEM_DANH_HEADERS.some(k => h === k || h.includes(k))) diemDanhCol = i;
  }
  const hasAll =
    maHVCol >= 0 && hoTenCol >= 0 && lopCol >= 0 && thangCol >= 0 && buoiCol >= 0 && diemDanhCol >= 0;
  if (!hasAll) return null;
  return {
    format: 'long',
    maHVCol,
    hoTenCol,
    tenCol: tenCol >= 0 ? tenCol : hoTenCol,
    lopCol,
    thangCol,
    buoiCol,
    diemDanhCol,
  };
}

/**
 * Returns long format mapping or null if format is not supported.
 */
export function parseHeaderMapping(headers) {
  return detectLongFormatMapping(headers);
}

export function resolveClassIdFromName(className, classes) {
  if (!className || !Array.isArray(classes) || classes.length === 0) return null;
  const raw = String(className).trim();
  if (!raw) return null;
  const normalized = raw.replace(/\s+/g, ' ').toLowerCase();
  const match = classes.find(c => {
    const n = (c.name || '').trim().replace(/\s+/g, ' ').toLowerCase();
    return n === normalized || n === raw || n.endsWith(normalized) || normalized.endsWith(n) || n.includes(normalized) || normalized.includes(n);
  });
  return match ? match.id : null;
}

/**
 * Parse rows in 7-column long format into { maHV, hoTen, classId, records }.
 * Each row = one record (thang, buoi, value). Value only M, B, X, P (uppercase).
 */
export function parseAttendanceDataLongFormat(rows, mapping, classesOrClassId) {
  const {
    maHVCol,
    hoTenCol,
    tenCol,
    lopCol,
    thangCol,
    buoiCol,
    diemDanhCol,
  } = mapping;
  const classes = Array.isArray(classesOrClassId) ? classesOrClassId : null;
  const fallbackClassId = !Array.isArray(classesOrClassId) && classesOrClassId != null ? Number(classesOrClassId) : null;
  const dataRows = rows.slice(1);
  const byStudent = new Map();

  for (let r = 0; r < dataRows.length; r++) {
    const row = dataRows[r] || [];
    const diemDanhRaw = diemDanhCol >= 0 ? String(row[diemDanhCol] ?? '').trim() : '';
    const value = diemDanhRaw === '' || diemDanhRaw === '-' ? '' : diemDanhRaw.toUpperCase().trim();
    if (value !== '' && !VALID_VALUES.has(value)) continue;
    if (value === '') continue;
    const normalizedValue = value;
    const maHV = maHVCol >= 0 ? String(row[maHVCol] ?? '').trim() : '';
    const hoTen = hoTenCol >= 0 ? String(row[hoTenCol] ?? '').trim() : '';
    const ten = tenCol >= 0 ? String(row[tenCol] ?? '').trim() : '';
    const thangRaw = thangCol >= 0 ? String(row[thangCol] ?? '').trim() : '';
    const buoiRaw = buoiCol >= 0 ? row[buoiCol] : null;
    const thang = thangRaw.replace(/\s+/g, '').replace(/^tháng\s*/i, '').replace(/\//g, '.');
    const buoi = buoiRaw != null && buoiRaw !== '' ? parseInt(Number(buoiRaw), 10) : NaN;
    if (!thang || isNaN(buoi) || buoi < 1) continue;
    if (!maHV && !hoTen) continue;

    let classId = fallbackClassId;
    if (lopCol >= 0 && classes) {
      const className = row[lopCol] != null ? String(row[lopCol]).trim() : '';
      classId = resolveClassIdFromName(className, classes);
    }

    const key = `${maHV}|${hoTen}|${ten}|${classId ?? ''}`;
    if (!byStudent.has(key)) {
      byStudent.set(key, {
        rowIndex: r + 1,
        maHV,
        hoTen,
        ten,
        classId: classId ?? null,
        records: [],
      });
    }
    byStudent.get(key).records.push({
      thang,
      buoi,
      value: normalizedValue,
      note: '',
    });
  }

  return Array.from(byStudent.values()).map((item, idx) => ({
    ...item,
    rowIndex: item.rowIndex,
  }));
}

export function transformToImportFormat(parsedData) {
  return parsedData.map(row => ({
    maHV: row.maHV,
    hoTen: row.hoTen,
    classId: row.classId,
    records: (row.records || []).filter(rec => rec.thang && rec.buoi != null),
  }));
}

export function formatPreviewData(parsedData, validationResult) {
  const preview = validationResult?.preview || [];
  const byRow = new Map(preview.map((p) => [p.rowIndex, p]));

  return parsedData.map(row => {
    const v = byRow.get(row.rowIndex) || {};
    const vRecordsByKey = new Map(
      (v.records || []).map((r) => [`${r.thang}-${r.buoi}`, r])
    );
    return {
      ...row,
      student: v.student ?? null,
      className: v.className ?? null,
      records: (row.records || []).map((rec) => {
        const key = rec.thang && rec.buoi != null ? `${rec.thang}-${rec.buoi}` : null;
        const detail = key ? vRecordsByKey.get(key) : null;
        return {
          ...rec,
          session: detail?.session ?? null,
          attendance: detail?.attendance ?? null,
        };
      }),
      warnings: v.warnings || [],
      errors: v.errors || [],
      status: (v.errors?.length ?? 0) > 0 ? 'error' : (v.warnings?.length ?? 0) > 0 ? 'warning' : 'valid',
    };
  });
}
