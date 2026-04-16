// ======================================================
// PHÂN TÍCH NHẬN XÉT BẰNG TAG (GEMINI-POWERED)
// ======================================================

var _TAG_LOG_PREFIX = "[TagAnalysis] ";

function _logTag(msg) {
  Logger.log(_TAG_LOG_PREFIX + msg);
}

function loadTagConfig() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName("TagConfig");
  if (!sheet) {
    _logTag("loadTagConfig: sheet 'TagConfig' not found");
    return [];
  }
  var data = sheet.getDataRange().getValues();
  if (data.length < 2) {
    _logTag("loadTagConfig: sheet empty (rows=" + data.length + ")");
    return [];
  }
  var tags = [];
  for (var i = 1; i < data.length; i++) {
    var row = data[i];
    var tag = String(row[0] || "").trim().toLowerCase();
    if (!tag) continue;
    tags.push({
      tag: tag,
      category: String(row[1] || "").trim().toLowerCase(),
      shortLabel: String(row[2] || "").trim(),
      source: String(row[3] || "").trim(),
      addedDate: row[4] || ""
    });
  }
  _logTag("loadTagConfig: loaded " + tags.length + " tags");
  return tags;
}

function seedDefaultTags() {
  _logTag("seedDefaultTags: start");
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName("TagConfig");
  if (sheet) {
    _logTag("seedDefaultTags: sheet already exists, skipping");
    return;
  }
  sheet = ss.insertSheet("TagConfig");
  var headers = ["Tag", "Category", "ShortLabel", "Source", "AddedDate"];
  var now = new Date();
  var defaults = [
    ["thiếu btvn", "btvn", "thiếu BTVN", "hardcode", now],
    ["chưa làm btvn", "btvn", "chưa làm BTVN", "hardcode", now],
    ["không làm btvn", "btvn", "không làm BTVN", "hardcode", now],
    ["chưa xong btvn", "btvn", "chưa xong BTVN", "hardcode", now],
    ["ý thức", "attitude", "ý thức chưa tốt", "hardcode", now],
    ["mất trật tự", "attitude", "mất trật tự", "hardcode", now],
    ["nhắc nhở", "attitude", "cần nhắc nhở", "hardcode", now],
    ["dùng điện thoại", "attitude", "dùng điện thoại", "hardcode", now],
    ["nói chuyện", "attitude", "nói chuyện", "hardcode", now],
    ["muộn", "attitude", "đi muộn", "hardcode", now],
    ["ngủ", "attitude", "ngủ gật", "hardcode", now],
    ["mất tập trung", "attitude", "mất tập trung", "hardcode", now],
    ["không ghi", "attitude", "không ghi bài", "hardcode", now],
    ["không chữa bài", "attitude", "không chữa bài", "hardcode", now],
    ["từ vựng", "vocab", "từ vựng", "hardcode", now],
    ["chép phạt", "vocab", "chép phạt", "hardcode", now],
    ["từ mới", "vocab", "từ mới", "hardcode", now]
  ];
  var allRows = [headers].concat(defaults);
  sheet.getRange(1, 1, allRows.length, headers.length).setValues(allRows);
  sheet.getRange(1, 1, 1, headers.length).setFontWeight("bold").setBackground("#cfe2f3");
  sheet.autoResizeColumns(1, headers.length);
  _logTag("seedDefaultTags: created with " + defaults.length + " default tags");
}

function findUncoveredComments(uniqueComments, tags) {
  var uncovered = [];
  for (var i = 0; i < uniqueComments.length; i++) {
    var c = uniqueComments[i];
    if (!c || String(c).trim() === "" || String(c).toLowerCase() === "đủ") continue;
    var lower = String(c).toLowerCase();
    var matched = false;
    for (var t = 0; t < tags.length; t++) {
      if (lower.indexOf(tags[t].tag) >= 0) {
        matched = true;
        break;
      }
    }
    if (!matched) uncovered.push(c);
  }
  _logTag("findUncoveredComments: " + uniqueComments.length + " unique, " + uncovered.length + " uncovered");
  return uncovered;
}

function callGeminiForTagAnalysis(uncoveredComments, existingTags) {
  _logTag("callGeminiForTagAnalysis: start, " + (uncoveredComments ? uncoveredComments.length : 0) + " comments");
  if (!uncoveredComments || uncoveredComments.length === 0) return [];

  var keys = getGeminiApiKeys();
  if (!keys || keys.length === 0) {
    _logTag("callGeminiForTagAnalysis: No Gemini API keys available");
    return [];
  }
  _logTag("callGeminiForTagAnalysis: " + keys.length + " API key(s) available");

  var tagList = existingTags.map(function(t) { return t.tag; }).join(", ");

  var commentList = "";
  for (var i = 0; i < uncoveredComments.length; i++) {
    commentList += (i + 1) + '. "' + uncoveredComments[i] + '"\n';
  }

  var prompt =
    'Bạn là trợ lý giáo vụ tiếng Anh. Dưới đây là danh sách các nhận xét unique từ giáo viên về học sinh.\n\n' +
    'NHIỆM VỤ:\n' +
    '1. KIỂM TRA LỖI CHÍNH TẢ: Với mỗi nhận xét, nếu có lỗi chính tả tiếng Việt thì gợi ý sửa.\n' +
    '2. PHÂN LOẠI: Với mỗi nhận xét, phân loại vào 1 trong các nhóm:\n' +
    '   - "btvn": liên quan đến bài tập về nhà\n' +
    '   - "attitude": liên quan đến ý thức, thái độ học tập\n' +
    '   - "vocab": liên quan đến từ vựng, chép phạt\n' +
    '   - "positive": nhận xét tích cực\n' +
    '   - "neutral": nhận xét trung tính (VD: "Đủ", "OK")\n' +
    '   - "unknown": không rõ\n' +
    '3. GỢI Ý TAG MỚI: Nếu nhận xét chứa keyword mới chưa có trong danh sách tag hiện tại, gợi ý keyword ngắn (2-4 từ) để thêm vào hệ thống.\n\n' +
    'DANH SÁCH TAG HIỆN TẠI:\n' + tagList + '\n\n' +
    'DANH SÁCH NHẬN XÉT:\n' + commentList + '\n' +
    'TRẢ VỀ ĐÚNG JSON (không markdown, không giải thích):\n' +
    '[{"original":"...","spellFix":"..." hoặc null,"category":"btvn|attitude|vocab|positive|neutral|unknown","suggestedTag":"..." hoặc null,"shortLabel":"..." hoặc null}]';

  var geminiUrl = typeof getGeminiUrl === 'function'
    ? getGeminiUrl()
    : 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent';

  var payload = {
    contents: [{ parts: [{ text: prompt }] }]
  };

  for (var k = 0; k < keys.length; k++) {
    try {
      _logTag("callGeminiForTagAnalysis: trying key #" + (k + 1) + ", url=" + geminiUrl);
      _throttleGeminiBeforeCall();
      var response = UrlFetchApp.fetch(geminiUrl, {
        method: 'post',
        contentType: 'application/json',
        headers: { 'X-goog-api-key': keys[k] },
        payload: JSON.stringify(payload),
        muteHttpExceptions: true
      });

      var code = response.getResponseCode();
      _logTag("callGeminiForTagAnalysis: key #" + (k + 1) + " responseCode=" + code);
      if (code === 429) {
        _logTag("callGeminiForTagAnalysis: 429 rate limit, rotating to next key");
        continue;
      }
      if (code !== 200) {
        _logTag("callGeminiForTagAnalysis: non-200 body=" + (response.getContentText() || "").substring(0, 300));
        continue;
      }

      var body = response.getContentText();
      var result;
      try { result = JSON.parse(body); } catch (pe) {
        _logTag("callGeminiForTagAnalysis: JSON parse error: " + pe.toString());
        continue;
      }
      if (result.error) {
        _logTag("callGeminiForTagAnalysis: API error: " + JSON.stringify(result.error).substring(0, 300));
        continue;
      }
      var text = "";
      if (result.candidates && result.candidates[0] && result.candidates[0].content && result.candidates[0].content.parts) {
        text = result.candidates[0].content.parts[0].text || "";
      }
      if (!text) {
        _logTag("callGeminiForTagAnalysis: empty text from candidates");
        continue;
      }
      _logTag("callGeminiForTagAnalysis: got text (" + text.length + " chars)");

      var parsed = _parseJsonFromGeminiText(text);
      if (Array.isArray(parsed)) {
        _logTag("callGeminiForTagAnalysis: parsed " + parsed.length + " suggestions");
        return parsed;
      }

      _logTag("callGeminiForTagAnalysis: parsed result not an array, key #" + (k + 1));
    } catch (e) {
      _logTag("callGeminiForTagAnalysis: exception on key #" + (k + 1) + ": " + e.toString());
    }
  }

  _logTag("callGeminiForTagAnalysis: all keys exhausted, returning []");
  return [];
}

function writeApprovedTags(approvedItems) {
  _logTag("writeApprovedTags: start, items=" + (approvedItems ? approvedItems.length : 0));
  if (!approvedItems || approvedItems.length === 0) return 0;
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName("TagConfig");
  if (!sheet) {
    _logTag("writeApprovedTags: TagConfig not found, seeding defaults");
    seedDefaultTags();
    sheet = ss.getSheetByName("TagConfig");
  }
  var lastRow = sheet.getLastRow();
  var now = new Date();
  var rows = [];
  for (var i = 0; i < approvedItems.length; i++) {
    var item = approvedItems[i];
    var tagStr = String(item.tag || "").trim().toLowerCase();
    if (!tagStr) continue;
    rows.push([tagStr, String(item.category || "").trim().toLowerCase(), String(item.shortLabel || "").trim(), "gemini", now]);
    _logTag("writeApprovedTags: + tag='" + tagStr + "' cat=" + item.category);
  }
  if (rows.length > 0) {
    sheet.getRange(lastRow + 1, 1, rows.length, 5).setValues(rows);
    _logTag("writeApprovedTags: wrote " + rows.length + " rows at row " + (lastRow + 1));
  }
  return rows.length;
}

function analyzeCommentWithTags(text, tags) {
  var result = { btvn: false, vocab: false, attitude: false };
  if (!text || !tags || tags.length === 0) return result;
  var str = String(text).toLowerCase();
  for (var i = 0; i < tags.length; i++) {
    if (str.indexOf(tags[i].tag) >= 0) {
      var cat = tags[i].category;
      if (cat === "btvn") result.btvn = true;
      else if (cat === "attitude") result.attitude = true;
      else if (cat === "vocab") result.vocab = true;
    }
  }
  return result;
}

function analyzeCommentWithTagsPhrases(text, tags) {
  var result = { attitude: { matched: false, phrases: [] }, vocab: { matched: false, phrases: [] } };
  if (!text || typeof text !== "string" || !tags || tags.length === 0) return result;
  var str = String(text);
  var lower = str.toLowerCase();
  for (var i = 0; i < tags.length; i++) {
    var tag = tags[i];
    if (tag.category !== "attitude" && tag.category !== "vocab") continue;
    var idx = 0;
    while (true) {
      var pos = lower.indexOf(tag.tag, idx);
      if (pos === -1) break;
      var original = str.substring(pos, pos + tag.tag.length);
      if (tag.category === "attitude") {
        result.attitude.phrases.push(original);
      } else if (tag.category === "vocab") {
        result.vocab.phrases.push(original);
      }
      idx = pos + 1;
    }
  }
  result.attitude.matched = result.attitude.phrases.length > 0;
  result.vocab.matched = result.vocab.phrases.length > 0;
  return result;
}

function commentToAttitudePhraseFromTags(text, tags) {
  if (!text || !tags || tags.length === 0) return "chưa tập trung";
  var str = String(text).toLowerCase();
  for (var i = 0; i < tags.length; i++) {
    if (tags[i].category === "attitude" && str.indexOf(tags[i].tag) >= 0) {
      return tags[i].shortLabel || "chưa tập trung";
    }
  }
  return "chưa tập trung";
}

// --- Dialog support functions ---

var _TAG_SUGGESTION_CACHE_KEY = "TAG_SUGGESTIONS_PENDING";

/**
 * Lưu suggestions vào cache. KHÔNG mở dialog (dialog sẽ mở SAU khi report xong).
 */
function storeTagSuggestions(suggestions) {
  var cache = CacheService.getScriptCache();
  var json = JSON.stringify(suggestions);
  _logTag("storeTagSuggestions: stored " + suggestions.length + " suggestions (" + json.length + " bytes)");
  cache.put(_TAG_SUGGESTION_CACHE_KEY, json, 600);
}

/**
 * Mở dialog review tag. Gọi SAU KHI report hoàn tất (không gọi giữa chừng).
 */
function showTagApprovalDialog() {
  _logTag("showTagApprovalDialog: opening dialog");
  var html = HtmlService.createHtmlOutputFromFile("TagApprovalDialog")
    .setWidth(820)
    .setHeight(520);
  SpreadsheetApp.getUi().showModalDialog(html, "Gợi ý Tag mới từ Gemini");
}

function hasPendingTagSuggestions() {
  var cache = CacheService.getScriptCache();
  return !!cache.get(_TAG_SUGGESTION_CACHE_KEY);
}

function openPendingTagReview() {
  if (!hasPendingTagSuggestions()) {
    SpreadsheetApp.getUi().alert("Không có gợi ý tag nào đang chờ duyệt.");
    return;
  }
  showTagApprovalDialog();
}

function getTagSuggestionData() {
  _logTag("getTagSuggestionData: called from dialog");
  var cache = CacheService.getScriptCache();
  var data = cache.get(_TAG_SUGGESTION_CACHE_KEY);
  if (!data) {
    _logTag("getTagSuggestionData: cache empty");
    return [];
  }
  try {
    var parsed = JSON.parse(data);
    _logTag("getTagSuggestionData: returning " + parsed.length + " items");
    return parsed;
  } catch (e) {
    _logTag("getTagSuggestionData: parse error: " + e.toString());
    return [];
  }
}

function applyApprovedTags(items) {
  _logTag("applyApprovedTags: called with " + (items ? items.length : 0) + " items");
  try {
    var count = writeApprovedTags(items);
    var cache = CacheService.getScriptCache();
    cache.remove(_TAG_SUGGESTION_CACHE_KEY);
    _logTag("applyApprovedTags: done, wrote " + count + " tags, cache cleared");
    return count;
  } catch (e) {
    _logTag("applyApprovedTags: ERROR: " + e.toString());
    throw e;
  }
}
