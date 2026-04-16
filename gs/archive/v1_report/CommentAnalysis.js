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
    attitude: str.indexOf("ý thức") >= 0 || str.indexOf("mất trật tự") >= 0 || str.indexOf("nhắc nhở") >= 0 || str.indexOf("dùng điện thoại") >= 0 || str.indexOf("nói chuyện") >= 0 || str.indexOf("muộn") >= 0 || str.indexOf("ngủ") >= 0 || str.indexOf("mất tập trung") >= 0 || str.indexOf("không ghi") >= 0 || str.indexOf("không chữa bài") >= 0,
    vocab: str.indexOf("từ vựng") >= 0 || str.indexOf("chép phạt") >= 0 || str.indexOf("từ mới") >= 0
  };
}

/**
 * Phân tích nhận xét và trả về các cụm từ đã match (để bôi đen).
 * Trả về chuỗi thực tế trong text (giữ nguyên hoa/thường).
 * @param {string} text - Nội dung nhận xét
 * @return {{attitude: {matched: boolean, phrases: string[]}, vocab: {matched: boolean, phrases: string[]}}}
 */
function analyzeCommentTextWithPhrases(text) {
  var result = { attitude: { matched: false, phrases: [] }, vocab: { matched: false, phrases: [] } };
  if (!text || typeof text !== "string") return result;
  var str = String(text);
  var lower = str.toLowerCase();
  var attPhrases = ["ý thức", "mất trật tự", "nhắc nhở", "dùng điện thoại", "nói chuyện", "muộn", "ngủ", "mất tập trung", "không ghi", "không chữa bài"];
  var vocabPhrases = ["từ vựng", "chép phạt", "từ mới"];
  function findPhrasesInText(phrases, lowerStr, origStr) {
    var found = [];
    for (var i = 0; i < phrases.length; i++) {
      var p = phrases[i];
      var idx = 0;
      while (true) {
        var pos = lowerStr.indexOf(p, idx);
        if (pos === -1) break;
        found.push(origStr.substring(pos, pos + p.length));
        idx = pos + 1;
      }
    }
    return found;
  }
  result.attitude.phrases = findPhrasesInText(attPhrases, lower, str);
  result.attitude.matched = result.attitude.phrases.length > 0;
  result.vocab.phrases = findPhrasesInText(vocabPhrases, lower, str);
  result.vocab.matched = result.vocab.phrases.length > 0;
  return result;
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
  if (str.indexOf("ngủ") >= 0) return "ngủ gật";
  if (str.indexOf("mất tập trung") >= 0) return "mất tập trung";
  if (str.indexOf("không ghi") >= 0) return "không ghi bài";
  if (str.indexOf("không chữa bài") >= 0) return "không chữa bài";
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
  var bareNum = hvStr.match(/^0*(\d+)$/);
  if (bareNum && bareNum[1]) {
    var n = parseInt(bareNum[1], 10);
    if (!isNaN(n)) return "HV-" + ("000000" + n).slice(-6);
  }
  return hvStr;
}
