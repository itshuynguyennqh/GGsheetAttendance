/**
 * Dashboard Logic cho Streak Điểm Danh
 * Tạo và cập nhật dashboard trên Google Sheet và cung cấp API cho website
 */

/**
 * Tính toán streak cho một học sinh từ dữ liệu điểm danh.
 * Mỗi phần tử sau trim, so sánh không phân biệt hoa thường:
 * - "X" (đi), "B" (bù), "M" (học sinh mới) → coi là có đi
 * - "P" → coi là nghỉ (chỉ P, không coi giá trị khác là nghỉ)
 * - Giá trị khác ("?", "-", "", v.v.) → pass, không tính nghỉ hay đi, bỏ qua trong streak
 * @param {Array} attendance - Mảng các giá trị điểm danh
 * @return {Object} {currentStreak, maxAttendStreak, maxAbsenceStreak}
 */
function calculateStreak(attendance) {
  function isAttend(v) {
    const x = String(v).trim().toUpperCase();
    return x === "X" || x === "B" || x === "M";
  }
  function isAbsence(v) {
    const x = String(v).trim().toUpperCase();
    return x === "P";
  }

  // Chỉ giữ X, B, M, P; giá trị khác (?, -, "", ...) → pass, bỏ qua
  const filtered = attendance.filter(val => {
    const x = String(val).trim().toUpperCase();
    return x === "X" || x === "B" || x === "M" || x === "P";
  });

  let maxAttend = 0, currentAttend = 0;
  let maxAbsence = 0, currentAbsence = 0;
  let latestStreak = 0;

  // Duyệt từ đầu đến cuối để tìm chuỗi Max
  filtered.forEach(val => {
    if (isAttend(val)) {
      currentAttend++;
      currentAbsence = 0;
      if (currentAttend > maxAttend) maxAttend = currentAttend;
    } else if (isAbsence(val)) {
      currentAbsence++;
      currentAttend = 0;
      if (currentAbsence > maxAbsence) maxAbsence = currentAbsence;
    }
    // giá trị khác không vào filtered, không xử lý
  });

  // Duyệt ngược từ cuối lên để tìm Streak hiện tại
  if (filtered.length > 0) {
    const lastVal = filtered[filtered.length - 1];
    const lastIsAttend = isAttend(lastVal);
    for (let j = filtered.length - 1; j >= 0; j--) {
      if (isAttend(filtered[j]) === lastIsAttend) {
        latestStreak++;
      } else {
        break;
      }
    }
    if (!lastIsAttend) latestStreak = -latestStreak;
  }

  return {
    currentStreak: latestStreak,
    maxAttendStreak: maxAttend,
    maxAbsenceStreak: maxAbsence
  };
}

/**
 * Trích giá trị điểm danh từ ô (format "Tháng X.YYYY||Buổi N||X" hoặc raw)
 */
function _extractAttendanceVal(val) {
  if (val === "" || val === null || val === undefined) return "";
  const text = String(val).trim();
  if (text === "") return "";
  const parts = text.split("||");
  if (parts.length >= 3) return parts[parts.length - 1].trim();
  return text;
}

/**
 * Parse tháng và buổi từ ô dạng "Tháng 6.2025||Buổi 2||X"
 * @return {{ thang: string, buoi: number } | null}
 */
function _parseThangBuoi(cell) {
  if (!cell || String(cell).trim() === "") return null;
  const s = String(cell).trim();
  if (s.indexOf("||") === -1) return null;
  const parts = s.split("||");
  if (parts.length < 2) return null;
  const thang = parts[0].replace(/^Tháng\s*/i, "").trim();
  const buoiMatch = parts[1].match(/^Buổi\s*(\d+)/i);
  const buoi = buoiMatch ? parseInt(buoiMatch[1], 10) : NaN;
  if (!thang && isNaN(buoi)) return null;
  return { thang: thang || null, buoi: isNaN(buoi) ? null : buoi };
}

function _isLongFormat(headerRow) {
  if (!headerRow || headerRow.length < 7) return false;
  const h4 = String(headerRow[4] || "").toLowerCase();
  const h5 = String(headerRow[5] || "").toLowerCase();
  return (h4.indexOf("tháng") >= 0 || h4 === "thang") && (h5.indexOf("buổi") >= 0 || h5 === "buoi");
}

/**
 * Đọc và tính toán streak từ sheet "Gộp_Nối_Tiếp"
 * Hỗ trợ format long (Mã HV,Họ tên,Tên,Lớp,Tháng,Buổi,Điểm danh) và wide (cũ)
 */
function getStreakData(monthFilter, buoiFilter) {
  Logger.log("[getStreakData] Bắt đầu: đọc sheet 'Gộp_Nối_Tiếp'");

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName("Gộp_Nối_Tiếp");
  if (!sheet) throw new Error("Không tìm thấy sheet 'Gộp_Nối_Tiếp'! Vui lòng chạy hàm gộp sheet trước.");

  const data = sheet.getDataRange().getValues();
  if (data.length < 2) return { students: [], months: [], buois: [] };

  if (_isLongFormat(data[0])) {
    return _getStreakDataLongFormat(data, monthFilter, buoiFilter);
  }
  return _getStreakDataWideFormat(data, monthFilter, buoiFilter);
}

function _getStreakDataLongFormat(data, monthFilter, buoiFilter) {
  const colThang = 4, colBuoi = 5, colDiemDanh = 6;
  const mFilter = (monthFilter == null || monthFilter === "") ? null : String(monthFilter).trim();
  const bFilter = (buoiFilter == null || buoiFilter === "" || isNaN(parseInt(buoiFilter, 10))) ? null : parseInt(buoiFilter, 10);

  const byStudent = {};
  const monthsSet = {};
  const buoisSet = {};
  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    const maHV = row[0];
    if (!maHV) continue;
    const thang = String(row[colThang] || "").trim();
    const buoi = row[colBuoi] != null ? parseInt(row[colBuoi], 10) : null;
    const val = String(row[colDiemDanh] || "").trim();
    if (!thang || buoi == null || isNaN(buoi)) continue;
    if (mFilter != null && thang !== mFilter) continue;
    if (bFilter != null && buoi !== bFilter) continue;
    monthsSet[thang] = true;
    buoisSet[buoi] = true;
    if (!byStudent[maHV]) byStudent[maHV] = { info: [row[0], row[1], row[2], row[3]], recs: [] };
    byStudent[maHV].recs.push({ thang, buoi, val });
  }

  const parseThang = t => {
    const p = String(t || "").trim().split(/[.\/]/);
    const a = parseInt(p[0], 10) || 0, b = parseInt(p[1], 10) || 0;
    if (a >= 1000) return { year: a, month: b };
    return { month: a, year: b };
  };
  const cmp = (a, b) => {
    const pa = parseThang(a.thang), pb = parseThang(b.thang);
    if (pa.year !== pb.year) return pa.year - pb.year;
    if (pa.month !== pb.month) return pa.month - pb.month;
    return (a.buoi || 0) - (b.buoi || 0);
  };

  const months = Object.keys(monthsSet).sort();
  const buois = Object.keys(buoisSet).map(Number).sort((a, b) => a - b);
  const students = [];

  for (const maHV in byStudent) {
    const st = byStudent[maHV];
    st.recs.sort(cmp);
    const attendance = st.recs.map(r => r.val);
    const streak = calculateStreak(attendance);
    const totalSessions = attendance.filter(v => String(v).trim() !== "").length;
    students.push({
      maHV, hoTen: st.info[1] || "", ten: st.info[2] || "", lop: st.info[3] || "",
      currentStreak: streak.currentStreak,
      maxAttendStreak: streak.maxAttendStreak,
      maxAbsenceStreak: streak.maxAbsenceStreak,
      maxAttendance: streak.maxAttendStreak,
      maxAbsence: streak.maxAbsenceStreak,
      totalSessions
    });
  }
  return { students, months, buois };
}

function _getStreakDataWideFormat(data, monthFilter, buoiFilter) {
  const numCols = data[0].length;
  const attendanceStartIndex = 4;
  const mFilter = (monthFilter == null || monthFilter === "") ? null : String(monthFilter).trim();
  const bFilterNorm = (buoiFilter == null || buoiFilter === "" || isNaN(parseInt(buoiFilter, 10))) ? null : parseInt(buoiFilter, 10);

  const colMeta = {};
  for (let c = attendanceStartIndex; c < numCols; c++) colMeta[c] = null;
  for (let i = 1; i < data.length; i++) {
    for (let c = attendanceStartIndex; c < numCols; c++) {
      if (colMeta[c] !== null) continue;
      const parsed = _parseThangBuoi(data[i][c]);
      if (parsed) colMeta[c] = parsed;
    }
  }

  const monthsSet = {};
  const buoisSet = {};
  for (let c = attendanceStartIndex; c < numCols; c++) {
    const m = colMeta[c];
    if (m && m.thang) monthsSet[m.thang] = true;
    if (m && m.buoi != null) buoisSet[m.buoi] = true;
  }
  const months = Object.keys(monthsSet).sort();
  const buois = Object.keys(buoisSet).map(Number).sort((a, b) => a - b);

  const includedCols = [];
  for (let c = attendanceStartIndex; c < numCols; c++) {
    const m = colMeta[c];
    if (mFilter != null && (!m || m.thang !== mFilter)) continue;
    if (bFilterNorm != null && (!m || m.buoi !== bFilterNorm)) continue;
    includedCols.push(c);
  }

  const students = [];
  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    const maHV = row[0];
    if (!maHV) continue;
    const attendance = includedCols.map(c => _extractAttendanceVal(row[c]));
    const streak = calculateStreak(attendance);
    const totalSessions = attendance.filter(v => String(v).trim() !== "").length;
    students.push({
      maHV, hoTen: row[1] || "", ten: row[2] || "", lop: row[3] || "",
      currentStreak: streak.currentStreak,
      maxAttendStreak: streak.maxAttendStreak,
      maxAbsenceStreak: streak.maxAbsenceStreak,
      maxAttendance: streak.maxAttendStreak,
      maxAbsence: streak.maxAbsenceStreak,
      totalSessions
    });
  }
  return { students, months, buois };
}

/**
 * Tạo hoặc cập nhật dashboard trên Google Sheet
 */
function createStreakDashboard() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  
  try {
    // Lấy dữ liệu streak (không lọc tháng/buổi)
    const { students } = getStreakData(null, null);

    if (students.length === 0) {
      SpreadsheetApp.getUi().alert("⚠️ Không có dữ liệu học sinh! Vui lòng kiểm tra sheet 'Gộp_Nối_Tiếp'.");
      return;
    }

    // Tạo hoặc xóa sheet cũ
    let dashboardSheet = ss.getSheetByName("Dashboard_Streak");
    if (dashboardSheet) {
      ss.deleteSheet(dashboardSheet);
    }
    dashboardSheet = ss.insertSheet("Dashboard_Streak");

    // 1. LEADERBOARD (Top 20)
    const leaderboard = students
      .filter(s => s.currentStreak > 0)
      .sort((a, b) => b.currentStreak - a.currentStreak)
      .slice(0, 20);

    let currentRow = 1;
    
    // Header Leaderboard
    dashboardSheet.getRange(currentRow, 1, 1, 5).merge()
      .setValue("🏆 BẢNG XẾP HẠNG STREAK ĐI HỌC (TOP 20)")
      .setFontWeight("bold")
      .setFontSize(14)
      .setBackground("#1a73e8")
      .setFontColor("white")
      .setHorizontalAlignment("center");
    currentRow++;

    const leaderboardHeaders = [["Hạng", "Mã HV", "Họ Tên", "Lớp", "Streak hiện tại"]];
    dashboardSheet.getRange(currentRow, 1, 1, 5).setValues(leaderboardHeaders)
      .setFontWeight("bold")
      .setBackground("#cfe2f3");
    currentRow++;

    const leaderboardData = leaderboard.map((s, idx) => [
      idx + 1,
      s.maHV,
      s.hoTen,
      s.lop,
      s.currentStreak
    ]);
    
    if (leaderboardData.length > 0) {
      dashboardSheet.getRange(currentRow, 1, leaderboardData.length, 5).setValues(leaderboardData);
      // Định dạng màu cho top 3
      if (leaderboardData.length >= 1) {
        dashboardSheet.getRange(currentRow, 1, 1, 5).setBackground("#ffd700"); // Vàng cho hạng 1
      }
      if (leaderboardData.length >= 2) {
        dashboardSheet.getRange(currentRow + 1, 1, 1, 5).setBackground("#c0c0c0"); // Bạc cho hạng 2
      }
      if (leaderboardData.length >= 3) {
        dashboardSheet.getRange(currentRow + 2, 1, 1, 5).setBackground("#cd7f32"); // Đồng cho hạng 3
      }
      currentRow += leaderboardData.length;
    } else {
      dashboardSheet.getRange(currentRow, 1).setValue("Chưa có học sinh nào có streak đi học.");
      currentRow++;
    }

    currentRow += 2; // Khoảng cách

    // 2. DANH SÁCH ĐẦY ĐỦ
    dashboardSheet.getRange(currentRow, 1, 1, 7).merge()
      .setValue("📋 DANH SÁCH TẤT CẢ HỌC SINH")
      .setFontWeight("bold")
      .setFontSize(14)
      .setBackground("#34a853")
      .setFontColor("white")
      .setHorizontalAlignment("center");
    currentRow++;

    const fullListHeaders = [["Mã HV", "Họ Tên", "Tên", "Lớp", "Streak hiện tại", "Streak Max (Đi học)", "Streak Max (Nghỉ)"]];
    dashboardSheet.getRange(currentRow, 1, 1, 7).setValues(fullListHeaders)
      .setFontWeight("bold")
      .setBackground("#d9ead3");
    currentRow++;

    const fullListData = students.map(s => [
      s.maHV,
      s.hoTen,
      s.ten,
      s.lop,
      s.currentStreak,
      s.maxAttendStreak,
      s.maxAbsenceStreak
    ]);

    dashboardSheet.getRange(currentRow, 1, fullListData.length, 7).setValues(fullListData);
    
    // Conditional formatting cho streak hiện tại
    const streakRange = dashboardSheet.getRange(currentRow, 5, fullListData.length, 1);
    const rules = [
      SpreadsheetApp.newConditionalFormatRule()
        .whenNumberGreaterThan(0)
        .setBackground("#b7e1cd")
        .setRanges([streakRange])
        .build(),
      SpreadsheetApp.newConditionalFormatRule()
        .whenNumberLessThan(0)
        .setBackground("#f4cccc")
        .setRanges([streakRange])
        .build()
    ];
    dashboardSheet.setConditionalFormatRules(rules);
    
    currentRow += fullListData.length + 2;

    // 3. THỐNG KÊ THEO LỚP
    const classStats = {};
    students.forEach(s => {
      if (!classStats[s.lop]) {
        classStats[s.lop] = {
          total: 0,
          positiveStreak: 0,
          negativeStreak: 0,
          avgStreak: 0,
          sumStreak: 0
        };
      }
      classStats[s.lop].total++;
      classStats[s.lop].sumStreak += s.currentStreak;
      if (s.currentStreak > 0) {
        classStats[s.lop].positiveStreak++;
      } else if (s.currentStreak < 0) {
        classStats[s.lop].negativeStreak++;
      }
    });

    Object.keys(classStats).forEach(lop => {
      const stats = classStats[lop];
      stats.avgStreak = stats.total > 0 ? (stats.sumStreak / stats.total).toFixed(1) : 0;
    });

    dashboardSheet.getRange(currentRow, 1, 1, 6).merge()
      .setValue("📊 THỐNG KÊ THEO LỚP")
      .setFontWeight("bold")
      .setFontSize(14)
      .setBackground("#ea4335")
      .setFontColor("white")
      .setHorizontalAlignment("center");
    currentRow++;

    const classHeaders = [["Lớp", "Tổng HS", "Streak dương", "Streak âm", "Streak TB", "Tỷ lệ tích cực"]];
    dashboardSheet.getRange(currentRow, 1, 1, 6).setValues(classHeaders)
      .setFontWeight("bold")
      .setBackground("#fce8e6");
    currentRow++;

    const classData = Object.keys(classStats)
      .sort()
      .map(lop => {
        const stats = classStats[lop];
        const positiveRate = stats.total > 0 ? ((stats.positiveStreak / stats.total) * 100).toFixed(1) + "%" : "0%";
        return [
          lop,
          stats.total,
          stats.positiveStreak,
          stats.negativeStreak,
          stats.avgStreak,
          positiveRate
        ];
      });

    if (classData.length > 0) {
      dashboardSheet.getRange(currentRow, 1, classData.length, 6).setValues(classData);
      currentRow += classData.length;
    }

    currentRow += 2;

    // 4. CẢNH BÁO (theo logic mới)
    const warnings = students.filter(s =>
      s.currentStreak < 0 || // Đang nghỉ liên tiếp
      (s.maxAbsenceStreak >= 3) // Lịch sử nghỉ nhiều
    );

    dashboardSheet.getRange(currentRow, 1, 1, 6).merge()
      .setValue("🚨 CẢNH BÁO - HỌC SINH CẦN LƯU Ý")
      .setFontWeight("bold")
      .setFontSize(14)
      .setBackground("#fbbc04")
      .setFontColor("white")
      .setHorizontalAlignment("center");
    currentRow++;

    const warningHeaders = [["Mã HV", "Họ Tên", "Lớp", "Streak hiện tại", "Streak nghỉ Max", "Lý do"]];
    dashboardSheet.getRange(currentRow, 1, 1, 6).setValues(warningHeaders)
      .setFontWeight("bold")
      .setBackground("#fff2cc");
    currentRow++;

    const warningData = warnings.map(s => {
      let reason = "";
      if (s.currentStreak < 0) {
        reason = `Đang nghỉ ${Math.abs(s.currentStreak)} buổi liên tiếp`;
      }
      if (s.maxAbsenceStreak >= 3) {
        reason += (reason ? "; " : "") + `Đã từng nghỉ ${s.maxAbsenceStreak} buổi liên tiếp`;
      }
      return [
        s.maHV,
        s.hoTen,
        s.lop,
        s.currentStreak,
        s.maxAbsenceStreak,
        reason
      ];
    });

    if (warningData.length > 0) {
      dashboardSheet.getRange(currentRow, 1, warningData.length, 6).setValues(warningData);
      dashboardSheet.getRange(currentRow, 4, warningData.length, 1).setBackground("#f4cccc");
    } else {
      dashboardSheet.getRange(currentRow, 1).setValue("✅ Không có học sinh nào cần cảnh báo.");
    }

    // Định dạng chung
    dashboardSheet.setFrozenRows(1);
    dashboardSheet.autoResizeColumns(1, 7);
    
    // Thêm timestamp
    const lastRow = dashboardSheet.getLastRow();
    dashboardSheet.getRange(lastRow + 2, 1).setValue("Cập nhật lúc: " + Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "dd/MM/yyyy HH:mm:ss"))
      .setFontStyle("italic")
      .setFontColor("#666666");

    dashboardSheet.activate();
    SpreadsheetApp.getUi().alert(`✅ Đã tạo dashboard thành công!\n\n- ${leaderboard.length} học sinh trong bảng xếp hạng\n- ${students.length} học sinh tổng cộng\n- ${Object.keys(classStats).length} lớp\n- ${warnings.length} học sinh cần cảnh báo`);

  } catch (error) {
    SpreadsheetApp.getUi().alert("❌ Lỗi: " + error.toString());
    Logger.log("Lỗi createStreakDashboard: " + error.toString());
  }
}

/**
 * Cập nhật dashboard (gọi lại createStreakDashboard)
 */
function updateStreakDashboard() {
  createStreakDashboard();
}

/**
 * Trả về dữ liệu JSON cho website
 * @param {string|null} monthFilter - Lọc theo tháng ("6.2025"), null/"" = tất cả
 * @param {string|number|null} buoiFilter - Lọc theo buổi (1,2,3...), null/"" = tất cả
 * @return {Object} Dữ liệu streak + filterOptions + appliedFilters
 */
function getStreakDataForWeb(monthFilter, buoiFilter) {
  const m = (monthFilter === undefined || monthFilter === null || monthFilter === "") ? null : monthFilter;
  const b = (buoiFilter === undefined || buoiFilter === null || buoiFilter === "") ? null : buoiFilter;
  Logger.log("[getStreakDataForWeb] ========== BẮT ĐẦU ========== month=" + (m || "all") + ", buoi=" + (b == null ? "all" : b));
  try {
    const { students, months, buois } = getStreakData(m, b);
    Logger.log("[getStreakDataForWeb] getStreakData() trả về: students.length=" + students.length + ", months=" + months.length + ", buois=" + buois.length);
    if (students.length > 0) {
      Logger.log("[getStreakDataForWeb] Mẫu students[0]: " + JSON.stringify(students[0]));
    }

    // Tính toán leaderboard
    const positiveStreakStudents = students.filter(s => s.currentStreak > 0);
    Logger.log("[getStreakDataForWeb] Số HS có streak > 0 (trước sort/slice): " + positiveStreakStudents.length);

    const leaderboard = positiveStreakStudents
      .sort((a, b) => b.currentStreak - a.currentStreak)
      .slice(0, 20)
      .map((s, idx) => ({
        rank: idx + 1,
        ...s
      }));

    Logger.log("[getStreakDataForWeb] leaderboard.length=" + leaderboard.length);
    if (leaderboard.length > 0) {
      Logger.log("[getStreakDataForWeb] leaderboard (top 3): " + JSON.stringify(leaderboard.slice(0, 3)));
    }

    // Tính toán thống kê theo lớp
    const classStats = {};
    students.forEach(s => {
      if (!classStats[s.lop]) {
        classStats[s.lop] = {
          className: s.lop,
          total: 0,
          positiveStreak: 0,
          negativeStreak: 0,
          avgStreak: 0,
          sumStreak: 0
        };
      }
      classStats[s.lop].total++;
      classStats[s.lop].sumStreak += s.currentStreak;
      if (s.currentStreak > 0) {
        classStats[s.lop].positiveStreak++;
      } else if (s.currentStreak < 0) {
        classStats[s.lop].negativeStreak++;
      }
    });

    const classNames = Object.keys(classStats);
    Logger.log("[getStreakDataForWeb] classStats: số lớp=" + classNames.length + ", keys=" + JSON.stringify(classNames));

    Object.keys(classStats).forEach(lop => {
      const stats = classStats[lop];
      stats.avgStreak = stats.total > 0 ? parseFloat((stats.sumStreak / stats.total).toFixed(1)) : 0;
    });

    const classes = Object.values(classStats).sort((a, b) => a.className.localeCompare(b.className));
    Logger.log("[getStreakDataForWeb] classes (mảng sau sort): length=" + classes.length);
    if (classes.length > 0) {
      Logger.log("[getStreakDataForWeb] Mẫu classes[0]: " + JSON.stringify(classes[0]));
    }

    // Cảnh báo (theo logic mới)
    const warningsRaw = students.filter(s => s.currentStreak < 0 || s.maxAbsenceStreak >= 3);
    Logger.log("[getStreakDataForWeb] Số HS cần cảnh báo (currentStreak<0 hoặc maxAbsenceStreak>=3): " + warningsRaw.length);

    const warnings = warningsRaw.map(s => ({
      ...s,
      reason: s.currentStreak < 0
        ? "Đang nghỉ " + Math.abs(s.currentStreak) + " buổi liên tiếp"
        : "Đã từng nghỉ " + s.maxAbsenceStreak + " buổi liên tiếp"
    }));

    Logger.log("[getStreakDataForWeb] warnings.length=" + warnings.length);
    if (warnings.length > 0) {
      Logger.log("[getStreakDataForWeb] Mẫu warnings (tối đa 3): " + JSON.stringify(warnings.slice(0, 3)));
    }

    const stats = {
      totalStudents: students.length,
      totalClasses: Object.keys(classStats).length,
      positiveStreakCount: students.filter(s => s.currentStreak >= 5).length,
      negativeStreakCount: students.filter(s => s.currentStreak < 0).length,
      warningCount: warnings.length
    };
    Logger.log("[getStreakDataForWeb] stats: " + JSON.stringify(stats));

    const result = {
      success: true,
      timestamp: new Date().toISOString(),
      students: students,
      leaderboard: leaderboard,
      classes: classes,
      warnings: warnings,
      stats: stats,
      filterOptions: { months: months, buois: buois },
      appliedFilters: { month: m, buoi: b }
    };

    Logger.log("[getStreakDataForWeb] Kết quả trả về: success=" + result.success + ", students.length=" + result.students.length + ", leaderboard.length=" + result.leaderboard.length + ", classes.length=" + result.classes.length + ", warnings.length=" + result.warnings.length);
    Logger.log("[getStreakDataForWeb] ========== KẾT THÚC THÀNH CÔNG ==========");
    return result;
  } catch (error) {
    Logger.log("[getStreakDataForWeb] LỖI: " + error.toString());
    Logger.log("[getStreakDataForWeb] Stack: " + (error.stack || "N/A"));
    Logger.log("[getStreakDataForWeb] ========== KẾT THÚC LỖI ==========");
    return {
      success: false,
      error: error.toString(),
      timestamp: new Date().toISOString()
    };
  }
}

/**
 * Web App: Serve HTML cho website dashboard hoặc API JSON
 * 
 * Endpoints:
 * - GET /exec → Dashboard HTML (mặc định)
 * - GET /exec?endpoint=getStreakData&month={month}&buoi={buoi} → JSON API
 */
function doGet(e) {
  // Kiểm tra nếu có parameter endpoint=getStreakData
  if (e && e.parameter && e.parameter.endpoint === 'getStreakData') {
    const month = e.parameter.month || null;
    const buoi = e.parameter.buoi ? parseInt(e.parameter.buoi, 10) : null;
    
    try {
      const data = getStreakDataForWeb(month, buoi);
      return ContentService.createTextOutput(JSON.stringify(data))
        .setMimeType(ContentService.MimeType.JSON)
        .setHeader('Access-Control-Allow-Origin', '*') // CORS
        .setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS')
        .setHeader('Access-Control-Allow-Headers', 'Content-Type');
    } catch (error) {
      return ContentService.createTextOutput(JSON.stringify({
        success: false,
        error: error.toString(),
        timestamp: new Date().toISOString()
      }))
        .setMimeType(ContentService.MimeType.JSON)
        .setHeader('Access-Control-Allow-Origin', '*');
    }
  }
  
  // Mặc định trả về Dashboard HTML
  return HtmlService.createTemplateFromFile('Dashboard')
    .evaluate()
    .setTitle('Dashboard Streak Điểm Danh')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

/**
 * Include HTML/CSS file (helper function)
 */
function include(filename) {
  try {
    return HtmlService.createHtmlOutputFromFile(filename).getContent();
  } catch (e) {
    Logger.log("Lỗi include file " + filename + ": " + e.toString());
    return "";
  }
}

/**
 * API endpoint để lấy dữ liệu streak (JSON)
 */
function getStreakDataAPI() {
  const data = getStreakDataForWeb();
  return ContentService.createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}
