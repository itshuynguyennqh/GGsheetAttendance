// ======================================================
// CẤU HÌNH AI TRỢ LÝ VÀ CONSTANTS
// ======================================================
// API Key và Sheet ID được đọc từ Script Properties (không lưu trong code).
// Cách cấu hình: Apps Script → Project Settings (⚙️) → Script properties
//   Thêm: GEMINI_API_KEY = <key lấy từ https://aistudio.google.com/app/apikey>
//   Thêm: GEMINI_MODEL = <tên model, ví dụ gemini-2.0-flash> (tùy chọn; mặc định gemini-2.0-flash)
//   Thêm: EXTERNAL_BTVN_SHEET_ID = <ID file Google Sheet báo cáo BTVN Azota>

function _getScriptProp(name) {
  try {
    return PropertiesService.getScriptProperties().getProperty(name) || "";
  } catch (e) {
    return "";
  }
}

var GEMINI_API_KEY = _getScriptProp("GEMINI_API_KEY");
var GEMINI_MODEL = (_getScriptProp("GEMINI_MODEL") || "gemini-2.0-flash").replace(/^models\//, "").trim();
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

/** Gợi ý model (id API, không có tiền tố models/) */
var GEMINI_MODEL_PRESETS = [
  { id: "gemini-2.0-flash", label: "Gemini 2.0 Flash (mặc định, nhanh)" },
  { id: "gemini-2.5-flash", label: "Gemini 2.5 Flash" },
  { id: "gemini-2.5-flash-preview", label: "Gemini 2.5 Flash (preview)" },
  { id: "gemini-3.1-flash-lite-preview", label: "Gemini 3.1 Flash Lite (preview)" },
  { id: "gemma-4-31b-it", label: "Gemma 4 31B (text + vision)" },
  { id: "gemma-3-27b-it", label: "Gemma 3 27B (vision + text)" },
  { id: "gemini-1.5-flash", label: "Gemini 1.5 Flash" },
  { id: "gemini-1.5-pro", label: "Gemini 1.5 Pro" }
];

/**
 * Đổi model Gemini dùng cho OCR Azota, AI trợ lý, v.v.
 * Lưu vào Script Properties GEMINI_MODEL. Mỗi lần chạy script đọc lại từ Properties.
 */
function updateGeminiModel() {
  var ui = SpreadsheetApp.getUi();
  var props = PropertiesService.getScriptProperties();
  var current = props.getProperty("GEMINI_MODEL") || "";
  var effective = current || "gemini-2.0-flash (mặc định code)";
  var list = "Model đang lưu trong Properties: " + (current || "(chưa set — dùng gemini-2.0-flash)") + "\n\n";
  list += "Chọn nhanh (nhập số 1–" + GEMINI_MODEL_PRESETS.length + ") hoặc gõ tên model tùy ý:\n";
  for (var i = 0; i < GEMINI_MODEL_PRESETS.length; i++) {
    list += (i + 1) + ". " + GEMINI_MODEL_PRESETS[i].id + " — " + GEMINI_MODEL_PRESETS[i].label + "\n";
  }
  list += "\nHoặc nhập đúng id model (ví dụ gemini-2.0-flash), không cần models/ và :generateContent.\n";
  list += "Để trống + OK = xóa GEMINI_MODEL (dùng lại mặc định gemini-2.0-flash).";

  var result = ui.prompt("Đổi model Gemini", list, ui.ButtonSet.OK_CANCEL);
  if (result.getSelectedButton() !== ui.Button.OK) {
    ui.alert("Đã hủy.");
    return;
  }
  var raw = (result.getResponseText() || "").trim();
  var modelId = "";
  if (!raw) {
    props.deleteProperty("GEMINI_MODEL");
    ui.alert("✅ Đã xóa GEMINI_MODEL.\nLần chạy sau dùng mặc định: gemini-2.0-flash");
    return;
  }
  var num = parseInt(raw, 10);
  if (!isNaN(num) && num >= 1 && num <= GEMINI_MODEL_PRESETS.length) {
    modelId = GEMINI_MODEL_PRESETS[num - 1].id;
  } else {
    modelId = raw.replace(/^models\//, "").replace(/:generateContent$/i, "").trim();
  }
  if (!modelId || !/^[a-zA-Z0-9_.\-]+$/.test(modelId)) {
    ui.alert("❌ Tên model không hợp lệ. Chỉ dùng chữ, số, gạch ngang, gạch dưới, dấu chấm.");
    return;
  }
  props.setProperty("GEMINI_MODEL", modelId);
  ui.alert(
    "✅ Đã lưu GEMINI_MODEL = " + modelId + "\n\n" +
    "Áp dụng cho: Kéo điểm chấm Azota (OCR), AI Tạo Đáp Án, v.v.\n" +
    "URL API: .../v1beta/models/" + modelId + ":generateContent"
  );
  Logger.log("GEMINI_MODEL set to " + modelId);
}

/** Hiện model đang dùng (theo lần load script hiện tại + Properties) */
function showGeminiModelInfo() {
  var saved = PropertiesService.getScriptProperties().getProperty("GEMINI_MODEL") || "";
  var msg =
    "GEMINI_MODEL trong Properties: " + (saved || "(chưa set)") + "\n\n" +
    "Model hiệu lực lần chạy này: " + GEMINI_MODEL + "\n\n" +
    "Đổi model: menu Báo cáo Buổi → Đổi model Gemini.";
  SpreadsheetApp.getUi().alert(msg);
}
