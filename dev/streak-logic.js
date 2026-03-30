/**
 * Logic tính streak và build response cho dashboard.
 * Port từ DashboardLogic.js (App Script), chạy trên dữ liệu CSV/rows.
 * Không phụ thuộc App Script – web kéo dữ liệu từ Google Sheet (Publish to web).
 */

(function(global) {
  'use strict';

  function calculateStreak(attendance) {
    function isAttend(v) {
      var x = String(v).trim().toUpperCase();
      return x === 'X' || x === 'B' || x === 'M';
    }
    function isAbsence(v) {
      var x = String(v).trim().toUpperCase();
      return x === 'P';
    }
    var filtered = attendance.filter(function(val) {
      var x = String(val).trim().toUpperCase();
      return x === 'X' || x === 'B' || x === 'M' || x === 'P';
    });
    var maxAttend = 0, currentAttend = 0;
    var maxAbsence = 0, currentAbsence = 0;
    var latestStreak = 0;
    filtered.forEach(function(val) {
      if (isAttend(val)) {
        currentAttend++;
        currentAbsence = 0;
        if (currentAttend > maxAttend) maxAttend = currentAttend;
      } else if (isAbsence(val)) {
        currentAbsence++;
        currentAttend = 0;
        if (currentAbsence > maxAbsence) maxAbsence = currentAbsence;
      }
    });
    if (filtered.length > 0) {
      var lastVal = filtered[filtered.length - 1];
      var lastIsAttend = isAttend(lastVal);
      var j = filtered.length - 1;
      while (j >= 0 && isAttend(filtered[j]) === lastIsAttend) {
        latestStreak++;
        j--;
      }
      if (!lastIsAttend) latestStreak = -latestStreak;
    }
    return { currentStreak: latestStreak, maxAttendStreak: maxAttend, maxAbsenceStreak: maxAbsence };
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

  /**
   * Phát hiện format: long (Mã HV,Họ tên,Tên,Lớp,Tháng,Buổi,Điểm danh) hay wide (cũ)
   */
  function isLongFormat(headerRow) {
    if (!headerRow || headerRow.length < 7) return false;
    var h4 = String(headerRow[4] || '').toLowerCase();
    var h5 = String(headerRow[5] || '').toLowerCase();
    return (h4.indexOf('tháng') >= 0 || h4 === 'thang') && (h5.indexOf('buổi') >= 0 || h5 === 'buoi');
  }

  /**
   * Từ raw rows (sau khi parse CSV). Hỗ trợ 2 format:
   * - Long: Mã HV | Họ tên | Tên | Lớp | Tháng | Buổi | Điểm danh (1 dòng = 1 record)
   * - Wide (cũ): Mã HV | Họ tên | Tên | Lớp | B1 | B2 | ... (format "Tháng X.YYYY||Buổi N||X")
   * filterOptions: { startBuoiIndex, endBuoiIndex } (1-based)
   */
  function getStreakDataFromRows(rows, filterOptions) {
    var data = rows;
    var empty = { students: [], months: [], buois: [], timelineBuois: [] };
    if (data.length < 2) return empty;

    if (isLongFormat(data[0])) {
      return getStreakDataFromLongFormat(data, filterOptions);
    }
    return getStreakDataFromWideFormat(data, filterOptions);
  }

  function parseThangForSort(thang) {
    if (!thang || typeof thang !== 'string') return { year: 0, month: 0 };
    var parts = String(thang).trim().split(/[.\/]/);
    var a = parseInt(parts[0], 10) || 0, b = parseInt(parts[1], 10) || 0;
    if (a >= 1000) return { year: a, month: b };
    return { year: b, month: a };
  }
  function toKey(thang, buoi) {
    return (thang || '') + '_' + (buoi != null ? buoi : '');
  }
  function formatBuoiLabel(e) {
    if (!e || e.buoi == null) return '';
    var p = parseThangForSort(e.thang);
    if (p.year && p.month >= 1 && p.month <= 12) {
      var mo = ('0' + p.month).slice(-2);
      var bb = ('0' + parseInt(e.buoi, 10)).slice(-2);
      return p.year + '.' + mo + '-B' + bb;
    }
    return (e.thang || '') + '-B' + e.buoi;
  }

  function getStreakDataFromLongFormat(data, filterOptions) {
    var colMaHV = 0, colHoTen = 1, colTen = 2, colLop = 3, colThang = 4, colBuoi = 5, colDiemDanh = 6;
    var recordsByStudent = {};
    var allThangBuoi = {};
    for (var i = 1; i < data.length; i++) {
      var row = data[i];
      var maHV = row[colMaHV];
      if (!maHV) continue;
      var thang = String(row[colThang] || '').trim();
      var buoi = row[colBuoi] != null ? parseInt(row[colBuoi], 10) : null;
      var val = String(row[colDiemDanh] || '').trim();
      if (!thang || buoi == null || isNaN(buoi)) continue;
      var k = toKey(thang, buoi);
      allThangBuoi[k] = { thang: thang, buoi: buoi };
      if (!recordsByStudent[maHV]) recordsByStudent[maHV] = { info: [row[colMaHV], row[colHoTen], row[colTen], row[colLop]], records: [] };
      recordsByStudent[maHV].records.push({ key: k, thang: thang, buoi: buoi, val: val });
    }

    var uniqueList = Object.keys(allThangBuoi).map(function(k) {
      var t = allThangBuoi[k];
      return { key: k, thang: t.thang, buoi: t.buoi };
    });
    uniqueList.sort(function(a, b) {
      var pa = parseThangForSort(a.thang);
      var pb = parseThangForSort(b.thang);
      if (pa.year !== pb.year) return pa.year - pb.year;
      if (pa.month !== pb.month) return pa.month - pb.month;
      return (a.buoi || 0) - (b.buoi || 0);
    });
    var timelineBuois = uniqueList.map(function(e, idx) {
      return { index: idx + 1, key: e.key, thang: e.thang, buoi: e.buoi, label: formatBuoiLabel(e) };
    });

    var startIdx = filterOptions && filterOptions.startBuoiIndex != null ? parseInt(filterOptions.startBuoiIndex, 10) : 1;
    var endIdx = filterOptions && filterOptions.endBuoiIndex != null ? parseInt(filterOptions.endBuoiIndex, 10) : timelineBuois.length;
    if (isNaN(startIdx)) startIdx = 1;
    if (isNaN(endIdx)) endIdx = timelineBuois.length;
    startIdx = Math.max(1, Math.min(startIdx, timelineBuois.length));
    endIdx = Math.max(startIdx, Math.min(endIdx, timelineBuois.length));

    var selectedKeys = {};
    for (var k = 0; k < timelineBuois.length; k++) {
      var t = timelineBuois[k];
      if (t.index >= startIdx && t.index <= endIdx) selectedKeys[t.key] = true;
    }

    var monthsSet = {};
    var buoisSet = {};
    for (var k = 0; k < timelineBuois.length; k++) {
      var t = timelineBuois[k];
      if (t.index >= startIdx && t.index <= endIdx) {
        if (t.thang) monthsSet[t.thang] = true;
        if (t.buoi != null) buoisSet[t.buoi] = true;
      }
    }
    var months = Object.keys(monthsSet).sort();
    var buois = Object.keys(buoisSet).map(Number).sort(function(a, b) { return a - b; });

    var debugMode = filterOptions && filterOptions.debug === true;
    var students = [];
    for (var maHV in recordsByStudent) {
      if (!recordsByStudent.hasOwnProperty(maHV)) continue;
      var st = recordsByStudent[maHV];
      var recs = st.records.filter(function(r) { return selectedKeys[r.key]; });
      recs.sort(function(a, b) {
        var pa = parseThangForSort(a.thang);
        var pb = parseThangForSort(b.thang);
        if (pa.year !== pb.year) return pa.year - pb.year;
        if (pa.month !== pb.month) return pa.month - pb.month;
        return (a.buoi || 0) - (b.buoi || 0);
      });
      var attendance = recs.map(function(r) { return r.val; });
      var streak = calculateStreak(attendance);
      var totalSessions = attendance.filter(function(v) { return String(v).trim() !== ''; }).length;
      var student = {
        maHV: maHV,
        hoTen: st.info[1] || '',
        ten: st.info[2] || '',
        lop: st.info[3] || '',
        currentStreak: streak.currentStreak,
        maxAttendStreak: streak.maxAttendStreak,
        maxAbsenceStreak: streak.maxAbsenceStreak,
        maxAttendance: streak.maxAttendStreak,
        maxAbsence: streak.maxAbsenceStreak,
        totalSessions: totalSessions
      };
      if (debugMode) student.buoiValues = attendance.slice();
      students.push(student);
    }
    return { students: students, months: months, buois: buois, timelineBuois: timelineBuois };
  }

  function getStreakDataFromWideFormat(data, filterOptions) {
    var attendanceStartIndex = 4;
    var numCols = data[0] ? data[0].length : 0;
    var allThangBuoi = {};
    var colThangBuoiSets = {};
    for (var c = attendanceStartIndex; c < numCols; c++) colThangBuoiSets[c] = {};
    for (var i = 1; i < data.length; i++) {
      for (var c = attendanceStartIndex; c < numCols; c++) {
        var parsed = parseThangBuoi(data[i][c]);
        if (parsed && parsed.thang && parsed.buoi != null) {
          var k = toKey(parsed.thang, parsed.buoi);
          allThangBuoi[k] = { thang: parsed.thang, buoi: parsed.buoi };
          colThangBuoiSets[c][k] = true;
        }
      }
    }
    var uniqueList = Object.keys(allThangBuoi).map(function(k) {
      var t = allThangBuoi[k];
      return { key: k, thang: t.thang, buoi: t.buoi };
    });
    uniqueList.sort(function(a, b) {
      var pa = parseThangForSort(a.thang);
      var pb = parseThangForSort(b.thang);
      if (pa.year !== pb.year) return pa.year - pb.year;
      if (pa.month !== pb.month) return pa.month - pb.month;
      return (a.buoi || 0) - (b.buoi || 0);
    });
    var timelineBuois;
    if (uniqueList.length === 0) {
      timelineBuois = [];
      for (var fc = attendanceStartIndex; fc < numCols; fc++) {
        var idx = fc - attendanceStartIndex + 1;
        var k = '_col' + fc;
        timelineBuois.push({ index: idx, key: k, thang: null, buoi: null, label: 'Buổi ' + idx });
        colThangBuoiSets[fc][k] = true;
      }
    } else {
      timelineBuois = uniqueList.map(function(e, idx) {
        return { index: idx + 1, key: e.key, thang: e.thang, buoi: e.buoi, label: formatBuoiLabel(e) };
      });
    }

    var startIdx = filterOptions && filterOptions.startBuoiIndex != null ? parseInt(filterOptions.startBuoiIndex, 10) : 1;
    var endIdx = filterOptions && filterOptions.endBuoiIndex != null ? parseInt(filterOptions.endBuoiIndex, 10) : timelineBuois.length;
    if (isNaN(startIdx)) startIdx = 1;
    if (isNaN(endIdx)) endIdx = timelineBuois.length;
    startIdx = Math.max(1, Math.min(startIdx, timelineBuois.length));
    endIdx = Math.max(startIdx, Math.min(endIdx, timelineBuois.length));

    var selectedKeys = {};
    for (var k = 0; k < timelineBuois.length; k++) {
      var t = timelineBuois[k];
      if (t.index >= startIdx && t.index <= endIdx) selectedKeys[t.key] = true;
    }
    var includedCols = [];
    for (var c = attendanceStartIndex; c < numCols; c++) {
      var colKeys = colThangBuoiSets[c];
      for (var key in colKeys) { if (colKeys.hasOwnProperty(key) && selectedKeys[key]) { includedCols.push(c); break; } }
    }

    var monthsSet = {};
    var buoisSet = {};
    for (var k = 0; k < timelineBuois.length; k++) {
      var t = timelineBuois[k];
      if (t.index >= startIdx && t.index <= endIdx) {
        if (t.thang) monthsSet[t.thang] = true;
        if (t.buoi != null) buoisSet[t.buoi] = true;
      }
    }
    var months = Object.keys(monthsSet).sort();
    var buois = Object.keys(buoisSet).map(Number).sort(function(a, b) { return a - b; });

    var debugMode = filterOptions && filterOptions.debug === true;
    var students = [];
    for (var i = 1; i < data.length; i++) {
      var row = data[i];
      var maHV = row[0];
      if (!maHV) continue;
      var attendance = includedCols.map(function(c) { return extractAttendanceVal(row[c]); });
      var streak = calculateStreak(attendance);
      var totalSessions = attendance.filter(function(v) { return String(v).trim() !== ''; }).length;
      var student = {
        maHV: maHV,
        hoTen: row[1] || '',
        ten: row[2] || '',
        lop: row[3] || '',
        currentStreak: streak.currentStreak,
        maxAttendStreak: streak.maxAttendStreak,
        maxAbsenceStreak: streak.maxAbsenceStreak,
        maxAttendance: streak.maxAttendStreak,
        maxAbsence: streak.maxAbsenceStreak,
        totalSessions: totalSessions
      };
      if (debugMode) student.buoiValues = attendance.slice();
      students.push(student);
    }
    return { students: students, months: months, buois: buois, timelineBuois: timelineBuois };
  }

  /**
   * Build object giống getStreakDataForWeb (leaderboard, classes, warnings, stats, filterOptions, appliedFilters).
   * appliedFilters: { startBuoiIndex, endBuoiIndex }
   */
  function buildFullResponse(students, months, buois, timelineBuois, appliedFilters) {
    var leaderboard = students
      .filter(function(s) { return s.currentStreak > 0; })
      .sort(function(a, b) { return b.currentStreak - a.currentStreak; })
      .slice(0, 20)
      .map(function(s, idx) { return { rank: idx + 1, maHV: s.maHV, hoTen: s.hoTen, lop: s.lop, currentStreak: s.currentStreak }; });

    var classStats = {};
    students.forEach(function(s) {
      if (!classStats[s.lop]) {
        classStats[s.lop] = { className: s.lop, total: 0, positiveStreak: 0, negativeStreak: 0, avgStreak: 0, sumStreak: 0 };
      }
      classStats[s.lop].total++;
      classStats[s.lop].sumStreak += s.currentStreak;
      if (s.currentStreak > 0) classStats[s.lop].positiveStreak++;
      else if (s.currentStreak < 0) classStats[s.lop].negativeStreak++;
    });
    Object.keys(classStats).forEach(function(lop) {
      var st = classStats[lop];
      st.avgStreak = st.total > 0 ? parseFloat((st.sumStreak / st.total).toFixed(1)) : 0;
    });
    var classes = Object.values(classStats).sort(function(a, b) { return a.className.localeCompare(b.className); });

    var warningsRaw = students.filter(function(s) { return s.currentStreak < 0 || s.maxAbsenceStreak >= 3; });
    var warnings = warningsRaw.map(function(s) {
      return {
        maHV: s.maHV, hoTen: s.hoTen, lop: s.lop,
        currentStreak: s.currentStreak, maxAbsenceStreak: s.maxAbsenceStreak, maxAbsence: s.maxAbsenceStreak,
        reason: s.currentStreak < 0 ? 'Đang nghỉ ' + Math.abs(s.currentStreak) + ' buổi liên tiếp' : 'Đã từng nghỉ ' + s.maxAbsenceStreak + ' buổi liên tiếp'
      };
    });

    var stats = {
      totalStudents: students.length,
      totalClasses: Object.keys(classStats).length,
      positiveStreakCount: students.filter(function(s) { return s.currentStreak >= 5; }).length,
      negativeStreakCount: students.filter(function(s) { return s.currentStreak < 0; }).length,
      warningCount: warnings.length
    };

    return {
      success: true,
      timestamp: new Date().toISOString(),
      students: students,
      leaderboard: leaderboard,
      classes: classes,
      warnings: warnings,
      stats: stats,
      filterOptions: { months: months, buois: buois, timelineBuois: timelineBuois || [] },
      appliedFilters: appliedFilters || {}
    };
  }

  /**
   * Parse CSV text thành mảng các dòng, mỗi dòng là mảng ô.
   * Hỗ trợ ô có dấu phẩy trong ngoặc kép (định dạng Google Sheets export).
   */
  function parseCSV(text) {
    var rows = [];
    var row = [];
    var cell = '';
    var inQuotes = false;
    var i = 0;
    while (i < text.length) {
      var ch = text[i];
      if (inQuotes) {
        if (ch === '"') {
          if (text[i + 1] === '"') { cell += '"'; i++; }
          else inQuotes = false;
        } else {
          cell += ch;
        }
        i++;
      } else {
        if (ch === '"') {
          inQuotes = true;
          i++;
        } else if (ch === ',' || ch === '\t') {
          row.push(cell.trim());
          cell = '';
          i++;
        } else if (ch === '\n' || ch === '\r') {
          row.push(cell.trim());
          cell = '';
          if (row.length > 0 && row.join('').replace(/\s/g, '').length > 0) rows.push(row);
          row = [];
          if (ch === '\r' && text[i + 1] === '\n') i++;
          i++;
        } else {
          cell += ch;
          i++;
        }
      }
    }
    if (cell !== '' || row.length > 0) {
      row.push(cell.trim());
      if (row.length > 0 && row.join('').replace(/\s/g, '').length > 0) rows.push(row);
    }
    return rows;
  }

  /**
   * Helper debug – dùng trong DevTools Console (F12).
   * Ví dụ: StreakLogic.debug.logParseCSV(csvText)
   *         StreakLogic.debug.runPipeline(csvText, { startBuoiIndex: 1, endBuoiIndex: 10 })
   */
  function debugLogParseCSV(text) {
    var rows = parseCSV(text || '');
    console.log('[StreakLogic.debug] parseCSV → số dòng:', rows.length, '| dòng đầu (header):', rows[0]);
    if (rows.length > 1) console.log('[StreakLogic.debug] dòng 2 (mẫu):', rows[1]);
    return rows;
  }

  function debugLogGetStreakData(rows, filterOptions) {
    var opts = filterOptions || {};
    opts.debug = true;
    var result = getStreakDataFromRows(rows, opts);
    console.log('[StreakLogic.debug] getStreakDataFromRows →', {
      studentsCount: result.students.length,
      months: result.months,
      buois: result.buois,
      timelineBuoisCount: result.timelineBuois.length,
      firstStudent: result.students[0],
      firstTimelineBuoi: result.timelineBuois[0]
    });
    return result;
  }

  function debugLogBuildFullResponse(students, months, buois, timelineBuois, appliedFilters) {
    var res = buildFullResponse(students, months, buois, timelineBuois, appliedFilters);
    console.log('[StreakLogic.debug] buildFullResponse →', {
      success: res.success,
      stats: res.stats,
      leaderboardLength: res.leaderboard.length,
      warningsLength: res.warnings.length,
      classesLength: res.classes.length
    });
    return res;
  }

  /** Chạy full pipeline (parse → getStreakData → buildFullResponse) và log từng bước. */
  function debugRunPipeline(csvText, filterOptions) {
    console.group('[StreakLogic.debug] runPipeline');
    var rows = debugLogParseCSV(csvText);
    if (!rows || rows.length < 2) {
      console.warn('CSV không đủ dòng, dừng pipeline.');
      console.groupEnd();
      return null;
    }
    var raw = debugLogGetStreakData(rows, filterOptions);
    var applied = filterOptions && (filterOptions.startBuoiIndex != null || filterOptions.endBuoiIndex != null)
      ? { startBuoiIndex: filterOptions.startBuoiIndex || null, endBuoiIndex: filterOptions.endBuoiIndex || null }
      : {};
    var full = debugLogBuildFullResponse(raw.students, raw.months, raw.buois, raw.timelineBuois, applied);
    console.groupEnd();
    return full;
  }

  global.StreakLogic = {
    parseCSV: parseCSV,
    getStreakDataFromRows: getStreakDataFromRows,
    buildFullResponse: buildFullResponse,
    debug: {
      logParseCSV: debugLogParseCSV,
      logGetStreakData: debugLogGetStreakData,
      logBuildFullResponse: debugLogBuildFullResponse,
      runPipeline: debugRunPipeline
    }
  };
})(typeof window !== 'undefined' ? window : typeof global !== 'undefined' ? global : this);
