// ======================================================
// BÁO CÁO TỔNG HỢP GỬI PHỤ HUYNH
// ======================================================

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
 * Đánh giá 4 tiêu chí: diemTB, thaiDo, btvnAzota, chepPhat.
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
  var thaiDo = s.errors.att === 0 ? "ok" : (s.errors.att === 1 ? "nho" : "xau");
  var btvnAzota = "ok";
  if (s.btvnAzota && s.btvnAzota.total > 0) {
    var completed = s.btvnAzota.completed || 0;
    var total = s.btvnAzota.total;
    var missing = total - completed;
    if (missing === 0) btvnAzota = "ok";
    else if (missing <= 2) btvnAzota = "nho";
    else btvnAzota = "xau";
  }
  if (s.btvnAzota.total === 0 && s.errors.btvn > 0) {
    btvnAzota = s.errors.btvn <= 2 ? "nho" : "xau";
  }
  var chepPhat = "ok";
  if (s.errors.vocab >= 1 || (s.chepPhatList && s.chepPhatList.length > 0)) chepPhat = "xau";
  return { diemTB: diemTB, thaiDo: thaiDo, btvnAzota: btvnAzota, chepPhat: chepPhat };
}

/**
 * Phân nhóm: 3 = Cần báo động, 1 = 0 hoặc 1 lỗi nhỏ, 2 = còn lại
 */
function classifyStudent(s, avg) {
  var ind = evaluateIndicators(s, avg);
  var badCount = 0;
  var hasNho = false;
  var hasXau = false;
  ["diemTB", "thaiDo", "btvnAzota", "chepPhat"].forEach(function(k) {
    if (ind[k] === "nho") { badCount++; hasNho = true; }
    if (ind[k] === "xau") { badCount++; hasXau = true; }
  });
  if (badCount >= 3) return 3;
  if (badCount === 0) return 1;
  if (badCount === 1 && hasNho && !hasXau) return 1;
  return 2;
}

function generateRangeReport(startStr, endStr) {
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
        btvnAzota: {total: 0, completed: 0},
        attitudePhrases: [], chepPhatList: []
      };
    }
    var scoreStr = score ? String(score).trim() : "";
    if (scoreStr !== "" && scoreStr.toUpperCase() !== "TB") {
      var parsedScore = parseScore(scoreStr);
      if (parsedScore !== null) students[id].scores.push(parsedScore);
    }
    var commentStr = comment ? String(comment).trim() : "";
    var chepPhatStr = chepPhat ? String(chepPhat).trim() : "";
    var attUpper = String(attendance).toUpperCase().trim();
    if ((attUpper === "X" || attUpper === "M") && commentStr === "" && chepPhatStr === "") {
      commentStr = "Đủ";
    }
    var ana = analyzeCommentText(commentStr);
    if (ana.btvn) students[id].errors.btvn++;
    if (ana.attitude) {
      students[id].errors.att++;
      var attPhrase = commentToAttitudePhrase(commentStr);
      if (attPhrase) students[id].attitudePhrases.push(attPhrase);
    }
    if (ana.vocab) students[id].errors.vocab++;
    if (chepPhatStr !== "") students[id].chepPhatList.push(chepPhatStr);
    if (!isCommentOnlyBTVNAzota(commentStr)) {
      var detailParts = [];
      if (scoreStr !== "") detailParts.push("Điểm: " + scoreStr);
      if (commentStr !== "" && commentStr.toLowerCase() !== "đủ") detailParts.push(commentStr);
      if (chepPhatStr !== "") detailParts.push("Chép phạt: " + chepPhatStr);
      if (detailParts.length > 0) {
        students[id].details.push("- " + formatDateVN(dateVal) + ": " + detailParts.join(" | "));
      }
    }
  }
  var btvnAzotaData = loadBTVNAzotaFromExternalSheet();
  var btvnAzotaDataNormalized = {};
  for (var btvnKey in btvnAzotaData) {
    var normalized = normalizeHVCode(btvnKey);
    if (!btvnAzotaDataNormalized[normalized]) btvnAzotaDataNormalized[normalized] = [];
    btvnAzotaDataNormalized[normalized].push({ originalKey: btvnKey, data: btvnAzotaData[btvnKey] });
  }
  for (var hvKey in students) {
    var normalizedHvKey = normalizeHVCode(hvKey);
    var matchedBtvn = btvnAzotaDataNormalized[normalizedHvKey];
    if (matchedBtvn && matchedBtvn.length > 0) {
      students[hvKey].btvnAzota = matchedBtvn[0].data;
    }
  }
  var rangeDateStr = formatDateVN(startDate) + " - " + formatDateVN(endDate);
  var monthLabel = getMonthLabel(startDate);
  var out = [["Mã HV", "Họ Tên", "Lớp", "Điểm TB", "Chi tiết điểm", "Lỗi (BTVN/TV/YT)", "Chỉ số BTVN Azota", "Nhóm", "TC Điểm TB", "TC Thái độ", "TC BTVN Azota", "TC Chép phạt", "Nội dung tin nhắn"]];
  for (var key in students) {
    var s = students[key];
    var avg = "";
    if (s.scores.length > 0) {
      var sum = s.scores.reduce(function(a, b) { return a + b; }, 0);
      avg = (sum / s.scores.length).toFixed(1);
    }
    var btvnAzotaRate = "";
    if (s.btvnAzota.total > 0) {
      var rate = (s.btvnAzota.completed / s.btvnAzota.total * 100).toFixed(1);
      btvnAzotaRate = s.btvnAzota.completed + "/" + s.btvnAzota.total + " (" + rate + "%)";
      if (s.btvnAzota.scores && s.btvnAzota.scores.length > 0) {
        btvnAzotaRate += " - Điểm: " + s.btvnAzota.scores.map(function(x) { return typeof x === "number" ? x.toFixed(1) : String(x); }).join(", ");
      }
    } else {
      btvnAzotaRate = "N/A";
    }
    var indicators = evaluateIndicators(s, avg);
    var group = classifyStudent(s, avg);
    var thaiDoText = (s.attitudePhrases && s.attitudePhrases.length > 0)
      ? Array.from(new Set(s.attitudePhrases)).join(", ")
      : "chưa tập trung";
    var phatText = (s.chepPhatList && s.chepPhatList.length > 0) ? s.chepPhatList.join(", ") : "";
    var opts = { indicators: indicators, thaiDo: thaiDoText, phat: phatText };
    var msg;
    if (group === 1) msg = generateMessageGroup1(s, monthLabel, rangeDateStr, avg, btvnAzotaRate, opts);
    else if (group === 2) msg = generateMessageGroup2(s, monthLabel, rangeDateStr, avg, btvnAzotaRate, opts);
    else msg = generateMessageGroup3(s, monthLabel, rangeDateStr, avg, btvnAzotaRate, opts);
    out.push([
      key, s.name, s.class, avg, s.scores.join(", "),
      s.errors.btvn + "/" + s.errors.vocab + "/" + s.errors.att,
      btvnAzotaRate, group,
      indicators.diemTB, indicators.thaiDo, indicators.btvnAzota, indicators.chepPhat,
      msg
    ]);
  }
  var targetName = "Báo Cáo Tổng Hợp";
  var target = ss.getSheetByName(targetName);
  if (!target) target = ss.insertSheet(targetName);
  else target.clear();
  if (out.length > 1) {
    target.getRange(1, 1, out.length, out[0].length).setValues(out);
    var boldPhrases = [
      "Cần lưu ý:", "Điểm TB còn cần cải thiện", "Trên lớp con còn chưa thực sự tập trung",
      "Về nhà con có vài buổi chưa hoàn thành BTVN Azota", "Cụ thể hôm rồi con có bị phạt:",
      "Chị nhắc nhẹ", "Một số điểm tích cực:", "Thực sự em đang khá lo lắng",
      "Về ý thức:", "Về bài vở:", "Giai đoạn này rất quan trọng", "Chỉ cần lưu ý nhẹ:"
    ];
    var colMessage = 13;
    for (var r = 1; r < out.length; r++) {
      var msg = out[r][colMessage - 1];
      if (msg && typeof msg === "string") {
        var rich = buildMessageRichText(msg, boldPhrases);
        if (rich) target.getRange(r + 1, colMessage).setRichTextValue(rich);
      }
    }
    target.getRange(1, 1, 1, out[0].length).setFontWeight("bold").setBackground("#cfe2f3");
    target.setColumnWidth(colMessage, 400);
    target.getRange(1, colMessage, out.length, colMessage).setWrapStrategy(SpreadsheetApp.WrapStrategy.WRAP);
    target.getRange("H:H").setWrapStrategy(SpreadsheetApp.WrapStrategy.WRAP);
    target.autoResizeColumns(1, 7);
    SpreadsheetApp.getUi().alert("✅ Đã tạo báo cáo thành công!");
  } else {
    SpreadsheetApp.getUi().alert("⚠️ Không tìm thấy dữ liệu phù hợp trong khoảng thời gian này!");
  }
}
