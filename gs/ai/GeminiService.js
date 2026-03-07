// AI TRá»¢ LÃ (GEMINI)
// ======================================================
// PHẦN: AI TRỢ LÝ TẠO ĐÁP ÁN & BÁO CÁO (GEMINI)
// ======================================================

// Hàm kiểm tra quyền truy cập DriveApp
function checkDrivePermission() {
  Logger.log("🔐 Kiểm tra quyền DriveApp...");
  try {
    // Thử truy cập Drive để trigger authorization nếu cần
    DriveApp.getRootFolder();
    Logger.log("✅ Có quyền truy cập DriveApp");
    return true;
  } catch (e) {
    Logger.log("❌ Không có quyền DriveApp: " + e.toString());
    return false;
  }
}

// Hàm hiển thị hộp thoại nhập ID file và xử lý
function showAiInputDialog() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  
  Logger.log("=== SHOW AI INPUT DIALOG ===");
  Logger.log("Thời gian: " + new Date().toISOString());
  
  ss.toast("🔍 Kiểm tra quyền...", "AI Trợ Lý", 2);
  
  // Kiểm tra quyền DriveApp trước
  if (!checkDrivePermission()) {
    Logger.log("❌ Không có quyền DriveApp");
    ss.toast("❌ Chưa có quyền Drive", "Lỗi", 3);
    SpreadsheetApp.getUi().alert(
      "⚠️ Script chưa có quyền truy cập Google Drive!\n\n" +
      "💡 CÁCH KHẮC PHỤC:\n" +
      "1. Vào menu: Extensions → Apps Script\n" +
      "2. Chọn bất kỳ hàm nào (ví dụ: onOpen) và nhấn Run\n" +
      "3. Google sẽ hiện popup yêu cầu cấp quyền\n" +
      "4. Chọn tài khoản và nhấn 'Cho phép'\n" +
      "5. Sau đó quay lại chạy lại tính năng này"
    );
    return;
  }
  
  Logger.log("✅ Có quyền DriveApp");
  ss.toast("✅ Đã có quyền", "Sẵn sàng", 1);
  
  var ui = SpreadsheetApp.getUi();
  var result = ui.prompt('Nhập File ID', 'Hãy dán ID của file Word/Ảnh bài tập từ Google Drive:', ui.ButtonSet.OK_CANCEL);
  
  if (result.getSelectedButton() == ui.Button.OK) {
    var fileId = result.getResponseText().trim();
    Logger.log("File ID nhập vào: " + fileId);
    
    if (!fileId) {
      Logger.log("❌ File ID trống");
      ss.toast("⚠️ File ID không được để trống!", "Lỗi", 3);
      SpreadsheetApp.getUi().alert("⚠️ Vui lòng nhập File ID!");
      return;
    }
    
    Logger.log("Bắt đầu xử lý với File ID: " + fileId);
    ss.toast("🚀 Bắt đầu xử lý...", "Đang khởi động", 2);
    processAiTasks(fileId);
  } else {
    Logger.log("Người dùng hủy");
    ss.toast("Đã hủy", "Thông báo", 1);
  }
}

function processAiTasks(fileId) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var startTime = new Date();
  
  Logger.log("=== BẮT ĐẦU XỬ LÝ AI TASKS ===");
  Logger.log("File ID: " + fileId);
  Logger.log("Thời gian bắt đầu: " + startTime.toISOString());
  
  ss.toast("🚀 Bắt đầu xử lý...", "AI Trợ Lý", 2);
  
  var sheet = ss.getActiveSheet();
  var range = sheet.getActiveRange();
  
  if (!range) {
    Logger.log("❌ LỖI: Không có vùng được chọn");
    ss.toast("⚠️ Vui lòng bôi chọn vùng danh sách học sinh!", "Lỗi", 3);
    SpreadsheetApp.getUi().alert("⚠️ Vui lòng bôi chọn vùng danh sách học sinh!");
    return;
  }
  
  Logger.log("Vùng được chọn: " + range.getA1Notation());
  
  // Kiểm tra API Key (đọc từ Script Properties)
  if (!GEMINI_API_KEY) {
    Logger.log("❌ LỖI: API Key chưa được cấu hình");
    ss.toast("⚠️ Vui lòng cấu hình GEMINI_API_KEY!", "Lỗi", 3);
    SpreadsheetApp.getUi().alert(
      "⚠️ Chưa cấu hình Gemini API Key.\n\n" +
      "Vào: Extensions → Apps Script → ⚙️ Project Settings → Script properties\n" +
      "Thêm property: GEMINI_API_KEY = (key lấy từ https://aistudio.google.com/app/apikey)"
    );
    return;
  }
  
  try {
    // 1. Lấy dữ liệu học sinh từ vùng bôi chọn
    Logger.log("📋 Bước 1: Lấy dữ liệu học sinh...");
    ss.toast("📋 Đang lấy dữ liệu học sinh...", "Đang xử lý", 2);
    
    var studentData = range.getValues();
    var studentCount = studentData.length;
    Logger.log("Số dòng học sinh: " + studentCount);
    
    var studentInfoText = studentData.map(function(row) {
      return row.join(" - ");
    }).join("\n");
    
    Logger.log("Độ dài text học sinh: " + studentInfoText.length + " ký tự");

    // 2. Đọc nội dung file từ Drive
    Logger.log("📁 Bước 2: Đọc file từ Google Drive...");
    ss.toast("📁 Đang đọc file từ Drive...", "Đang xử lý", 2);
    
    var file;
    try {
      file = DriveApp.getFileById(fileId);
      Logger.log("✅ Tìm thấy file: " + file.getName());
      Logger.log("File size: " + file.getSize() + " bytes");
      Logger.log("File type: " + file.getMimeType());
    } catch (driveError) {
      Logger.log("❌ LỖI DriveApp: " + driveError.toString());
      var errorMsg = driveError.toString();
      if (errorMsg.includes("Exception: Access denied") || errorMsg.includes("Exception: Permission denied")) {
        throw new Error("TRUY_CAP_TU_CHOI: Script chưa có quyền truy cập Google Drive. Vui lòng:\n1. Chạy lại script để Google yêu cầu cấp quyền\n2. Chọn 'Cho phép' khi được hỏi về quyền truy cập Drive\n3. Hoặc kiểm tra file có quyền chia sẻ với tài khoản của bạn không");
      } else if (errorMsg.includes("Exception: File not found")) {
        throw new Error("FILE_NOT_FOUND: Không tìm thấy file với ID này. Vui lòng kiểm tra:\n1. File ID có đúng không?\n2. File có tồn tại trong Google Drive không?\n3. File có được chia sẻ với bạn không?");
      } else {
        throw new Error("DRIVE_ERROR: " + errorMsg);
      }
    }
    
    // Kiểm tra quyền đọc file
    try {
      Logger.log("📖 Đang đọc nội dung file...");
      var blob = file.getBlob();
      var fileSizeBytes = blob.getBytes().length;
      var base64File = Utilities.base64Encode(blob.getBytes());
      var mimeType = blob.getContentType();
      
      Logger.log("✅ Đọc file thành công");
      Logger.log("Kích thước blob: " + fileSizeBytes + " bytes");
      Logger.log("Kích thước base64: " + base64File.length + " ký tự");
      Logger.log("MIME type: " + mimeType);
    } catch (readError) {
      Logger.log("❌ LỖI đọc file: " + readError.toString());
      throw new Error("DOC_FILE_LOI: Không thể đọc file. Vui lòng kiểm tra quyền truy cập file trong Google Drive.");
    }

    // 3. Xây dựng Prompt
    Logger.log("📝 Bước 3: Xây dựng prompt...");
    ss.toast("📝 Đang chuẩn bị prompt...", "Đang xử lý", 2);
    
    var prompt = `
      Bạn là trợ lý giáo vụ. Dựa vào nội dung file đính kèm và danh sách học sinh dưới đây, hãy thực hiện:
      NHIỆM VỤ 1: Tạo bảng ĐÁP ÁN (Answer Key) kèm giải thích ngắn bằng tiếng Việt.
      NHIỆM VỤ 2: Tạo BÁO CÁO HỌC TẬP (Learning Report) tóm tắt kiến thức và nhận xét từng học sinh dựa trên danh sách (ai thiếu bài, ai cần lưu ý).
      
      DANH SÁCH HỌC SINH:
      ${studentInfoText}
    `;
    
    Logger.log("Độ dài prompt: " + prompt.length + " ký tự");

    // 4. Gọi Gemini API
    Logger.log("🤖 Bước 4: Gọi Gemini API...");
    ss.toast("🤖 Đang gửi yêu cầu đến AI...", "Đang xử lý", 2);
    
    var payload = {
      "contents": [{
        "parts": [
          {"text": prompt},
          {
            "inline_data": {
              "mime_type": mimeType,
              "data": base64File
            }
          }
        ]
      }]
    };
    
    var payloadSize = JSON.stringify(payload).length;
    Logger.log("Kích thước payload: " + payloadSize + " ký tự");

    // Tạo options với header X-goog-api-key (theo chuẩn curl example)
    var options = {
      "method": "post",
      "contentType": "application/json",
      "headers": {
        "X-goog-api-key": GEMINI_API_KEY
      },
      "payload": JSON.stringify(payload),
      "muteHttpExceptions": true
    };

    var apiStartTime = new Date();
    Logger.log("Thời gian gọi API: " + apiStartTime.toISOString());
    Logger.log("Model: " + GEMINI_MODEL);
    Logger.log("API Version: v1beta");
    
    // Hiển thị thông báo đang xử lý (không chặn)
    ss.toast("⏳ Đang xử lý với AI, vui lòng đợi...", "AI đang xử lý", 5);

    // Gọi API với gemini-2.0-flash trên v1beta
    var url = getGeminiUrl();
    Logger.log("API URL: " + url);
    
    var response;
    try {
      response = UrlFetchApp.fetch(url, options);
      var responseCode = response.getResponseCode();
      Logger.log("Response code: " + responseCode);
      
      // Xử lý lỗi 429 (Rate Limit)
      if (responseCode === 429) {
        var responseText = response.getContentText();
        Logger.log("⚠️ Rate Limit (429) - Đã vượt quá quota/rate limit");
        Logger.log("Response: " + responseText.substring(0, 200));
        throw new Error("RATE_LIMIT_429: Đã vượt quá quota hoặc rate limit của Gemini API. Vui lòng:\n1. Đợi một vài phút rồi thử lại\n2. Kiểm tra quota tại: https://aistudio.google.com/app/apikey\n3. Nếu cần, nâng cấp quota hoặc tạo API key mới");
      }
      
      // Kiểm tra lỗi khác
      if (responseCode !== 200) {
        var responseText = response.getContentText();
        Logger.log("❌ Lỗi API: " + responseCode);
        Logger.log("Response: " + responseText.substring(0, 300));
        throw new Error("API_ERROR_" + responseCode + ": " + responseText.substring(0, 200));
      }
      
    } catch (fetchError) {
      Logger.log("❌ Lỗi khi fetch API: " + fetchError.toString());
      // Nếu đã là Error object từ code trên, throw lại
      if (fetchError.message && (fetchError.message.includes("RATE_LIMIT_429") || fetchError.message.includes("API_ERROR_"))) {
        throw fetchError;
      }
      // Nếu là lỗi network/exception khác
      throw new Error("API_FETCH_ERROR: " + fetchError.toString());
    }
    
    var apiEndTime = new Date();
    var apiDuration = (apiEndTime - apiStartTime) / 1000;
    
    Logger.log("✅ Nhận được response từ API");
    Logger.log("Model: " + GEMINI_MODEL);
    Logger.log("API version: v1beta");
    Logger.log("Response code: " + response.getResponseCode());
    Logger.log("Thời gian API: " + apiDuration.toFixed(2) + " giây");
    
    var responseText = response.getContentText();
    Logger.log("Độ dài response: " + responseText.length + " ký tự");
    
    // Response code đã được kiểm tra ở trên, không cần kiểm tra lại
    
    var result;
    try {
      result = JSON.parse(responseText);
    } catch (parseError) {
      Logger.log("❌ LỖI parse JSON: " + parseError.toString());
      Logger.log("Response text (500 ký tự đầu): " + responseText.substring(0, 500));
      throw new Error("PARSE_ERROR: Không thể parse response từ API. " + parseError.toString());
    }
    
    // Kiểm tra lỗi từ API
    Logger.log("🔍 Kiểm tra kết quả từ API...");
    
    if (result.error) {
      Logger.log("❌ LỖI từ API: " + JSON.stringify(result.error));
      var apiErrorMsg = result.error.message || "Lỗi từ Gemini API";
      var apiErrorCode = result.error.code || "UNKNOWN";
      Logger.log("Error code: " + apiErrorCode);
      Logger.log("Error message: " + apiErrorMsg);
      
      // Xử lý lỗi version cụ thể
      if (apiErrorCode === 404 || apiErrorMsg.includes("version") || apiErrorMsg.includes("not found")) {
        throw new Error("API_VERSION_ERROR: API version không hợp lệ hoặc model không tồn tại. Vui lòng kiểm tra:\n1. Model name có đúng không?\n2. API version có được hỗ trợ không?\n3. API Key có quyền truy cập model này không?");
      }
      
      throw new Error("GEMINI_API_ERROR: " + apiErrorMsg + " (Code: " + apiErrorCode + ")");
    }
    
    if (!result.candidates || !result.candidates[0] || !result.candidates[0].content) {
      Logger.log("❌ LỖI: Không có candidates trong response");
      Logger.log("Response structure: " + JSON.stringify(result).substring(0, 500));
      throw new Error("Không nhận được phản hồi từ AI");
    }
    
    var aiOutput = result.candidates[0].content.parts[0].text;
    Logger.log("✅ Nhận được output từ AI");
    Logger.log("Độ dài output: " + aiOutput.length + " ký tự");
    Logger.log("Preview output (200 ký tự đầu): " + aiOutput.substring(0, 200));

    // 5. Xuất kết quả ra Sheet mới
    Logger.log("📊 Bước 5: Xuất kết quả ra Sheet...");
    ss.toast("📊 Đang tạo sheet kết quả...", "Đang xử lý", 2);
    
    var timestamp = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "HH:mm");
    var resultSheetName = "Kết quả AI " + timestamp;
    var resultSheet = ss.insertSheet(resultSheetName);
    resultSheet.getRange(1, 1).setValue(aiOutput);
    resultSheet.getRange(1, 1).setWrapStrategy(SpreadsheetApp.WrapStrategy.WRAP);
    resultSheet.setColumnWidth(1, 600);
    resultSheet.activate();
    
    var endTime = new Date();
    var totalDuration = (endTime - startTime) / 1000;
    
    Logger.log("✅ Hoàn thành!");
    Logger.log("Sheet tạo: " + resultSheetName);
    Logger.log("Tổng thời gian: " + totalDuration.toFixed(2) + " giây");
    Logger.log("=== KẾT THÚC XỬ LÝ ===");
    
    ss.toast("✅ Hoàn thành! (" + totalDuration.toFixed(1) + "s)", "Thành công", 3);
    SpreadsheetApp.getUi().alert("✅ Đã tạo báo cáo thành công tại Sheet: " + resultSheetName);
    
  } catch (e) {
    var endTime = new Date();
    var totalDuration = (endTime - startTime) / 1000;
    
    Logger.log("❌❌❌ LỖI XẢY RA ❌❌❌");
    Logger.log("Thời gian lỗi: " + endTime.toISOString());
    Logger.log("Tổng thời gian trước khi lỗi: " + totalDuration.toFixed(2) + " giây");
    Logger.log("Lỗi: " + e.toString());
    Logger.log("Stack trace: " + e.stack);
    Logger.log("=== KẾT THÚC VỚI LỖI ===");
    
    var errorMsg = "❌ Lỗi: " + e.toString();
    var errorStr = e.toString();
    
    // Xử lý các loại lỗi cụ thể
    if (errorStr.includes("TRUY_CAP_TU_CHOI")) {
      errorMsg = errorStr.replace("Error: TRUY_CAP_TU_CHOI: ", "");
      errorMsg += "\n\n💡 CÁCH KHẮC PHỤC:\n";
      errorMsg += "1. Vào menu: Extensions → Apps Script\n";
      errorMsg += "2. Chạy lại hàm 'showAiInputDialog' hoặc bất kỳ hàm nào\n";
      errorMsg += "3. Google sẽ hiện popup yêu cầu cấp quyền → Chọn 'Cho phép'\n";
      errorMsg += "4. Hoặc vào: File → Project settings → Xem lại quyền";
      ss.toast("❌ Lỗi quyền truy cập Drive", "Lỗi", 3);
    } else if (errorStr.includes("FILE_NOT_FOUND")) {
      errorMsg = errorStr.replace("Error: FILE_NOT_FOUND: ", "");
      ss.toast("❌ Không tìm thấy file", "Lỗi", 3);
    } else if (errorStr.includes("DOC_FILE_LOI")) {
      errorMsg = errorStr.replace("Error: DOC_FILE_LOI: ", "");
      errorMsg += "\n\n💡 Kiểm tra:\n";
      errorMsg += "- File có được chia sẻ với email của bạn không?\n";
      errorMsg += "- Bạn có quyền xem/tải file không?";
      ss.toast("❌ Không thể đọc file", "Lỗi", 3);
    } else if (errorStr.includes("File not found") || errorStr.includes("Exception: File not found")) {
      errorMsg = "⚠️ Không tìm thấy file với ID này.\n\nVui lòng kiểm tra:\n- File ID có đúng không?\n- File có tồn tại trong Google Drive không?\n- File có được chia sẻ với bạn không?";
      ss.toast("❌ File không tồn tại", "Lỗi", 3);
    } else if (errorStr.includes("Access denied") || errorStr.includes("Permission denied")) {
      errorMsg = "⚠️ Truy cập bị từ chối.\n\nVui lòng:\n1. Chạy lại script để cấp quyền\n2. Chọn 'Cho phép' khi được hỏi\n3. Kiểm tra quyền truy cập file trong Drive";
      ss.toast("❌ Truy cập bị từ chối", "Lỗi", 3);
    } else if (errorStr.includes("API_KEY") || errorStr.includes("API key")) {
      errorMsg = "⚠️ Lỗi API Key.\n\nVui lòng kiểm tra lại GEMINI_API_KEY trong code.";
      ss.toast("❌ Lỗi API Key", "Lỗi", 3);
    } else if (errorStr.includes("API_MODEL_ERROR")) {
      errorMsg = "❌ Model không hoạt động!\n\n";
      errorMsg += "Model đã thử: " + GEMINI_MODEL + "\n";
      errorMsg += "\n💡 CÁCH KHẮC PHỤC:\n";
      errorMsg += "1. Kiểm tra API Key có hợp lệ không\n";
      errorMsg += "2. Kiểm tra API Key trong Script Properties có quyền truy cập Gemini API không\n";
      errorMsg += "3. Thử tạo API Key mới tại: https://aistudio.google.com/app/apikey\n";
      errorMsg += "4. Xem Logger để biết chi tiết lỗi";
      ss.toast("❌ Model không hoạt động", "Lỗi", 3);
    } else if (errorStr.includes("API_VERSION_ERROR") || errorStr.includes("API version")) {
      errorMsg = errorStr.replace("Error: API_VERSION_ERROR: ", "");
      errorMsg += "\n\n💡 CÁCH KHẮC PHỤC:\n";
      errorMsg += "1. Kiểm tra model name trong code (GEMINI_MODEL)\n";
      errorMsg += "2. Kiểm tra API Key có quyền truy cập model này không\n";
      errorMsg += "3. Xem Logger để biết chi tiết lỗi";
      ss.toast("❌ Lỗi API Version", "Lỗi", 3);
    } else if (errorStr.includes("API_FETCH_ERROR")) {
      errorMsg = errorStr.replace("Error: API_FETCH_ERROR: ", "");
      errorMsg += "\n\n💡 CÁCH KHẮC PHỤC:\n";
      errorMsg += "1. Kiểm tra kết nối internet\n";
      errorMsg += "2. Kiểm tra API Key có hợp lệ không\n";
      errorMsg += "3. Xem Logger để biết chi tiết lỗi";
      ss.toast("❌ Lỗi kết nối API", "Lỗi", 3);
    } else if (errorStr.includes("RATE_LIMIT_429")) {
      errorMsg = errorStr.replace("Error: RATE_LIMIT_429: ", "");
      errorMsg += "\n\n⏰ Rate Limit được reset theo chu kỳ (thường là mỗi phút hoặc mỗi giờ).";
      ss.toast("⏰ Rate Limit - Đợi vài phút", "Thông báo", 5);
    } else if (errorStr.includes("API_ERROR_")) {
      var errorCode = errorStr.match(/API_ERROR_(\d+)/);
      if (errorCode && errorCode[1] === "429") {
        errorMsg = "⏰ Rate Limit (429) - Đã vượt quá quota/rate limit\n\n";
        errorMsg += "💡 CÁCH KHẮC PHỤC:\n";
        errorMsg += "1. Đợi 1-5 phút rồi thử lại (rate limit thường reset theo phút)\n";
        errorMsg += "2. Kiểm tra quota tại: https://aistudio.google.com/app/apikey\n";
        errorMsg += "3. Nếu cần, nâng cấp quota hoặc tạo API key mới\n";
        errorMsg += "4. Giảm tần suất gọi API nếu có thể";
        ss.toast("⏰ Rate Limit - Đợi vài phút", "Thông báo", 5);
      } else {
        errorMsg = "⚠️ Lỗi API HTTP " + (errorCode ? errorCode[1] : "unknown");
        errorMsg += "\n\nVui lòng xem Logger để biết chi tiết.";
        ss.toast("❌ Lỗi API HTTP", "Lỗi", 3);
      }
    } else {
      ss.toast("❌ Đã xảy ra lỗi. Xem Logger để biết chi tiết", "Lỗi", 3);
    }
    
    SpreadsheetApp.getUi().alert(errorMsg);
  }
}

