// ======================================================
// CHỈ TẠO LẠI NỘI DUNG TIN NHẮN (không chạy lại báo cáo)
// Đọc sheet "Báo Cáo Tổng Hợp", ghi đè cột "Nội dung tin nhắn" (mẫu V2)
// ======================================================

var MESSAGE_REGENERATE_SHEET_DEFAULT = "Báo Cáo Tổng Hợp";

function _mrFindCol(headerRow, name) {
  for (var i = 0; i < headerRow.length; i++) {
    if (String(headerRow[i] || "").trim() === name) return i;
  }
  return -1;
}

/** Parse tỉ lệ BTVN Azota từ "x/y (z%)" */
function _mrParseBTVNAzotaRate(s) {
  if (!s || typeof s !== "string") return null;
  var m = String(s).match(/\((\d+(?:[.,]\d+)?)\s*%\)/);
  if (m) return parseFloat(m[1].replace(",", "."));
  var mm = String(s).match(/(\d+)\s*\/\s*(\d+)/);
  if (mm) {
    var den = parseInt(mm[2], 10);
    return den > 0 ? (parseInt(mm[1], 10) / den * 100) : null;
  }
  return null;
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

/** Rút gọn nhận xét: tối đa maxLines dòng, mỗi dòng tối đa maxLen ký tự */
function _mrShortenNhanXet(text, maxLines, maxLen) {
  maxLines = maxLines || 2;
  maxLen = maxLen || 100;
  var s = String(text || "").trim();
  if (!s) return "";
  var rows = s.split(/\n/).map(function(x) {
    return x.trim();
  }).filter(Boolean);
  var out = [];
  for (var i = 0; i < rows.length && out.length < maxLines; i++) {
    var line = rows[i];
    if (line.length > maxLen) line = line.substring(0, maxLen - 1) + "…";
    out.push(line);
  }
  return out.join(" ");
}

/** "5/10 (50%)" -> { done:5, total:10 } */
function _mrBtvnXY(s) {
  var m = String(s || "").match(/(\d+)\s*\/\s*(\d+)/);
  if (!m) return null;
  return { done: parseInt(m[1], 10), total: parseInt(m[2], 10) };
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

  var tcChep = _mrFirstLine(ctx.tcChepPhat).toLowerCase();
  var tcThai = _mrFirstLine(ctx.tcThaiDo).toLowerCase();
  var nghiNum = null;
  if (ctx.soBuoiNghi != null && String(ctx.soBuoiNghi).trim() !== "") {
    nghiNum = parseInt(String(ctx.soBuoiNghi), 10);
    if (isNaN(nghiNum)) nghiNum = null;
  }
  var curAvg = _mrParseFloat(ctx.diemTB);
  var prevAvg = _mrParseFloat(ctx.diemTBTruoc);
  var curPct = _mrParseBTVNAzotaRate(String(ctx.chiSoBTVN || ""));
  var prevPct = _mrParseBTVNAzotaRate(String(ctx.chiSoBTVNTruoc || ""));
  var btvnXY = _mrBtvnXY(String(ctx.chiSoBTVN || ""));
  var nxShort = _mrShortenNhanXet(ctx.nhanXetChuaNhanDien, 2, 95);

  var scoreDropped =
    curAvg !== null && prevAvg !== null && curAvg < prevAvg - 0.05;
  var scoreLow =
    curAvg !== null && curAvg < 6.5 && (!prevAvg || curAvg <= prevAvg);
  var btvnBad =
    curPct !== null &&
    (curPct <= 0.5 || (prevPct !== null && curPct + 0.5 < prevPct));
  var btvnZero = curPct !== null && curPct <= 0.001;
  var chepBad = tcChep !== "" && tcChep !== "ok";
  var thaiBad = tcThai !== "" && tcThai !== "ok";
  var nghiBad = nghiNum !== null && nghiNum >= 1;

  var hasConcern =
    scoreDropped ||
    scoreLow ||
    btvnBad ||
    chepBad ||
    thaiBad ||
    nghiBad ||
    (nxShort && (chepBad || thaiBad || btvnBad || scoreDropped));

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
  if (tcThai === "ok")
    posBits.push("trên lớp con có ý thức tốt");
  if (tcChep === "ok") posBits.push("không phải chép phạt");
  if (nghiNum !== null && nghiNum === 0)
    posBits.push("đi học chuyên cần, đầy đủ các buổi");
  if (curPct !== null && curPct >= 99)
    posBits.push("làm bài Azota đầy đủ");
  else if (curPct !== null && curPct >= 50)
    posBits.push(
      "về nhà con có nỗ lực hoàn thành khoảng " +
        Math.round(curPct) +
        "% bài Azota"
    );
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
    else if (scoreDropped || btvnZero)
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
    if (chepBad) {
      var chepTail = _mrTailLines(ctx.tcChepPhat, 1);
      var line =
        "Về ý thức: Con vẫn còn phải chép phạt để ghi nhớ lỗi sai";
      if (chepTail.length)
        line += " (" + chepTail[0] + ").";
      else line += ".";
      body.push(line);
      body.push("");
    } else if (thaiBad) {
      body.push(
        "Về ý thức: Trên lớp con còn cần chấn chỉnh thái độ học tập."
      );
      body.push("");
    }
    if (btvnBad) {
      var bLine = "Về bài vở: ";
      if (btvnZero && btvnXY)
        bLine +=
          "Con thiếu khá nhiều bài tập Azota (" +
          btvnXY.done +
          "/" +
          btvnXY.total +
          " bài).";
      else if (prevPct !== null && curPct !== null && curPct < prevPct)
        bLine +=
          "Tỉ lệ Azota giảm so với tháng trước (khoảng " +
          Math.round(curPct) +
          "% so với " +
          Math.round(prevPct) +
          "%).";
      else if (btvnXY)
        bLine +=
          "Con cần hoàn thành đều bài Azota (" +
          btvnXY.done +
          "/" +
          btvnXY.total +
          " bài).";
      else bLine += "Con cần chủ động làm đủ bài Azota ở nhà.";
      body.push(bLine);
      if (nxShort && (btvnZero || btvnBad)) {
        body.push("Đặc biệt: " + nxShort);
      }
      body.push("");
    } else if (nxShort && (chepBad || thaiBad)) {
      body.push("Chi tiết: " + nxShort);
      body.push("");
    } else if (nxShort && scoreDropped) {
      body.push("Ghi chú: " + nxShort);
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
    chiSoBTVN: _mrFindCol(headerRow, "Chỉ số BTVN Azota"),
    chiSoBTVNTruoc: _mrFindCol(headerRow, "Chỉ số BTVN Azota (T.trước)"),
    soBuoiNghi: _mrFindCol(headerRow, "Số buổi nghỉ"),
    tcThaiDo: _mrFindCol(headerRow, "TC Thái độ"),
    tcChepPhat: _mrFindCol(headerRow, "TC Chép phạt"),
    nhanXet: _mrFindCol(headerRow, "Nhận xét chưa nhận diện"),
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
  var colMsg = map.noiDungTN + 1;
  var boldPhrases = [
    "Cần lưu ý:",
    "Tuy nhiên",
    "Về điểm số:",
    "Về bài vở:",
    "Về ý thức:",
    "Về chuyên cần:",
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
    var hasTen = _mrCell(rowD, map.hoTen).toString().trim() || _mrCell(row, map.hoTen).toString().trim();
    if (map.maHV >= 0 && !hasMa) continue;
    if (map.maHV < 0 && !hasTen) continue;
    var ctx = {
      hoTen: _mrCell(rowD, map.hoTen) || _mrCell(row, map.hoTen),
      diemTB: _mrCell(rowD, map.diemTB),
      diemTBTruoc: map.diemTBTruoc >= 0 ? _mrCell(rowD, map.diemTBTruoc) : "",
      chiSoBTVN: map.chiSoBTVN >= 0 ? _mrCell(rowD, map.chiSoBTVN) : "",
      chiSoBTVNTruoc:
        map.chiSoBTVNTruoc >= 0 ? _mrCell(rowD, map.chiSoBTVNTruoc) : "",
      soBuoiNghi: map.soBuoiNghi >= 0 ? _mrCell(rowD, map.soBuoiNghi) : null,
      tcThaiDo: map.tcThaiDo >= 0 ? _mrCell(rowD, map.tcThaiDo) : "",
      tcChepPhat: map.tcChepPhat >= 0 ? _mrCell(rowD, map.tcChepPhat) : "",
      nhanXetChuaNhanDien: map.nhanXet >= 0 ? _mrCell(rowD, map.nhanXet) : "",
      loiBTVN: map.loi >= 0 ? _mrCell(rowD, map.loi) : "",
      xuHuong: map.xuHuong >= 0 ? _mrCell(rowD, map.xuHuong) : "",
      chiTietXuHuong:
        map.chiTietXuHuong >= 0 ? _mrCell(rowD, map.chiTietXuHuong) : "",
      month: month,
      year: year,
      salutation: salutation
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
  var r1 = ui.prompt(
    "Tháng / Năm (lời chào)",
    "Nhập tháng (1-12):",
    ui.ButtonSet.OK_CANCEL
  );
  if (r1.getSelectedButton() !== ui.Button.OK) return;
  var month = parseInt(String(r1.getResponseText()).trim(), 10);
  if (isNaN(month) || month < 1 || month > 12) {
    ui.alert("Tháng không hợp lệ.");
    return;
  }
  var r2 = ui.prompt("Năm:", "Nhập năm (vd: 2026):", ui.ButtonSet.OK_CANCEL);
  if (r2.getSelectedButton() !== ui.Button.OK) return;
  var year = parseInt(String(r2.getResponseText()).trim(), 10);
  if (isNaN(year) || year < 2000 || year > 2100) {
    ui.alert("Năm không hợp lệ.");
    return;
  }
  var r3 = ui.alert(
    "Xưng hô",
    "Chọn Chị (mặc định PH nữ) hoặc Anh (PH nam).\n\nOK = chị / Cancel = anh",
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
    ui.alert("✅ Đã tạo lại nội dung tin nhắn (mẫu mới) cho " + n + " dòng.");
  } catch (e) {
    ui.alert("Lỗi: " + (e && e.message ? e.message : e));
  }
}
