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
      .addItem("📈 1a. Bảng tương quan (sau khi tạo báo cáo)", "generateCorrelationMatrix")
      .addItem("💬 1b. Chỉ tạo lại nội dung tin nhắn (mẫu mới)", "showRegenerateMessagesDialog")
      .addSeparator()
      .addItem("🚨 2. Tìm HS vi phạm (BTVN/Ý thức)", "showWarningDialog")
      .addItem("🛑 3. Cảnh báo Điểm danh (Nghỉ nhiều)", "showAttendanceWarningDialog")
      .addSeparator()
      .addItem("📉 4. Danh sách Học Bù (Chi tiết nghỉ)", "generateMakeupList")
      .addItem("📉 5. Danh HS nhận xét", "showDetailDialog")
      .addSeparator()
      .addItem("🔗 7. Gộp (Join) dữ liệu nhiều tháng (Chọn sheet)", "showJoinSheetsDialog")
      .addItem("⚡ 7a. Gộp TẤT CẢ sheet \"Tháng\" (Chạy ngay)", "manualJoinAllMonthlySheets")
      .addItem("🔄 7b. Bật tự động gộp sheet (Tự động cập nhật)", "setupAutoJoinTrigger")
      .addItem("⏸️ 7c. Tắt tự động gộp sheet", "removeAutoJoinTrigger")
      .addItem("🔥 8. Phân tích Streak (Chuỗi liên tiếp)", "analyzeAttendanceStreaks")
      .addSeparator()
      .addItem("📊 9. Tạo Dashboard Streak", "createStreakDashboard")
      .addItem("🔄 9a. Cập nhật Dashboard Streak", "updateStreakDashboard")
      .addItem("🌐 9b. Mở Website Dashboard", "openDashboardWeb")
      .addSeparator()
      .addToUi();

    Logger.log("onOpen: Tạo menu Báo cáo Buổi");
    ui.createMenu("📅 Báo cáo Buổi")
      .addItem("📥 1. Kéo điểm danh sang BaoCao", "showAttendanceExportDialog")
      .addItem("📝 2. Kéo nhận xét Azota", "processBTVNAzota")
      .addItem("📊 3. Kéo điểm Azota → xác minh rồi ghi", "pullAzotaExamResult")
      .addSeparator()
      .addSubMenu(
        ui
          .createMenu("⚙️ Gemini (API · Model · Thông tin)")
          .addItem("🔑 Cập nhật API Key", "updateGeminiApiKey")
          .addItem("🧠 Đổi model (OCR / AI)", "updateGeminiModel")
          .addItem("ℹ️ Xem model đang dùng", "showGeminiModelInfo")
      )
      .addToUi();

    ui.createMenu("🧪 Test")
      .addItem("Đọc nội dung Google Doc (BVN)", "testReadBVNDoc")
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
