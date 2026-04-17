/**
 * gs/attendance/SyncNotes.js
 * Cập nhật ghi chú từ tab BaoCao chỉ cho vùng người dùng đang chọn
 */

/**
 * Hàm hỗ trợ xác định luồng xử lý dựa trên tên sheet
 */
function determineSyncFlow(sheetName) {
    if (/Tháng \d{2}\.\d{4}/.test(sheetName)) {
      return "PullFromReport";
    } else {
      // Nếu ở sheet BaoCao, có thể mở rộng logic Push sau này
      return null;
    }
  }
  
  /**
   * Hàm chính thực hiện đồng bộ
   */
  function syncCommentsToNotes() {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const currentSheet = ss.getActiveSheet();
    const sheetName = currentSheet.getName();
  
    // 1. Kiểm tra luồng đồng bộ
    const syncFlow = determineSyncFlow(sheetName);
    if (syncFlow !== "PullFromReport") {
      SpreadsheetApp.getUi().alert("Vui lòng chọn sheet điểm danh tháng (ví dụ: Tháng 04.2026)!");
      return;
    }
  
    // 2. Xác định vùng người dùng đang bôi đen (Selection)
    const selection = currentSheet.getActiveRange();
    const startRow = selection.getRow();
    const numRows = selection.getNumRows();
    const startCol = selection.getColumn();
    const numCols = selection.getNumColumns();
  
    // Ràng buộc: Chỉ xử lý nếu vùng chọn bắt đầu từ khu vực có dữ liệu (Hàng 3, Cột 5 - Cột E)
    if (startRow < 3 || startCol < 5) {
      SpreadsheetApp.getUi().alert("Vui lòng bôi đen các ô điểm danh (từ hàng 3 và cột E trở đi)!");
      return;
    }
  
    // 3. Lấy dữ liệu từ tab BaoCao và đưa vào Map để tra cứu nhanh
    const reportSheet = ss.getSheetByName("BaoCao");
    if (!reportSheet) {
      SpreadsheetApp.getUi().alert("Không tìm thấy sheet 'BaoCao'!");
      return;
    }
    const reportData = reportSheet.getDataRange().getValues();
    
    // Map tra cứu: Key = "MãHS_MãBuổi", Value = "Nội dung"
    const reportMap = new Map();
    // Bỏ qua dòng tiêu đề (i=1)
    for (let i = 1; i < reportData.length; i++) {
      const dateId = reportData[i][1]; // Cột B: Mã Buổi/Ngày
      const content = reportData[i].splice(9,10); // Cột CI,J: Nội dung
      const studentId = reportData[i][3]; // Cột D: Mã Học Sinh
      
      if (studentId && dateId) {
        const key = `${studentId}_${dateId}`;
        const existing = reportMap.get(key);
        reportMap.set(key, existing ? existing + "\n---\n" + content : content);
      }
    }
  
    // 4. Lấy thông tin Tên/Mã HS và Đầu mục buổi tương ứng với VÙNG CHỌN
    // Lấy cột A (Mã HS) cho các hàng đang chọn
    const studentIdsInSelection = currentSheet.getRange(startRow, 1, numRows, 1).getValues();
    // Lấy hàng 1 (Tiêu đề buổi) cho các cột đang chọn
    const sessionHeadersInSelection = currentSheet.getRange(1, startCol, 1, numCols).getValues()[0];
  
    // Tiền tố tháng (ví dụ: "T04.2026")
    const monthPrefix = "T" + sheetName.split(" ")[1];
  
    // 5. Duyệt qua vùng chọn để tạo mảng Ghi chú (Notes)
    const notesToSet = [];
  
    for (let r = 0; r < numRows; r++) {
      const rowNotes = [];
      const studentId = studentIdsInSelection[r][0];
  
      for (let c = 0; c < numCols; c++) {
        const header = sessionHeadersInSelection[c].toString().trim();
        // Chuyển "Buổi 1" -> "T04.2026-B1" (Khớp với logic ID trong BaoCao của bạn)
        const parts = header.split(" ");
        const sessionId = `${monthPrefix}-B${parts[parts.length - 1]}`;
        
        const key = `${studentId}_${sessionId}`;
        rowNotes.push(reportMap.has(key) ? reportMap.get(key) : "");
      }
      notesToSet.push(rowNotes);
    }
  
    // 6. Ghi ghi chú vào đúng vùng đang chọn trên Sheet
    selection.setNotes(notesToSet);
    
    ss.toast(`Đã cập nhật ghi chú cho ${numRows} hàng x ${numCols} cột.`, "Hoàn tất");
  }