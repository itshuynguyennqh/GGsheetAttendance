// ======================================================
// BẢNG TƯƠNG QUAN HỌC TẬP
// Đọc từ "Báo Cáo Tổng Hợp", tính hệ số Pearson, ghi ra "Bảng tương quan"
// ======================================================

/**
 * Tìm cột theo tên header
 */
function _corrFindCol(headerRow, name) {
  for (var i = 0; i < headerRow.length; i++) {
    if (String(headerRow[i] || "").trim().indexOf(name) >= 0) return i;
  }
  return -1;
}

/**
 * Parse Lỗi "btvn/tv/yt" -> [btvn, tv, yt] hoặc tổng
 */
function _corrParseLoi(s) {
  if (!s || typeof s !== "string") return null;
  var parts = String(s).trim().split("/");
  var arr = [];
  for (var i = 0; i < 3; i++) {
    var n = parseInt(parts[i] || "0", 10);
    arr.push(isNaN(n) ? 0 : n);
  }
  return { btvn: arr[0], tv: arr[1], yt: arr[2], total: arr[0] + arr[1] + arr[2] };
}

/**
 * Encode ok/nho/xau (lấy dòng đầu nếu có \n)
 */
function _corrEncodeTC(val) {
  if (!val || typeof val !== "string") return null;
  var v = String(val).split("\n")[0].toLowerCase().trim();
  if (v === "ok") return 2;
  if (v === "nho") return 1;
  if (v === "xau") return 0;
  return null;
}

/**
 * Tính hệ số tương quan Pearson giữa hai mảng
 * Chỉ dùng các cặp (x,y) mà cả hai đều có giá trị hợp lệ (không null/NaN)
 */
function _pearsonCorrelation(xArr, yArr) {
  var n = Math.min(xArr.length, yArr.length);
  var valid = [];
  for (var i = 0; i < n; i++) {
    var x = xArr[i];
    var y = yArr[i];
    if (x != null && !isNaN(x) && y != null && !isNaN(y)) {
      valid.push({ x: parseFloat(x), y: parseFloat(y) });
    }
  }
  if (valid.length < 2) return null;
  var sumX = 0, sumY = 0, sumX2 = 0, sumY2 = 0, sumXY = 0;
  for (var j = 0; j < valid.length; j++) {
    var v = valid[j];
    sumX += v.x;
    sumY += v.y;
    sumX2 += v.x * v.x;
    sumY2 += v.y * v.y;
    sumXY += v.x * v.y;
  }
  var m = valid.length;
  var den = Math.sqrt((sumX2 - sumX * sumX / m) * (sumY2 - sumY * sumY / m));
  if (den === 0) return null;
  return (sumXY - sumX * sumY / m) / den;
}

/**
 * Đọc dữ liệu từ sheet Báo Cáo Tổng Hợp, trích xuất các biến số
 */
function _extractCorrelationData(sheet) {
  var data = sheet.getDataRange().getValues();
  if (data.length < 2) return { vars: {}, labels: [], n: 0 };
  var headers = data[0];
  var rows = data.slice(1);
  var labels = [];
  var vars = {};
  var n = rows.length;

  var idxDiemTB = _corrFindCol(headers, "Điểm TB");
  var idxDiemTBPrev = _corrFindCol(headers, "Điểm TB (T.trước)");
  var idxLoi = _corrFindCol(headers, "Lỗi (BTVN");
  var idxLoiPrev = _corrFindCol(headers, "Lỗi (T.trước)");
  var idxSoBuoiDi = _corrFindCol(headers, "Số buổi đi");
  var idxSoBuoiNghi = _corrFindCol(headers, "Số buổi nghỉ");
  var idxNhom = _corrFindCol(headers, "Nhóm");
  var idxTcDiemTB = _corrFindCol(headers, "TC Điểm TB");
  var idxTcThaiDo = _corrFindCol(headers, "TC Thái độ");
  var idxTcChepPhat = _corrFindCol(headers, "TC Chép phạt");

  function col(idx) {
    var arr = [];
    for (var r = 0; r < n; r++) {
      arr.push(idx >= 0 && idx < rows[r].length ? rows[r][idx] : null);
    }
    return arr;
  }

  if (idxDiemTB >= 0) {
    var arr = col(idxDiemTB).map(function(v) {
      var num = parseFloat(String(v || "").replace(",", "."));
      return isNaN(num) ? null : num;
    });
    vars["Điểm_TB"] = arr;
    labels.push("Điểm_TB");
  }
  if (idxDiemTBPrev >= 0) {
    var arr = col(idxDiemTBPrev).map(function(v) {
      var num = parseFloat(String(v || "").replace(",", "."));
      return isNaN(num) ? null : num;
    });
    vars["Điểm_TB_Trước"] = arr;
    labels.push("Điểm_TB_Trước");
  }
  if (idxDiemTB >= 0 && idxDiemTBPrev >= 0) {
    var arr = [];
    for (var r = 0; r < n; r++) {
      var c = vars["Điểm_TB"][r];
      var p = vars["Điểm_TB_Trước"][r];
      if (c != null && !isNaN(c) && p != null && !isNaN(p)) arr.push(c - p);
      else arr.push(null);
    }
    vars["Score_Diff"] = arr;
    labels.push("Score_Diff");
  }
  if (idxSoBuoiDi >= 0) {
    vars["Số_buổi_đi"] = col(idxSoBuoiDi).map(function(v) {
      var num = parseInt(String(v || "0"), 10);
      return isNaN(num) ? null : num;
    });
    labels.push("Số_buổi_đi");
  }
  if (idxSoBuoiNghi >= 0) {
    vars["Số_buổi_nghỉ"] = col(idxSoBuoiNghi).map(function(v) {
      var num = parseInt(String(v || "0"), 10);
      return isNaN(num) ? null : num;
    });
    labels.push("Số_buổi_nghỉ");
  }
  if (idxLoi >= 0) {
    var raw = col(idxLoi);
    var btvn = [], tv = [], yt = [], total = [];
    for (var r = 0; r < n; r++) {
      var parsed = _corrParseLoi(raw[r]);
      if (parsed) {
        btvn.push(parsed.btvn);
        tv.push(parsed.tv);
        yt.push(parsed.yt);
        total.push(parsed.total);
      } else {
        btvn.push(null);
        tv.push(null);
        yt.push(null);
        total.push(null);
      }
    }
    vars["Lỗi_BTVN"] = btvn;
    vars["Lỗi_TV"] = tv;
    vars["Lỗi_YT"] = yt;
    vars["Tổng_lỗi"] = total;
    labels.push("Lỗi_BTVN", "Lỗi_TV", "Lỗi_YT", "Tổng_lỗi");
  }
  if (idxLoiPrev >= 0) {
    var raw = col(idxLoiPrev);
    var totalPrev = [];
    for (var r = 0; r < n; r++) {
      var parsed = _corrParseLoi(raw[r]);
      totalPrev.push(parsed ? parsed.total : null);
    }
    vars["Tổng_lỗi_Trước"] = totalPrev;
    labels.push("Tổng_lỗi_Trước");
  }
  if (idxNhom >= 0) {
    vars["Nhóm"] = col(idxNhom).map(function(v) {
      var num = parseInt(String(v || ""), 10);
      return (num >= 1 && num <= 3) ? num : null;
    });
    labels.push("Nhóm");
  }
  if (idxTcThaiDo >= 0) {
    vars["TC_Thái_độ"] = col(idxTcThaiDo).map(function(v) { return _corrEncodeTC(String(v || "")); });
    labels.push("TC_Thái_độ");
  }
  if (idxTcChepPhat >= 0) {
    vars["TC_Chép_phạt"] = col(idxTcChepPhat).map(function(v) { return _corrEncodeTC(String(v || "")); });
    labels.push("TC_Chép_phạt");
  }

  var uniqueLabels = [];
  var seen = {};
  for (var k = 0; k < labels.length; k++) {
    if (!seen[labels[k]]) {
      seen[labels[k]] = true;
      uniqueLabels.push(labels[k]);
    }
  }

  return { vars: vars, labels: uniqueLabels, n: n };
}

/**
 * Tạo bảng tương quan và ghi vào sheet "Bảng tương quan"
 */
function generateCorrelationMatrix() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var reportSheet = ss.getSheetByName("Báo Cáo Tổng Hợp");
  if (!reportSheet) {
    SpreadsheetApp.getUi().alert("⚠️ Chưa có sheet 'Báo Cáo Tổng Hợp'. Hãy tạo báo cáo tổng hợp trước (Báo cáo Tháng > 1. Tạo báo cáo tổng hợp).");
    return;
  }
  var extracted = _extractCorrelationData(reportSheet);
  if (extracted.n < 2) {
    SpreadsheetApp.getUi().alert("⚠️ Cần ít nhất 2 dòng dữ liệu để tính tương quan.");
    return;
  }
  var vars = extracted.vars;
  var labels = extracted.labels;
  if (labels.length === 0) {
    SpreadsheetApp.getUi().alert("⚠️ Không tìm thấy cột số phù hợp.");
    return;
  }

  var k = labels.length;
  var matrix = [];
  for (var i = 0; i <= k; i++) {
    matrix[i] = [];
    for (var j = 0; j <= k; j++) {
      matrix[i][j] = "";
    }
  }
  matrix[0][0] = "";
  for (var a = 0; a < k; a++) matrix[0][a + 1] = labels[a];
  for (var a = 0; a < k; a++) matrix[a + 1][0] = labels[a];

  for (var i = 0; i < k; i++) {
    for (var j = 0; j < k; j++) {
      var xArr = vars[labels[i]];
      var yArr = vars[labels[j]];
      if (!xArr || !yArr) continue;
      var r = _pearsonCorrelation(xArr, yArr);
      if (r != null && !isNaN(r)) {
        matrix[i + 1][j + 1] = Math.round(r * 100) / 100;
      } else {
        matrix[i + 1][j + 1] = "";
      }
    }
  }

  var targetSheet = ss.getSheetByName("Bảng tương quan");
  if (!targetSheet) targetSheet = ss.insertSheet("Bảng tương quan");
  else targetSheet.clear();

  targetSheet.getRange(1, 1, matrix.length, matrix[0].length).setValues(matrix);
  targetSheet.getRange(1, 1, 1, matrix[0].length).setFontWeight("bold").setBackground("#cfe2f3");
  targetSheet.getRange(1, 1, matrix.length, 1).setFontWeight("bold").setBackground("#e6f2ff");
  targetSheet.setFrozenRows(1);
  targetSheet.setFrozenColumns(1);

  for (var r = 1; r < matrix.length; r++) {
    for (var c = 1; c < matrix[0].length; c++) {
      var val = matrix[r][c];
      if (typeof val === "number") {
        var cell = targetSheet.getRange(r + 1, c + 1);
        if (val > 0.3) cell.setBackground("#c8e6c9");
        else if (val < -0.3) cell.setBackground("#ffccbc");
        else if (val === 1) cell.setBackground("#fff9c4");
      }
    }
  }
  targetSheet.autoResizeColumns(1, matrix[0].length);
  SpreadsheetApp.getUi().alert("✅ Đã tạo Bảng tương quan từ " + extracted.n + " học sinh, " + k + " biến.");
}
