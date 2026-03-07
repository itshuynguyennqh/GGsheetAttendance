// ======================================================
// CẢNH BÁO TÍCH HỢP TOÀN DIỆN
// ======================================================

function showIntegratedWarningDialog() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheets = ss.getSheets();
  var sheetOptions = "";
  for (var i = 0; i < sheets.length; i++) {
    sheetOptions += "<option value=\"" + sheets[i].getName() + "\">" + sheets[i].getName() + "</option>";
  }
  var html = "<!DOCTYPE html><html><head><base target=\"_top\"><style>body{font-family:'Segoe UI',sans-serif;padding:15px;font-size:13px}.section{border:1px solid #ddd;padding:10px;border-radius:5px;margin-bottom:10px;background:#f9f9f9}.title{font-weight:bold;color:#1a73e8;margin-bottom:5px;display:block;border-bottom:1px solid #ccc;padding-bottom:3px}label{display:flex;justify-content:space-between;margin-bottom:5px;align-items:center}input,select{width:140px;padding:5px;border:1px solid #ccc;border-radius:3px}button{width:100%;padding:12px;background:#d93025;color:white;border:none;border-radius:4px;font-weight:bold;cursor:pointer;margin-top:5px}button:hover{background:#b02a20}</style></head><body><h3 style=\"text-align:center;margin:0 0 10px 0;color:#d93025\">🚨 CẢNH BÁO TOÀN DIỆN</h3><div class=\"section\"><span class=\"title\">1. Dữ liệu Hàng Ngày (BTVN/Ý thức)</span><label>Chọn tháng quét: <input type=\"month\" id=\"monthPicker\" value=\"" + new Date().toISOString().slice(0, 7) + "\"></label><label>Ngưỡng thiếu BTVN: <input type=\"number\" id=\"limitBTVN\" value=\"3\" min=\"1\"></label><label>Ngưỡng lỗi Ý thức: <input type=\"number\" id=\"limitAtt\" value=\"2\" min=\"1\"></label><label>Ngưỡng Điểm TB <: <input type=\"number\" id=\"limitScore\" value=\"5\" step=\"0.5\"></label></div><div class=\"section\"><span class=\"title\">2. Dữ liệu Điểm danh (Chuyên cần)</span><label>Chọn Sheet Điểm danh: <select id=\"attSheetName\">" + sheetOptions + "</select></label><label>Ngưỡng nghỉ học >: <input type=\"number\" id=\"limitAbsence\" value=\"2\" min=\"1\"></label></div><button onclick=\"run()\" id=\"btn\">QUÉT TOÀN BỘ HỆ THỐNG</button><div id=\"msg\" style=\"display:none;text-align:center;margin-top:10px;color:#666\">⏳ Đang tổng hợp dữ liệu...</div><script>var opts=document.getElementById('attSheetName').options;for(var i=0;i<opts.length;i++){if(opts[i].value.toLowerCase().indexOf('attendance')>=0||opts[i].value.indexOf('T12')>=0){document.getElementById('attSheetName').selectedIndex=i;break}}function run(){var cfg={month:document.getElementById('monthPicker').value,btvn:document.getElementById('limitBTVN').value,att:document.getElementById('limitAtt').value,score:document.getElementById('limitScore').value,attSheet:document.getElementById('attSheetName').value,absence:document.getElementById('limitAbsence').value};if(!cfg.month){alert('Vui lòng chọn tháng!');return}document.getElementById('btn').disabled=true;document.getElementById('msg').style.display='block';google.script.run.withSuccessHandler(google.script.host.close).scanIntegratedSystem(cfg)}</script></body></html>";
  SpreadsheetApp.getUi().showModalDialog(HtmlService.createHtmlOutput(html).setWidth(400).setHeight(520), " ");
}

function createStudentObj(name, lop) {
  return { name: name, class: lop, btvnCount: 0, attCount: 0, absenceCount: 0, scores: [], details: [] };
}

function scanIntegratedSystem(cfg) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var students = {};
  var dailySheet = ss.getActiveSheet();
  var dailyData = dailySheet.getDataRange().getValues();
  var targetYear = parseInt(cfg.month.split("-")[0], 10);
  var targetMonth = parseInt(cfg.month.split("-")[1], 10);
  for (var i = 1; i < dailyData.length; i++) {
    var row = dailyData[i];
    var d = parseDate(row[0]);
    if (!d || d.getMonth() + 1 !== targetMonth || d.getFullYear() !== targetYear) continue;
    var id = String(row[3]).trim();
    if (!id || id.indexOf("HV") !== 0) continue;
    if (!students[id]) students[id] = createStudentObj(row[4], row[6]);
    var comment = row[8];
    var analysis = analyzeCommentText(comment);
    if (analysis.btvn) {
      students[id].btvnCount++;
      students[id].details.push("[" + formatDateVN(d) + "] Thiếu BTVN");
    }
    if (analysis.attitude) {
      students[id].attCount++;
      students[id].details.push("[" + formatDateVN(d) + "] Lỗi ý thức: " + comment);
    }
    var score = parseScore(row[7]);
    if (score > 0) students[id].scores.push(score);
  }
  var attSheet = ss.getSheetByName(cfg.attSheet);
  if (attSheet) {
    var attData = attSheet.getDataRange().getValues();
    for (var i = 1; i < attData.length; i++) {
      var row = attData[i];
      var id = String(row[0]).trim();
      if (!id || id.indexOf("HV") !== 0) continue;
      if (!students[id]) students[id] = createStudentObj(row[1], row[3]);
      var countAbsence = 0;
      var absDetails = [];
      for (var j = 4; j <= 13; j++) {
        var status = String(row[j]).toUpperCase().trim();
        if (status === "P" || status === "V" || status === "KP" || status === "NGHỈ") {
          countAbsence++;
          absDetails.push("Buổi " + (j - 3) + " (" + status + ")");
        }
      }
      students[id].absenceCount = countAbsence;
      if (absDetails.length > 0) students[id].details.push("🛑 Nghỉ " + countAbsence + " buổi: " + absDetails.join(", "));
    }
  }
  var warningList = [];
  for (var key in students) {
    var s = students[key];
    var avgScore = s.scores.length ? s.scores.reduce(function(a, b) { return a + b; }, 0) / s.scores.length : 10;
    var reasons = [];
    var isRisk = false;
    if (s.btvnCount >= cfg.btvn) { isRisk = true; reasons.push("❌ Thiếu BTVN (" + s.btvnCount + " lần)"); }
    if (s.attCount >= cfg.att) { isRisk = true; reasons.push("⚠️ Ý thức kém (" + s.attCount + " lần)"); }
    if (s.absenceCount > cfg.absence) { isRisk = true; reasons.push("🛑 Nghỉ học nhiều (" + s.absenceCount + " buổi)"); }
    if (avgScore < cfg.score && s.scores.length > 0) { isRisk = true; reasons.push("📉 Điểm thấp (" + avgScore.toFixed(1) + ")"); }
    if (isRisk) warningList.push([key, s.name, s.class, reasons.join("\n"), s.details.join("\n")]);
  }
  var outputSheetName = "🚨 TỔNG HỢP CẢNH BÁO";
  var outSheet = ss.getSheetByName(outputSheetName) || ss.insertSheet(outputSheetName);
  outSheet.clear();
  var headers = [["Mã HV", "Họ Tên", "Lớp", "Lý Do Cảnh Báo (Tóm tắt)", "Chi Tiết Vi Phạm (Ngày/Lỗi)"]];
  if (warningList.length > 0) {
    outSheet.getRange(1, 1, 1, 5).setValues(headers).setFontWeight("bold").setBackground("#c00").setFontColor("white");
    outSheet.getRange(2, 1, warningList.length, 5).setValues(warningList);
    outSheet.setColumnWidth(2, 160);
    outSheet.setColumnWidth(4, 250);
    outSheet.setColumnWidth(5, 450);
    outSheet.getRange("D:E").setWrapStrategy(SpreadsheetApp.WrapStrategy.WRAP);
    outSheet.getRange(2, 1, warningList.length, 5).setVerticalAlignment("top");
    SpreadsheetApp.getUi().alert("🚨 Đã quét xong!\nPhát hiện " + warningList.length + " học sinh cần lưu ý.\nXem chi tiết tại sheet \"" + outputSheetName + "\".");
  } else {
    outSheet.getRange(1, 1).setValue("Tuyệt vời! Tháng này không có học sinh nào vi phạm vượt ngưỡng.");
    SpreadsheetApp.getUi().alert("✅ Tuyệt vời! Không có học sinh nào vi phạm vượt ngưỡng.");
  }
}
