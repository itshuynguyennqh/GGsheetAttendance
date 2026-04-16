// ======================================================
// CÁC HÀM HIỂN THỊ DIALOG
// ======================================================

var DOC_REPORT_DATE_START = "report_dialog_date_start";
var DOC_REPORT_DATE_END = "report_dialog_date_end";
var DOC_REPORT_COMPARE_SHEET = "report_dialog_compare_sheet";
var DOC_REPORT_ATTENDANCE_SHEET = "report_dialog_attendance_sheet";

function getReportDialogPrefs() {
  var p = PropertiesService.getDocumentProperties();
  return {
    start: p.getProperty(DOC_REPORT_DATE_START) || "",
    end: p.getProperty(DOC_REPORT_DATE_END) || "",
    compareSheet: p.getProperty(DOC_REPORT_COMPARE_SHEET) || "",
    attendanceSheet: p.getProperty(DOC_REPORT_ATTENDANCE_SHEET) || ""
  };
}

function saveReportDialogPrefs(startIso, endIso, compareSheetName, attendanceSheetName) {
  var p = PropertiesService.getDocumentProperties();
  var props = {};
  props[DOC_REPORT_DATE_START] = startIso != null ? String(startIso) : "";
  props[DOC_REPORT_DATE_END] = endIso != null ? String(endIso) : "";
  props[DOC_REPORT_COMPARE_SHEET] = compareSheetName != null ? String(compareSheetName) : "";
  props[DOC_REPORT_ATTENDANCE_SHEET] = attendanceSheetName != null ? String(attendanceSheetName) : "";
  p.setProperties(props, false);
}

function showJoinSheetsDialog() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheets = ss.getSheets().map(function(s) { return s.getName(); });
  var monthlySheets = sheets.filter(function(name) { return name.indexOf("Tháng") >= 0; });
  var template = HtmlService.createTemplateFromFile("JoinDialog");
  template.sheetNames = monthlySheets;
  var html = template.evaluate().setWidth(400).setHeight(450);
  SpreadsheetApp.getUi().showModalDialog(html, "Chọn các Sheet cần gộp");
}

function showAttendanceExportDialog() {
  var sheet = SpreadsheetApp.getActiveSheet();
  var range = sheet.getActiveRange();
  if (!range) {
    SpreadsheetApp.getUi().alert("⚠️ Vui lòng chọn các hàng cần xử lý!");
    return;
  }
  var startRow = range.getRow();
  var endRow = range.getLastRow();
  var selectedColumn = range.getColumn();
  var headerValue = sheet.getRange(1, selectedColumn).getValue();
  var sessionNumber = null;
  if (headerValue && typeof headerValue === "string") {
    var match = headerValue.match(/Buổi\s*(\d+)/i);
    if (match) sessionNumber = parseInt(match[1], 10);
  }
  if (!sessionNumber) {
    SpreadsheetApp.getUi().alert("⚠️ Không tìm thấy số buổi ở dòng 1 của cột được chọn!\nGiá trị hiện tại: " + headerValue);
    return;
  }
  try {
    var result = processAttendanceExport(startRow, endRow, sessionNumber, selectedColumn);
    SpreadsheetApp.getUi().alert("✅ " + result);
  } catch (error) {
    SpreadsheetApp.getUi().alert("❌ Lỗi: " + error.message);
  }
}

function showDateRangePicker() {
  var prefs = getReportDialogPrefs();
  var template = HtmlService.createTemplateFromFile("DateRangePicker");
  template.prefStart = prefs.start || "";
  template.prefEnd = prefs.end || "";
  template.prefCompare = prefs.compareSheet || "";
  template.prefAttendance = prefs.attendanceSheet || "";
  var html = template.evaluate().setWidth(320).setHeight(420);
  SpreadsheetApp.getUi().showModalDialog(html, " ");
}
