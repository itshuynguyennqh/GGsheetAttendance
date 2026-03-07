// ======================================================
// CẢNH BÁO ĐIỂM DANH (Nghỉ nhiều)
// ======================================================

function showAttendanceWarningDialog() {
  var html = "<!DOCTYPE html><html><head><base target=\"_top\"><style>body{font-family:sans-serif;padding:15px;color:#333}h3{color:#cc0000;text-align:center;margin-top:0}label{display:block;margin-top:10px;font-weight:bold;font-size:0.9em}select,input{width:100%;padding:8px;margin-top:5px;box-sizing:border-box;border:1px solid #ccc;border-radius:4px}button{margin-top:20px;width:100%;padding:10px;background:#cc0000;color:#fff;border:none;border-radius:4px;cursor:pointer;font-weight:bold}</style></head><body><h3>🛑 CẢNH BÁO ĐIỂM DANH</h3><label>Chọn Sheet điểm danh:</label><select id=\"sheetName\"><option value=\"\" disabled selected>Đang tải...</option></select><label>Ngưỡng nghỉ cho phép:</label><input type=\"number\" id=\"limit\" value=\"2\" min=\"1\"><button onclick=\"run()\">QUÉT DANH SÁCH</button><script>window.onload=function(){google.script.run.withSuccessHandler(populate).getThangSheets()}function populate(names){var s=document.getElementById('sheetName');s.innerHTML=\"\";if(names.length===0){s.add(new Option(\"Không có Sheet 'Tháng...'\",\"\"));return}names.forEach(function(n){s.add(new Option(n,n))})}function run(){var sn=document.getElementById('sheetName').value,l=document.getElementById('limit').value;if(!sn||!l){alert('Thiếu thông tin!');return}google.script.run.withSuccessHandler(google.script.host.close).scanAttendanceWarning(sn,l)}</script></body></html>";
  SpreadsheetApp.getUi().showModalDialog(HtmlService.createHtmlOutput(html).setWidth(300).setHeight(320), " ");
}

function scanAttendanceWarning(sheetName, limitInput) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var targetSheet = ss.getSheetByName(sheetName);
  var limit = parseInt(limitInput, 10);
  if (!targetSheet) { SpreadsheetApp.getUi().alert("Lỗi: Không tìm thấy Sheet: " + sheetName); return; }
  var data = targetSheet.getDataRange().getValues();
  var warningList = [];
  for (var i = 1; i < data.length; i++) {
    var row = data[i];
    var id = row[0];
    if (!id || String(id).indexOf("HV") !== 0) continue;
    var count = 0;
    var details = [];
    for (var j = 4; j <= 13; j++) {
      if (j >= row.length) break;
      var val = String(row[j]).toUpperCase().trim();
      if (val === "P" || val === "V" || val === "KP" || val === "NGHỈ") {
        count++;
        details.push("Buổi " + (j - 3) + " (" + val + ")");
      }
    }
    if (count > limit) {
      warningList.push([id, row[1], row[3], count, details.join(", ")]);
    }
  }
  var rSheet = ss.getSheetByName("🛑 Cảnh Báo Điểm Danh");
  if (!rSheet) rSheet = ss.insertSheet("🛑 Cảnh Báo Điểm Danh");
  rSheet.clear();
  if (warningList.length > 0) {
    rSheet.getRange(1, 1, 1, 5).setValues([["Mã HV", "Tên", "Lớp", "Tổng Nghỉ", "Chi tiết"]]).setFontWeight("bold").setBackground("#ea9999");
    rSheet.getRange(2, 1, warningList.length, 5).setValues(warningList);
    rSheet.setColumnWidth(5, 300);
    SpreadsheetApp.getUi().alert("🛑 Tìm thấy " + warningList.length + " học sinh nghỉ quá " + limit + " buổi.");
  } else {
    SpreadsheetApp.getUi().alert("✅ Sheet \"" + sheetName + "\" không có học sinh vi phạm.");
  }
}
