// ======================================================
// HÀM PHỤ TRỢ CHUNG
// ======================================================

function parseDate(dateVal) {
  if (!dateVal) return null;
  if (dateVal instanceof Date) return dateVal;
  var d = new Date(dateVal);
  return isNaN(d.getTime()) ? null : d;
}

function formatDateVN(dateObj) {
  if (!dateObj) return "";
  return Utilities.formatDate(dateObj, Session.getScriptTimeZone(), "dd/MM");
}

function parseScore(score) {
  if (score === "" || score === null || score === undefined) return null;
  var scoreStr = String(score).replace(",", ".");
  var num = parseFloat(scoreStr);
  return isNaN(num) ? null : num;
}

/**
 * Trả về chuỗi "tháng X/YYYY" từ Date
 */
function getMonthLabel(dateObj) {
  if (!dateObj || !dateObj.getMonth) return "";
  var m = dateObj.getMonth() + 1;
  var y = dateObj.getFullYear();
  return "tháng " + m + "/" + y;
}
