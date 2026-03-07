// ======================================================
// PHÂN TÍCH NHẬN XÉT VÀ MÃ HV
// ======================================================

/**
 * Phân tích nhận xét để tìm lỗi BTVN, từ vựng, ý thức.
 * @return {{btvn: boolean, vocab: boolean, attitude: boolean}}
 */
function analyzeCommentText(text) {
  if (!text) return {btvn: false, vocab: false, attitude: false};
  var str = String(text).toLowerCase();
  return {
    btvn: str.indexOf("thiếu btvn") >= 0 || str.indexOf("chưa làm btvn") >= 0 || str.indexOf("không làm btvn") >= 0 || str.indexOf("chưa xong btvn") >= 0 || str.indexOf("chưa làm btvn azota") >= 0,
    attitude: str.indexOf("ý thức") >= 0 || str.indexOf("mất trật tự") >= 0 || str.indexOf("nhắc nhở") >= 0 || str.indexOf("dùng điện thoại") >= 0 || str.indexOf("nói chuyện") >= 0 || str.indexOf("muộn") >= 0,
    vocab: str.indexOf("từ vựng") >= 0 || str.indexOf("chép phạt") >= 0 || str.indexOf("từ mới") >= 0
  };
}

/**
 * Từ nhận xét raw trả về cụm ngắn cho thái độ
 */
function commentToAttitudePhrase(commentStr) {
  if (!commentStr) return "";
  var str = String(commentStr).toLowerCase();
  if (str.indexOf("muộn") >= 0) return "đi muộn";
  if (str.indexOf("mất trật tự") >= 0) return "mất trật tự";
  if (str.indexOf("nói chuyện") >= 0) return "nói chuyện";
  if (str.indexOf("dùng điện thoại") >= 0) return "dùng điện thoại";
  if (str.indexOf("nhắc nhở") >= 0) return "cần nhắc nhở";
  if (str.indexOf("ý thức") >= 0) return "ý thức chưa tốt";
  return "chưa tập trung";
}

/**
 * Kiểm tra nhận xét có phải thuần túy BTVN Azota (không đưa vào phần buổi cần lưu ý)
 */
function isCommentOnlyBTVNAzota(commentStr) {
  if (!commentStr || commentStr === "" || commentStr.toLowerCase() === "đủ") return false;
  var c = commentStr.toLowerCase();
  if (c.indexOf("chưa làm btvn azota") >= 0) return true;
  if (c.indexOf("đã làm bài tốt với") >= 0) return true;
  if (c.indexOf("đã làm bài ở mức điểm khá") >= 0) return true;
  if (c.indexOf("làm chưa đạt yêu cầu") >= 0) return true;
  return false;
}

/**
 * Chuẩn hóa mã HV để match linh hoạt (HV-000482 vs HV-0000482)
 * @param {string} hvCode - Mã HV
 * @return {string} - Mã HV đã chuẩn hóa (HV-000482)
 */
function normalizeHVCode(hvCode) {
  if (!hvCode || typeof hvCode !== "string") return hvCode;
  var hvStr = String(hvCode).trim().toUpperCase();
  var match = hvStr.match(/^HV-0*(\d+)$/);
  if (match && match[1]) {
    var num = parseInt(match[1], 10);
    if (!isNaN(num)) {
      return "HV-" + ("000000" + num).slice(-6);
    }
  }
  return hvStr;
}
