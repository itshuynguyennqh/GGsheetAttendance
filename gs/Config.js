// ======================================================
// CẤU HÌNH AI TRỢ LÝ VÀ CONSTANTS
// ======================================================
// API Key và Sheet ID được đọc từ Script Properties (không lưu trong code).
// Cách cấu hình: Apps Script → Project Settings (⚙️) → Script properties
//   Thêm: GEMINI_API_KEY = <key lấy từ https://aistudio.google.com/app/apikey>
//   Thêm: EXTERNAL_BTVN_SHEET_ID = <ID file Google Sheet báo cáo BTVN Azota>

function _getScriptProp(name) {
  try {
    return PropertiesService.getScriptProperties().getProperty(name) || "";
  } catch (e) {
    return "";
  }
}

var GEMINI_API_KEY = _getScriptProp("GEMINI_API_KEY");
var GEMINI_MODEL = "gemini-2.0-flash";
var EXTERNAL_BTVN_SHEET_ID = _getScriptProp("EXTERNAL_BTVN_SHEET_ID");

/**
 * Tạo URL API Gemini (v1beta)
 */
function getGeminiUrl() {
  return "https://generativelanguage.googleapis.com/v1beta/models/" + GEMINI_MODEL + ":generateContent";
}

/**
 * List các models available (để debug)
 */
function listAvailableGeminiModels() {
  Logger.log("=== LIST AVAILABLE MODELS ===");
  var versions = ["v1", "v1beta"];
  var allModels = [];
  for (var v = 0; v < versions.length; v++) {
    var version = versions[v];
    var listUrl = "https://generativelanguage.googleapis.com/v1/models?key=" + GEMINI_API_KEY;
    try {
      Logger.log("Checking " + version + "...");
      var response = UrlFetchApp.fetch(listUrl);
      var result = JSON.parse(response.getContentText());
      if (result.models) {
        Logger.log("Found " + result.models.length + " models in " + version);
        result.models.forEach(function(model) {
          var modelName = model.name.replace("models/", "");
          var supportedMethods = model.supportedGenerationMethods || [];
          if (supportedMethods.indexOf("generateContent") >= 0) {
            Logger.log("  ✅ " + modelName + " (supports generateContent)");
            allModels.push({name: modelName, version: version, methods: supportedMethods});
          } else {
            Logger.log("  ⚠️ " + modelName + " (no generateContent)");
          }
        });
      }
    } catch (e) {
      Logger.log("❌ Error checking " + version + ": " + e.toString());
    }
  }
  Logger.log("=== END LIST ===");
  return allModels;
}
