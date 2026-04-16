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
 * Model fallback + quota theo yêu cầu vận hành:
 * - Gemini 2.5 Flash: RPM 5, RPD 20
 * - Gemma 4 31B: RPM 15, RPD 1500
 * Áp dụng cho toàn bộ 3 API key (luân phiên key như logic hiện tại).
 */
var GEMINI_MODEL_FALLBACKS = [
  { id: 'gemini-2.5-flash', rpm: 5, rpd: 20 },
  { id: 'gemma-4-31b-it', rpm: 15, rpd: 1500 }
];
var GEMINI_RPM_WINDOW_MS = 60000;
var _geminiLastCallMsByModel = {};
/** Số ảnh gửi trong 1 request batch Gemini (giảm số lần gọi API). */
var GEMINI_BATCH_SIZE = 6;

function _sanitizeModelIdForKey(modelId) {
  return String(modelId || '').replace(/[^a-zA-Z0-9_.-]/g, '_');
}

function _getGeminiModelQuota(modelId) {
  for (var i = 0; i < GEMINI_MODEL_FALLBACKS.length; i++) {
    if (GEMINI_MODEL_FALLBACKS[i].id === modelId) return GEMINI_MODEL_FALLBACKS[i];
  }
  return { id: modelId || 'unknown', rpm: 15, rpd: 1500 };
}

function _getGeminiDateKey() {
  return Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyyMMdd');
}

function _checkAndConsumeGeminiRpd(modelId, keyLabel) {
  var quota = _getGeminiModelQuota(modelId);
  if (!quota.rpd || quota.rpd <= 0) return true;
  var props = PropertiesService.getScriptProperties();
  var safeModel = _sanitizeModelIdForKey(modelId);
  var safeKey = _sanitizeModelIdForKey(keyLabel || 'key1');
  var dateKey = _getGeminiDateKey();
  var usageKey = 'GEMINI_DAILY_USAGE_' + safeModel + '_' + safeKey + '_' + dateKey;
  var current = Number(props.getProperty(usageKey) || '0');
  if (current >= quota.rpd) {
    _logExam('GEMINI_RPD', 'skip model=' + modelId + ' ' + safeKey + ' usage=' + current + '/' + quota.rpd);
    return false;
  }
  props.setProperty(usageKey, String(current + 1));
  return true;
}

function _buildGeminiGenerateUrl(modelId) {
  return 'https://generativelanguage.googleapis.com/v1beta/models/' + modelId + ':generateContent';
}

/** Giữ tối đa RPM theo model (khoảng cách tối thiểu giữa hai lần gọi). */
function _throttleGeminiBeforeCall(modelId) {
  var quota = _getGeminiModelQuota(modelId || GEMINI_MODEL_FALLBACKS[0].id);
  var rpm = Number(quota.rpm) > 0 ? Number(quota.rpm) : 15;
  var minIntervalMs = Math.ceil(GEMINI_RPM_WINDOW_MS / rpm);
  var bucket = modelId || 'default';
  var now = Date.now();
  var lastMs = Number(_geminiLastCallMsByModel[bucket] || 0);
  var elapsed = now - lastMs;
  if (lastMs > 0 && elapsed < minIntervalMs) {
    var wait = minIntervalMs - elapsed;
    _logExam('GEMINI', 'RPM model=' + bucket + ' ' + rpm + '/min: cho ' + wait + 'ms');
    Utilities.sleep(wait);
  }
  _geminiLastCallMsByModel[bucket] = Date.now();
}

/**
 * Hàm helper: Cập nhật Gemini API Key trong Script Properties.
 * Chạy hàm này từ menu hoặc gọi trực tiếp để cập nhật key.
 */
function updateGeminiApiKey() {
  var ui = SpreadsheetApp.getUi();
  var props = PropertiesService.getScriptProperties();
  var currentKeys = getGeminiApiKeys();
  var promptText = 'Nhập Gemini API Key mới (tối đa 3 key), ngăn cách bằng dấu phẩy ",".\n';
  promptText += 'Ví dụ: key1,key2,key3\n';
  promptText += 'Lấy từ: https://aistudio.google.com/app/apikey\n\n';
  if (currentKeys.length > 0) {
    var lens = [];
    for (var i = 0; i < currentKeys.length; i++) lens.push(currentKeys[i].length);
    promptText += 'Đang có ' + currentKeys.length + ' key (độ dài): ' + lens.join(', ') + '\n';
  } else {
    promptText += 'Chưa có key trong Properties.\n';
  }
  promptText += '\nĐể trống và OK = xóa toàn bộ key hiện tại.';
  
  var result = ui.prompt('Cập nhật Gemini API Key', promptText, ui.ButtonSet.OK_CANCEL);
  if (result.getSelectedButton() !== ui.Button.OK) {
    ui.alert('Đã hủy.');
    return;
  }
  
  var rawInput = (result.getResponseText() || '').trim();
  try {
    if (rawInput) {
      var parsedKeys = rawInput
        .split(',')
        .map(function(s) { return String(s || '').trim(); })
        .filter(function(s) { return !!s; });
      var uniq = [];
      var seen = {};
      for (var j = 0; j < parsedKeys.length; j++) {
        if (!seen[parsedKeys[j]]) {
          seen[parsedKeys[j]] = true;
          uniq.push(parsedKeys[j]);
        }
      }
      if (uniq.length > 3) uniq = uniq.slice(0, 3);
      if (uniq.length === 0) {
        throw new Error('Không tìm thấy key hợp lệ. Vui lòng nhập key và ngăn cách bằng dấu phẩy.');
      }

      props.setProperty('GEMINI_API_KEY', uniq[0]);
      if (uniq[1]) props.setProperty('GEMINI_API_KEY_2', uniq[1]); else props.deleteProperty('GEMINI_API_KEY_2');
      if (uniq[2]) props.setProperty('GEMINI_API_KEY_3', uniq[2]); else props.deleteProperty('GEMINI_API_KEY_3');
      props.deleteProperty('GEMINI_API_KEYS');

      ui.alert(
        '✅ Đã lưu ' + uniq.length + ' Gemini API key.\n' +
        'Độ dài: ' + uniq.map(function(k) { return k.length; }).join(', ') + '\n\n' +
        'Lưu ý: Nếu vẫn không thấy thay đổi, thử:\n1. Đóng và mở lại Apps Script editor\n2. Hoặc chạy lại tính năng "Kéo điểm chấm Azota"'
      );
      Logger.log('Gemini API keys updated: count=' + uniq.length);
    } else {
      props.deleteProperty('GEMINI_API_KEY');
      props.deleteProperty('GEMINI_API_KEY_2');
      props.deleteProperty('GEMINI_API_KEY_3');
      props.deleteProperty('GEMINI_API_KEYS');
      ui.alert('✅ Đã xóa toàn bộ Gemini API key khỏi Properties.');
      Logger.log('Gemini API keys deleted');
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

    // Step 1: cho user chọn ảnh trước khi OCR/khớp để giảm thời gian chạy.
    var sortedItems = sortExamItemsByTime(items);
    var preselectRows = buildAzotaPreselectRows(sortedItems);
    showAzotaImagePreselectDialog({
      examId: examId,
      bearerToken: token,
      cookie: cookie || '',
      useDialog: !!useDialog,
      sheetName: 'BaoCao',
      firstRow: activeRange.getRow(),
      lastRow: activeRange.getLastRow(),
      rows: preselectRows,
    });
    return;

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
    _logExam('OCR', 'Gemini tuan tu theo model fallback, jobs=' + geminiJobs.length);
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

function sortExamItemsByTime(items) {
  var arr = (items || []).map(function(it, idx) {
    return { item: it, idx: idx, ts: extractItemTimeMs(it) };
  });
  arr.sort(function(a, b) {
    var ta = a.ts == null ? Number.POSITIVE_INFINITY : a.ts;
    var tb = b.ts == null ? Number.POSITIVE_INFINITY : b.ts;
    if (ta < tb) return -1;
    if (ta > tb) return 1;
    return a.idx - b.idx;
  });
  return arr.map(function(x) { return x.item; });
}

function extractItemTimeMs(item) {
  if (!item || typeof item !== 'object') return null;
  var keys = ['createdAt', 'submittedAt', 'submitTime', 'created_at'];
  for (var i = 0; i < keys.length; i++) {
    var v = item[keys[i]];
    if (!v) continue;
    var ms = null;
    if (typeof v === 'number') ms = v > 1e12 ? v : v * 1000;
    else {
      var parsed = Date.parse(String(v));
      if (!isNaN(parsed)) ms = parsed;
      else if (/^\d+$/.test(String(v))) {
        var n = Number(v);
        ms = n > 1e12 ? n : n * 1000;
      }
    }
    if (ms != null && !isNaN(ms)) return ms;
  }
  return null;
}

function buildAzotaPreselectRows(sortedItems) {
  var rows = [];
  for (var i = 0; i < (sortedItems || []).length; i++) {
    var it = sortedItems[i] || {};
    var tms = extractItemTimeMs(it);
    rows.push({
      index: i,
      mark: getMarkFromItem(it),
      thumbUrl: getNameImageUrlFromItem(it) || '',
      displayTime: tms != null ? Utilities.formatDate(new Date(tms), Session.getScriptTimeZone(), 'dd/MM HH:mm:ss') : '—',
    });
  }
  return rows;
}

function _encodePayload(obj) {
  return Utilities.base64EncodeWebSafe(Utilities.newBlob(JSON.stringify(obj), 'application/json').getBytes());
}

function _decodePayload(s) {
  var txt = Utilities.newBlob(Utilities.base64DecodeWebSafe(String(s || ''))).getDataAsString();
  return JSON.parse(txt || '{}');
}

function showAzotaImagePreselectDialog(payload) {
  var htmlTpl = HtmlService.createTemplateFromFile('azota/AzotaImagePreselectDialog');
  htmlTpl.payloadB64 = _encodePayload({
    examId: payload.examId,
    bearerToken: payload.bearerToken,
    cookie: payload.cookie || '',
    useDialog: !!payload.useDialog,
    sheetName: payload.sheetName || 'BaoCao',
    firstRow: payload.firstRow,
    lastRow: payload.lastRow,
  });
  htmlTpl.rowsJson = JSON.stringify(payload.rows || []);
  SpreadsheetApp.getUi().showModalDialog(
    htmlTpl.evaluate().setWidth(980).setHeight(720),
    'Chọn bài để khớp điểm'
  );
}

function continueAzotaWithSelection(payloadB64, selectedIndices) {
  var payload = _decodePayload(payloadB64);
  var examId = String(payload.examId || '').trim();
  var token = normalizeBearerToken(String(payload.bearerToken || ''));
  var cookie = String(payload.cookie || '').trim();
  var useDialog = !!payload.useDialog;
  var sheetName = String(payload.sheetName || 'BaoCao');
  var firstRow = Number(payload.firstRow || 1);
  var lastRow = Number(payload.lastRow || firstRow);

  if (!examId || !token) throw new Error('Thiếu examId/token để tiếp tục xử lý.');
  var picked = Array.isArray(selectedIndices) ? selectedIndices : [];
  var pickedSet = {};
  var pickedNorm = [];
  for (var i = 0; i < picked.length; i++) {
    var n = Number(picked[i]);
    if (!isNaN(n) && n >= 0 && !pickedSet[n]) {
      pickedSet[n] = true;
      pickedNorm.push(n);
    }
  }
  if (!pickedNorm.length) throw new Error('Bạn chưa chọn ảnh nào để xử lý.');

  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var baoCaoSheet = ss.getSheetByName(sheetName);
  if (!baoCaoSheet) throw new Error('Không tìm thấy sheet "' + sheetName + '".');

  var apiResponse = fetchExamResult(examId, token, cookie);
  if (!apiResponse || !apiResponse.items || !apiResponse.items.length) {
    throw new Error('Không có dữ liệu items từ exam-result.');
  }
  var sortedItems = sortExamItemsByTime(apiResponse.items);
  var selectedItems = [];
  for (var p = 0; p < pickedNorm.length; p++) {
    var idx = pickedNorm[p];
    if (idx >= 0 && idx < sortedItems.length) selectedItems.push(sortedItems[idx]);
  }
  if (!selectedItems.length) throw new Error('Danh sách ảnh đã chọn không hợp lệ.');

  processAzotaItemsForMatching({
    ss: ss,
    baoCaoSheet: baoCaoSheet,
    examId: examId,
    firstRow: firstRow,
    lastRow: lastRow,
    items: selectedItems,
    token: token,
    cookie: cookie,
    useDialog: useDialog,
  });
}

function getGeminiApiKeys() {
  var props = PropertiesService.getScriptProperties();
  var keys = [];
  var direct = (props.getProperty('GEMINI_API_KEYS') || '').trim();
  if (direct) {
    var parts = direct.split(',');
    for (var i = 0; i < parts.length; i++) {
      var k = (parts[i] || '').trim();
      if (k) keys.push(k);
    }
  }
  var k1 = (props.getProperty('GEMINI_API_KEY') || '').trim();
  var k2 = (props.getProperty('GEMINI_API_KEY_2') || '').trim();
  var k3 = (props.getProperty('GEMINI_API_KEY_3') || '').trim();
  if (k1) keys.unshift(k1);
  if (k2) keys.push(k2);
  if (k3) keys.push(k3);
  var uniq = [];
  var seen = {};
  for (var j = 0; j < keys.length; j++) {
    if (!seen[keys[j]]) {
      seen[keys[j]] = true;
      uniq.push(keys[j]);
    }
  }
  return uniq.slice(0, 3);
}

function _parseRetryDelayMsFrom429Body(body) {
  try {
    var json = JSON.parse(body || '{}');
    var err = json.error || {};
    if (Number(err.code) !== 429 || String(err.status || '') !== 'RESOURCE_EXHAUSTED') return 0;
    var details = Array.isArray(err.details) ? err.details : [];
    for (var i = 0; i < details.length; i++) {
      var d = details[i] || {};
      if (String(d['@type'] || '') === 'type.googleapis.com/google.rpc.RetryInfo') {
        var delay = d.retry_delay || d.retryDelay;
        if (typeof delay === 'string') {
          var m = delay.match(/^(\d+)(ms|s|m)?$/i);
          if (m) {
            var n = Number(m[1]);
            var u = (m[2] || 's').toLowerCase();
            if (u === 'ms') return n;
            if (u === 'm') return n * 60000;
            return n * 1000;
          }
        } else if (delay && typeof delay === 'object') {
          var sec = Number(delay.seconds || 0);
          var nanos = Number(delay.nanos || 0);
          return sec * 1000 + Math.floor(nanos / 1000000);
        }
      }
    }
  } catch (e) {}
  return 0;
}

/**
 * Parse JSON text an toàn từ output Gemini.
 * Hỗ trợ: raw JSON, markdown code fence, hoặc text lẫn JSON.
 */
function _parseJsonFromGeminiText(text) {
  var s = String(text || '').trim();
  if (!s) return null;
  try {
    return JSON.parse(s);
  } catch (e1) {}

  var fence = s.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (fence && fence[1]) {
    try {
      return JSON.parse(fence[1].trim());
    } catch (e2) {}
  }

  var firstArr = s.indexOf('[');
  var lastArr = s.lastIndexOf(']');
  if (firstArr >= 0 && lastArr > firstArr) {
    try {
      return JSON.parse(s.substring(firstArr, lastArr + 1));
    } catch (e3) {}
  }
  var firstObj = s.indexOf('{');
  var lastObj = s.lastIndexOf('}');
  if (firstObj >= 0 && lastObj > firstObj) {
    try {
      return JSON.parse(s.substring(firstObj, lastObj + 1));
    } catch (e4) {}
  }
  return null;
}

function _callGeminiWithFallback(payload, apiKey, keyLabel) {
  var last = { response: null, modelId: '', responseCode: 0, responseBody: '' };
  for (var i = 0; i < GEMINI_MODEL_FALLBACKS.length; i++) {
    var cfg = GEMINI_MODEL_FALLBACKS[i];
    if (!_checkAndConsumeGeminiRpd(cfg.id, keyLabel)) continue;
    _throttleGeminiBeforeCall(cfg.id);
    var url = _buildGeminiGenerateUrl(cfg.id);
    var response = UrlFetchApp.fetch(url, {
      method: 'post',
      contentType: 'application/json',
      headers: { 'X-goog-api-key': apiKey },
      payload: JSON.stringify(payload),
      muteHttpExceptions: true,
    });
    var code = response.getResponseCode();
    var body = response.getContentText() || '';
    last = { response: response, modelId: cfg.id, responseCode: code, responseBody: body };
    if (code === 200) return last;
    _logExam('GEMINI_FB', 'model=' + cfg.id + ' key=' + (keyLabel || 'key1') + ' code=' + code);
    if (code !== 429 && code !== 503) break;
  }
  return last;
}

/**
 * OCR batch: gửi nhiều ảnh + danh sách tên trong 1 request Gemini.
 * Kết quả mong đợi: [{ idx: <index-trong-batch>, name: "<ten>" }, ...]
 */
function recognizeHandwrittenNamesBatch(jobs, studentNames, apiKey, keyLabel) {
  if (!jobs || !jobs.length || !apiKey) return [];
  var names = Array.isArray(studentNames) ? studentNames.filter(function(n) { return !!String(n || '').trim(); }) : [];
  var prompt =
    'Bạn là bộ nhận diện tên học sinh từ ảnh chữ viết tay.\n' +
    'Danh sách tên hợp lệ để chọn:\n' +
    names.map(function(n, i) { return (i + 1) + '. ' + String(n); }).join('\n') + '\n\n' +
    'Nhiệm vụ:\n' +
    '- Tôi gửi nhiều ảnh, mỗi ảnh có nhãn "IMAGE_<idx>".\n' +
    '- Với mỗi ảnh, chọn đúng 1 tên gần nhất trong danh sách hợp lệ ở trên.\n' +
    '- Nếu không đọc được thì để name là chuỗi rỗng.\n' +
    '- Trả về DUY NHẤT JSON array, không markdown, không giải thích.\n' +
    '- Định dạng chính xác: [{"idx":0,"name":"..."},{"idx":1,"name":"..."}]\n';

  var parts = [{ text: prompt }];
  for (var i = 0; i < jobs.length; i++) {
    var j = jobs[i];
    parts.push({ text: 'IMAGE_' + i });
    parts.push({ inline_data: { mime_type: j.mime || 'image/jpeg', data: j.base64 } });
  }

  var payload = { contents: [{ parts: parts }] };
  var call = _callGeminiWithFallback(payload, apiKey, keyLabel || 'key1');
  var response = call.response;
  if (!response) {
    var noRespErr = new Error('Gemini batch no response');
    noRespErr.responseCode = 503;
    noRespErr.responseBody = '';
    throw noRespErr;
  }
  var code = response.getResponseCode();
  var body = response.getContentText() || '';
  if (code !== 200) {
    var err = new Error('Gemini batch non-200: ' + code + ' model=' + (call.modelId || 'unknown'));
    err.responseCode = code;
    err.responseBody = body;
    throw err;
  }

  var txt = _parseGeminiFetchResponse(response);
  var parsed = _parseJsonFromGeminiText(txt);
  if (!Array.isArray(parsed)) return [];
  return parsed;
}

/**
 * Batch OCR ưu tiên: gọi Gemini theo lô nhiều ảnh + danh sách tên.
 * Nếu batch lỗi/parse lỗi thì fallback về từng ảnh để đảm bảo không gián đoạn.
 */
function processGeminiJobsBatch(geminiJobs, keys, geminiUrl, recognized, ss, studentNames) {
  var keyCount = Math.min(3, keys.length);
  var done = 0;
  var total = geminiJobs.length;
  var keyCursor = 0;

  for (var start = 0; start < geminiJobs.length; start += GEMINI_BATCH_SIZE) {
    var chunk = geminiJobs.slice(start, Math.min(start + GEMINI_BATCH_SIZE, geminiJobs.length));
    var success = false;
    var lastErr = null;

    for (var attempt = 0; attempt < keyCount; attempt++) {
      var kIdx = (keyCursor + attempt) % keyCount;
      var key = keys[kIdx];
      try {
        var out = recognizeHandwrittenNamesBatch(chunk, studentNames, key, 'key' + (kIdx + 1));
        var mapped = {};
        for (var i = 0; i < out.length; i++) {
          var row = out[i] || {};
          var localIdx = Number(row.idx);
          if (!isNaN(localIdx) && localIdx >= 0 && localIdx < chunk.length) {
            mapped[localIdx] = String(row.name || '').trim();
          }
        }
        for (var c = 0; c < chunk.length; c++) {
          var job = chunk[c];
          var name = mapped.hasOwnProperty(c) ? mapped[c] : '';
          recognized[job.idx].recognizedName = name;
          done++;
        }
        success = true;
        keyCursor = (kIdx + 1) % keyCount;
        _logExam('OCR_BATCH', 'chunk=' + (Math.floor(start / GEMINI_BATCH_SIZE) + 1) + ' size=' + chunk.length + ' done=' + done + '/' + total + ' key#' + (kIdx + 1));
        if (ss) ss.toast('OCR batch ' + done + '/' + total, 'Gemini batch', 2);
        break;
      } catch (e) {
        lastErr = e;
        var code = Number(e && e.responseCode);
        if (code === 429) {
          var waitMs = _parseRetryDelayMsFrom429Body((e && e.responseBody) || '') || 60000;
          _logExam('OCR_BATCH_429', 'key#' + (kIdx + 1) + ' wait=' + waitMs + 'ms');
          Utilities.sleep(waitMs);
          continue;
        }
        _logExam('OCR_BATCH_ERR', 'key#' + (kIdx + 1) + ' err=' + (e && e.message ? e.message : e));
      }
    }

    if (!success) {
      _logExam('OCR_BATCH', 'fallback single-image for chunk size=' + chunk.length + ' err=' + (lastErr && lastErr.message ? lastErr.message : 'unknown'));
      for (var s = 0; s < chunk.length; s++) {
        var j = chunk[s];
        var singleName = '';
        for (var t = 0; t < keyCount; t++) {
          var singleKey = keys[(keyCursor + t) % keyCount];
          singleName = recognizeHandwrittenName(j.base64, j.mime || 'image/jpeg', singleKey, 'key' + ((keyCursor + t) % keyCount + 1));
          if (singleName || AZOTA_GEMINI_KEY_FATAL) break;
        }
        recognized[j.idx].recognizedName = String(singleName || '').trim();
        done++;
      }
      if (ss) ss.toast('OCR fallback ' + done + '/' + total, 'Gemini', 2);
    }
  }
}

function processGeminiJobsParallel(geminiJobs, keys, geminiUrl, recognized, ss) {
  var keyCount = Math.min(3, keys.length);
  var queues = [[], [], []];
  for (var i = 0; i < geminiJobs.length; i++) {
    queues[i % keyCount].push(geminiJobs[i]);
  }
  var nextAvailableAt = [0, 0, 0];
  var successCount = [0, 0, 0];
  var errorCount = [0, 0, 0];
  var completedIndices = [];
  var total = geminiJobs.length;
  var done = 0;
  while (done < total) {
    var now = Date.now();
    var reqs = [];
    var reqMeta = [];
    for (var k = 0; k < keyCount; k++) {
      if (queues[k].length === 0) continue;
      if (now < nextAvailableAt[k]) continue;
      var job = queues[k][0];
      reqs.push({
        url: geminiUrl,
        method: 'post',
        contentType: 'application/json',
        headers: { 'X-goog-api-key': keys[k] },
        payload: JSON.stringify({
          contents: [{
            parts: [
              { text: GEMINI_NAME_PROMPT },
              { inline_data: { mime_type: job.mime || 'image/jpeg', data: job.base64 } }
            ]
          }]
        }),
        muteHttpExceptions: true,
      });
      reqMeta.push({ keyIdx: k, job: job });
    }

    if (!reqs.length) {
      var minTs = 0;
      for (var kk = 0; kk < keyCount; kk++) {
        if (queues[kk].length === 0) continue;
        if (minTs === 0 || nextAvailableAt[kk] < minTs) minTs = nextAvailableAt[kk];
      }
      if (minTs > now) Utilities.sleep(Math.max(200, minTs - now));
      else Utilities.sleep(200);
      continue;
    }

    var responses = UrlFetchApp.fetchAll(reqs);
    for (var r = 0; r < responses.length; r++) {
      var meta = reqMeta[r];
      var keyIdx = meta.keyIdx;
      var jobMeta = meta.job;
      var resp = responses[r];
      var code = resp.getResponseCode();
      var body = resp.getContentText() || '';
      if (code === 200) {
        var text = _parseGeminiFetchResponse(resp);
        recognized[jobMeta.idx].recognizedName = text;
        queues[keyIdx].shift();
        successCount[keyIdx]++;
        done++;
        completedIndices.push(jobMeta.idx);
      } else if (code === 429) {
        var retryMs = _parseRetryDelayMsFrom429Body(body);
        if (!retryMs || retryMs <= 0) retryMs = 60000;
        nextAvailableAt[keyIdx] = Date.now() + retryMs;
        errorCount[keyIdx]++;
        _logExam('OCR_429', 'key#' + (keyIdx + 1) + ' retryDelayMs=' + retryMs + ' idx=' + jobMeta.idx);
      } else {
        // lỗi khác: bỏ qua item để tránh kẹt pipeline.
        queues[keyIdx].shift();
        errorCount[keyIdx]++;
        done++;
        _logExam('OCR_ERR', 'key#' + (keyIdx + 1) + ' code=' + code + ' idx=' + jobMeta.idx + ' body=' + body.substring(0, 160));
      }
    }
    _logExam('OCR_PROGRESS', 'done=' + done + '/' + total + ' completed=' + completedIndices.slice(Math.max(0, completedIndices.length - 8)).join(','));
    ss.toast('OCR ' + done + '/' + total, 'Gemini x3', 2);
  }
  return {
    successCount: successCount,
    errorCount: errorCount,
    completedIndices: completedIndices,
  };
}

function processAzotaItemsForMatching(ctx) {
  var ss = ctx.ss;
  var baoCaoSheet = ctx.baoCaoSheet;
  var firstRow = ctx.firstRow;
  var lastRow = ctx.lastRow;
  var items = ctx.items || [];
  var token = ctx.token;
  var cookie = ctx.cookie;
  var useDialog = !!ctx.useDialog;

  var colMapping = getBaoCaoColumnMapping(baoCaoSheet);
  if (colMapping.hoTen < 0) throw new Error('Không tìm thấy cột Họ tên/Tên trong BaoCao.');

  var lastCol = Math.max(baoCaoSheet.getLastColumn(), colMapping.hv + 1, colMapping.diemCham + 1, colMapping.anhTen + 1, 10);
  var rangeValues = baoCaoSheet.getRange(firstRow, 1, Math.max(1, lastRow - firstRow + 1), lastCol).getValues();
  var baoCaoNames = [];
  var rowIndices = [];
  for (var i = 0; i < rangeValues.length; i++) {
    var nameVal = rangeValues[i][colMapping.hoTen];
    if (nameVal !== undefined && nameVal !== null && String(nameVal).trim() !== '') {
      baoCaoNames.push(String(nameVal).trim());
      rowIndices.push(firstRow + i);
    }
  }
  if (!baoCaoNames.length) throw new Error('Trong vùng chọn không có dữ liệu cột Họ tên.');

  var recognized = [];
  recognized.length = items.length;
  var geminiJobs = [];
  var needHttp = [];
  for (var idx = 0; idx < items.length; idx++) {
    var item = items[idx];
    var mark = getMarkFromItem(item);
    var imageUrl = getNameImageUrlFromItem(item) || '';
    var attendeeName = item.attendeeName || '';
    if (attendeeName && String(attendeeName).trim()) {
      recognized[idx] = { mark: mark, nameImageUrl: imageUrl, recognizedName: String(attendeeName).trim(), sourceItem: item };
    } else if (imageUrl) {
      recognized[idx] = { mark: mark, nameImageUrl: imageUrl, recognizedName: '', sourceItem: item };
      if (imageUrl.indexOf('data:image/') === 0 && imageUrl.indexOf(';base64,') > 0) {
        var mimeM = imageUrl.match(/data:image\/([^;]+)/);
        geminiJobs.push({ idx: idx, base64: imageUrl.substring(imageUrl.indexOf(';base64,') + 8), mime: mimeM ? 'image/' + mimeM[1] : 'image/jpeg' });
      } else {
        needHttp.push({ idx: idx, imageUrl: imageUrl });
      }
    } else {
      recognized[idx] = { mark: mark, nameImageUrl: imageUrl, recognizedName: '', sourceItem: item };
    }
  }

  if (needHttp.length > 0) {
    var httpHeaders = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Referer': 'https://azota.vn/',
      'Accept': 'image/*,*/*'
    };
    if (token) httpHeaders['Authorization'] = 'Bearer ' + token;
    if (cookie && String(cookie).trim()) httpHeaders['Cookie'] = String(cookie).trim();
    var httpReqs = [];
    for (var h = 0; h < needHttp.length; h++) httpReqs.push({ url: needHttp[h].imageUrl, method: 'get', muteHttpExceptions: true, headers: httpHeaders });
    var httpRes = UrlFetchApp.fetchAll(httpReqs);
    for (var h2 = 0; h2 < needHttp.length; h2++) {
      if (httpRes[h2].getResponseCode() === 200) {
        var blob = httpRes[h2].getBlob();
        geminiJobs.push({ idx: needHttp[h2].idx, base64: Utilities.base64Encode(blob.getBytes()), mime: blob.getContentType() || 'image/jpeg' });
      }
    }
  }

  var keys = getGeminiApiKeys();
  var geminiUrl = typeof getGeminiUrl === 'function' ? getGeminiUrl() : 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent';
  if (geminiJobs.length > 0 && keys.length > 0 && !AZOTA_GEMINI_KEY_FATAL) {
    processGeminiJobsBatch(geminiJobs, keys, geminiUrl, recognized, ss, baoCaoNames);
  }

  var diemCol = colMapping.diemCham >= 0 ? colMapping.diemCham : colMapping.hoTen + 2;
  var anhCol = colMapping.anhTen >= 0 ? colMapping.anhTen : diemCol + 1;
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
    }
    if (useDialog) {
      resultsForDialog.push({
        mark: rec.mark,
        nameImageUrl: rec.nameImageUrl || '',
        recognizedName: rec.recognizedName || '',
        matchedName: matchedName,
        matchedSheetRow: sheetRow,
        score: scoreNum,
        sourceItem: rec.sourceItem || {},
      });
    }
  }

  if (useDialog) {
    var unmatchedForDialog = [];
    for (var u = 0; u < rowIndices.length; u++) if (!usedRow[u]) unmatchedForDialog.push({ sheetRow: rowIndices[u], name: baoCaoNames[u] || '' });
    var sheetContext = { diemCol: diemCol + 1, anhCol: anhCol + 1, examId: ctx.examId, token: token, cookie: cookie };
    enrichResultsWithLargeImage(resultsForDialog, sheetContext);
    showAzotaResultDialog(resultsForDialog, unmatchedForDialog, sheetContext);
    return;
  }

  ss.toast('Xong. Khớp ' + matchedCount + '/' + items.length + ' học sinh.', 'Kết quả', 4);
  SpreadsheetApp.getUi().alert('✅ Đã ghi điểm chấm Azota.\nKhớp: ' + matchedCount + '/' + items.length + ' học sinh.');
}

/**
 * Gọi GET .../exams/{examId}/exam-result với Bearer token và (tùy chọn) Cookie.
 * Thử private-api trước; nếu bị anti-bot/HTML hoặc lỗi thì fallback sang ListResults.
 * Giả định response có dạng { data: [...] } hoặc { items: [...] } hoặc { students: [...] }.
 */
function fetchExamResult(examId, token, cookie) {
  cookie = (typeof cookie === 'string' && cookie) ? cookie.trim() : '';
  var privateApiUrl = AZOTA_EXAM_RESULT_BASE + '/' + encodeURIComponent(examId) + '/exam-result';
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

  function _looksLikeHtml(body, contentType) {
    var txt = body || '';
    var trimmed = txt.trim();
    var ct = (contentType || '').toLowerCase();
    return ct.indexOf('text/html') >= 0 || trimmed.charAt(0) === '<' || /<!doctype html>|<html[\s>]/i.test(trimmed.substring(0, 300));
  }

  _logExam('FETCH', 'Try #1 URL=' + privateApiUrl);
  var response;
  try {
    response = UrlFetchApp.fetch(privateApiUrl, options);
  } catch (fetchErr) {
    _logExam('FETCH', 'Try #1 fetch threw: ' + fetchErr.toString());
    response = null;
  }

  var rawText = '';
  var code = 0;
  var responseHeaders = {};
  var contentType = '';
  if (response) {
    code = response.getResponseCode();
    responseHeaders = response.getHeaders();
    rawText = response.getContentText() || '';
    contentType = responseHeaders['Content-Type'] || responseHeaders['content-type'] || '';
    _logExam('FETCH', 'Try #1 responseCode=' + code + ' Content-Type=' + contentType);
    _logExam('FETCH', 'Try #1 responseLength=' + rawText.length + ' firstChar=' + (rawText.trim().charAt(0) || ''));
  }

  var shouldFallbackToListResults = false;
  if (!response) {
    shouldFallbackToListResults = true;
  } else if (code !== 200) {
    _logExam('FETCH', 'Try #1 Non-200 Location=' + (responseHeaders['Location'] || responseHeaders['location'] || ''));
    shouldFallbackToListResults = true;
  } else if (!rawText) {
    _logExam('FETCH', 'Try #1 empty body');
    shouldFallbackToListResults = true;
  } else if (_looksLikeHtml(rawText, contentType)) {
    _logExam('FETCH', 'Try #1 got HTML (possible anti-bot/session), first 150: ' + rawText.substring(0, 150));
    shouldFallbackToListResults = true;
  }

  if (shouldFallbackToListResults) {
    _logExam('FETCH', 'Fallback to ListResults endpoint');
    var listFallback = fetchExamResultViaListResults(examId, token, cookie, headers);
    if (listFallback) return listFallback;
    throw new Error(
      'Không lấy được dữ liệu JSON từ private-api (khả năng bị anti-bot hoặc session hết hạn). ' +
      'Kiểm tra lại Bearer token + Cookie mới từ DevTools, rồi chạy lại. ' +
      'Private-api responseCode=' + code + ', contentType=' + contentType + '.'
    );
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
function recognizeHandwrittenName(imageBase64, mimeType, geminiApiKey, keyLabel) {
  // Use parameter first, fallback to global GEMINI_API_KEY from Config.js
  var apiKey = geminiApiKey || (typeof GEMINI_API_KEY !== 'undefined' ? GEMINI_API_KEY : '');
  if (!apiKey) {
    _logExam('GEMINI', 'Chưa có Gemini API key (không có trong Properties và không nhập trong dialog)');
    Logger.log('recognizeHandwrittenName: Chưa có Gemini API key');
    return '';
  }
  var payload = {
    contents: [{
      parts: [
        { text: GEMINI_NAME_PROMPT },
        { inline_data: { mime_type: mimeType || 'image/png', data: imageBase64 } }
      ]
    }]
  };
  var call = _callGeminiWithFallback(payload, apiKey, keyLabel || 'key1');
  var response = call.response;
  if (!response) return '';
    var geminiCode = response.getResponseCode();
    var geminiBody = response.getContentText();
    _logExam('GEMINI', 'model=' + (call.modelId || 'unknown') + ' responseCode=' + geminiCode + ' bodyLength=' + geminiBody.length);
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
  }).map(function (t) {
    // Bỏ dấu chấm/ký tự đặc biệt để "k." => "k", "q." => "q".
    return t.replace(/[^a-z0-9]/g, '');
  }).filter(function (t) {
    return t.length > 0;
  });
}

function _matchInitialAbbrevScore(rTok, fTok) {
  if (!rTok || !fTok || rTok.length < 2 || fTok.length < 2) return 0;
  var initial = rTok[0];
  if (!initial || initial.length !== 1) return 0;

  var tail = rTok.slice(1);
  if (tail.length > fTok.length) return 0;

  // Đuôi tên viết tắt phải khớp hậu tố của tên đầy đủ: "k ha anh" -> "... ha anh"
  var suffixOk = true;
  for (var i = 0; i < tail.length; i++) {
    if (tail[tail.length - 1 - i] !== fTok[fTok.length - 1 - i]) {
      suffixOk = false;
      break;
    }
  }
  if (!suffixOk) return 0;

  // Phần prefix còn lại phải có ít nhất một token bắt đầu bằng chữ viết tắt.
  var prefixLen = fTok.length - tail.length;
  if (prefixLen <= 0) return 0;
  for (var p = 0; p < prefixLen; p++) {
    if (fTok[p] && fTok[p].charAt(0) === initial) {
      // Chấm điểm cao vì đây là pattern rõ ràng: "V. Trang", "Q. Thư", "K. Hà Anh"
      return 0.93 + 0.03 * Math.min(1, tail.length / Math.max(fTok.length, 1));
    }
  }
  return 0;
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

  var abbrevScore = _matchInitialAbbrevScore(rTok, fTok);
  if (abbrevScore > 0) return abbrevScore;

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

function _extractUserIdFromItem(item) {
  if (!item || typeof item !== 'object') return null;
  var keys = ['userId', 'user_id', 'studentId', 'student_id', 'attendeeId', 'attendee_id', 'id'];
  for (var i = 0; i < keys.length; i++) {
    var v = item[keys[i]];
    if (v == null || v === '') continue;
    var n = Number(v);
    if (!isNaN(n) && n > 0) return n;
  }
  return null;
}

function _extractAztPathFromAny(obj) {
  if (obj == null) return '';
  if (typeof obj === 'string') {
    var s = obj.trim();
    if (s.indexOf('.azt') >= 0 || s.indexOf('mobile_scan/') >= 0) return s;
    return '';
  }
  if (Array.isArray(obj)) {
    for (var i = 0; i < obj.length; i++) {
      var v = _extractAztPathFromAny(obj[i]);
      if (v) return v;
    }
    return '';
  }
  if (typeof obj === 'object') {
    var keys = Object.keys(obj);
    for (var k = 0; k < keys.length; k++) {
      var found = _extractAztPathFromAny(obj[keys[k]]);
      if (found) return found;
    }
  }
  return '';
}

function _buildLargeImageUrlFromPath(path) {
  if (!path) return '';
  var s = String(path).trim();
  if (!s) return '';
  if (/^https?:\/\//i.test(s)) return s;
  if (s.charAt(0) === '/') s = s.substring(1);
  return 'https://liveazotastoragett112025.azota.vn/' + s;
}

function fetchExamResultGetDetail(examId, userId, token, cookie) {
  if (!examId || !userId) return null;
  var url = 'https://azota.vn/api/ExamResult/GetDetail?examId=' + encodeURIComponent(examId) + '&userId=' + encodeURIComponent(userId);
  var headers = {
    'Authorization': 'Bearer ' + token,
    'User-Agent': 'Mozilla/5.0',
    'Referer': 'https://azota.vn/',
    'Accept': 'application/json'
  };
  if (cookie) headers['Cookie'] = cookie;
  try {
    var resp = UrlFetchApp.fetch(url, { method: 'get', muteHttpExceptions: true, headers: headers });
    if (resp.getResponseCode() !== 200) return null;
    return JSON.parse(resp.getContentText() || '{}');
  } catch (e) {
    _logExam('DETAIL', 'GetDetail error userId=' + userId + ': ' + e.toString());
    return null;
  }
}

function enrichResultsWithLargeImage(resultsForDialog, sheetContext) {
  var examId = sheetContext && sheetContext.examId ? String(sheetContext.examId) : '';
  var token = sheetContext && sheetContext.token ? String(sheetContext.token) : '';
  var cookie = sheetContext && sheetContext.cookie ? String(sheetContext.cookie) : '';
  if (!examId || !token) return;
  for (var i = 0; i < (resultsForDialog || []).length; i++) {
    var row = resultsForDialog[i];
    var src = row && row.sourceItem ? row.sourceItem : null;
    var uid = _extractUserIdFromItem(src);
    var detail = uid ? fetchExamResultGetDetail(examId, uid, token, cookie) : null;
    var path = _extractAztPathFromAny(detail);
    row.nameImageUrlLarge = _buildLargeImageUrlFromPath(path) || row.nameImageUrl || '';
  }
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
      '<div class="hint"><b>Cách dùng:</b> Kéo chip từ <b>Chưa gán</b> thả vào ô <b>Tên trong lớp</b>. Kéo chip từ ô này sang ô khác (chip bị đè sẽ chuyển về ô trống hoặc về Chưa gán). Kéo chip từ ô thả vào vùng Chưa gán hoặc double-click ô để trả chip. <b>Ghi vào sheet</b> chỉ ghi điểm chấm.</div>' +
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
      'function markPoolFree(sr){for(var u=0;u<UD.length;u++)if(UD[u].sheetRow===sr)UD[u].used=false;}' +
      'function firstEmptyRow(exclude){var ex=exclude||{};for(var i=0;i<RD.length;i++)if(!RD[i].matchedSheetRow&&!ex[i])return i;return -1;}' +
      'function addToPool(sheetRow,name){var found=false;for(var u=0;u<UD.length;u++)if(UD[u].sheetRow===sheetRow){UD[u].used=false;found=true;break;}if(!found)UD.push({sheetRow:sheetRow,name:name||"",used:false});}' +
      'function clearRow(ix){if(ix==null||ix<0||ix>=RD.length)return;RD[ix].matchedName="";RD[ix].matchedSheetRow=null;RD[ix].score=0;refreshRow(ix);}' +
      'function placeChipBack(displaced,exclude){if(!displaced||!displaced.sheetRow)return;var ex=exclude||{};var emptyIx=firstEmptyRow(ex);if(emptyIx>=0){RD[emptyIx].matchedSheetRow=displaced.sheetRow;RD[emptyIx].matchedName=displaced.name||\"\";RD[emptyIx].score=100;for(var u=0;u<UD.length;u++)if(UD[u].sheetRow===displaced.sheetRow)UD[u].used=true;refreshRow(emptyIx);}else{addToPool(displaced.sheetRow,displaced.name||\"\");}}' +
      'function fillDropChip(td,txt,has,rowIdx,sheetRow){td.innerHTML="";if(txt&&has){var sp=document.createElement("span");sp.className="chip chip-matched";sp.draggable=true;sp.textContent=txt;sp.ondragstart=function(ev){ev.dataTransfer.setData("text/plain","cell|"+rowIdx+"|"+(sheetRow||"")+"|"+encodeURIComponent(txt||""));ev.dataTransfer.effectAllowed="move";};td.appendChild(sp);}else if(txt){var sp2=document.createElement("span");sp2.className="chip chip-matched";sp2.textContent=txt;td.appendChild(sp2);}else{var pl=document.createElement("span");pl.className="chip-placeholder";pl.textContent="Thả chip vào đây";td.appendChild(pl);}td.style.background=has?"#f1f8e9":"#fafafa";}' +
      'function refreshRow(i){' +
      'var tr=rowsEl[i];if(!tr)return;' +
      'var r=RD[i];' +
      'var tdDrop=tr.querySelector(".drop-cell");var tdScore=tr.querySelector(".td-score");' +
      'fillDropChip(tdDrop,r.matchedName||"",!!r.matchedSheetRow,i,r.matchedSheetRow);' +
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
      'chip.ondragstart=function(ev){var t=ev.target;ev.dataTransfer.setData("text/plain","pool|"+t.getAttribute("data-row")+"|"+encodeURIComponent(t.getAttribute("data-name")||""));ev.dataTransfer.effectAllowed="copyMove";};' +
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
      'var ix=rowIdx;var raw=(e.dataTransfer.getData("text/plain")||"");var parts=raw.split("|");' +
      'var kind=parts[0];' +
      'if(kind==="pool"){' +
      'var sr=parseInt(parts[1],10);var nm=parts.length>2?decodeURIComponent(parts[2]):"";' +
      'if(!sr||isNaN(sr))return;' +
      'var displaced=RD[ix].matchedSheetRow!=null?{sheetRow:RD[ix].matchedSheetRow,name:RD[ix].matchedName}:null;' +
      'for(var u=0;u<UD.length;u++)if(UD[u].sheetRow===sr)UD[u].used=true;' +
      'RD[ix].matchedSheetRow=sr;RD[ix].matchedName=nm;RD[ix].score=100;refreshRow(ix);renderPool();' +
      'if(displaced&&displaced.sheetRow&&displaced.sheetRow!==sr){markPoolFree(displaced.sheetRow);placeChipBack(displaced,(function(){var ex={};ex[ix]=true;return ex;})());refreshRow(ix);renderPool();}' +
      '}else if(kind==="cell"){' +
      'var fromIx=parseInt(parts[1],10);var sr=parseInt(parts[2],10);var nm=parts.length>3?decodeURIComponent(parts[3]):"";' +
      'if(fromIx===ix||isNaN(fromIx))return;' +
      'var displaced=RD[ix].matchedSheetRow!=null?{sheetRow:RD[ix].matchedSheetRow,name:RD[ix].matchedName}:null;' +
      'RD[ix].matchedSheetRow=sr;RD[ix].matchedName=nm;RD[ix].score=100;' +
      'RD[fromIx].matchedSheetRow=null;RD[fromIx].matchedName="";RD[fromIx].score=0;' +
      'for(var u=0;u<UD.length;u++)if(UD[u].sheetRow===sr)UD[u].used=true;' +
      'if(displaced){var ex={};ex[fromIx]=true;ex[ix]=true;var emptyIx=firstEmptyRow(ex);' +
      'if(emptyIx>=0){RD[emptyIx].matchedSheetRow=displaced.sheetRow;RD[emptyIx].matchedName=displaced.name;RD[emptyIx].score=100;for(var u2=0;u2<UD.length;u2++)if(UD[u2].sheetRow===displaced.sheetRow)UD[u2].used=true;refreshRow(emptyIx);}else{markPoolFree(displaced.sheetRow);addToPool(displaced.sheetRow,displaced.name);}}' +
      'refreshRow(ix);refreshRow(fromIx);renderPool();' +
      '}' +
      '};' +
      'var td0=document.createElement("td");var u=r.nameImageUrl||"";var ul=r.nameImageUrlLarge||u||"";' +
      'if(u.indexOf("data:image/")===0||u){var im=document.createElement("img");im.src=u||ul;im.style.cssText="max-height:72px;max-width:140px;object-fit:contain;border-radius:6px;border:1px solid #ccc;cursor:zoom-in;vertical-align:middle";im.title="Phóng to";im.onclick=function(){window.open(ul||this.src);};td0.appendChild(im);if(ul){var z=document.createElement("a");z.href=ul;z.target="_blank";z.textContent=" 🔍";z.title="Xem ảnh lớn";z.style.marginLeft="6px";td0.appendChild(z);}}' +
      'else if(ul){var a=document.createElement("a");a.href=ul;a.target="_blank";a.textContent="Ảnh lớn 🔍";td0.appendChild(a);}else{td0.textContent="—";}' +
      'tr.appendChild(td0);' +
      'var tdDrop=document.createElement("td");tdDrop.className="drop-cell";' +
      'if(r.matchedName){var sp0=document.createElement("span");sp0.className="chip chip-matched";sp0.textContent=r.matchedName;tdDrop.appendChild(sp0);}' +
      'else{var pl0=document.createElement("span");pl0.className="chip-placeholder";pl0.textContent="Thả chip vào đây";tdDrop.appendChild(pl0);}' +
      'tdDrop.style.background=r.matchedSheetRow?"#f1f8e9":"#fafafa";' +
      'tdDrop.title="Kéo chip thả vào dòng; double-click ô để trả chip";' +
      'tdDrop.ondblclick=function(){var p=RD[rowIdx].matchedSheetRow;var nm=RD[rowIdx].matchedName||\"\";if(p){markPoolFree(p);addToPool(p,nm);}clearRow(rowIdx);renderPool();};' +
      'tr.appendChild(tdDrop);' +
      'var tdM=document.createElement("td");tdM.textContent=r.mark!=null?String(r.mark):"";tr.appendChild(tdM);' +
      'var tdR=document.createElement("td");tdR.textContent=r.recognizedName||"";tr.appendChild(tdR);' +
      'var tdS=document.createElement("td");tdS.className="td-score";if(r.score>0){tdS.textContent=String(Math.round(r.score));tdS.className+=" "+(r.score>=75?"score-ok":"score-warn");}else{tdS.textContent="—";}' +
      'tr.appendChild(tdS);tb.appendChild(tr);' +
      '})(i);}' +
      'renderPool();' +
      'var poolEl=document.getElementById("pool");' +
      'poolEl.ondragover=function(e){e.preventDefault();e.dataTransfer.dropEffect="move";};' +
      'poolEl.ondrop=function(e){e.preventDefault();var raw=e.dataTransfer.getData("text/plain")||"";var parts=raw.split("|");if(parts[0]!=="cell")return;' +
      'var fromIx=parseInt(parts[1],10);var sr=parseInt(parts[2],10);var nm=parts.length>3?decodeURIComponent(parts[3]):"";' +
      'if(isNaN(fromIx))return;' +
      'RD[fromIx].matchedSheetRow=null;RD[fromIx].matchedName="";RD[fromIx].score=0;addToPool(sr,nm);refreshRow(fromIx);renderPool();};' +
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
