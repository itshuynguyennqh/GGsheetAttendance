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
/** true sau lần gọi Gemini đầu tiên trả về API key hết hạn / không hợp lệ — tránh gọi lặp 29 lần */
var AZOTA_GEMINI_KEY_FATAL = false;
/**
 * Gemini 3.1 Flash Lite: giới hạn an toàn ~15 request/phút → gọi tuần tự, cách nhau tối thiểu 4s.
 * (Song song nhiều request dễ vượt RPM / 429.)
 */
var GEMINI_RPM_LIMIT = 15;
var GEMINI_RPM_WINDOW_MS = 60000;
var GEMINI_MIN_INTERVAL_MS = Math.ceil(GEMINI_RPM_WINDOW_MS / GEMINI_RPM_LIMIT); // 4000 ms
var _geminiLastCallMs = 0;

/** Giữ tối đa GEMINI_RPM_LIMIT request/phút (khoảng cách tối thiểu giữa hai lần gọi). */
function _throttleGeminiBeforeCall() {
  var now = Date.now();
  var elapsed = now - _geminiLastCallMs;
  if (_geminiLastCallMs > 0 && elapsed < GEMINI_MIN_INTERVAL_MS) {
    var wait = GEMINI_MIN_INTERVAL_MS - elapsed;
    _logExam('GEMINI', 'RPM limit ' + GEMINI_RPM_LIMIT + '/min: cho ' + wait + 'ms');
    Utilities.sleep(wait);
  }
  _geminiLastCallMs = Date.now();
}

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

/**
 * Menu mặc định: sau OCR + khớp tên → mở dialog xác minh → bấm "Ghi vào sheet" mới ghi.
 */
function pullAzotaExamResult() {
  pullAzotaExamResultCore(true);
}

/**
 * Ghi thẳng vào BaoCao không qua dialog (nhanh; rủi ro khớp sai tên).
 */
function pullAzotaExamResultDirect() {
  pullAzotaExamResultCore(false);
}

/**
 * Giống pullAzotaExamResult (dialog xác minh). Giữ tên hàm cho menu cũ / tài liệu.
 */
function pullAzotaExamResultWithDialog() {
  pullAzotaExamResultCore(true);
}

function pullAzotaExamResultCore(useDialog) {
  AZOTA_GEMINI_KEY_FATAL = false;
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

    var total = items.length;
    var ocrFailedCount = 0;
    var geminiKeyIssue = false;
    // #region agent log
    if (items.length > 0) {
      _logExam('DEBUG', 'First item keys: ' + Object.keys(items[0]).join(','));
      _logExam('DEBUG', 'First item sample: ' + JSON.stringify(items[0]).substring(0, 500));
    }
    // #endregion
    var recognized = [];
    recognized.length = items.length;
    var geminiJobs = [];
    var needHttp = [];
    for (var idx = 0; idx < items.length; idx++) {
      var item = items[idx];
      var mark = getMarkFromItem(item);
      var imageUrl = getNameImageUrlFromItem(item) || '';
      var attendeeName = item.attendeeName || '';
      _logExam('OCR', 'item ' + (idx + 1) + '/' + total + ' mark=' + mark + ' imageUrl=' + (imageUrl ? imageUrl.substring(0, 50) + '...' : 'null') + ' attendeeName=' + (attendeeName || 'null'));
      if (attendeeName && String(attendeeName).trim()) {
        recognized[idx] = { mark: mark, nameImageUrl: imageUrl, recognizedName: String(attendeeName).trim() };
        _logExam('OCR', 'item ' + (idx + 1) + ' using attendeeName="' + recognized[idx].recognizedName + '"');
      } else if (imageUrl && geminiKey && !AZOTA_GEMINI_KEY_FATAL) {
        recognized[idx] = { mark: mark, nameImageUrl: imageUrl, recognizedName: '' };
        if (imageUrl.indexOf('data:image/') === 0 && imageUrl.indexOf(';base64,') > 0) {
          var mimeM = imageUrl.match(/data:image\/([^;]+)/);
          geminiJobs.push({
            idx: idx,
            base64: imageUrl.substring(imageUrl.indexOf(';base64,') + 8),
            mime: mimeM ? 'image/' + mimeM[1] : 'image/jpeg'
          });
        } else {
          needHttp.push({ idx: idx, imageUrl: imageUrl, mark: mark });
        }
      } else {
        recognized[idx] = { mark: mark, nameImageUrl: imageUrl, recognizedName: '' };
      }
    }
    if (needHttp.length > 0) {
      _logExam('OCR', 'fetchAll ảnh HTTP song song: ' + needHttp.length);
      var httpHeaders = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Referer': 'https://azota.vn/',
        'Accept': 'image/*,*/*'
      };
      if (token) httpHeaders['Authorization'] = 'Bearer ' + token;
      if (cookie && String(cookie).trim()) httpHeaders['Cookie'] = String(cookie).trim();
      var httpReqs = [];
      for (var h = 0; h < needHttp.length; h++) {
        httpReqs.push({ url: needHttp[h].imageUrl, method: 'get', muteHttpExceptions: true, headers: httpHeaders });
      }
      var httpRes = UrlFetchApp.fetchAll(httpReqs);
      for (var h2 = 0; h2 < needHttp.length; h2++) {
        if (httpRes[h2].getResponseCode() === 200) {
          var blob = httpRes[h2].getBlob();
          geminiJobs.push({
            idx: needHttp[h2].idx,
            base64: Utilities.base64Encode(blob.getBytes()),
            mime: blob.getContentType() || 'image/jpeg'
          });
        } else {
          _logExam('IMAGE', 'HTTP image fail idx=' + needHttp[h2].idx + ' code=' + httpRes[h2].getResponseCode());
        }
      }
    }
    _logExam('OCR', 'Gemini tuan tu (max ' + GEMINI_RPM_LIMIT + ' req/phut), jobs=' + geminiJobs.length);
    if (geminiJobs.length > 0 && geminiKey && !AZOTA_GEMINI_KEY_FATAL) {
      var geminiUrl = typeof getGeminiUrl === 'function' ? getGeminiUrl() : 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent';
      for (var g = 0; g < geminiJobs.length && !AZOTA_GEMINI_KEY_FATAL; g++) {
        var j = geminiJobs[g];
        ss.toast('Gemini OCR ' + (g + 1) + '/' + geminiJobs.length + '...', 'OCR', 4);
        _throttleGeminiBeforeCall();
        var payload1 = {
          contents: [{
            parts: [
              { text: GEMINI_NAME_PROMPT },
              { inline_data: { mime_type: j.mime || 'image/jpeg', data: j.base64 } }
            ]
          }]
        };
        var resp1 = UrlFetchApp.fetch(geminiUrl, {
          method: 'post',
          contentType: 'application/json',
          headers: { 'X-goog-api-key': geminiKey },
          payload: JSON.stringify(payload1),
          muteHttpExceptions: true
        });
        var idxJ = j.idx;
        var text = _parseGeminiFetchResponse(resp1);
        recognized[idxJ].recognizedName = text;
        _logExam('OCR', 'item ' + (idxJ + 1) + ' recognizedName="' + text + '"');
        if (!text && geminiKey) {
          ocrFailedCount++;
          geminiKeyIssue = true;
        }
        _logExam('GEMINI', 'Recognized text="' + text + '" (idx ' + idxJ + ')');
      }
    }
    var recognizedOrdered = [];
    for (var ord = 0; ord < items.length; ord++) recognizedOrdered.push(recognized[ord]);
    recognized = recognizedOrdered;
    
    // #region agent log
    if (ocrFailedCount > 0) {
      _logExam('OCR', 'OCR failed for ' + ocrFailedCount + '/' + total + ' items');
      if (geminiKeyIssue) {
        _logExam('OCR', 'Gemini API key issue detected - may need new key');
      }
    }
    // #endregion

    if (AZOTA_GEMINI_KEY_FATAL) {
      ui.alert(
        '❌ Gemini API key không dùng được\n\n' +
        'Google trả lỗi: API key expired / API_KEY_INVALID.\n\n' +
        'Cách xử lý:\n' +
        '1. Vào https://aistudio.google.com/app/apikey\n' +
        '2. Tạo API key mới (hoặc bật lại key cũ nếu còn hạn)\n' +
        '3. Menu: Báo cáo Buổi → 🔑 Cập nhật Gemini API Key\n' +
        '4. Dán key mới vào Script Properties (GEMINI_API_KEY)\n\n' +
        'Sau đó chạy lại kéo điểm chấm Azota.'
      );
      return;
    }

    while (recognized.length < items.length) {
      var itemRest = items[recognized.length];
      recognized.push({
        mark: getMarkFromItem(itemRest),
        nameImageUrl: getNameImageUrlFromItem(itemRest),
        recognizedName: ''
      });
    }

    var diemCol = colMapping.diemCham >= 0 ? colMapping.diemCham : colMapping.hoTen + 2;
    var anhCol = colMapping.anhTen >= 0 ? colMapping.anhTen : diemCol + 1;
    _logExam('WRITE', 'diemCol(0-based)=' + diemCol + ' anhCol(0-based)=' + anhCol);

    var matchedCount = 0;
    var usedRow = {};
    var resultsForDialog = useDialog ? [] : null;

    for (var r = 0; r < recognized.length; r++) {
      var rec = recognized[r];
      var best = findBestMatch(rec.recognizedName, baoCaoNames);
      var sheetRow = -1;
      var matchedName = '';
      var scoreNum = 0;
      if (best && best.index >= 0 && !usedRow[best.index]) {
        usedRow[best.index] = true;
        sheetRow = rowIndices[best.index];
        matchedName = baoCaoNames[best.index] || '';
        scoreNum = Math.round((best.score || 0) * 100);
        if (!useDialog) {
          baoCaoSheet.getRange(sheetRow, diemCol + 1).setValue(markValueForSheet(rec.mark));
          if (rec.nameImageUrl) baoCaoSheet.getRange(sheetRow, anhCol + 1).setValue(rec.nameImageUrl);
        }
        matchedCount++;
        _logExam('MATCH', 'recognized="' + rec.recognizedName + '" -> row ' + sheetRow + ' (' + matchedName + ') score=' + scoreNum);
      } else {
        _logExam('NOMATCH', 'recognized="' + rec.recognizedName + '" no match or row already used');
      }
      if (useDialog) {
        resultsForDialog.push({
          mark: rec.mark,
          nameImageUrl: rec.nameImageUrl || '',
          recognizedName: rec.recognizedName || '',
          matchedName: matchedName,
          matchedSheetRow: sheetRow,
          score: scoreNum
        });
      }
    }

    if (useDialog) {
      var unmatchedForDialog = [];
      for (var u = 0; u < rowIndices.length; u++) {
        if (!usedRow[u]) {
          unmatchedForDialog.push({ sheetRow: rowIndices[u], name: baoCaoNames[u] || '' });
        }
      }
      var sheetContext = { diemCol: diemCol + 1, anhCol: anhCol + 1 };
      showAzotaResultDialog(resultsForDialog, unmatchedForDialog, sheetContext);
      return;
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

/** Ghi điểm lên sheet: dấu phẩy làm thập phân (8,25 thay vì 8.25). */
function markValueForSheet(mark) {
  if (mark == null || mark === '') return '';
  return String(mark).trim().replace(/\./g, ',');
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
    if (AZOTA_GEMINI_KEY_FATAL) return '';
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
 * Parse HTTP response từ Gemini generateContent (dùng cho fetchAll batch).
 */
function _parseGeminiFetchResponse(response) {
  var geminiCode = response.getResponseCode();
  var geminiBody = response.getContentText();
  _logExam('GEMINI', 'Gemini responseCode=' + geminiCode + ' bodyLength=' + (geminiBody && geminiBody.length));
  if (geminiCode !== 200) {
    _logExam('GEMINI', 'Gemini non-200 body: ' + (geminiBody || '').substring(0, 300));
    try {
      var errJ = JSON.parse(geminiBody);
      var errMsg = (errJ.error && errJ.error.message) ? String(errJ.error.message) : '';
      var errReason = '';
      if (errJ.error && errJ.error.details && errJ.error.details[0] && errJ.error.details[0].reason) {
        errReason = String(errJ.error.details[0].reason);
      }
      if (errReason === 'API_KEY_INVALID' || errMsg.indexOf('expired') >= 0 || errMsg.indexOf('API key') >= 0) {
        AZOTA_GEMINI_KEY_FATAL = true;
        _logExam('GEMINI', 'API key hết hạn hoặc không hợp lệ — dừng batch OCR');
      }
    } catch (e2) {}
    return '';
  }
  try {
    var result = JSON.parse(geminiBody);
    if (!result.candidates || !result.candidates[0] || !result.candidates[0].content || !result.candidates[0].content.parts) {
      return '';
    }
    return (result.candidates[0].content.parts[0].text || '').trim();
  } catch (parseErr) {
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
  _throttleGeminiBeforeCall();
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
      try {
        var errJ = JSON.parse(geminiBody);
        var errMsg = (errJ.error && errJ.error.message) ? String(errJ.error.message) : '';
        var errReason = '';
        if (errJ.error && errJ.error.details && errJ.error.details[0] && errJ.error.details[0].reason) {
          errReason = String(errJ.error.details[0].reason);
        }
        if (errReason === 'API_KEY_INVALID' || errMsg.indexOf('expired') >= 0 || errMsg.indexOf('API key') >= 0) {
          AZOTA_GEMINI_KEY_FATAL = true;
          _logExam('GEMINI', 'API key hết hạn hoặc không hợp lệ — dừng gọi OCR tiếp');
        }
        if (geminiCode === 403 && errMsg.indexOf('leaked') >= 0) {
          _logExam('GEMINI', 'ERROR: API key bị leak. Tạo key mới tại https://aistudio.google.com/app/apikey');
        }
      } catch (e2) {}
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

/** Tách tên đã chuẩn hóa thành mảng từ (họ / đệm / tên). */
function nameTokensNormalized(norm) {
  if (!norm || typeof norm !== 'string') return [];
  return norm.trim().split(/\s+/).filter(function (t) {
    return t.length > 0;
  });
}

/**
 * Điểm khớp 0..1: tên đọc được thường chỉ có tên hoặc đệm+tên;
 * tên trong lớp có thể đủ họ đệm tên hoặc ngắn — so khớp theo hậu tố từ, chuỗi con, subsequence.
 */
function nameMatchScore(normRec, normFull) {
  if (!normRec || !normFull) return 0;
  if (normRec === normFull) return 1;
  var rTok = nameTokensNormalized(normRec);
  var fTok = nameTokensNormalized(normFull);
  if (rTok.length === 0) return 0;

  if (normFull.indexOf(normRec) >= 0 && normRec.length >= 2) return 0.94;
  if (normRec.indexOf(normFull) >= 0 && normFull.length >= 2) return 0.96;

  if (rTok.length <= fTok.length) {
    var suffixOk = true;
    for (var k = 0; k < rTok.length; k++) {
      if (rTok[rTok.length - 1 - k] !== fTok[fTok.length - 1 - k]) {
        suffixOk = false;
        break;
      }
    }
    if (suffixOk) {
      return 0.76 + 0.2 * Math.min(1, rTok.length / Math.max(fTok.length, 1));
    }
  }

  var pi = 0;
  var fi = 0;
  for (fi = 0; fi < fTok.length && pi < rTok.length; fi++) {
    if (rTok[pi] === fTok[fi]) {
      pi++;
    } else if (similarityScore(rTok[pi], fTok[fi]) >= 0.88) {
      pi++;
    }
  }
  if (pi === rTok.length) {
    return 0.66 + 0.26 * Math.min(1, rTok.length / Math.max(fTok.length, 1));
  }

  if (rTok.length === 1 && fTok.length >= 1) {
    var last = fTok[fTok.length - 1];
    var sim = similarityScore(rTok[0], last);
    if (sim >= 0.9) return 0.7 + 0.22 * sim;
    if (rTok[0].length >= 2 && last.indexOf(rTok[0]) >= 0) return 0.69;
    if (last.length >= 2 && rTok[0].indexOf(last) >= 0) return 0.67;
  }

  if (rTok.length === 2 && fTok.length >= 2) {
    var sim2 = similarityScore(rTok.join(' '), fTok.slice(-2).join(' '));
    if (sim2 >= 0.82) return 0.72 + 0.2 * sim2;
  }

  return similarityScore(normRec, normFull);
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
    var score = nameMatchScore(normRec, normB);
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
function showAzotaResultDialog(results, unmatched, sheetContext) {
  try {
    var payload = JSON.stringify({ r: results, u: unmatched || [], s: sheetContext || {} });
    var blob = Utilities.newBlob(payload, 'application/json; charset=UTF-8', 'payload.json');
    var b64 = Utilities.base64Encode(blob.getBytes());
    _logExam('DIALOG', 'payload b64 length=' + b64.length + ' rows=' + (results && results.length));
    var html =
      '<!DOCTYPE html><html lang="vi"><head><base target="_top"><meta charset="UTF-8">' +
      '<style>*{box-sizing:border-box}body{font-family:"Segoe UI",Arial,sans-serif;padding:12px;margin:0;font-size:13px}' +
      'h3{margin:0 0 10px;color:#1a73e8}.layout{display:flex;gap:14px;align-items:flex-start}' +
      '.table-wrap{flex:1;min-width:0;overflow:auto;border:1px solid #ddd;border-radius:8px;max-height:68vh}' +
      'table{width:100%;border-collapse:collapse}th,td{padding:8px 6px;border-bottom:1px solid #eee;vertical-align:middle}' +
      'th{background:#1a73e8;color:#fff;font-weight:600}tr.drop-target{outline:2px dashed #1a73e8;outline-offset:-2px;background:#e3f2fd}' +
      '.drop-cell{min-height:36px;border-radius:6px;padding:6px;transition:background .15s}' +
      '.score-ok{color:#1b5e20;font-weight:700}.score-warn{color:#e65100;font-weight:600}' +
      '.sidebar{width:260px;flex-shrink:0;border:2px solid #ff9800;border-radius:10px;padding:10px;background:#fff8e1;max-height:68vh;overflow-y:auto}' +
      '.chip{display:inline-block;margin:4px;padding:8px 12px;background:#fff;border:1px solid #ff9800;border-radius:20px;cursor:grab;font-size:12px;max-width:100%;word-break:break-word;box-shadow:0 1px 3px rgba(0,0,0,.08)}' +
      '.chip-matched{background:#e8f5e9;border:2px solid #43a047;color:#1b5e20;cursor:default;font-weight:600}' +
      '.chip-placeholder{display:inline-block;padding:8px 14px;border:1px dashed #bdbdbd;border-radius:20px;color:#9e9e9e;font-size:11px;font-style:normal}' +
      '.chip:active{cursor:grabbing;opacity:.9}.chip-pool{min-height:80px;display:flex;flex-wrap:wrap;align-content:flex-start;gap:2px}' +
      '.actions{margin-top:14px;display:flex;gap:8px;flex-wrap:wrap;align-items:center}button{padding:10px 16px;border:none;border-radius:8px;cursor:pointer;font-weight:600}' +
      '.btn-primary{background:#1a73e8;color:#fff}.btn-secondary{background:#e0e0e0}#err{color:#b71c1c;font-size:12px;margin-top:8px;white-space:pre-wrap}' +
      '.hint{background:#e3f2fd;border:1px solid #64b5f6;border-radius:8px;padding:10px;margin-bottom:10px;font-size:12px;line-height:1.5}' +
      '.small{font-size:11px;color:#555;margin-top:6px}' +
      '</style></head><body>' +
      '<h3>Xác minh khớp tên — Kéo điểm chấm Azota</h3>' +
      '<div class="hint"><b>Cách dùng:</b> Kéo <b>chip tên</b> bên phải thả vào ô <b>Tên trong lớp</b> của đúng dòng bài làm. ' +
      'Double-click ô tên đã gán để trả chip về. <b>Ghi vào sheet</b> chỉ ghi <b>điểm chấm</b> (không ghi link ảnh).</div>' +
      '<div class="layout"><div class="table-wrap"><table><thead><tr>' +
      '<th>Ảnh</th><th>Tên trong lớp (chip — kéo thả)</th><th>Điểm</th><th>Tên đọc được</th><th>Độ khớp</th></tr></thead><tbody id="tb"></tbody></table></div>' +
      '<div class="sidebar"><b>Chưa gán — kéo thả</b> <span id="uc">0</span> chip' +
      '<div class="small">Kéo từng chip vào đúng dòng bài làm bên trái.</div>' +
      '<div id="pool" class="chip-pool"></div></div></div>' +
      '<div class="actions"><button type="button" class="btn-primary" id="bw">Ghi vào sheet BaoCao</button>' +
      '<button type="button" class="btn-secondary" id="bx">Đóng</button></div><div id="m"></div><div id="err"></div>' +
      '<textarea id="p" style="display:none">' + b64 + '</textarea>' +
      '<script>' +
      '(function(){' +
      'function b64ToUtf8(b64){' +
      'var bin=atob(b64);' +
      'if(typeof TextDecoder!=="undefined"){var u8=new Uint8Array(bin.length);for(var i=0;i<bin.length;i++)u8[i]=bin.charCodeAt(i)&255;return new TextDecoder("utf-8").decode(u8);}' +
      'try{return decodeURIComponent(escape(bin));}catch(e){return bin;}' +
      '}' +
      'var el=document.getElementById("p");' +
      'var raw=el?el.value.trim().replace(/\\s/g,""):"";' +
      'var RD=[],UD=[],SC={},rowsEl=[];' +
      'try{var D=JSON.parse(b64ToUtf8(raw));RD=D.r||[];UD=(D.u||[]).slice();SC=D.s||{};for(var zi=0;zi<UD.length;zi++)UD[zi].used=false;}' +
      'catch(ex){document.getElementById("err").textContent="Lỗi đọc dữ liệu (UTF-8): "+ex.message;return;}' +
      'function rowBySheetRow(sr){for(var i=0;i<RD.length;i++)if(RD[i].matchedSheetRow===sr)return i;return -1;}' +
      'function freeSheetRow(sr){for(var u=0;u<UD.length;u++)if(UD[u].sheetRow===sr)UD[u].used=false;var ix=rowBySheetRow(sr);if(ix>=0){RD[ix].matchedName="";RD[ix].matchedSheetRow=null;RD[ix].score=0;refreshRow(ix);}}' +
      'function fillDropChip(td,txt,has){td.innerHTML="";if(txt){var sp=document.createElement("span");sp.className="chip chip-matched";sp.textContent=txt;td.appendChild(sp);}else{var pl=document.createElement("span");pl.className="chip-placeholder";pl.textContent="Thả chip vào đây";td.appendChild(pl);}td.style.background=has?"#f1f8e9":"#fafafa";}' +
      'function refreshRow(i){' +
      'var tr=rowsEl[i];if(!tr)return;' +
      'var r=RD[i];' +
      'var tdDrop=tr.querySelector(".drop-cell");var tdScore=tr.querySelector(".td-score");' +
      'fillDropChip(tdDrop,r.matchedName||"",!!r.matchedSheetRow);' +
      'if(r.score>0){tdScore.textContent=String(Math.round(r.score));tdScore.className="td-score "+(r.score>=75?"score-ok":"score-warn");}' +
      'else{tdScore.textContent="—";tdScore.className="td-score";}' +
      '}' +
      'function renderPool(){' +
      'var pool=document.getElementById("pool");pool.innerHTML="";var nfree=0;' +
      'for(var j=0;j<UD.length;j++)if(UD[j]&&!UD[j].used)nfree++;' +
      'document.getElementById("uc").textContent=String(nfree);' +
      'for(var j=0;j<UD.length;j++){' +
      'var u=UD[j];if(!u||u.used)continue;' +
      'var chip=document.createElement("div");chip.className="chip";chip.draggable=true;chip.textContent=u.name||"";' +
      'chip.setAttribute("data-row",String(u.sheetRow));' +
      'chip.setAttribute("data-name",u.name||"");' +
      'chip.ondragstart=function(ev){var t=ev.target;ev.dataTransfer.setData("text/plain",t.getAttribute("data-row")+"|"+encodeURIComponent(t.getAttribute("data-name")||""));ev.dataTransfer.effectAllowed="copyMove";};' +
      'pool.appendChild(chip);}' +
      '}' +
      'function build(){' +
      'var tb=document.getElementById("tb");tb.innerHTML="";rowsEl=[];' +
      'if(!RD.length){tb.innerHTML="<tr><td colspan=5>Không có dữ liệu</td></tr>";renderPool();return;}' +
      'for(var i=0;i<RD.length;i++){(function(rowIdx){' +
      'var r=RD[rowIdx];var tr=document.createElement("tr");tr.setAttribute("data-ix",String(rowIdx));rowsEl[rowIdx]=tr;' +
      'tr.ondragover=function(e){e.preventDefault();e.dataTransfer.dropEffect="move";this.classList.add("drop-target");};' +
      'tr.ondragleave=function(){this.classList.remove("drop-target");};' +
      'tr.ondrop=function(e){e.preventDefault();this.classList.remove("drop-target");' +
      'var ix=rowIdx;var parts=(e.dataTransfer.getData("text/plain")||"").split("|");' +
      'var sr=parseInt(parts[0],10);var nm=parts.length>1?decodeURIComponent(parts[1]):"";' +
      'if(!sr||isNaN(sr))return;' +
      'var prev=RD[ix].matchedSheetRow;if(prev&&prev!==sr)freeSheetRow(prev);' +
      'freeSheetRow(sr);' +
      'for(var u=0;u<UD.length;u++)if(UD[u].sheetRow===sr)UD[u].used=true;' +
      'RD[ix].matchedSheetRow=sr;RD[ix].matchedName=nm;RD[ix].score=100;refreshRow(ix);renderPool();' +
      '};' +
      'var td0=document.createElement("td");var u=r.nameImageUrl||"";' +
      'if(u.indexOf("data:image/")===0){var im=document.createElement("img");im.src=u;im.style.cssText="max-height:72px;max-width:140px;object-fit:contain;border-radius:6px;border:1px solid #ccc;cursor:zoom-in";im.title="Phóng to";im.onclick=function(){window.open(this.src);};td0.appendChild(im);}' +
      'else if(u){var a=document.createElement("a");a.href=u;a.target="_blank";a.textContent="Ảnh";td0.appendChild(a);}else{td0.textContent="—";}' +
      'tr.appendChild(td0);' +
      'var tdDrop=document.createElement("td");tdDrop.className="drop-cell";' +
      'if(r.matchedName){var sp0=document.createElement("span");sp0.className="chip chip-matched";sp0.textContent=r.matchedName;tdDrop.appendChild(sp0);}' +
      'else{var pl0=document.createElement("span");pl0.className="chip-placeholder";pl0.textContent="Thả chip vào đây";tdDrop.appendChild(pl0);}' +
      'tdDrop.style.background=r.matchedSheetRow?"#f1f8e9":"#fafafa";' +
      'tdDrop.title="Kéo chip thả vào dòng; double-click ô để trả chip";' +
      'tdDrop.ondblclick=function(){var p=RD[rowIdx].matchedSheetRow;if(p)freeSheetRow(p);RD[rowIdx].matchedName="";RD[rowIdx].matchedSheetRow=null;RD[rowIdx].score=0;refreshRow(rowIdx);renderPool();};' +
      'tr.appendChild(tdDrop);' +
      'var tdM=document.createElement("td");tdM.textContent=r.mark!=null?String(r.mark):"";tr.appendChild(tdM);' +
      'var tdR=document.createElement("td");tdR.textContent=r.recognizedName||"";tr.appendChild(tdR);' +
      'var tdS=document.createElement("td");tdS.className="td-score";if(r.score>0){tdS.textContent=String(Math.round(r.score));tdS.className+=" "+(r.score>=75?"score-ok":"score-warn");}else{tdS.textContent="—";}' +
      'tr.appendChild(tdS);tb.appendChild(tr);' +
      '})(i);}' +
      'renderPool();' +
      'document.getElementById("bw").onclick=function(){document.getElementById("bw").disabled=true;document.getElementById("m").textContent="Đang ghi...";' +
      'google.script.run.withSuccessHandler(function(){document.getElementById("m").textContent="Đã ghi xong."})' +
      '.withFailureHandler(function(err){document.getElementById("m").textContent="Lỗi: "+(err&&err.message||err);document.getElementById("bw").disabled=false})' +
      '.writeAzotaResultFromDialog(RD,SC);};' +
      'document.getElementById("bx").onclick=function(){google.script.host.close();};' +
      '}' +
      'build();' +
      '})();' +
      '</script></body></html>';
    SpreadsheetApp.getUi().showModalDialog(HtmlService.createHtmlOutput(html).setWidth(980).setHeight(720), 'Xác minh — Điểm chấm Azota');
    _logExam('DIALOG', 'showModalDialog done');
  } catch (e) {
    _logExam('DIALOG', 'showAzotaResultDialog error: ' + e.toString());
    SpreadsheetApp.getUi().alert('Không thể mở dialog: ' + e.toString());
  }
}

/**
 * Ghi kết quả từ dialog vào sheet BaoCao. Chỉ ghi cột điểm chấm (không ghi URL ảnh).
 * results: [{ mark, matchedSheetRow, ... }]
 * sheetContext: { diemCol } (1-based)
 */
function writeAzotaResultFromDialog(results, sheetContext) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName('BaoCao');
  if (!sheet) {
    throw new Error('Không tìm thấy sheet "BaoCao".');
  }
  var diemCol = sheetContext.diemCol || 0;
  if (diemCol < 1) {
    throw new Error('Thiếu thông tin cột điểm (diemCol).');
  }
  var count = 0;
  for (var i = 0; i < results.length; i++) {
    var r = results[i];
    var row = r.matchedSheetRow;
    if (row != null && row >= 1) {
      sheet.getRange(row, diemCol).setValue(markValueForSheet(r.mark));
      count++;
    }
  }
  SpreadsheetApp.getUi().alert('Đã ghi điểm cho ' + count + ' học sinh (chỉ cột điểm chấm).');
}

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
