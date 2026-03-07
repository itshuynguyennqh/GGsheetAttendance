// ======================================================
// LIỆT KÊ CHI TIẾT NHẬN XÉT & CHÉP PHẠT
// ======================================================

function showDetailDialog() {
  var html = "<!DOCTYPE html><html><head><base target=\"_top\"><style>body{font-family:sans-serif;padding:15px;color:#333}h3{color:#1a73e8;text-align:center;margin-top:0}label{display:block;margin-top:10px;font-weight:bold;font-size:0.9em}input{width:100%;padding:8px;margin-top:5px;box-sizing:border-box;border:1px solid #ccc;border-radius:4px}button{margin-top:20px;width:100%;padding:10px;background:#1a73e8;color:#fff;border:none;border-radius:4px;cursor:pointer;font-weight:bold}button:hover{background:#1557b0}</style></head><body><h3>📋 TRÍCH XUẤT CHI TIẾT</h3><label>Từ ngày:</label><input type=\"date\" id=\"s\"><label>Đến ngày:</label><input type=\"date\" id=\"e\"><button onclick=\"run()\">XUẤT DANH SÁCH</button><script>window.onload=function(){var d=new Date();document.getElementById('e').valueAsDate=d;d.setDate(1);document.getElementById('s').valueAsDate=d}function run(){var s=document.getElementById('s').value,e=document.getElementById('e').value;if(!s||!e){alert('Vui lòng chọn ngày bắt đầu và kết thúc!');return}google.script.run.withSuccessHandler(google.script.host.close).generateStudentDetails(s,e)}</script></body></html>";
  SpreadsheetApp.getUi().showModalDialog(HtmlService.createHtmlOutput(html).setWidth(320).setHeight(300), " ");
}

function generateStudentDetails(startDateStr, endDateStr) {
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
    var diem = row[7] ? row[7].toString().trim() : "";
    var nhanXet = row[8] ? row[8].toString().trim() : "";
    var chepPhat = row[9] ? row[9].toString().trim() : "";
    var parts = [];
    if (diem !== "") parts.push("Điểm: " + diem);
    if (nhanXet !== "") parts.push(nhanXet);
    if (chepPhat !== "") parts.push("Chép phạt: " + chepPhat);
    var noiDungHienThi = parts.length === 0 ? "Đủ" : parts.join(" | ");
    if (!students[id]) students[id] = { name: row[4], class: row[6], details: [] };
    students[id].details.push("[" + formatDateVN(d) + "] " + noiDungHienThi);
  }
  var list = [];
  for (var k in students) {
    var s = students[k];
    list.push([k, s.name, s.class, s.details.join("\n")]);
  }
  var outSheetName = "📋 Chi Tiết Nhận Xét";
  var outSheet = ss.getSheetByName(outSheetName);
  if (!outSheet) outSheet = ss.insertSheet(outSheetName);
  outSheet.clear();
  if (list.length > 0) {
    var headers = [["Mã HV", "Họ Tên", "Lớp", "Chi Tiết"]];
    outSheet.getRange(1, 1, 1, 4).setValues(headers).setFontWeight("bold").setBackground("#cfe2f3");
    outSheet.getRange(2, 1, list.length, 4).setValues(list);
    outSheet.setColumnWidth(4, 500);
    outSheet.getRange("D:D").setWrapStrategy(SpreadsheetApp.WrapStrategy.WRAP);
    outSheet.getRange(1, 1, list.length + 1, 4).setVerticalAlignment("top");
    outSheet.autoResizeColumns(1, 3);
    outSheet.activate();
    SpreadsheetApp.getUi().alert("✅ Đã hoàn thành liệt kê cho " + list.length + " học sinh.");
  } else {
    SpreadsheetApp.getUi().alert("Không tìm thấy dữ liệu trong khoảng thời gian này.");
  }
}
