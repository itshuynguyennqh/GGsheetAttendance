// ======================================================
// CẢNH BÁO LỖI BTVN / Ý THỨC - THEO KHOẢNG THỜI GIAN
// ======================================================

function showWarningDialog() {
  var html = "<!DOCTYPE html><html><head><base target=\"_top\"><style>body{font-family:sans-serif;padding:15px;color:#333}h3{color:#d93025;text-align:center;margin-top:0}label{display:block;margin-top:10px;font-weight:bold;font-size:0.9em}input{width:100%;padding:8px;margin-top:5px;box-sizing:border-box;border:1px solid #ccc;border-radius:4px}button{margin-top:20px;width:100%;padding:10px;background:#d93025;color:#fff;border:none;border-radius:4px;cursor:pointer;font-weight:bold}button:hover{background:#b02018}</style></head><body><h3>🚨 CẢNH BÁO VI PHẠM</h3><label>Từ ngày:</label><input type=\"date\" id=\"s\"><label>Đến ngày:</label><input type=\"date\" id=\"e\"><div style=\"display:flex;gap:10px;margin-top:10px\"><div style=\"flex:1\"><label>Max BTVN:</label><input type=\"number\" id=\"btvn\" value=\"3\"></div><div style=\"flex:1\"><label>Max Ý thức:</label><input type=\"number\" id=\"att\" value=\"2\"></div></div><button onclick=\"run()\">QUÉT DANH SÁCH</button><script>window.onload=function(){var d=new Date();document.getElementById('e').valueAsDate=d;d.setDate(1);document.getElementById('s').valueAsDate=d}function run(){var s=document.getElementById('s').value,e=document.getElementById('e').value,b=document.getElementById('btvn').value,a=document.getElementById('att').value;if(!s||!e){alert('Vui lòng chọn ngày bắt đầu và kết thúc!');return}google.script.run.withSuccessHandler(google.script.host.close).scanAtRiskStudents(s,e,b,a)}</script></body></html>";
  SpreadsheetApp.getUi().showModalDialog(HtmlService.createHtmlOutput(html).setWidth(320).setHeight(400), " ");
}

function scanAtRiskStudents(startDateStr, endDateStr, limitBTVN, limitAtt) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName("BaoCao");
  if (!sheet) { SpreadsheetApp.getUi().alert("Không tìm thấy sheet 'BaoCao'"); return; }
  var data = sheet.getDataRange().getValues();
  var startDate = new Date(startDateStr);
  startDate.setHours(0, 0, 0, 0);
  var endDate = new Date(endDateStr);
  endDate.setHours(23, 59, 59, 999);
  var students = {};
  for (var i = 1; i < data.length; i++) {
    var row = data[i];
    var d = parseDate(row[0]);
    if (!d || d < startDate || d > endDate) continue;
    var id = row[3];
    if (!id) continue;
    if (!students[id]) {
      students[id] = { name: row[4], class: row[6], btvn: 0, att: 0, details: [] };
    }
    var ana = analyzeCommentText(row[8]);
    if (ana.btvn) {
      students[id].btvn++;
      students[id].details.push("[" + formatDateVN(d) + "] Thiếu BTVN");
    }
    if (ana.attitude) {
      students[id].att++;
      students[id].details.push("[" + formatDateVN(d) + "] Ý thức: " + row[8]);
    }
  }
  var list = [];
  for (var k in students) {
    var s = students[k];
    if (s.btvn >= limitBTVN || s.att >= limitAtt) {
      list.push([k, s.name, s.class, "Thiếu BTVN: " + s.btvn + " | Ý thức: " + s.att, s.details.join("\n")]);
    }
  }
  var outSheet = ss.getSheetByName("⚠️ Cảnh Báo Vi Phạm");
  if (!outSheet) outSheet = ss.insertSheet("⚠️ Cảnh Báo Vi Phạm");
  outSheet.clear();
  if (list.length > 0) {
    outSheet.getRange(1, 1, 1, 5).setValues([["Mã HV", "Họ Tên", "Lớp", "Tổng Lỗi", "Chi Tiết"]]).setFontWeight("bold").setBackground("#f4cccc");
    outSheet.getRange(2, 1, list.length, 5).setValues(list);
    outSheet.setColumnWidth(5, 400);
    outSheet.getRange("E:E").setWrapStrategy(SpreadsheetApp.WrapStrategy.WRAP);
    outSheet.autoResizeColumns(1, 4);
    SpreadsheetApp.getUi().alert("🚨 Đã quét xong!\nPhát hiện " + list.length + " học sinh vi phạm trong khoảng thời gian này.");
  } else {
    SpreadsheetApp.getUi().alert("✅ Tuyệt vời! Không có học sinh nào vi phạm vượt ngưỡng trong khoảng thời gian này.");
  }
}
