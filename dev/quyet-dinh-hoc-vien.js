/**
 * Logic xác định học viên đã thôi học và build sheet "Quyết định học viên".
 * Dựa trên dữ liệu sheet Gộp_Nối_Tiếp.
 *
 * Tiêu chí "đã thôi học": Buổi cuối cùng có điểm danh (X/B/M/P) là trước Buổi 5 tháng 1.2026.
 *
 * Cấu trúc sheet "Quyết định học viên":
 * - Mã HV, Họ tên, Lớp
 * - Trạng thái: bắt đầu nhập học | nghỉ học | tái tục
 * - Ghi chú (Lịch sử chăm sóc): lý do nghỉ, đã chăm sóc, feedback học viên
 */

(function(global) {
  'use strict';

  var CUTOFF = { thang: '1.2026', buoi: 5 };

  function isAttend(val) {
    var x = String(val || '').trim().toUpperCase();
    return x === 'X' || x === 'B' || x === 'M';
  }

  function extractAttendanceVal(val) {
    if (val === '' || val === null || val === undefined) return '';
    var text = String(val).trim();
    if (text === '') return '';
    var parts = text.split('||');
    if (parts.length >= 3) return parts[parts.length - 1].trim();
    return text;
  }

  function parseThangBuoi(cell) {
    if (!cell || String(cell).trim() === '') return null;
    var s = String(cell).trim();
    if (s.indexOf('||') === -1) return null;
    var parts = s.split('||');
    if (parts.length < 2) return null;
    var thang = parts[0].replace(/^Tháng\s*/i, '').trim();
    var buoiMatch = parts[1].match(/^Buổi\s*(\d+)/i);
    var buoi = buoiMatch ? parseInt(buoiMatch[1], 10) : NaN;
    if (!thang && isNaN(buoi)) return null;
    return { thang: thang || null, buoi: isNaN(buoi) ? null : buoi };
  }

  function parseThangForSort(thang) {
    if (!thang || typeof thang !== 'string') return { year: 0, month: 0 };
    var parts = thang.trim().split(/[.\/]/);
    var a = parseInt(parts[0], 10) || 0, b = parseInt(parts[1], 10) || 0;
    if (a >= 1000) return { year: a, month: b };
    return { year: b, month: a };
  }

  /**
   * So sánh (thang, buoi) với cutoff. Trả về true nếu (thang, buoi) < cutoff (trước cutoff).
   */
  function isBeforeCutoff(thang, buoi, cutoff) {
    cutoff = cutoff || CUTOFF;
    var cThang = parseThangForSort(cutoff.thang);
    var cBuoi = cutoff.buoi != null ? cutoff.buoi : 0;
    var p = parseThangForSort(thang);
    var b = buoi != null ? buoi : 0;
    if (p.year < cThang.year) return true;
    if (p.year > cThang.year) return false;
    if (p.month < cThang.month) return true;
    if (p.month > cThang.month) return false;
    return b < cBuoi;
  }

  function isLongFormat(headerRow) {
    if (!headerRow || headerRow.length < 7) return false;
    var h4 = String(headerRow[4] || '').toLowerCase();
    var h5 = String(headerRow[5] || '').toLowerCase();
    return (h4.indexOf('tháng') >= 0 || h4 === 'thang') && (h5.indexOf('buổi') >= 0 || h5 === 'buoi');
  }

  /**
   * Từ rows (sau parseCSV), lấy danh sách học viên với trạng thái quyết định.
   * Hỗ trợ format long (Mã HV,Họ tên,Tên,Lớp,Tháng,Buổi,Điểm danh) và wide (cũ).
   */
  function getQuyetDinhHocVienFromRows(rows, cutoff, options) {
    cutoff = cutoff || CUTOFF;
    options = options || {};
    var data = rows;
    if (data.length < 2) return [];
    if (isLongFormat(data[0])) {
      return getQuyetDinhFromLongFormat(data, cutoff, options);
    }
    return getQuyetDinhFromWideFormat(data, cutoff, options);
  }

  function getQuyetDinhFromLongFormat(data, cutoff, options) {
    var debug = options.debug === true;
    var colMaHV = 0, colHoTen = 1, colTen = 2, colLop = 3, colThang = 4, colBuoi = 5, colDiemDanh = 6;
    var byStudent = {};
    for (var i = 1; i < data.length; i++) {
      var row = data[i];
      var maHV = row[colMaHV];
      if (!maHV) continue;
      var thang = String(row[colThang] || '').trim();
      var buoi = row[colBuoi] != null ? parseInt(row[colBuoi], 10) : null;
      var val = String(row[colDiemDanh] || '').trim();
      if (!thang || buoi == null || isNaN(buoi)) continue;
      if (!byStudent[maHV]) byStudent[maHV] = { info: [row[colMaHV], row[colHoTen], row[colTen], row[colLop]], attended: [] };
      if (isAttend(val)) {
        byStudent[maHV].attended.push({ thang: thang, buoi: buoi });
      }
    }
    var result = [];
    for (var maHV in byStudent) {
      if (!byStudent.hasOwnProperty(maHV)) continue;
      var st = byStudent[maHV];
      var attended = st.attended;
      attended.sort(function(a, b) {
        var pa = parseThangForSort(a.thang);
        var pb = parseThangForSort(b.thang);
        if (pa.year !== pb.year) return pa.year - pb.year;
        if (pa.month !== pb.month) return pa.month - pb.month;
        return (a.buoi || 0) - (b.buoi || 0);
      });
      var lastAttended = attended.length > 0 ? attended[attended.length - 1] : null;
      var trangThai;
      if (!lastAttended) {
        trangThai = 'bắt đầu nhập học';
      } else if (isBeforeCutoff(lastAttended.thang, lastAttended.buoi, cutoff)) {
        trangThai = 'nghỉ học';
      } else {
        trangThai = 'đang học';
      }
      if (options.onlyDroppedOut && trangThai !== 'nghỉ học') continue;
      result.push({
        maHV: maHV,
        hoTen: st.info[1] || '',
        ten: st.info[2] || '',
        lop: st.info[3] || '',
        trangThai: trangThai,
        buoiCuoiCung: lastAttended ? formatBuoiLabel(lastAttended) : '',
        ghiChu: ''
      });
    }
    return result;
  }

  function getQuyetDinhFromWideFormat(data, cutoff, options) {
    var debug = options.debug === true;
    var attendanceStartIndex = 4;
    var numCols = data[0] ? data[0].length : 0;
    var colMeta = {};
    for (var c = attendanceStartIndex; c < numCols; c++) colMeta[c] = null;
    for (var c = attendanceStartIndex; c < numCols; c++) {
      var parsed = parseThangBuoi(data[0][c]);
      if (parsed) colMeta[c] = parsed;
    }
    for (var i = 1; i < data.length; i++) {
      for (var c = attendanceStartIndex; c < numCols; c++) {
        if (colMeta[c] !== null) continue;
        var parsed = parseThangBuoi(data[i][c]);
        if (parsed) colMeta[c] = parsed;
      }
    }
    var entries = [];
    for (var c = attendanceStartIndex; c < numCols; c++) {
      var m = colMeta[c];
      entries.push({ colIndex: c, thang: m ? m.thang : null, buoi: m && m.buoi != null ? m.buoi : null });
    }
    entries.sort(function(a, b) {
      var pa = parseThangForSort(a.thang);
      var pb = parseThangForSort(b.thang);
      if (pa.year !== pb.year) return pa.year - pb.year;
      if (pa.month !== pb.month) return pa.month - pb.month;
      var buoiA = a.buoi != null ? a.buoi : 0;
      var buoiB = b.buoi != null ? b.buoi : 0;
      if (buoiA !== buoiB) return buoiA - buoiB;
      return a.colIndex - b.colIndex;
    });

    var result = [];
    for (var i = 1; i < data.length; i++) {
      var row = data[i];
      var maHV = row[0];
      if (!maHV) continue;
      var lastAttended = null;
      var hasAnySessionData = false;
      for (var c = numCols - 1; c >= attendanceStartIndex; c--) {
        var cellRaw = row[c];
        if (cellRaw === undefined || cellRaw === null) continue;
        var val = extractAttendanceVal(cellRaw);
        var valStr = String(val || '').trim();
        if (valStr !== '') hasAnySessionData = true;
        if (isAttend(val)) {
          var meta = parseThangBuoi(cellRaw) || colMeta[c];
          var thang = (meta && meta.thang != null) ? meta.thang : null;
          var buoi = (meta && meta.buoi != null) ? meta.buoi : null;
          lastAttended = { thang: thang, buoi: buoi, label: formatBuoiLabel({ thang: thang, buoi: buoi }) };
          break;
        }
      }
      var trangThai;
      if (!lastAttended) {
        trangThai = hasAnySessionData ? 'nghỉ học' : 'bắt đầu nhập học';
      } else if (isBeforeCutoff(lastAttended.thang, lastAttended.buoi, cutoff)) {
        trangThai = 'nghỉ học';
      } else {
        trangThai = 'đang học';
      }
      if (options.onlyDroppedOut && trangThai !== 'nghỉ học') continue;
      result.push({
        maHV: maHV,
        hoTen: row[1] || '',
        ten: row[2] || '',
        lop: row[3] || '',
        trangThai: trangThai,
        buoiCuoiCung: lastAttended ? lastAttended.label : '',
        ghiChu: ''
      });
    }
    return result;
  }

  function formatBuoiLabel(entry) {
    if (!entry || entry.buoi == null) return '';
    var p = parseThangForSort(entry.thang);
    if (p.year && p.month >= 1 && p.month <= 12) {
      var mo = ('0' + p.month).slice(-2);
      var bb = ('0' + parseInt(entry.buoi, 10)).slice(-2);
      return p.year + '.' + mo + '-B' + bb;
    }
    return (entry.thang || '') + '-B' + entry.buoi;
  }

  /**
   * Chuyển mảng quyết định sang CSV (dùng dấu phẩy, bọc trong dấu ngoặc kép nếu có dấu phẩy).
   */
  function toCSV(items) {
    var header = ['Mã HV', 'Họ tên', 'Lớp', 'Trạng thái', 'Buổi cuối cùng', 'Ghi chú (Lịch sử chăm sóc)'];
    var lines = [escapeCSVCell(header.join(','))];
    (items || []).forEach(function(it) {
      var row = [
        it.maHV || '',
        it.hoTen || '',
        it.lop || '',
        it.trangThai || '',
        it.buoiCuoiCung || '',
        it.ghiChu || ''
      ];
      lines.push(row.map(escapeCSVCell).join(','));
    });
    return lines.join('\n');
  }

  function escapeCSVCell(val) {
    var s = String(val == null ? '' : val);
    if (s.indexOf(',') >= 0 || s.indexOf('"') >= 0 || s.indexOf('\n') >= 0) {
      return '"' + s.replace(/"/g, '""') + '"';
    }
    return s;
  }

  /**
   * Debug: chạy full pipeline và log ra Console.
   * Gọi từ Console: QuyetDinhHocVien.debug.runPipeline(csvText)
   * hoặc sau khi load trang: QuyetDinhHocVien.debug.runPipeline(await fetch(window.CSV_URL).then(r => r.text()))
   */
  function debugRunPipeline(csvText, options) {
    options = options || {};
    options.debug = true;
    console.group('[QuyetDinhHocVien.debug] runPipeline');
    var rows = (typeof StreakLogic !== 'undefined' && StreakLogic.parseCSV)
      ? StreakLogic.parseCSV(csvText || '')
      : [];
    console.log('parseCSV -> rows:', rows.length, '| cols:', rows[0] ? rows[0].length : 0);
    if (rows.length < 2) {
      console.warn('Không đủ dữ liệu');
      console.groupEnd();
      return [];
    }
    var result = getQuyetDinhHocVienFromRows(rows, null, options);
    console.log('Kết quả cuối:', result.length, 'học viên');
    console.groupEnd();
    return result;
  }

  global.QuyetDinhHocVien = {
    CUTOFF: CUTOFF,
    getQuyetDinhHocVienFromRows: getQuyetDinhHocVienFromRows,
    toCSV: toCSV,
    isBeforeCutoff: isBeforeCutoff,
    debug: { runPipeline: debugRunPipeline }
  };
})(typeof window !== 'undefined' ? window : typeof global !== 'undefined' ? global : this);
