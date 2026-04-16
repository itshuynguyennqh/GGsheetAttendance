// ======================================================
// BÁO CÁO TỔNG HỢP GỬI PHỤ HUYNH
// ======================================================

/**
 * Tạo RichTextValue cho ô evidence: label + các dòng với cụm từ match được bôi đen.
 * @param {string} label - VD: "ok", "nho", "xau"
 * @param {Array} lines - [{date: "dd/MM", text: "...", phrases: ["ý thức", ...]}]
 * @return {RichTextValue|null}
 */
function buildEvidenceRichText(label, lines) {
  if (!lines || lines.length === 0) return SpreadsheetApp.newRichTextValue().setText(label || "").build();
  var parts = [label || ""];
  for (var i = 0; i < lines.length; i++) {
    parts.push(lines[i].date + ": " + lines[i].text);
  }
  var fullText = parts.join("\n");
  var builder = SpreadsheetApp.newRichTextValue().setText(fullText);
  var boldStyle = SpreadsheetApp.newTextStyle().setBold(true).build();
  var offset = (label || "").length + 1;
  for (var j = 0; j < lines.length; j++) {
    var line = lines[j];
    var lineStart = offset;
    var lineText = line.date + ": " + line.text;
    var phrases = line.phrases || [];
    for (var p = 0; p < phrases.length; p++) {
      var phrase = phrases[p];
      var idx = 0;
      while (true) {
        var pos = lineText.indexOf(phrase, idx);
        if (pos === -1) break;
        builder.setTextStyle(lineStart + pos, lineStart + pos + phrase.length, boldStyle);
        idx = pos + 1;
      }
    }
    offset += lineText.length + 1;
  }
  return builder.build();
}

/**
 * Tạo RichTextValue cho ô tin nhắn: dòng đầu cỡ chữ 13, các cụm lưu ý in đậm.
 * @param {string} msg - Nội dung tin nhắn
 * @param {string[]} boldPhrases - Danh sách cụm từ cần in đậm
 * @return {RichTextValue|null}
 */
function buildMessageRichText(msg, boldPhrases) {
  if (!msg || typeof msg !== "string") return null;
  var builder = SpreadsheetApp.newRichTextValue().setText(msg);
  var len = msg.length;
  var firstLineEnd = msg.indexOf("\n");
  if (firstLineEnd === -1) firstLineEnd = len;
  if (firstLineEnd > 0) {
    builder.setTextStyle(0, firstLineEnd, SpreadsheetApp.newTextStyle().setFontSize(13).build());
  }
  var ranges = [];
  for (var p = 0; p < boldPhrases.length; p++) {
    var phrase = boldPhrases[p];
    var idx = 0;
    while (true) {
      var pos = msg.indexOf(phrase, idx);
      if (pos === -1) break;
      ranges.push([pos, pos + phrase.length]);
      idx = pos + 1;
    }
  }
  ranges.sort(function(a, b) { return a[0] - b[0]; });
  var merged = [];
  for (var i = 0; i < ranges.length; i++) {
    var s = ranges[i][0], e = ranges[i][1];
    if (merged.length > 0 && s <= merged[merged.length - 1][1]) {
      if (e > merged[merged.length - 1][1]) merged[merged.length - 1][1] = e;
    } else {
      merged.push([s, e]);
    }
  }
  var boldStyle = SpreadsheetApp.newTextStyle().setBold(true).build();
  for (var j = 0; j < merged.length; j++) {
    var start = merged[j][0], end = merged[j][1];
    if (end > len) end = len;
    if (start < end) builder.setTextStyle(start, end, boldStyle);
  }
  return builder.build();
}

/**
 * Đánh giá tiêu chí: diemTB, btvn, thaiDo, chepPhat.
 * Mỗi trường: 'ok' (tốt), 'nho' (lỗi nhỏ), 'xau' (chưa tốt rõ).
 */
function evaluateIndicators(s, avg) {
  var avgNum = (avg !== "" && avg != null) ? parseFloat(String(avg).replace(",", ".")) : null;
  var hasAvg = avgNum !== null && !isNaN(avgNum);
  var diemTB = "ok";
  if (hasAvg) {
    if (avgNum < 6) diemTB = "xau";
    else if (avgNum >= 7 && avgNum <= 8.5) diemTB = "nho";
    else if (avgNum > 8.5) diemTB = "ok";
    else diemTB = "xau";
  }
  var btvn = s.errors.btvn === 0 ? "ok" : (s.errors.btvn === 1 ? "nho" : "xau");
  var thaiDo = s.errors.att === 0 ? "ok" : (s.errors.att === 1 ? "nho" : "xau");
  var chepPhat = "ok";
  if (s.errors.vocab >= 1 || (s.chepPhatList && s.chepPhatList.length > 0)) chepPhat = "xau";
  return { diemTB: diemTB, btvn: btvn, thaiDo: thaiDo, chepPhat: chepPhat };
}

/**
 * Trả về danh sách tên sheet trong spreadsheet (dùng cho dropdown so sánh tháng trước).
 */
function getSheetNamesForCompare() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  return ss.getSheets().map(function(s) { return s.getName(); });
}

/**
 * Đọc dữ liệu báo cáo tháng trước từ sheet. TC Thái độ, TC Chép phạt chỉ lấy dòng đầu.
 * @param {string} sheetName - Tên sheet
 * @return {Object} { "HV-000123": { diemTB, chiTietDiem, loi, nhom, tcDiemTB, tcThaiDo, tcChepPhat }, ... }
 */
function _findColByHeader(headerRow, name) {
  for (var i = 0; i < headerRow.length; i++) {
    if (String(headerRow[i] || "").trim() === name) return i;
  }
  return -1;
}

/**
 * Lấy chuỗi hiển thị từ ô. Dùng display value để tránh Date bị toString() thành "Wed May 06...".
 */
function _prevCellStr(val) {
  if (val == null || val === "") return "";
  return String(val).trim();
}

function loadPreviousMonthReport(sheetName) {
  var result = {};
  if (!sheetName || String(sheetName).trim() === "") return result;
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var prevSheet = ss.getSheetByName(String(sheetName).trim());
  if (!prevSheet) return result;
  var range = prevSheet.getDataRange();
  var values = range.getValues();
  var displays = range.getDisplayValues();
  if (values.length < 2) return result;
  var h = values[0];
  var col = {
    maHV: 0,
    diemTB: _findColByHeader(h, "Điểm TB") >= 0 ? _findColByHeader(h, "Điểm TB") : 3,
    chiTietDiem: _findColByHeader(h, "Chi tiết điểm") >= 0 ? _findColByHeader(h, "Chi tiết điểm") : 4,
    loi: _findColByHeader(h, "Lỗi (BTVN/TV/YT)") >= 0 ? _findColByHeader(h, "Lỗi (BTVN/TV/YT)") : 5,
    soBuoiNghi: _findColByHeader(h, "Số buổi nghỉ"),
    nhom: _findColByHeader(h, "Nhóm") >= 0 ? _findColByHeader(h, "Nhóm") : 6,
    tcDiemTB: _findColByHeader(h, "TC Điểm TB") >= 0 ? _findColByHeader(h, "TC Điểm TB") : 7,
    tcBTVN: _findColByHeader(h, "TC BTVN"),
    tcThaiDo: _findColByHeader(h, "TC Thái độ") >= 0 ? _findColByHeader(h, "TC Thái độ") : 8,
    tcChepPhat: _findColByHeader(h, "TC Chép phạt") >= 0 ? _findColByHeader(h, "TC Chép phạt") : 9
  };
  for (var i = 1; i < values.length; i++) {
    var row = values[i];
    var rowD = displays[i];
    var id = row[col.maHV];
    if (!id || String(id).trim() === "") continue;
    var norm = normalizeHVCode(String(id).trim());
    var tcBTVNVal = (col.tcBTVN >= 0 && col.tcBTVN < rowD.length) ? _prevCellStr(rowD[col.tcBTVN]) : "";
    var tcThaiVal = _prevCellStr(rowD[col.tcThaiDo]);
    var tcPhatVal = _prevCellStr(rowD[col.tcChepPhat]);
    var soBuoiNghiVal = null;
    if (col.soBuoiNghi >= 0 && col.soBuoiNghi < rowD.length) {
      var v = parseInt(String(rowD[col.soBuoiNghi] || "0"), 10);
      soBuoiNghiVal = isNaN(v) ? null : v;
    }
    result[norm] = {
      diemTB: _prevCellStr(rowD[col.diemTB]),
      chiTietDiem: _prevCellStr(rowD[col.chiTietDiem]),
      loi: _prevCellStr(rowD[col.loi]),
      soBuoiNghi: soBuoiNghiVal,
      nhom: _prevCellStr(rowD[col.nhom]),
      tcDiemTB: _prevCellStr(rowD[col.tcDiemTB]),
      tcBTVN: tcBTVNVal !== "" ? tcBTVNVal.split("\n")[0].trim() : "",
      tcThaiDo: tcThaiVal !== "" ? tcThaiVal.split("\n")[0].trim() : "",
      tcChepPhat: tcPhatVal !== "" ? tcPhatVal.split("\n")[0].trim() : ""
    };
  }
  return result;
}

/**
 * Đọc dữ liệu điểm danh từ sheet. Cột A=Mã, E-N=Buổi 1..10. Giá trị: X/M=đi học, P=nghỉ.
 * @param {string} sheetName - Tên sheet
 * @return {Object} { "HV-000123": { di: number, nghi: number }, ... }
 */
function loadAttendanceData(sheetName) {
  var result = {};
  if (!sheetName || String(sheetName).trim() === "") return result;
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var attSheet = ss.getSheetByName(String(sheetName).trim());
  if (!attSheet) return result;
  var data = attSheet.getDataRange().getValues();
  if (data.length < 2) return result;
  var colMa = 0;
  var colBuoiStart = 4;
  var colBuoiEnd = 13;
  for (var i = 1; i < data.length; i++) {
    var row = data[i];
    var id = row[colMa];
    if (!id || String(id).trim() === "") continue;
    var norm = normalizeHVCode(String(id).trim());
    var di = 0, nghi = 0;
    for (var c = colBuoiStart; c <= colBuoiEnd && c < row.length; c++) {
      var val = row[c];
      if (val == null || String(val).trim() === "") continue;
      var v = String(val).toUpperCase().trim();
      if (v === "X" || v === "M") di++;
      else if (v === "P") nghi++;
    }
    result[norm] = { di: di, nghi: nghi };
  }
  return result;
}

/**
 * So sánh ok/nho/xau: ok=2, nho=1, xau=0. Cao hơn = tốt hơn.
 */
function _rankIndicator(val) {
  if (!val) return -1;
  var v = String(val).toLowerCase().trim();
  if (v === "ok") return 2;
  if (v === "nho") return 1;
  if (v === "xau") return 0;
  return -1;
}

/**
 * Parse Lỗi "btvn/tv/yt" thành tổng số lỗi
 */
function _parseLoiTotal(s) {
  if (!s || typeof s !== "string") return null;
  var parts = String(s).trim().split("/");
  var sum = 0;
  for (var i = 0; i < parts.length; i++) {
    var n = parseInt(parts[i], 10);
    if (!isNaN(n)) sum += n;
  }
  return parts.length > 0 ? sum : null;
}

/**
 * Tính xu hướng: Cải thiện / Sa sút / Ổn định / —
 * 5 phiếu bầu: Điểm TB, Thái độ, Chép phạt, Tổng lỗi, Chuyên cần.
 * Trả về { result, improve, decline, reasonsImprove, reasonsDecline }.
 */
function computeXuHuong(prev, current) {
  var reasonsImprove = [], reasonsDecline = [];
  if (!prev) return { result: "—", improve: 0, decline: 0, reasonsImprove: [], reasonsDecline: [] };
  var improve = 0, decline = 0;

  // 1. Điểm TB
  var pAvg = parseFloat(String(prev.diemTB || "").replace(",", "."));
  var cAvg = parseFloat(String(current.avg || "").replace(",", "."));
  if (!isNaN(pAvg) && !isNaN(cAvg)) {
    if (cAvg > pAvg) { improve += 1; reasonsImprove.push("Điểm TB tăng"); }
    else if (cAvg < pAvg) { decline += 1; reasonsDecline.push("Điểm TB giảm"); }
  }

  // 2. Thái độ
  var rThaiPrev = _rankIndicator(prev.tcThaiDo);
  var rThaiCur = _rankIndicator(current.tcThaiDo);
  if (rThaiPrev >= 0 && rThaiCur >= 0) {
    if (rThaiCur > rThaiPrev) { improve += 1; reasonsImprove.push("Thái độ cải thiện"); }
    else if (rThaiCur < rThaiPrev) { decline += 1; reasonsDecline.push("Thái độ tụt cấp"); }
    else if (rThaiCur === 2) { improve += 0.5; reasonsImprove.push("Thái độ duy trì ok"); }
  }

  // 3. Chép phạt
  var rPhatPrev = _rankIndicator(prev.tcChepPhat);
  var rPhatCur = _rankIndicator(current.tcChepPhat);
  if (rPhatPrev >= 0 && rPhatCur >= 0) {
    if (rPhatCur > rPhatPrev) { improve += 1; reasonsImprove.push("Chép phạt cải thiện"); }
    else if (rPhatCur < rPhatPrev) { decline += 1; reasonsDecline.push("Chép phạt xuất hiện xấu"); }
    else if (rPhatCur === 2) { improve += 0.5; reasonsImprove.push("Chép phạt duy trì ok"); }
  }

  // 4. Tổng lỗi
  var pLoi = _parseLoiTotal(prev.loi);
  var cLoi = current.loiTotal;
  if (pLoi !== null && cLoi !== null) {
    if (cLoi < pLoi) { improve += 1; reasonsImprove.push("Lỗi giảm"); }
    else if (cLoi > pLoi) { decline += 1; reasonsDecline.push("Lỗi tăng"); }
    else if (cLoi === 0) { improve += 0.5; reasonsImprove.push("Duy trì 0 lỗi"); }
  }

  // 5. Chuyên cần
  var pNghi = prev.soBuoiNghi;
  var cNghi = current.soBuoiNghi;
  if (typeof pNghi === "number" && typeof cNghi === "number") {
    if (cNghi < pNghi) { improve += 1; reasonsImprove.push("Nghỉ ít hơn"); }
    else if (cNghi > pNghi) { decline += 1; reasonsDecline.push("Nghỉ nhiều hơn"); }
    else if (cNghi === 0) { improve += 0.5; reasonsImprove.push("Không nghỉ buổi nào"); }
  } else if (typeof cNghi === "number" && cNghi === 0) {
    improve += 0.5;
    reasonsImprove.push("Không nghỉ buổi nào");
  }

  var result = "Ổn định";
  if (improve > decline) result = "Cải thiện";
  else if (decline > improve) result = "Sa sút";
  return { result: result, improve: improve, decline: decline, reasonsImprove: reasonsImprove, reasonsDecline: reasonsDecline };
}

/**
 * Format chi tiết xu hướng: Cộng X (lý do) | Trừ Y (lý do)
 */
function _formatXuHuongDetail(xuHuong) {
  if (!xuHuong || xuHuong.result === "—") return "";
  var parts = [];
  if (xuHuong.improve > 0) {
    var impVal = xuHuong.improve % 1 === 0 ? xuHuong.improve : xuHuong.improve.toFixed(1);
    parts.push("Cộng " + impVal + (xuHuong.reasonsImprove.length > 0 ? ": " + xuHuong.reasonsImprove.join(", ") : ""));
  }
  if (xuHuong.decline > 0) {
    var decVal = xuHuong.decline % 1 === 0 ? xuHuong.decline : xuHuong.decline.toFixed(1);
    parts.push("Trừ " + decVal + (xuHuong.reasonsDecline.length > 0 ? ": " + xuHuong.reasonsDecline.join(", ") : ""));
  }
  return parts.length > 0 ? parts.join(" | ") : "";
}

/**
 * Phân nhóm: 3 = Cần báo động, 1 = 0 hoặc 1 lỗi nhỏ, 2 = còn lại
 */
function classifyStudent(s, avg) {
  var ind = evaluateIndicators(s, avg);
  var badCount = 0;
  var hasNho = false;
  var hasXau = false;
  ["diemTB", "thaiDo", "chepPhat"].forEach(function(k) {
    if (ind[k] === "nho") { badCount++; hasNho = true; }
    if (ind[k] === "xau") { badCount++; hasXau = true; }
  });
  if (badCount >= 3) return 3;
  if (badCount === 0) return 1;
  if (badCount === 1 && hasNho && !hasXau) return 1;
  return 2;
}

function generateRangeReport(startStr, endStr, compareSheetName, attendanceSheetName) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName('BaoCao');
  if (!sheet) {
    SpreadsheetApp.getUi().alert("⚠️ Không tìm thấy sheet 'BaoCao'!");
    return;
  }
  if (sheet.getLastRow() < 2) {
    SpreadsheetApp.getUi().alert("⚠️ Sheet 'BaoCao' không có đủ dữ liệu!");
    return;
  }
  var data = sheet.getDataRange().getValues();
  var startDate = new Date(startStr);
  startDate.setHours(0, 0, 0, 0);
  var endDate = new Date(endStr);
  endDate.setHours(23, 59, 59, 999);

  var tags = loadTagConfig();
  if (!tags || tags.length === 0) {
    seedDefaultTags();
    tags = loadTagConfig();
  }

  var uniqueComments = {};
  for (var ci = 1; ci < data.length; ci++) {
    var cDateVal = parseDate(data[ci][0]);
    if (!cDateVal || isNaN(cDateVal.getTime())) continue;
    if (cDateVal < startDate || cDateVal > endDate) continue;
    var cComment = data[ci][8];
    var cCommentStr = cComment ? String(cComment).trim() : "";
    if (cCommentStr && cCommentStr.toLowerCase() !== "đủ") {
      uniqueComments[cCommentStr] = true;
    }
  }
  var uniqueList = Object.keys(uniqueComments);

  var _pendingTagSuggestions = false;
  var uncovered = findUncoveredComments(uniqueList, tags);
  if (uncovered.length > 0) {
    try {
      Logger.log("[Report] Calling Gemini for " + uncovered.length + " uncovered comments...");
      var suggestions = callGeminiForTagAnalysis(uncovered, tags);
      if (suggestions && suggestions.length > 0) {
        storeTagSuggestions(suggestions);
        _pendingTagSuggestions = true;
        Logger.log("[Report] Stored " + suggestions.length + " tag suggestions (dialog shown after report)");
      }
    } catch (e) {
      Logger.log("[Report] Gemini tag analysis error: " + e.toString());
    }
  }

  var students = {};
  for (var i = 1; i < data.length; i++) {
    var row = data[i];
    var dateVal = parseDate(row[0]);
    if (!dateVal || isNaN(dateVal.getTime())) continue;
    if (dateVal < startDate || dateVal > endDate) continue;
    var id = row[3];
    if (!id || String(id).trim() === "") continue;
    var name = row[4];
    var lop = row[6];
    var score = row[7];
    var comment = row[8];
    var chepPhat = row[9];
    var attendance = row[2];
    if (!students[id]) {
      students[id] = {
        name: name, class: lop, scores: [], details: [],
        errors: {btvn: 0, vocab: 0, att: 0},
        attitudePhrases: [], chepPhatList: [],
        btvnMatchedLines: [], thaiDoMatchedLines: [], chepPhatMatchedLines: [], unrecognizedLines: []
      };
    }
    var scoreStr = score ? String(score).trim() : "";
    if (scoreStr !== "") {
      if (scoreStr.toUpperCase() === "TB") {
        students[id].scores.push(5);
      } else {
        var parsedScore = parseScore(scoreStr);
        if (parsedScore !== null) students[id].scores.push(parsedScore);
      }
    }
    var commentStr = comment ? String(comment).trim() : "";
    var chepPhatStr = chepPhat ? String(chepPhat).trim() : "";
    var attUpper = String(attendance).toUpperCase().trim();
    if ((attUpper === "X" || attUpper === "M") && commentStr === "" && chepPhatStr === "") {
      commentStr = "Đủ";
    }
    var ana = analyzeCommentText(commentStr, tags);
    var anaPhrases = analyzeCommentTextWithPhrases(commentStr, tags);
    if (ana.btvn) {
      students[id].errors.btvn++;
      students[id].btvnMatchedLines.push({
        date: formatDateVN(dateVal),
        text: commentStr,
        phrases: (anaPhrases.btvn && anaPhrases.btvn.phrases) ? anaPhrases.btvn.phrases : []
      });
    }
    if (ana.attitude) {
      students[id].errors.att++;
      var attPhrase = commentToAttitudePhrase(commentStr, tags);
      if (attPhrase) students[id].attitudePhrases.push(attPhrase);
      students[id].thaiDoMatchedLines.push({
        date: formatDateVN(dateVal),
        text: commentStr,
        phrases: anaPhrases.attitude.phrases
      });
    }
    if (ana.vocab) students[id].errors.vocab++;
    if (chepPhatStr !== "") {
      students[id].chepPhatList.push(chepPhatStr);
      students[id].chepPhatMatchedLines.push({
        date: formatDateVN(dateVal),
        text: chepPhatStr,
        phrases: [chepPhatStr]
      });
    }
    if (anaPhrases.vocab.matched) {
      students[id].chepPhatMatchedLines.push({
        date: formatDateVN(dateVal),
        text: commentStr,
        phrases: anaPhrases.vocab.phrases
      });
    }
    if (commentStr !== "" && commentStr.toLowerCase() !== "đủ" && !ana.btvn && !ana.attitude && !ana.vocab && chepPhatStr === "") {
      students[id].unrecognizedLines.push({ date: formatDateVN(dateVal), comment: commentStr });
    }
    var detailParts = [];
    if (scoreStr !== "") detailParts.push("Điểm: " + scoreStr);
    if (commentStr !== "" && commentStr.toLowerCase() !== "đủ") detailParts.push(commentStr);
    if (chepPhatStr !== "") detailParts.push("Chép phạt: " + chepPhatStr);
    if (detailParts.length > 0) {
      students[id].details.push("- " + formatDateVN(dateVal) + ": " + detailParts.join(" | "));
    }
  }
  var prevData = null;
  if (compareSheetName && String(compareSheetName).trim() !== "") {
    prevData = loadPreviousMonthReport(compareSheetName);
  }
  var attendanceData = null;
  if (attendanceSheetName && String(attendanceSheetName).trim() !== "") {
    attendanceData = loadAttendanceData(attendanceSheetName);
  }
  for (var hvKey in students) {
    var normalizedHvKey = normalizeHVCode(hvKey);
    if (attendanceData && attendanceData[normalizedHvKey]) {
      students[hvKey].attendance = attendanceData[normalizedHvKey];
    } else {
      students[hvKey].attendance = null;
    }
  }
  var rangeDateStr = formatDateVN(startDate) + " - " + formatDateVN(endDate);
  var monthLabel = getMonthLabel(startDate);
  var baseHeaders = ["Mã HV", "Họ Tên", "Lớp", "Điểm TB", "Chi tiết điểm", "Lỗi (BTVN/TV/YT)", "Số buổi đi", "Số buổi nghỉ", "Nhóm", "TC Điểm TB", "TC BTVN", "TC Thái độ", "TC Chép phạt", "Nhận xét chưa nhận diện", "Nội dung tin nhắn"];
  var prevHeaders = prevData ? ["Điểm TB (T.trước)", "Chi tiết điểm (T.trước)", "Lỗi (T.trước)", "Nhóm (T.trước)", "TC Điểm TB (T.trước)", "TC BTVN (T.trước)", "TC Thái độ (T.trước)", "TC Chép phạt (T.trước)", "Xu hướng", "Chi tiết xu hướng"] : [];
  var out = [baseHeaders.concat(prevHeaders)];
  var richTextBTVN = [];
  var richTextThaiDo = [];
  var richTextChepPhat = [];
  for (var key in students) {
    var s = students[key];
    var avg = "";
    if (s.scores.length > 0) {
      var sum = s.scores.reduce(function(a, b) { return a + b; }, 0);
      avg = (sum / s.scores.length).toFixed(1);
    }
    var indicators = evaluateIndicators(s, avg);
    var group = classifyStudent(s, avg);
    var thaiDoText = (s.attitudePhrases && s.attitudePhrases.length > 0)
      ? Array.from(new Set(s.attitudePhrases)).join(", ")
      : "chưa tập trung";
    var phatText = (s.chepPhatList && s.chepPhatList.length > 0) ? s.chepPhatList.join(", ") : "";
    var opts = { indicators: indicators, thaiDo: thaiDoText, phat: phatText };
    var msg;
    if (group === 1) msg = generateMessageGroup1(s, monthLabel, rangeDateStr, avg, opts);
    else if (group === 2) msg = generateMessageGroup2(s, monthLabel, rangeDateStr, avg, opts);
    else msg = generateMessageGroup3(s, monthLabel, rangeDateStr, avg, opts);
    var btvnLabel = indicators.btvn || "ok";
    var thaiDoLabel = indicators.thaiDo || "ok";
    var chepPhatLabel = indicators.chepPhat || "ok";
    var btvnLines = s.btvnMatchedLines || [];
    var thaiDoLines = s.thaiDoMatchedLines || [];
    var chepPhatLines = s.chepPhatMatchedLines || [];
    richTextBTVN.push(buildEvidenceRichText(btvnLabel, btvnLines));
    richTextThaiDo.push(buildEvidenceRichText(thaiDoLabel, thaiDoLines));
    richTextChepPhat.push(buildEvidenceRichText(chepPhatLabel, chepPhatLines));
    var btvnPlain = btvnLabel + (btvnLines.length > 0 ? "\n" + btvnLines.map(function(l) { return l.date + ": " + l.text; }).join("\n") : "");
    var thaiDoPlain = thaiDoLabel + (thaiDoLines.length > 0 ? "\n" + thaiDoLines.map(function(l) { return l.date + ": " + l.text; }).join("\n") : "");
    var chepPhatPlain = chepPhatLabel + (chepPhatLines.length > 0 ? "\n" + chepPhatLines.map(function(l) { return l.date + ": " + l.text; }).join("\n") : "");
    var unrecognizedText = (s.unrecognizedLines && s.unrecognizedLines.length > 0)
      ? s.unrecognizedLines.map(function(l) { return l.date + ": " + l.comment; }).join("\n") : "";
    var soBuoiDi = "";
    var soBuoiNghi = "";
    if (s.attendance) {
      soBuoiDi = String(s.attendance.di);
      soBuoiNghi = String(s.attendance.nghi);
    }
    var rowData = [
      key, s.name, s.class, avg, s.scores.join(", "),
      s.errors.btvn + "/" + s.errors.vocab + "/" + s.errors.att,
      soBuoiDi, soBuoiNghi, group,
      indicators.diemTB, btvnPlain, thaiDoPlain, chepPhatPlain,
      unrecognizedText, msg
    ];
    if (prevData) {
      var prev = prevData[normalizeHVCode(key)] || null;
      var prevVals = prev ? [prev.diemTB, prev.chiTietDiem, prev.loi, prev.nhom, prev.tcDiemTB, prev.tcBTVN, prev.tcThaiDo, prev.tcChepPhat] : ["", "", "", "", "", "", "", ""];
      var loiTotal = s.errors.btvn + s.errors.vocab + s.errors.att;
      var soBuoiNghiNum = (s.attendance && s.attendance.nghi != null) ? s.attendance.nghi : null;
      var currentForXuHuong = { avg: avg, group: group, tcThaiDo: indicators.thaiDo, tcChepPhat: indicators.chepPhat, loiTotal: loiTotal, soBuoiNghi: soBuoiNghiNum };
      var xuHuong = computeXuHuong(prev, currentForXuHuong);
      var xuHuongDetail = _formatXuHuongDetail(xuHuong);
      rowData = rowData.concat(prevVals).concat(xuHuong.result, xuHuongDetail);
    }
    out.push(rowData);
  }
  var targetName = "Báo Cáo Tổng Hợp";
  var target = ss.getSheetByName(targetName);
  if (!target) target = ss.insertSheet(targetName);
  else target.clear();
  if (out.length > 1) {
    target.getRange(1, 1, out.length, out[0].length).setValues(out);
    var boldPhrases = [
      "Cần lưu ý:", "Điểm TB còn cần cải thiện", "Trên lớp con còn chưa thực sự tập trung",
      "Cụ thể hôm rồi con có bị phạt:",
      "Chị nhắc nhẹ", "Một số điểm tích cực:", "Thực sự em đang khá lo lắng",
      "Về ý thức:", "Giai đoạn này rất quan trọng", "Chỉ cần lưu ý nhẹ:"
    ];
    var colBTVN = 11;
    var colThaiDo = 12;
    var colChepPhat = 13;
    var colUnrecognized = 14;
    var colMessage = 15;
    for (var r = 1; r < out.length; r++) {
      if (richTextBTVN[r - 1]) target.getRange(r + 1, colBTVN).setRichTextValue(richTextBTVN[r - 1]);
      if (richTextThaiDo[r - 1]) target.getRange(r + 1, colThaiDo).setRichTextValue(richTextThaiDo[r - 1]);
      if (richTextChepPhat[r - 1]) target.getRange(r + 1, colChepPhat).setRichTextValue(richTextChepPhat[r - 1]);
      var msg = out[r][colMessage - 1];
      if (msg && typeof msg === "string") {
        var rich = buildMessageRichText(msg, boldPhrases);
        if (rich) target.getRange(r + 1, colMessage).setRichTextValue(rich);
      }
    }
    target.getRange(1, 1, 1, out[0].length).setFontWeight("bold").setBackground("#cfe2f3");
    target.setColumnWidth(colMessage, 400);
    target.setColumnWidth(colBTVN, 220);
    target.setColumnWidth(colThaiDo, 220);
    target.setColumnWidth(colChepPhat, 220);
    target.setColumnWidth(colUnrecognized, 220);
    target.getRange(1, colBTVN, out.length, colBTVN).setWrapStrategy(SpreadsheetApp.WrapStrategy.WRAP);
    target.getRange(1, colThaiDo, out.length, colThaiDo).setWrapStrategy(SpreadsheetApp.WrapStrategy.WRAP);
    target.getRange(1, colChepPhat, out.length, colChepPhat).setWrapStrategy(SpreadsheetApp.WrapStrategy.WRAP);
    target.getRange(1, colUnrecognized, out.length, colUnrecognized).setWrapStrategy(SpreadsheetApp.WrapStrategy.WRAP);
    target.getRange(1, colMessage, out.length, colMessage).setWrapStrategy(SpreadsheetApp.WrapStrategy.WRAP);
    target.getRange("H:H").setWrapStrategy(SpreadsheetApp.WrapStrategy.WRAP);
    if (prevData && out[0].length > 15) {
      for (var c = 16; c <= out[0].length; c++) {
        target.getRange(1, c, out.length, c).setWrapStrategy(SpreadsheetApp.WrapStrategy.WRAP);
      }
      target.autoResizeColumns(16, out[0].length);
    }
    target.autoResizeColumns(1, 6);
    Logger.log("[Report] Report written: " + (out.length - 1) + " students");
    SpreadsheetApp.getUi().alert("✅ Đã tạo báo cáo thành công!");
    if (_pendingTagSuggestions) {
      Logger.log("[Report] Opening tag approval dialog for pending suggestions");
      showTagApprovalDialog();
    }
  } else {
    SpreadsheetApp.getUi().alert("⚠️ Không tìm thấy dữ liệu phù hợp trong khoảng thời gian này!");
  }
}
