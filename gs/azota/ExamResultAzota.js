// ======================================================
// KÉO ĐIỂM CHẤM AZOTA (EXAM-RESULT) + OCR TÊN + KHỚP TÊN THÔNG MINH
// ======================================================
// GET https://azota.vn/private-api/exams/{examId}/exam-result
// Mỗi item có mark + nameImages.url (ảnh crop tên). Dùng Gemini đọc chữ viết tay,
// sau đó khớp tên với sheet BaoCao (fuzzy match) và ghi điểm.
// ======================================================

var AZOTA_EXAM_RESULT_BASE = 'https://azota.vn/private-api/exams';
var AZOTA_TEACHER_API_BASE = 'https://azt-teacher-api.azota.vn';
var SIMILARITY_THRESHOLD = 0.6;
var GEMINI_NAME_PROMPT = 'Đây là ảnh chứa tên học sinh viết tay. Chỉ trả về đúng tên học sinh (họ và tên), không thêm ký tự, số hay giải thích. Nếu không đọc được hãy trả về chuỗi rỗng.';

/**
 * Hàm helper: Cập nhật Gemini API Key trong Script Properties.
 * Chạy hàm này từ menu hoặc gọi trực tiếp để cập nhật key.
 */
function updateGeminiApiKey() {
  var ui = SpreadsheetApp.getUi();
  var currentKey = PropertiesService.getScriptProperties().getProperty('GEMINI_API_KEY') || '';
  var promptText = 'Nhập Gemini API Key mới:\nLấy từ: https://aistudio.google.com/app/apikey\n\n';
  if (currentKey) {
    promptText += 'Key hiện tại (độ dài): ' + currentKey.length + ' ký tự\n';
  } else {
    promptText += 'Chưa có key trong Properties.\n';
  }
  promptText += '\nĐể trống và OK = xóa key hiện tại.';
  
  var result = ui.prompt('Cập nhật Gemini API Key', promptText, ui.ButtonSet.OK_CANCEL);
  if (result.getSelectedButton() !== ui.Button.OK) {
    ui.alert('Đã hủy.');
    return;
  }
  
  var newKey = (result.getResponseText() || '').trim();
  try {
    if (newKey) {
      PropertiesService.getScriptProperties().setProperty('GEMINI_API_KEY', newKey);
      ui.alert('✅ Đã lưu Gemini API Key mới (độ dài: ' + newKey.length + ' ký tự).\n\nLưu ý: Nếu vẫn không thấy thay đổi, thử:\n1. Đóng và mở lại Apps Script editor\n2. Hoặc chạy lại tính năng "Kéo điểm chấm Azota"');
      Logger.log('Gemini API Key updated: length=' + newKey.length);
    } else {
      PropertiesService.getScriptProperties().deleteProperty('GEMINI_API_KEY');
      ui.alert('✅ Đã xóa Gemini API Key khỏi Properties.');
      Logger.log('Gemini API Key deleted');
    }
  } catch (e) {
    ui.alert('❌ Lỗi khi lưu: ' + e.toString() + '\n\nThử cách khác:\n1. Apps Script → Project Settings (⚙️) → Script properties\n2. Thêm/sửa GEMINI_API_KEY thủ công');
    Logger.log('Error updating Gemini API Key: ' + e.toString());
  }
}

/**
 * Entry point: Menu "Kéo điểm chấm Azota (exam-result)"
 * 1. Lấy sheet BaoCao và vùng chọn
 * 2. Dialog examId + token
 * 3. Gọi API exam-result
 * 4. Với mỗi item: fetch ảnh nameImages → Gemini OCR tên
 * 5. Khớp tên thông minh với cột Họ tên trong BaoCao
 * 6. Ghi điểm (và URL ảnh) vào cột tương ứng
 */
function _logExam(prefix, msg) {
  Logger.log('[Azota ExamResult][' + prefix + '] ' + msg);
}

/** Bỏ tiền tố "Bearer " (không phân biệt hoa thường) nếu user dán cả chuỗi từ DevTools. */
function normalizeBearerToken(s) {
  if (s == null || typeof s !== 'string') return '';
  var t = s.trim();
  if (t.toLowerCase().indexOf('bearer ') === 0) return t.substring(7).trim();
  return t;
}

function pullAzotaExamResult() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var ui = SpreadsheetApp.getUi();

  _logExam('START', 'pullAzotaExamResult called');

  try {
    var baoCaoSheet = ss.getSheetByName('BaoCao');
    if (!baoCaoSheet) {
      _logExam('ERROR', 'Sheet BaoCao not found');
      ui.alert('❌ Không tìm thấy sheet "BaoCao"!');
      return;
    }
    _logExam('SHEET', 'BaoCao found');

    var activeRange = baoCaoSheet.getActiveRange();
    if (!activeRange) {
      _logExam('ERROR', 'No active range');
      ui.alert('⚠️ Vui lòng chọn vùng dữ liệu trong sheet "BaoCao" (bao gồm dòng có Họ tên / Mã HV)!');
      return;
    }
    _logExam('RANGE', 'Active range: row ' + activeRange.getRow() + '-' + activeRange.getLastRow() + ', col ' + activeRange.getColumn() + '-' + activeRange.getLastColumn());

    var token = normalizeBearerToken(PropertiesService.getScriptProperties().getProperty('AZOTA_BEARER_TOKEN') || '');
    _logExam('TOKEN', 'Token from props: ' + (token ? token.length + ' chars' : 'empty'));

    var examId = '';
    var promptResult = ui.prompt('Kéo điểm chấm Azota', 'Nhập Exam ID (số, ví dụ 12897293):\n⚠️ Lưu ý: Đây là Exam ID từ URL Azota, KHÔNG phải Gemini API key.', ui.ButtonSet.OK_CANCEL);
    if (promptResult.getSelectedButton() !== ui.Button.OK) {
      _logExam('CANCEL', 'User cancelled examId prompt');
      return;
    }
    examId = (promptResult.getResponseText() || '').trim();
    if (!examId) {
      _logExam('ERROR', 'Exam ID empty');
      ui.alert('⚠️ Exam ID không được để trống.');
      return;
    }
    // Validate examId is numeric (not API key or other text)
    if (!/^\d+$/.test(examId)) {
      _logExam('ERROR', 'Exam ID không phải số: ' + examId);
      if (examId.indexOf('AIza') === 0 || examId.length > 30) {
        ui.alert('❌ Lỗi: Bạn đã nhập Gemini API key thay vì Exam ID!\n\nExam ID là số (ví dụ: 12897488) từ URL Azota.\nGemini API key cần cập nhật trong Script Properties (GEMINI_API_KEY), không phải nhập ở đây.');
      } else {
        ui.alert('❌ Exam ID phải là số (ví dụ: 12897488).\nBạn đã nhập: ' + examId);
      }
      return;
    }
    _logExam('INPUT', 'examId=' + examId);

    if (!token) {
      var tokenResult = ui.prompt('Token Azota', 'Nhập Bearer token (lấy từ DevTools khi đăng nhập azota.vn):', ui.ButtonSet.OK_CANCEL);
      if (tokenResult.getSelectedButton() !== ui.Button.OK) {
        _logExam('CANCEL', 'User cancelled token prompt');
        return;
      }
      token = normalizeBearerToken(tokenResult.getResponseText() || '');
      if (!token) {
        _logExam('ERROR', 'Token empty');
        ui.alert('⚠️ Token không được để trống.');
        return;
      }
      var saveToken = ui.alert('Lưu token?', 'Có lưu token vào Script Properties để lần sau không cần nhập lại?', ui.ButtonSet.YES_NO);
      if (saveToken === ui.Button.YES) {
        PropertiesService.getScriptProperties().setProperty('AZOTA_BEARER_TOKEN', token);
        _logExam('TOKEN', 'Token saved to Script Properties');
      }
    }
    _logExam('TOKEN', 'Using token length=' + token.length);

    var cookie = (PropertiesService.getScriptProperties().getProperty('AZOTA_COOKIE') || '').trim();
    if (!cookie) {
      var cookieResult = ui.prompt(
        'Cookie (tùy chọn)',
        'Nếu API vẫn trả HTML khi chỉ dùng Bearer, hãy dán Cookie:\nDevTools → Network → chọn request "exam-result" → Headers → Cookie (copy nguyên).\nĐể trống = bỏ qua.',
        ui.ButtonSet.OK_CANCEL
      );
      if (cookieResult.getSelectedButton() === ui.Button.OK) {
        cookie = (cookieResult.getResponseText() || '').trim();
        if (cookie) {
          var saveCookie = ui.alert('Lưu Cookie?', 'Lưu Cookie vào Script Properties? (Cookie thường hết hạn sau một thời gian.)', ui.ButtonSet.YES_NO);
          if (saveCookie === ui.Button.YES) {
            PropertiesService.getScriptProperties().setProperty('AZOTA_COOKIE', cookie);
            _logExam('COOKIE', 'Cookie saved to Script Properties');
          }
        }
      }
    }
    _logExam('COOKIE', 'Using cookie: ' + (cookie ? cookie.length + ' chars' : 'empty'));

    // Get Gemini API key (from Properties or prompt user)
    var geminiKey = PropertiesService.getScriptProperties().getProperty('GEMINI_API_KEY') || '';
    if (!geminiKey) {
      var geminiResult = ui.prompt(
        'Gemini API Key',
        'Nhập Gemini API Key để đọc tên từ ảnh:\nLấy từ: https://aistudio.google.com/app/apikey\n\n(Có thể để trống nếu không cần OCR tên)',
        ui.ButtonSet.OK_CANCEL
      );
      if (geminiResult.getSelectedButton() === ui.Button.OK) {
        geminiKey = (geminiResult.getResponseText() || '').trim();
        if (geminiKey) {
          var saveGemini = ui.alert('Lưu Gemini Key?', 'Có lưu Gemini API key vào Script Properties để lần sau không cần nhập lại?', ui.ButtonSet.YES_NO);
          if (saveGemini === ui.Button.YES) {
            try {
              PropertiesService.getScriptProperties().setProperty('GEMINI_API_KEY', geminiKey);
              _logExam('GEMINI', 'Gemini key saved to Script Properties');
            } catch (e) {
              _logExam('GEMINI', 'Failed to save Gemini key to Properties: ' + e.toString());
              ui.alert('⚠️ Không thể lưu vào Script Properties. Key sẽ chỉ dùng cho lần chạy này.');
            }
          }
        }
      }
    }
    // Use Gemini key from Properties or dialog
    if (!geminiKey) {
      geminiKey = PropertiesService.getScriptProperties().getProperty('GEMINI_API_KEY') || '';
    }
    if (geminiKey) {
      _logExam('GEMINI', 'Using Gemini key, length=' + geminiKey.length);
    } else {
      _logExam('GEMINI', 'No Gemini API key - OCR will be skipped');
    }

    ss.toast('Đang gọi API exam-result...', 'Azota', 2);
    _logExam('API', 'Calling fetchExamResult(examId=' + examId + ')');
    var apiResponse = fetchExamResult(examId, token, cookie);
    _logExam('API', 'fetchExamResult returned: ' + (apiResponse ? 'hasKeys=' + Object.keys(apiResponse).join(',') : 'null'));

    if (!apiResponse || !apiResponse.items) {
      _logExam('ERROR', 'No apiResponse or apiResponse.items. apiResponse=' + (apiResponse ? JSON.stringify(apiResponse).substring(0, 300) : 'null'));
      ui.alert('❌ Không lấy được dữ liệu từ API. Kiểm tra examId và token. Response: ' + (apiResponse ? JSON.stringify(apiResponse).substring(0, 200) : 'null'));
      return;
    }

    var items = apiResponse.items;
    _logExam('API', 'items.length=' + items.length);
    if (items.length === 0) {
      ui.alert('Không có kết quả nào trong đề thi này.');
      return;
    }

    var colMapping = getBaoCaoColumnMapping(baoCaoSheet);
    _logExam('COLS', 'colMapping: hoTen=' + colMapping.hoTen + ', hv=' + colMapping.hv + ', diemCham=' + colMapping.diemCham + ', anhTen=' + colMapping.anhTen);
    if (colMapping.hoTen < 0) {
      ui.alert('❌ Không tìm thấy cột "Họ tên" (hoặc "Tên") trong sheet BaoCao.');
      return;
    }

    var firstRow = activeRange.getRow();
    var lastRow = activeRange.getLastRow();
    var numRows = lastRow - firstRow + 1;
    var lastCol = Math.max(baoCaoSheet.getLastColumn(), colMapping.hv + 1, colMapping.diemCham + 1, colMapping.anhTen + 1, 10);
    var rangeValues = baoCaoSheet.getRange(firstRow, 1, lastRow, lastCol).getValues();
    var baoCaoNames = [];
    var rowIndices = [];
    for (var i = 0; i < rangeValues.length; i++) {
      var nameVal = rangeValues[i][colMapping.hoTen];
      if (nameVal !== undefined && nameVal !== null && String(nameVal).trim() !== '') {
        baoCaoNames.push(String(nameVal).trim());
        rowIndices.push(firstRow + i);
      }
    }
    _logExam('BAOCAO', 'baoCaoNames.length=' + baoCaoNames.length + ', sample=' + (baoCaoNames.slice(0, 3).join('; ')));
    if (baoCaoNames.length === 0) {
      ui.alert('❌ Trong vùng chọn không có giá trị cột Họ tên.');
      return;
    }

    var recognized = [];
    var total = items.length;
    var ocrFailedCount = 0;
    var geminiKeyIssue = false;
    // #region agent log
    if (items.length > 0) {
      _logExam('DEBUG', 'First item keys: ' + Object.keys(items[0]).join(','));
      _logExam('DEBUG', 'First item sample: ' + JSON.stringify(items[0]).substring(0, 500));
    }
    // #endregion
    for (var idx = 0; idx < items.length; idx++) {
      ss.toast('Đọc tên ảnh ' + (idx + 1) + '/' + total + '...', 'OCR', 1);
      var item = items[idx];
      var mark = getMarkFromItem(item);
      var imageUrl = getNameImageUrlFromItem(item);
      var attendeeName = item.attendeeName || '';
      _logExam('OCR', 'item ' + (idx + 1) + '/' + total + ' mark=' + mark + ' imageUrl=' + (imageUrl ? imageUrl.substring(0, 50) + '...' : 'null') + ' attendeeName=' + (attendeeName || 'null'));
      var recognizedName = '';
      if (attendeeName && attendeeName.trim()) {
        recognizedName = attendeeName.trim();
        _logExam('OCR', 'item ' + (idx + 1) + ' using attendeeName="' + recognizedName + '"');
      } else if (imageUrl) {
        recognizedName = fetchImageAndRecognizeName(imageUrl, token, cookie, geminiKey);
        _logExam('OCR', 'item ' + (idx + 1) + ' recognizedName="' + recognizedName + '"');
        if (!recognizedName && geminiKey) {
          ocrFailedCount++;
          geminiKeyIssue = true;
        }
        Utilities.sleep(300);
      }
      recognized.push({ mark: mark, nameImageUrl: imageUrl, recognizedName: recognizedName });
    }
    
    // #region agent log
    if (ocrFailedCount > 0) {
      _logExam('OCR', 'OCR failed for ' + ocrFailedCount + '/' + total + ' items');
      if (geminiKeyIssue) {
        _logExam('OCR', 'Gemini API key issue detected - may need new key');
      }
    }
    // #endregion

    var diemCol = colMapping.diemCham >= 0 ? colMapping.diemCham : colMapping.hoTen + 2;
    var anhCol = colMapping.anhTen >= 0 ? colMapping.anhTen : diemCol + 1;
    _logExam('WRITE', 'diemCol(0-based)=' + diemCol + ' anhCol(0-based)=' + anhCol);

    var matchedCount = 0;
    var usedRow = {};
    for (var r = 0; r < recognized.length; r++) {
      var rec = recognized[r];
      var best = findBestMatch(rec.recognizedName, baoCaoNames);
      if (best && best.index >= 0 && !usedRow[best.index]) {
        usedRow[best.index] = true;
        var sheetRow = rowIndices[best.index];
        baoCaoSheet.getRange(sheetRow, diemCol + 1).setValue(rec.mark);
        if (rec.nameImageUrl) baoCaoSheet.getRange(sheetRow, anhCol + 1).setValue(rec.nameImageUrl);
        matchedCount++;
        _logExam('MATCH', 'recognized="' + rec.recognizedName + '" -> row ' + sheetRow + ' (' + baoCaoNames[best.index] + ') score=' + best.score);
      } else {
        _logExam('NOMATCH', 'recognized="' + rec.recognizedName + '" no match or row already used');
      }
    }

    _logExam('DONE', 'matchedCount=' + matchedCount + '/' + total);
    var alertMsg = '✅ Đã ghi điểm chấm Azota.\nKhớp: ' + matchedCount + '/' + total + ' học sinh.';
    if (ocrFailedCount > 0 && geminiKeyIssue) {
      alertMsg += '\n\n⚠️ Lưu ý: ' + ocrFailedCount + ' ảnh không đọc được tên do Gemini API key bị leak.\n';
      alertMsg += 'Vui lòng tạo API key mới tại: https://aistudio.google.com/app/apikey\n';
      alertMsg += 'Sau đó cập nhật trong Script Properties (GEMINI_API_KEY) và chạy lại.';
    } else if (ocrFailedCount > 0) {
      alertMsg += '\n\n⚠️ ' + ocrFailedCount + ' ảnh không đọc được tên (kiểm tra GEMINI_API_KEY trong Script Properties).';
    }
    ss.toast('Xong. Khớp ' + matchedCount + '/' + total + ' học sinh.', 'Kết quả', 4);
    ui.alert(alertMsg);
  } catch (e) {
    _logExam('ERROR', 'Exception: ' + e.toString());
    _logExam('ERROR', 'Stack: ' + (e.stack || 'no stack'));
    Logger.log('pullAzotaExamResult error: ' + e.toString());
    if (e.stack) Logger.log('pullAzotaExamResult stack: ' + e.stack);
    ui.alert('❌ Lỗi: ' + e.toString());
  }
}

/**
 * Gọi GET .../exams/{examId}/exam-result với Bearer token và (tùy chọn) Cookie.
 * Thử azota.vn trước; nếu trả HTML thì fallback sang azt-teacher-api.azota.vn (cùng path).
 * Giả định response có dạng { data: [...] } hoặc { items: [...] } hoặc { students: [...] }.
 */
function fetchExamResult(examId, token, cookie) {
  cookie = (typeof cookie === 'string' && cookie) ? cookie.trim() : '';
  var path = '/private-api/exams/' + encodeURIComponent(examId) + '/exam-result';
  var urlsToTry = [
    AZOTA_EXAM_RESULT_BASE + '/' + encodeURIComponent(examId) + '/exam-result',
    AZOTA_TEACHER_API_BASE + path
  ];
  _logExam('FETCH', 'token length=' + (token ? token.length : 0) + ' cookie=' + (cookie ? cookie.length + ' chars' : 'no'));

  var headers = {
    'Authorization': 'Bearer ' + token,
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Referer': 'https://azota.vn/',
    'Origin': 'https://azota.vn',
    'Accept': 'application/json'
  };
  if (cookie) headers['Cookie'] = cookie;

  _logExam('FETCH', 'Request headers (masked): Authorization=' + (token ? 'Bearer ' + token.substring(0, 20) + '...(' + token.length + ')' : 'empty') + ' Cookie=' + (cookie ? cookie.substring(0, 40) + '...(' + cookie.length + ')' : 'no'));
  var options = {
    method: 'get',
    headers: headers,
    muteHttpExceptions: true,
    followRedirects: true
  };

  var rawText = '';
  var code = 0;
  var responseHeaders = {};
  var tried = 0;
  for (var u = 0; u < urlsToTry.length; u++) {
    var url = urlsToTry[u];
    tried++;
    _logExam('FETCH', 'Try #' + tried + ' URL=' + url);
    var response;
    try {
      response = UrlFetchApp.fetch(url, options);
    } catch (fetchErr) {
      _logExam('FETCH', 'Try #' + tried + ' fetch threw: ' + fetchErr.toString());
      if (u === urlsToTry.length - 1) throw fetchErr;
      continue;
    }
    code = response.getResponseCode();
    responseHeaders = response.getHeaders();
    rawText = response.getContentText();
    var textPreview = rawText.length > 500 ? rawText.substring(0, 500) + '...' : rawText;
    _logExam('FETCH', 'Try #' + tried + ' responseCode=' + code + ' Content-Type=' + (responseHeaders['Content-Type'] || responseHeaders['content-type'] || ''));
    _logExam('FETCH', 'Try #' + tried + ' responseLength=' + rawText.length + ' firstChar=' + (rawText.trim().charAt(0) || ''));

    if (code !== 200) {
      _logExam('FETCH', 'Try #' + tried + ' Non-200 Location=' + (responseHeaders['Location'] || responseHeaders['location'] || ''));
      if (u === urlsToTry.length - 1) {
        throw new Error('API trả về ' + code + (responseHeaders['Location'] ? ' redirect to ' + responseHeaders['Location'] : '') + '. ' + rawText.substring(0, 200));
      }
      continue;
    }
    if (rawText.length === 0) {
      if (u === urlsToTry.length - 1) throw new Error('API trả về body rỗng.');
      continue;
    }
    if (rawText.trim().charAt(0) === '<') {
      _logExam('FETCH', 'Try #' + tried + ' got HTML, first 150: ' + rawText.substring(0, 150));
      if (u < urlsToTry.length - 1) {
        _logExam('FETCH', 'Retry with next URL (Teacher API)');
        continue;
      }
      _logExam('FETCH', 'All URLs returned HTML.');
      throw new Error('API trả về HTML thay vì JSON (đã thử azota.vn và azt-teacher-api.azota.vn). Có thể cần lấy dữ liệu từ trình duyệt (copy JSON) hoặc API chỉ chấp nhận request từ trang azota.vn.');
    }
    break;
  }

  var json;
  try {
    json = JSON.parse(rawText);
  } catch (parseErr) {
    _logExam('FETCH', 'JSON.parse failed: ' + parseErr.toString());
    _logExam('FETCH', 'Raw response (first 1000 chars): ' + rawText.substring(0, 1000));
    throw new Error('Không parse được JSON từ API: ' + parseErr.toString() + '. Response bắt đầu với: ' + rawText.substring(0, 100));
  }

  _logExam('FETCH', 'Parsed JSON keys: ' + Object.keys(json).join(', '));
  if (json.data && Array.isArray(json.data)) {
    _logExam('FETCH', 'Using json.data, length=' + json.data.length);
    return { items: json.data };
  }
  if (json.items && Array.isArray(json.items)) {
    _logExam('FETCH', 'Using json.items, length=' + json.items.length);
    return json;
  }
  if (json.students && Array.isArray(json.students)) {
    _logExam('FETCH', 'Using json.students, length=' + json.students.length);
    return { items: json.students };
  }

  if (json.data === null && (json.success === 1 || json.code === 200)) {
    _logExam('FETCH', 'data is null from private-api, trying ListResults endpoint');
    var listResult = fetchExamResultViaListResults(examId, token, cookie, headers);
    if (listResult) return listResult;
  }

  _logExam('FETCH', 'No array in response. data=' + (json.data === null ? 'null' : typeof json.data));
  var errMsg = 'API trả về không có danh sách kết quả (data=null). ';
  errMsg += 'Kiểm tra: (1) Trong Thuộc tính tập lệnh, ô Giá trị phải dán đủ toàn bộ token (JWT thường 800+ ký tự)—nếu ô chỉ hiển thị một phần thì vẫn phải dán đủ rồi Lưu; ';
  errMsg += '(2) Exam ID đúng và thuộc tài khoản Azota đang đăng nhập; ';
  errMsg += '(3) Thử đăng nhập lại azota.vn, mở trang kết quả thi, copy lại Bearer token từ DevTools rồi cập nhật Script Properties.';
  throw new Error(errMsg);
}

/**
 * Thử endpoint ListResults khi private-api trả data=null.
 * GET /api/ExamPageResult/ListResults?examId=...
 */
function fetchExamResultViaListResults(examId, token, cookie, headers) {
  var url = AZOTA_TEACHER_API_BASE + '/api/ExamPageResult/ListResults?examId=' + encodeURIComponent(examId);
  _logExam('LIST', 'URL=' + url);
  try {
    var response = UrlFetchApp.fetch(url, {
      method: 'get',
      headers: headers,
      muteHttpExceptions: true,
      followRedirects: true
    });
    var code = response.getResponseCode();
    var body = response.getContentText();
    _logExam('LIST', 'responseCode=' + code + ' length=' + body.length);
    if (code !== 200 || body.trim().charAt(0) !== '{') return null;
    var j = JSON.parse(body);
    
    // #region agent log
    _logExam('DEBUG', 'ListResults JSON parsed. topLevelKeys=' + Object.keys(j).join(','));
    _logExam('DEBUG', 'data type=' + (j.data === null ? 'null' : typeof j.data) + ' isArray=' + Array.isArray(j.data));
    if (j.data && typeof j.data === 'object' && !Array.isArray(j.data)) {
      _logExam('DEBUG', 'data is object, keys=' + Object.keys(j.data).join(','));
      // Check nested arrays in data object
      var dataObjKeys = Object.keys(j.data);
      for (var dk = 0; dk < dataObjKeys.length; dk++) {
        var dkVal = j.data[dataObjKeys[dk]];
        if (Array.isArray(dkVal)) {
          _logExam('DEBUG', 'Found nested array in data.' + dataObjKeys[dk] + ' length=' + dkVal.length);
        } else if (dkVal && typeof dkVal === 'object' && !Array.isArray(dkVal)) {
          var nestedKeys = Object.keys(dkVal);
          _logExam('DEBUG', 'data.' + dataObjKeys[dk] + ' is object with keys: ' + nestedKeys.join(','));
          for (var nk = 0; nk < nestedKeys.length; nk++) {
            if (Array.isArray(dkVal[nestedKeys[nk]])) {
              _logExam('DEBUG', 'Found nested array in data.' + dataObjKeys[dk] + '.' + nestedKeys[nk] + ' length=' + dkVal[nestedKeys[nk]].length);
            }
          }
        }
      }
    }
    // Check all top-level keys for arrays or objects containing arrays
    var allKeys = Object.keys(j);
    for (var ak = 0; ak < allKeys.length; ak++) {
      var val = j[allKeys[ak]];
      if (Array.isArray(val)) {
        _logExam('DEBUG', 'Top-level key ' + allKeys[ak] + ' is array, length=' + val.length);
      } else if (val && typeof val === 'object' && val !== null) {
        var valKeys = Object.keys(val);
        _logExam('DEBUG', 'Top-level key ' + allKeys[ak] + ' is object with keys: ' + valKeys.join(','));
        for (var vk = 0; vk < valKeys.length; vk++) {
          if (Array.isArray(val[valKeys[vk]])) {
            _logExam('DEBUG', 'Found array in ' + allKeys[ak] + '.' + valKeys[vk] + ' length=' + val[valKeys[vk]].length);
          }
        }
      }
    }
    _logExam('DEBUG', 'JSON preview (first 3000): ' + JSON.stringify(j).substring(0, 3000));
    // #endregion
    
    if (j.data && Array.isArray(j.data)) {
      _logExam('LIST', 'Using ListResults json.data length=' + j.data.length);
      return { items: j.data };
    }
    if (j.items && Array.isArray(j.items)) {
      _logExam('LIST', 'Using ListResults json.items length=' + j.items.length);
      return { items: j.items };
    }
    
    // #region agent log - Find and use arrays in data object
    if (j.data && typeof j.data === 'object' && !Array.isArray(j.data)) {
      var dataKeys = Object.keys(j.data);
      var foundArray = null;
      var foundArrayPath = null;
      // Check direct arrays in data
      for (var k = 0; k < dataKeys.length; k++) {
        if (Array.isArray(j.data[dataKeys[k]])) {
          foundArray = j.data[dataKeys[k]];
          foundArrayPath = 'data.' + dataKeys[k];
          break;
        }
        // Check nested objects in data
        if (j.data[dataKeys[k]] && typeof j.data[dataKeys[k]] === 'object' && !Array.isArray(j.data[dataKeys[k]])) {
          var nestedKeys = Object.keys(j.data[dataKeys[k]]);
          for (var nk = 0; nk < nestedKeys.length; nk++) {
            if (Array.isArray(j.data[dataKeys[k]][nestedKeys[nk]])) {
              foundArray = j.data[dataKeys[k]][nestedKeys[nk]];
              foundArrayPath = 'data.' + dataKeys[k] + '.' + nestedKeys[nk];
              break;
            }
          }
          if (foundArray) break;
        }
      }
      if (foundArray && foundArrayPath) {
        _logExam('LIST', 'Found array at ' + foundArrayPath + ' length=' + foundArray.length);
        return { items: foundArray };
      }
    }
    // #endregion
    
    // #region agent log - Find and use top-level arrays
    var allTopLevelKeys = Object.keys(j);
    var foundTopLevelArray = null;
    var foundTopLevelPath = null;
    for (var i = 0; i < allTopLevelKeys.length; i++) {
      var topVal = j[allTopLevelKeys[i]];
      if (Array.isArray(topVal)) {
        foundTopLevelArray = topVal;
        foundTopLevelPath = allTopLevelKeys[i];
        break;
      }
      // Check nested objects at top level
      if (topVal && typeof topVal === 'object' && topVal !== null && !Array.isArray(topVal)) {
        var topValKeys = Object.keys(topVal);
        for (var tvk = 0; tvk < topValKeys.length; tvk++) {
          if (Array.isArray(topVal[topValKeys[tvk]])) {
            foundTopLevelArray = topVal[topValKeys[tvk]];
            foundTopLevelPath = allTopLevelKeys[i] + '.' + topValKeys[tvk];
            break;
          }
        }
        if (foundTopLevelArray) break;
      }
    }
    if (foundTopLevelArray && foundTopLevelPath) {
      _logExam('LIST', 'Found top-level array at ' + foundTopLevelPath + ' length=' + foundTopLevelArray.length);
      return { items: foundTopLevelArray };
    }
    // #endregion
    
    _logExam('LIST', 'ListResults no array, keys=' + Object.keys(j).join(','));
    return null;
  } catch (e) {
    _logExam('LIST', 'ListResults error: ' + e.toString());
    return null;
  }
}

function getMarkFromItem(item) {
  if (item == null) return '';
  if (item.mark != null && item.mark !== '') return String(item.mark);
  if (item.markPercent != null) return String(item.markPercent);
  if (item.statisticObj && item.statisticObj.avgMark != null) return String(item.statisticObj.avgMark);
  return '';
}

function getNameImageUrlFromItem(item) {
  if (item == null) return '';
  // #region agent log
  _logExam('DEBUG', 'getNameImageUrlFromItem: item keys=' + Object.keys(item).join(','));
  // #endregion
  // Try nameImages (from private-api/exam-result)
  var ni = item.nameImages;
  if (ni && ni.url) {
    _logExam('DEBUG', 'Found nameImages.url');
    return String(ni.url);
  }
  if (ni && typeof ni === 'object' && ni[0] && ni[0].url) {
    _logExam('DEBUG', 'Found nameImages[0].url');
    return String(ni[0].url);
  }
  // Try attendeeNameImage (from ListResults)
  var ani = item.attendeeNameImage;
  // #region agent log
  _logExam('DEBUG', 'attendeeNameImage=' + (ani ? (typeof ani) + ' keys=' + (typeof ani === 'object' ? Object.keys(ani).join(',') : '') : 'null'));
  // #endregion
  if (ani && ani.url) {
    _logExam('DEBUG', 'Found attendeeNameImage.url=' + (ani.url ? ani.url.substring(0, 50) + '...' : 'null'));
    return String(ani.url);
  }
  _logExam('DEBUG', 'No image URL found');
  return '';
}

/**
 * Fetch ảnh từ URL (có thể cần token/cookie Azota), base64, gọi Gemini đọc tên viết tay.
 * Hỗ trợ cả HTTP URL và base64 data URL (data:image/jpeg;base64,...).
 */
function fetchImageAndRecognizeName(imageUrl, azotaToken, azotaCookie, geminiApiKey) {
  try {
    // #region agent log
    _logExam('IMAGE', 'Processing imageUrl (first 60): ' + imageUrl.substring(0, 60) + '...');
    // #endregion
    
    // Check if it's a base64 data URL (data:image/...;base64,...)
    if (imageUrl.indexOf('data:image/') === 0 && imageUrl.indexOf(';base64,') > 0) {
      var base64Part = imageUrl.substring(imageUrl.indexOf(';base64,') + 8);
      var mimeMatch = imageUrl.match(/data:image\/([^;]+)/);
      var mimeType = mimeMatch ? 'image/' + mimeMatch[1] : 'image/jpeg';
      _logExam('IMAGE', 'Detected base64 data URL, mime=' + mimeType + ' base64len=' + base64Part.length);
      return recognizeHandwrittenName(base64Part, mimeType, geminiApiKey);
    }
    
    // Otherwise, fetch HTTP URL
    _logExam('IMAGE', 'Fetching HTTP URL...');
    var headers = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Referer': 'https://azota.vn/',
      'Accept': 'image/*,*/*'
    };
    if (azotaToken) headers['Authorization'] = 'Bearer ' + azotaToken;
    if (azotaCookie && typeof azotaCookie === 'string' && azotaCookie.trim()) headers['Cookie'] = azotaCookie.trim();
    var options = {
      method: 'get',
      muteHttpExceptions: true,
      headers: headers
    };
    var response = UrlFetchApp.fetch(imageUrl, options);
    var imgCode = response.getResponseCode();
    _logExam('IMAGE', 'Image responseCode=' + imgCode);
    if (imgCode !== 200) {
      _logExam('IMAGE', 'Image fetch failed, body start: ' + (response.getContentText() || '').substring(0, 200));
      return '';
    }
    var blob = response.getBlob();
    var mimeType = blob.getContentType() || 'image/png';
    var bytes = blob.getBytes();
    var base64 = Utilities.base64Encode(bytes);
    _logExam('IMAGE', 'Image size bytes=' + bytes.length + ' base64len=' + base64.length + ' mime=' + mimeType);
    return recognizeHandwrittenName(base64, mimeType, geminiApiKey);
  } catch (e) {
    _logExam('IMAGE', 'fetchImageAndRecognizeName error: ' + e.toString());
    Logger.log('fetchImageAndRecognizeName error: ' + e.toString());
    return '';
  }
}

/**
 * Gọi Gemini Vision: ảnh (inline_data) + prompt đọc tên học sinh viết tay.
 * Nhận geminiApiKey như parameter (từ Properties hoặc dialog).
 */
function recognizeHandwrittenName(imageBase64, mimeType, geminiApiKey) {
  // Use parameter first, fallback to global GEMINI_API_KEY from Config.js
  var apiKey = geminiApiKey || (typeof GEMINI_API_KEY !== 'undefined' ? GEMINI_API_KEY : '');
  if (!apiKey) {
    _logExam('GEMINI', 'Chưa có Gemini API key (không có trong Properties và không nhập trong dialog)');
    Logger.log('recognizeHandwrittenName: Chưa có Gemini API key');
    return '';
  }
  var url = typeof getGeminiUrl === 'function' ? getGeminiUrl() : 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent';
  _logExam('GEMINI', 'Calling Gemini url (model) for vision');
  var payload = {
    contents: [{
      parts: [
        { text: GEMINI_NAME_PROMPT },
        { inline_data: { mime_type: mimeType || 'image/png', data: imageBase64 } }
      ]
    }]
  };
  var options = {
    method: 'post',
    contentType: 'application/json',
    headers: { 'X-goog-api-key': apiKey },
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  };
  var response = UrlFetchApp.fetch(url, options);
    var geminiCode = response.getResponseCode();
    var geminiBody = response.getContentText();
    _logExam('GEMINI', 'Gemini responseCode=' + geminiCode + ' bodyLength=' + geminiBody.length);
    if (geminiCode !== 200) {
      _logExam('GEMINI', 'Gemini non-200 body: ' + geminiBody.substring(0, 300));
      if (geminiCode === 403) {
        try {
          var errJson = JSON.parse(geminiBody);
          if (errJson.error && errJson.error.message && errJson.error.message.indexOf('leaked') >= 0) {
            _logExam('GEMINI', 'ERROR: API key bị leak. Cần tạo key mới tại https://aistudio.google.com/app/apikey');
            Logger.log('⚠️ GEMINI API KEY BỊ LEAK - Cần tạo key mới và cập nhật trong Script Properties (GEMINI_API_KEY)');
          }
        } catch (e) {}
      }
      return '';
    }
  var result;
  try {
    result = JSON.parse(geminiBody);
  } catch (parseErr) {
    _logExam('GEMINI', 'Gemini JSON.parse error: ' + parseErr.toString());
    return '';
  }
  if (!result.candidates || !result.candidates[0] || !result.candidates[0].content || !result.candidates[0].content.parts) {
    _logExam('GEMINI', 'Gemini no candidates/parts: ' + JSON.stringify(result).substring(0, 200));
    return '';
  }
  var text = (result.candidates[0].content.parts[0].text || '').trim();
  _logExam('GEMINI', 'Recognized text="' + text + '"');
  return text;
}

/**
 * Chuẩn hóa tên để so sánh: trim, lowercase, bỏ dấu tiếng Việt, gộp khoảng trắng.
 */
function normalizeNameForMatch(name) {
  if (name == null || typeof name !== 'string') return '';
  var s = name.trim().toLowerCase().replace(/\s+/g, ' ');
  return removeVietnameseTone(s);
}

var VIETNAMESE_MAP = {
  'à': 'a', 'á': 'a', 'ả': 'a', 'ã': 'a', 'ạ': 'a', 'ă': 'a', 'ằ': 'a', 'ắ': 'a', 'ẳ': 'a', 'ẵ': 'a', 'ặ': 'a', 'â': 'a', 'ầ': 'a', 'ấ': 'a', 'ẩ': 'a', 'ẫ': 'a', 'ậ': 'a',
  'è': 'e', 'é': 'e', 'ẻ': 'e', 'ẽ': 'e', 'ẹ': 'e', 'ê': 'e', 'ề': 'e', 'ế': 'e', 'ể': 'e', 'ễ': 'e', 'ệ': 'e',
  'ì': 'i', 'í': 'i', 'ỉ': 'i', 'ĩ': 'i', 'ị': 'i',
  'ò': 'o', 'ó': 'o', 'ỏ': 'o', 'õ': 'o', 'ọ': 'o', 'ô': 'o', 'ồ': 'o', 'ố': 'o', 'ổ': 'o', 'ỗ': 'o', 'ộ': 'o', 'ơ': 'o', 'ờ': 'o', 'ớ': 'o', 'ở': 'o', 'ỡ': 'o', 'ợ': 'o',
  'ù': 'u', 'ú': 'u', 'ủ': 'u', 'ũ': 'u', 'ụ': 'u', 'ư': 'u', 'ừ': 'u', 'ứ': 'u', 'ử': 'u', 'ữ': 'u', 'ự': 'u',
  'ỳ': 'y', 'ý': 'y', 'ỷ': 'y', 'ỹ': 'y', 'ỵ': 'y', 'đ': 'd'
};

function removeVietnameseTone(str) {
  var out = '';
  for (var i = 0; i < str.length; i++) {
    var c = str.charAt(i);
    out += VIETNAMESE_MAP[c] || c;
  }
  return out;
}

/**
 * Levenshtein distance (số phép biến đổi tối thiểu).
 */
function levenshteinDistance(a, b) {
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;
  var m = a.length, n = b.length;
  var d = [];
  for (var i = 0; i <= m; i++) { d[i] = [i]; }
  for (var j = 0; j <= n; j++) { d[0][j] = j; }
  for (var i = 1; i <= m; i++) {
    for (var j = 1; j <= n; j++) {
      var cost = a.charAt(i - 1) === b.charAt(j - 1) ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
    }
  }
  return d[m][n];
}

/**
 * Điểm tương đồng 0..1 (1 = giống hệt). Dựa trên Levenshtein.
 */
function similarityScore(normA, normB) {
  if (normA === normB) return 1;
  if (normA.length === 0 && normB.length === 0) return 1;
  if (normA.length === 0 || normB.length === 0) return 0;
  var lev = levenshteinDistance(normA, normB);
  var maxLen = Math.max(normA.length, normB.length);
  return 1 - lev / maxLen;
}

/**
 * Tìm trong danh sách BaoCao (baoCaoNameList) bản ghi khớp nhất với recognizedName.
 * Trả về { index, score } hoặc null nếu dưới ngưỡng.
 */
function findBestMatch(recognizedName, baoCaoNameList) {
  if (!recognizedName || !baoCaoNameList || baoCaoNameList.length === 0) return null;
  var normRec = normalizeNameForMatch(recognizedName);
  if (normRec.length === 0) return null;
  var bestIndex = -1;
  var bestScore = SIMILARITY_THRESHOLD;
  for (var i = 0; i < baoCaoNameList.length; i++) {
    var normB = normalizeNameForMatch(baoCaoNameList[i]);
    var score = similarityScore(normRec, normB);
    if (score > bestScore) {
      bestScore = score;
      bestIndex = i;
    }
  }
  if (bestIndex < 0) return null;
  return { index: bestIndex, score: bestScore };
}

/**
 * Tìm index cột: Họ tên, Mã HV, Điểm chấm Azota, Ảnh tên Azota.
 * Dùng findColumnIndex từ BTVNLogic.js nếu có; không thì tìm đơn giản theo header row.
 */
function getBaoCaoColumnMapping(sheet) {
  var headerRow = 1;
  var lastCol = sheet.getLastColumn();
  if (lastCol === 0) return { hoTen: -1, hv: -1, diemCham: -1, anhTen: -1 };
  var headers = sheet.getRange(headerRow, 1, 1, lastCol).getValues()[0];
  var find = function(names) {
    var arr = Array.isArray(names) ? names : [names];
    for (var i = 0; i < headers.length; i++) {
      var h = String(headers[i] || '').trim().toLowerCase();
      for (var j = 0; j < arr.length; j++) {
        var n = String(arr[j]).trim().toLowerCase();
        if (h === n || h.indexOf(n) >= 0 || n.indexOf(h) >= 0) return i;
      }
    }
    return -1;
  };
  return {
    hoTen: find(['Họ tên', 'Họ và tên', 'Tên', 'hoten', 'ho ten']),
    hv: find(['Mã HV', 'Mã học viên', 'HV', 'ma hv']),
    diemCham: find(['Điểm chấm Azota', 'Điểm Azota', 'diem cham azota']),
    anhTen: find(['Ảnh tên Azota', 'Link ảnh', 'anh ten azota'])
  };
}
