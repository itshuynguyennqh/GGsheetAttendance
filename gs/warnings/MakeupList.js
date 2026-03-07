// ======================================================
// TẠO DANH SÁCH HỌC BÙ
// ======================================================

function generateMakeupList() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheets = ss.getSheets();
  var targetSheet = ss.getActiveSheet();
  var header = targetSheet.getRange("E1").getValue();
  if (String(header).indexOf("Buổi") === -1) {
    var found = null;
    for (var i = 0; i < sheets.length; i++) {
      var s = sheets[i];
      if (s.getName().toLowerCase().indexOf("attendance") >= 0 || s.getName().indexOf("T12") >= 0) {
        found = s;
        break;
      }
    }
    if (found) targetSheet = found;
    else {
      Browser.msgBox("⚠️ Vui lòng mở Sheet điểm danh (attendance...) lên trước!");
      return;
    }
  }
  var data = targetSheet.getDataRange().getValues();
  var makeupList = [];
  var classStats = {};
  for (var i = 1; i < data.length; i++) {
    var row = data[i];
    var id = row[0];
    if (!id || String(id).indexOf("HV") !== 0) continue;
    var name = row[1];
    var className = row[3];
    var count = 0;
    var details = [];
    for (var j = 4; j <= 13; j++) {
      var val = String(row[j]).toUpperCase().trim();
      if (val === "P" || val === "V" || val === "KP" || val === "NGHỈ") {
        count++;
        details.push("Buổi " + (j - 3));
      }
    }
    if (count > 0) {
      makeupList.push([id, name, className, count, details.join(", ")]);
      if (!classStats[className]) classStats[className] = { students: 0, sessions: 0 };
      classStats[className].students += 1;
      classStats[className].sessions += count;
    }
  }
  var reportName = "📉 Danh Sách Học Bù";
  var rSheet = ss.getSheetByName(reportName) || ss.insertSheet(reportName);
  rSheet.clear();
  rSheet.getRange("A1:E1").merge().setValue("I. CHI TIẾT HỌC SINH NGHỈ").setFontWeight("bold").setFontSize(14).setFontColor("#1a73e8").setHorizontalAlignment("center").setVerticalAlignment("middle");
  var headersDetail = ["Mã HV", "Họ Tên", "Lớp", "Số buổi nghỉ", "Các buổi cần học bù"];
  rSheet.getRange(3, 1, 1, 5).setValues([headersDetail]).setFontWeight("bold").setBackground("#f3f3f3").setBorder(true, true, true, true, true, true);
  if (makeupList.length > 0) {
    makeupList.sort(function(a, b) { return a[2].localeCompare(b[2]) || a[1].localeCompare(b[1]); });
    rSheet.getRange(4, 1, makeupList.length, 5).setValues(makeupList);
    rSheet.setColumnWidth(2, 160);
    rSheet.setColumnWidth(5, 300);
  } else {
    rSheet.getRange(4, 1).setValue("Không có học sinh nào nghỉ.");
  }
  var startColSummary = 8;
  rSheet.getRange(1, startColSummary, 1, 3).merge().setValue("II. THỐNG KÊ TÌNH HÌNH NGHỈ THEO LỚP").setFontWeight("bold").setFontSize(14).setFontColor("#d93025").setHorizontalAlignment("center").setVerticalAlignment("middle");
  var headerSummary = ["Tên Lớp", "Số HS nghỉ", "Tổng lượt vắng (Buổi)"];
  rSheet.getRange(3, startColSummary, 1, 3).setValues([headerSummary]).setFontWeight("bold").setBackground("#fce8e6").setBorder(true, true, true, true, true, true);
  var summaryData = [];
  var totalStudents = 0;
  var totalSessions = 0;
  for (var cls in classStats) {
    summaryData.push([cls, classStats[cls].students, classStats[cls].sessions]);
    totalStudents += classStats[cls].students;
    totalSessions += classStats[cls].sessions;
  }
  summaryData.sort(function(a, b) { return b[2] - a[2]; });
  if (summaryData.length > 0) {
    rSheet.getRange(4, startColSummary, summaryData.length, 3).setValues(summaryData);
    var lastRow = 4 + summaryData.length;
    rSheet.getRange(lastRow, startColSummary, 1, 3).setValues([["TỔNG CỘNG", totalStudents, totalSessions]]).setFontWeight("bold").setBackground("#fff2cc");
    rSheet.autoResizeColumns(startColSummary, 3);
  }
  SpreadsheetApp.getUi().alert("✅ Đã tìm thấy " + makeupList.length + " học sinh cần học bù.\nXem chi tiết tại sheet: " + reportName);
}
