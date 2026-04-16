// ======================================================
// CHỈ TẠO LẠI NỘI DUNG TIN NHẮN (không chạy lại báo cáo)
// Đọc sheet "Báo Cáo Tổng Hợp", ghi đè cột "Nội dung tin nhắn" (mẫu V2)
// ======================================================

var MESSAGE_REGENERATE_SHEET_DEFAULT = "Báo Cáo Tổng Hợp";

var DOC_REGEN_MONTH = "regen_msg_month";
var DOC_REGEN_YEAR = "regen_msg_year";
var DOC_REGEN_SALUTATION = "regen_msg_salutation";

function _getRegenMessageDocPrefs() {
  var p = PropertiesService.getDocumentProperties();
  return {
    month: p.getProperty(DOC_REGEN_MONTH) || "",
    year: p.getProperty(DOC_REGEN_YEAR) || "",
    salutation: p.getProperty(DOC_REGEN_SALUTATION) || ""
  };
}

function _saveRegenMessageDocPrefs(month, year, salutation) {
  var p = PropertiesService.getDocumentProperties();
  var props = {};
  props[DOC_REGEN_MONTH] = String(month);
  props[DOC_REGEN_YEAR] = String(year);
  props[DOC_REGEN_SALUTATION] = salutation === "anh" ? "anh" : "chị";
  p.setProperties(props, false);
}

function _mrFindCol(headerRow, name) {
  for (var i = 0; i < headerRow.length; i++) {
    if (String(headerRow[i] || "").trim() === name) return i;
  }
  return -1;
}

function _mrFirstLine(cell) {
  if (cell == null || cell === "") return "";
  var s = String(cell).trim();
  var idx = s.indexOf("\n");
  return idx === -1 ? s : s.substring(0, idx).trim();
}

function _mrParseFloat(v) {
  if (v == null || v === "") return null;
  var n = parseFloat(String(v).replace(",", ".").trim());
  return isNaN(n) ? null : n;
}

function _mrHash(str) {
  var h = 0;
  var s = String(str || "");
  for (var i = 0; i < s.length; i++) h = ((h << 5) - h + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

/** Lấy dòng thứ 2 trở đi của ô TC (chi tiết theo ngày) */
function _mrTailLines(cell, maxLines) {
  maxLines = maxLines || 2;
  var s = String(cell || "").trim();
  if (!s) return [];
  var parts = s.split(/\n/).map(function(x) {
    return x.trim();
  }).filter(Boolean);
  if (parts.length <= 1) return [];
  return parts.slice(1, 1 + maxLines);
}

/**
 * Lấy các cụm in đậm từ RichTextValue (minh chứng tag trong ô TC).
 */
function _mrExtractBoldPhrases(richVal) {
  var out = [];
  if (!richVal || typeof richVal.getRuns !== "function") return out;
  var runs;
  try {
    runs = richVal.getRuns();
  } catch (e) {
    return out;
  }
  if (!runs || !runs.length) return out;
  var seen = {};
  for (var i = 0; i < runs.length; i++) {
    var run = runs[i];
    if (!run) continue;
    var st = run.getTextStyle();
    if (!st || st.isBold() !== true) continue;
    var t = String(run.getText() || "").trim();
    if (!t) continue;
    var k = t.toLowerCase();
    if (seen[k]) continue;
    seen[k] = true;
    out.push(t);
  }
  return out;
}

/** Nối bold + fallback tail; dùng cho một dòng mô tả lỗi. */
function _mrDetailFromTc(boldList, cellPlain, maxTail) {
  maxTail = maxTail || 3;
  if (boldList && boldList.length > 0) return boldList.join(", ");
  var tail = _mrTailLines(cellPlain, maxTail);
  if (tail.length) return tail.join("; ");
  return "";
}

/**
 * @param {string} firstLower - dòng đầu ô TC (lowercase)
 */
function _mrTcDimensionBad(firstLower) {
  return firstLower !== "" && firstLower !== "ok";
}

/**
 * Tin nhắn V2: đa dạng mở/kết, ít bullet, đoạn gọn.
 * @param {Object} ctx
 */
function buildMessageV2(ctx) {
  var sal = ctx.salutation === "anh" ? "anh" : "chị";
  var fullName = String(ctx.hoTen || "").trim() || "con";
  var ten = getDisplayName(fullName) || fullName;
  var seed = _mrHash(fullName + ctx.month + ctx.year);
  var M = ctx.month;
  var Y = ctx.year;

  var tcBtvn = _mrFirstLine(ctx.tcBTVN).toLowerCase();
  var tcChep = _mrFirstLine(ctx.tcChepPhat).toLowerCase();
  var tcThai = _mrFirstLine(ctx.tcThaiDo).toLowerCase();
  var nghiNum = null;
  if (ctx.soBuoiNghi != null && String(ctx.soBuoiNghi).trim() !== "") {
    nghiNum = parseInt(String(ctx.soBuoiNghi), 10);
    if (isNaN(nghiNum)) nghiNum = null;
  }
  var curAvg = _mrParseFloat(ctx.diemTB);
  var prevAvg = _mrParseFloat(ctx.diemTBTruoc);

  var scoreDropped =
    curAvg !== null && prevAvg !== null && curAvg < prevAvg - 0.05;
  var scoreLow =
    curAvg !== null && curAvg < 6.5 && (!prevAvg || curAvg <= prevAvg);
  var btvnBad = _mrTcDimensionBad(tcBtvn);
  var chepBad = _mrTcDimensionBad(tcChep);
  var thaiBad = _mrTcDimensionBad(tcThai);
  var nghiBad = nghiNum !== null && nghiNum >= 1;

  var hasConcern =
    scoreDropped ||
    scoreLow ||
    btvnBad ||
    chepBad ||
    thaiBad ||
    nghiBad;

  // —— Mở đầu (3 kiểu, xen kẽ theo seed)
  var open = "";
  var o = seed % 3;
  if (o === 0) {
    open =
      "Em chào " +
      sal +
      " ạ! Em nhắn tin để trao đổi kỹ hơn về tình hình của " +
      ten +
      " tháng " +
      M +
      "/" +
      Y +
      " ạ.";
  } else if (o === 1) {
    open =
      "Dạ em chào " +
      sal +
      " ạ! Em cập nhật tình hình tháng " +
      M +
      "/" +
      Y +
      " của " +
      ten +
      " tới gia đình mình ạ.";
  } else {
    open =
      "Dạ em chào " +
      sal +
      " ạ! Em xin trao đổi nhanh về " +
      ten +
      " tháng " +
      M +
      "/" +
      Y +
      " ạ.";
  }

  // —— Điểm tích cực (một đoạn, không bullet)
  var posBits = [];
  if (tcBtvn === "ok") posBits.push("bài tập về nhà và nề nếp làm bài ổn");
  if (tcThai === "ok")
    posBits.push("trên lớp con có ý thức tốt");
  if (tcChep === "ok") posBits.push("không phải chép phạt");
  if (nghiNum !== null && nghiNum === 0)
    posBits.push("đi học chuyên cần, đầy đủ các buổi");
  if (curAvg !== null && curAvg >= 8 && !scoreDropped)
    posBits.push("điểm kiểm tra đang ở mức khá (" + curAvg + " điểm)");

  var body = [open, ""];
  if (posBits.length > 0) {
    var lead =
      seed % 2 === 0
        ? "Tháng này con có điểm tích cực là "
        : "Về ưu điểm: ";
    var mid = posBits.join(", ");
    mid = mid.charAt(0).toUpperCase() + mid.slice(1);
    body.push(lead + mid + ".");
    body.push("");
  }

  // —— Phần cần lưu ý (gọn, có nhãn nhỏ như mẫu)
  if (hasConcern) {
    var bridge =
      seed % 3 === 0
        ? "Tuy nhiên, em vẫn hơi lo lắng vì "
        : seed % 3 === 1
          ? "Tuy nhiên, em cần trao đổi với " +
            sal +
            " một vài điểm: "
          : "Cần lưu ý: ";
    if (scoreDropped && thaiBad && chepBad)
      bridge +=
        "con đang có dấu hiệu sa sút rõ rệt về cả điểm số lẫn ý thức làm bài.";
    else if (scoreDropped)
      bridge +=
        "con đang có dấu hiệu sụt giảm / chưa ổn định về kết quả học tập.";
    else bridge += "con cần lưu ý thêm một số điểm sau.";
    body.push(bridge);
    body.push("");

    if (nghiBad) {
      body.push(
        "Về chuyên cần: Con có nghỉ " +
          nghiNum +
          " buổi học trong tháng này."
      );
      body.push("");
    }
    if (scoreDropped && curAvg !== null && prevAvg !== null) {
      body.push(
        "Về điểm số: Điểm trung bình tháng này thấp hơn tháng trước (" +
          curAvg +
          " so với " +
          prevAvg +
          ")."
      );
      body.push("");
    } else if (scoreLow && curAvg !== null && !scoreDropped) {
      body.push(
        "Về sức học: Điểm trung bình tháng này còn thấp (" +
          curAvg +
          ")."
      );
      body.push("");
    }

    var boldB = ctx.boldBtvn || [];
    var boldT = ctx.boldThai || [];
    var boldC = ctx.boldChep || [];

    if (btvnBad) {
      var dB = _mrDetailFromTc(boldB, ctx.tcBTVN, 3);
      var lineB =
        "Về BTVN: Con còn mắc thiếu sót / chưa ổn bài tập về nhà" +
        (dB ? " (" + dB + ")." : ".");
      body.push(lineB);
      body.push("");
    }
    if (thaiBad) {
      var dT = _mrDetailFromTc(boldT, ctx.tcThaiDo, 3);
      var lineT =
        "Về ý thức trên lớp: Con cần chấn chỉnh thái độ học tập" +
        (dT ? " — cụ thể: " + dT + "." : ".");
      body.push(lineT);
      body.push("");
    }
    if (chepBad) {
      var dC = _mrDetailFromTc(boldC, ctx.tcChepPhat, 3);
      var lineC =
        "Về chép phạt / ghi nhớ lỗi: Con còn phải chép phạt" +
        (dC ? " (" + dC + ")." : ".");
      body.push(lineC);
      body.push("");
    }

    var remind =
      seed % 2 === 0
        ? sal +
          " nhắc nhẹ để con tập trung hơn vào bài kiểm tra và bài về nhà giúp em nha."
        : "Nhờ " +
          sal +
          " sát sao thêm để con lấy lại phong độ; nếu có khó khăn gì " +
          sal +
          " phản hồi em nhé.";
    body.push(remind);
    body.push("");
  }

  // —— Kết (4 kiểu)
  var c = (seed >> 3) % 4;
  if (c === 0) {
    body.push(
      "Trong quá trình học tập, nếu con có khúc mắc hay khó khăn gì, mong được gia đình góp ý chia sẻ để lớp học cải thiện chất lượng. Em cảm ơn " +
        sal +
        " ạ."
    );
  } else if (c === 1) {
    body.push(
      "Trong quá trình học nếu con có khó khăn gì, " +
        sal +
        " trao đổi thêm với em nhé. Em cảm ơn " +
        sal +
        " ạ."
    );
  } else if (c === 2) {
    body.push(
      "Rất mong gia đình đồng hành để con tiến bộ. Em cảm ơn " + sal + " nhiều ạ!"
    );
  } else {
    body.push(
      sal +
        " nhắc nhẹ con giữ thói quen học đều giúp em. Kiến thức ngày càng nặng, con lơ là dễ tụt điểm ạ. Em cảm ơn " +
        sal +
        "!"
    );
  }

  return body.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

function _mrBuildColMap(headerRow) {
  return {
    maHV: _mrFindCol(headerRow, "Mã HV"),
    hoTen: _mrFindCol(headerRow, "Họ Tên"),
    diemTB: _mrFindCol(headerRow, "Điểm TB"),
    diemTBTruoc: _mrFindCol(headerRow, "Điểm TB (T.trước)"),
    loi: _mrFindCol(headerRow, "Lỗi (BTVN/TV/YT)"),
    soBuoiNghi: _mrFindCol(headerRow, "Số buổi nghỉ"),
    tcBTVN: _mrFindCol(headerRow, "TC BTVN"),
    tcThaiDo: _mrFindCol(headerRow, "TC Thái độ"),
    tcChepPhat: _mrFindCol(headerRow, "TC Chép phạt"),
    noiDungTN: _mrFindCol(headerRow, "Nội dung tin nhắn"),
    xuHuong: _mrFindCol(headerRow, "Xu hướng"),
    chiTietXuHuong: _mrFindCol(headerRow, "Chi tiết xu hướng")
  };
}

function _mrCell(row, colIdx) {
  if (colIdx < 0 || colIdx >= row.length) return "";
  return row[colIdx] == null ? "" : row[colIdx];
}

/**
 * @param {GoogleAppsScript.Spreadsheet.Sheet} sheet
 * @param {number} month
 * @param {number} year
 * @param {string} salutation "chị"|"anh"
 */
function regenerateMessagesOnSheet(sheet, month, year, salutation) {
  var range = sheet.getDataRange();
  var values = range.getValues();
  var displays = range.getDisplayValues();
  if (values.length < 2) return 0;
  var headerRow = values[0];
  var map = _mrBuildColMap(headerRow);
  if (map.hoTen < 0 || map.noiDungTN < 0) {
    throw new Error("Thiếu cột bắt buộc: Họ Tên hoặc Nội dung tin nhắn");
  }
  var lastSheetRow = values.length;

  var richBtvnGrid = null;
  var richThaiGrid = null;
  var richChepGrid = null;
  try {
    if (map.tcBTVN >= 0) {
      richBtvnGrid = sheet
        .getRange(2, map.tcBTVN + 1, lastSheetRow, map.tcBTVN + 1)
        .getRichTextValues();
    }
    if (map.tcThaiDo >= 0) {
      richThaiGrid = sheet
        .getRange(2, map.tcThaiDo + 1, lastSheetRow, map.tcThaiDo + 1)
        .getRichTextValues();
    }
    if (map.tcChepPhat >= 0) {
      richChepGrid = sheet
        .getRange(2, map.tcChepPhat + 1, lastSheetRow, map.tcChepPhat + 1)
        .getRichTextValues();
    }
  } catch (eRich) {
    richBtvnGrid = null;
    richThaiGrid = null;
    richChepGrid = null;
  }

  var colMsg = map.noiDungTN + 1;
  var boldPhrases = [
    "Cần lưu ý:",
    "Tuy nhiên",
    "Về điểm số:",
    "Về BTVN:",
    "Về ý thức trên lớp:",
    "Về chép phạt",
    "Về chuyên cần:",
    "Về bài vở:",
    "Về ý thức:",
    "sụt giảm",
    "sa sút",
    "em hơi lo lắng",
    "nhắc nhẹ",
    "Trong quá trình học tập"
  ];
  var count = 0;
  for (var r = 1; r < values.length; r++) {
    var row = values[r];
    var rowD = displays[r];
    var hasMa = map.maHV >= 0 && _mrCell(row, map.maHV).toString().trim();
    var hasTen =
      _mrCell(rowD, map.hoTen).toString().trim() ||
      _mrCell(row, map.hoTen).toString().trim();
    if (map.maHV >= 0 && !hasMa) continue;
    if (map.maHV < 0 && !hasTen) continue;
    var off = r - 1;
    var bB = [];
    var bT = [];
    var bC = [];
    if (richBtvnGrid && richBtvnGrid[off] && richBtvnGrid[off][0]) {
      bB = _mrExtractBoldPhrases(richBtvnGrid[off][0]);
    }
    if (richThaiGrid && richThaiGrid[off] && richThaiGrid[off][0]) {
      bT = _mrExtractBoldPhrases(richThaiGrid[off][0]);
    }
    if (richChepGrid && richChepGrid[off] && richChepGrid[off][0]) {
      bC = _mrExtractBoldPhrases(richChepGrid[off][0]);
    }

    var ctx = {
      hoTen: _mrCell(rowD, map.hoTen) || _mrCell(row, map.hoTen),
      diemTB: _mrCell(rowD, map.diemTB),
      diemTBTruoc: map.diemTBTruoc >= 0 ? _mrCell(rowD, map.diemTBTruoc) : "",
      soBuoiNghi: map.soBuoiNghi >= 0 ? _mrCell(rowD, map.soBuoiNghi) : null,
      tcBTVN: map.tcBTVN >= 0 ? _mrCell(rowD, map.tcBTVN) : "",
      tcThaiDo: map.tcThaiDo >= 0 ? _mrCell(rowD, map.tcThaiDo) : "",
      tcChepPhat: map.tcChepPhat >= 0 ? _mrCell(rowD, map.tcChepPhat) : "",
      loiBTVN: map.loi >= 0 ? _mrCell(rowD, map.loi) : "",
      xuHuong: map.xuHuong >= 0 ? _mrCell(rowD, map.xuHuong) : "",
      chiTietXuHuong:
        map.chiTietXuHuong >= 0 ? _mrCell(rowD, map.chiTietXuHuong) : "",
      month: month,
      year: year,
      salutation: salutation,
      boldBtvn: bB,
      boldThai: bT,
      boldChep: bC
    };
    var msg = buildMessageV2(ctx);
    sheet.getRange(r + 1, colMsg).setValue(msg);
    var rich = buildMessageRichText(msg, boldPhrases);
    if (rich) sheet.getRange(r + 1, colMsg).setRichTextValue(rich);
    count++;
  }
  sheet.setColumnWidth(colMsg, 400);
  sheet
    .getRange(2, colMsg, values.length, colMsg)
    .setWrapStrategy(SpreadsheetApp.WrapStrategy.WRAP);
  return count;
}

function showRegenerateMessagesDialog() {
  var ui = SpreadsheetApp.getUi();
  var saved = _getRegenMessageDocPrefs();
  var hintMonth = saved.month
    ? "\n(Để trống = dùng tháng đã lưu: " + saved.month + ")"
    : "";
  var r1 = ui.prompt(
    "Tháng / Năm (lời chào)",
    "Nhập tháng (1-12):" + hintMonth,
    ui.ButtonSet.OK_CANCEL
  );
  if (r1.getSelectedButton() !== ui.Button.OK) return;
  var monthStr = String(r1.getResponseText()).trim();
  var month = monthStr
    ? parseInt(monthStr, 10)
    : saved.month
      ? parseInt(String(saved.month).trim(), 10)
      : NaN;
  if (isNaN(month) || month < 1 || month > 12) {
    ui.alert("Tháng không hợp lệ.");
    return;
  }
  var hintYear = saved.year
    ? "\n(Để trống = dùng năm đã lưu: " + saved.year + ")"
    : "";
  var r2 = ui.prompt(
    "Năm:",
    "Nhập năm (vd: 2026):" + hintYear,
    ui.ButtonSet.OK_CANCEL
  );
  if (r2.getSelectedButton() !== ui.Button.OK) return;
  var yearStr = String(r2.getResponseText()).trim();
  var year = yearStr
    ? parseInt(yearStr, 10)
    : saved.year
      ? parseInt(String(saved.year).trim(), 10)
      : NaN;
  if (isNaN(year) || year < 2000 || year > 2100) {
    ui.alert("Năm không hợp lệ.");
    return;
  }
  var salHint =
    saved.salutation === "anh" || saved.salutation === "chị"
      ? "\n\n(Lần trước: " + saved.salutation + ")"
      : "";
  var r3 = ui.alert(
    "Xưng hô",
    "Chọn Chị (mặc định PH nữ) hoặc Anh (PH nam).\n\nOK = chị / Cancel = anh" +
      salHint,
    ui.ButtonSet.OK_CANCEL
  );
  if (r3 === ui.Button.CLOSE) return;
  var salutation = r3 === ui.Button.CANCEL ? "anh" : "chị";

  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(MESSAGE_REGENERATE_SHEET_DEFAULT);
  if (!sheet) {
    ui.alert(
      "⚠️ Chưa có sheet \"" +
        MESSAGE_REGENERATE_SHEET_DEFAULT +
        "\". Hãy chạy Báo cáo Tháng > 1. Tạo báo cáo tổng hợp trước."
    );
    return;
  }
  try {
    var n = regenerateMessagesOnSheet(sheet, month, year, salutation);
    _saveRegenMessageDocPrefs(month, year, salutation);
    ui.alert("✅ Đã tạo lại nội dung tin nhắn (mẫu mới) cho " + n + " dòng.");
  } catch (e) {
    ui.alert("Lỗi: " + (e && e.message ? e.message : e));
  }
}
