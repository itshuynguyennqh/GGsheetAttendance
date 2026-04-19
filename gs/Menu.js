// ======================================================
// KHỞI TẠO MENU
// ======================================================

function onOpen() {
  try {
    Logger.log("onOpen: Bắt đầu");
    var ui = SpreadsheetApp.getUi();
    if (!ui) {
      Logger.log("onOpen: getUi() null (có thể đang chạy không phải từ Sheet)");
      return;
    }
    Logger.log("onOpen: Tạo menu Báo cáo Tháng");
    ui.createMenu("👉 Báo cáo Tháng")
      .addItem("📅 1. Tạo báo cáo tổng hợp (Gửi PH)", "showDateRangePicker")
      .addItem("💬 1b. Chỉ tạo lại nội dung tin nhắn (mẫu mới)", "showRegenerateMessagesDialog")
      .addItem('🔗 Gộp dữ liệu nhiều tháng (Thủ công)', 'manualJoinAllMonthlySheets')

      .addSeparator()
      .addToUi();

    Logger.log("onOpen: Tạo menu Báo cáo Buổi");
    ui.createMenu("📅 Báo cáo Buổi")
      .addItem("📥 1. Kéo điểm danh sang BaoCao", "showAttendanceExportDialog")
      .addItem("📊 2. Kéo điểm Azota", "pullAzotaExamResult")
      .addSeparator()
      .addItem("📊 3. Đồng bộ Notes", "syncCommentsToNotes")

      .addSubMenu(
        ui
          .createMenu("⚙️ Gemini (API · Model · Thông tin)")
          .addItem("🔑 Cập nhật API Key", "updateGeminiApiKey")
          .addItem("🧠 Đổi model (OCR / AI)", "updateGeminiModel")
          .addItem("ℹ️ Xem model đang dùng", "showGeminiModelInfo")
      )
      .addToUi();


    Logger.log("onOpen: Menu đã thêm xong");

    var spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = spreadsheet.getSheetByName("BaoCao");
    if (sheet) {
      var lastRow = sheet.getLastRow();
      if (lastRow >= 1) {
        sheet.getRange(lastRow, 2).activate();
        Logger.log("onOpen: Đã activate ô B" + lastRow);
      }
    }
    Logger.log("onOpen: Hoàn tất");
  } catch (error) {
    Logger.log("onOpen: Lỗi - " + error.toString());
    Logger.log("onOpen: Stack - " + (error && error.stack ? error.stack : "no stack"));
    try {
      SpreadsheetApp.getUi().alert("Lỗi khi tải menu: " + error.toString());
    } catch (e) {}
  }
}
