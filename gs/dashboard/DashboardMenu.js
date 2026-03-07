// ======================================================
// MENU DASHBOARD STREAK
// ======================================================

/**
 * Mở website dashboard trong tab mới
 */
function openDashboardWeb() {
  try {
    var scriptId = ScriptApp.getScriptId();
    var webAppUrl = "https://script.google.com/macros/s/" + scriptId + "/exec";
    var html = "<!DOCTYPE html><html><head><base target=\"_top\"><script>window.open('" + webAppUrl + "', '_blank'); google.script.host.close();</script></head><body><p>Đang mở dashboard...</p></body></html>";
    SpreadsheetApp.getUi().showModalDialog(
      HtmlService.createHtmlOutput(html).setWidth(300).setHeight(100),
      "Mở Dashboard"
    );
    SpreadsheetApp.getUi().alert(
      "🌐 Để mở Dashboard Website:\n\n" +
      "1. Deploy script as Web App:\n" +
      "   - Vào Extensions → Apps Script\n" +
      "   - Chọn \"Deploy\" → \"New deployment\"\n" +
      "   - Chọn type: \"Web app\"\n" +
      "   - Execute as: \"Me\"\n" +
      "   - Who has access: \"Anyone\"\n" +
      "   - Copy URL và mở trong trình duyệt\n\n" +
      "2. Hoặc dùng menu: 📊 9. Tạo Dashboard Streak để xem trên Sheet"
    );
  } catch (error) {
    SpreadsheetApp.getUi().alert("Lỗi: " + error.toString());
  }
}

/**
 * Lấy danh sách tên các sheet bắt đầu bằng "Tháng "
 */
function getSheetNames() {
  var sheets = SpreadsheetApp.getActiveSpreadsheet().getSheets();
  var filteredNames = [];
  sheets.forEach(function(sheet) {
    var name = sheet.getName();
    if (name.indexOf("Tháng ") === 0) filteredNames.push(name);
  });
  return filteredNames;
}

/**
 * Alias cho getSheetNames - dùng bởi showAttendanceWarningDialog
 */
function getThangSheets() {
  return getSheetNames();
}
