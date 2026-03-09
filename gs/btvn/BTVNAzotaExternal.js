// ======================================================
// BTVN AZOTA TỪ SHEET NGOÀI (Báo cáo tổng hợp)
// ======================================================
// EXTERNAL_BTVN_SHEET_ID từ Config.js

/**
 * Trích link ID từ URL hoặc chuỗi.
 * VD: https://azota.vn/de-thi/qy7fwe -> "qy7fwe" (6 ký tự bên phải)
 * @param {string} value - URL hoặc 6-char code
 * @return {string|null}
 */
function extractLinkId(value) {
  if (!value || String(value).trim() === "") return null;
  var s = String(value).trim();
  var beforeQuery = s.split("?")[0].trim();
  var segments = beforeQuery.split("/").filter(function(x) { return x.length > 0; });
  var last = segments.length > 0 ? segments[segments.length - 1] : "";
  return last.length >= 4 && last.length <= 32 ? last.slice(-6) : null;
}

/**
 * Lấy danh sách link ID từ sheet "Danh sách Bài" theo khoảng Format.
 * @param {Object} btvnRange - { buoiStart, thangStart, namStart, buoiEnd, thangEnd, namEnd }
 * @param {Spreadsheet} externalSS - Google Sheet ngoài
 * @return {Object} Set-like object (keys = linkId) hoặc null nếu không filter
 */
function getAllowedLinkIdsFromDanhSachBai(btvnRange, externalSS) {
  if (!btvnRange || btvnRange.buoiStart == null || btvnRange.thangStart == null || btvnRange.namStart == null ||
      btvnRange.buoiEnd == null || btvnRange.thangEnd == null || btvnRange.namEnd == null) {
    return null;
  }
  var danhSachSheet = externalSS.getSheetByName("Danh sách Bài");
  if (!danhSachSheet) {
    Logger.log("[BTVN Azota] Không tìm thấy sheet 'Danh sách Bài', bỏ qua filter link");
    return null;
  }
  var mapping = {};
  if (typeof createColumnMapping === "function") {
    mapping = createColumnMapping(danhSachSheet, {
      format: ["Format", "Mã Format", "Mã BTVN"],
      linkBai: ["Link Bài", "Link Kết quả"]
    });
  }
  var idxFormat = mapping.format !== undefined ? mapping.format : 7;
  var idxLinkBai = mapping.linkBai !== undefined ? mapping.linkBai : 8;
  var startFormat = "T" + ("0" + btvnRange.thangStart).slice(-2) + "." + btvnRange.namStart + "-B" + btvnRange.buoiStart;
  var endFormat = "T" + ("0" + btvnRange.thangEnd).slice(-2) + "." + btvnRange.namEnd + "-B" + btvnRange.buoiEnd;
  if (typeof compareFormat !== "function") {
    Logger.log("[BTVN Azota] compareFormat không tồn tại, bỏ qua filter link");
    return null;
  }
  var data = danhSachSheet.getDataRange().getValues();
  var allowed = {};
  for (var i = 1; i < data.length; i++) {
    var formatVal = data[i][idxFormat];
    var formatStr = formatVal ? String(formatVal).trim() : "";
    if (!formatStr) continue;
    var cmpStart = compareFormat(formatStr, startFormat);
    var cmpEnd = compareFormat(formatStr, endFormat);
    if (cmpStart >= 0 && cmpEnd <= 0) {
      var linkVal = data[i][idxLinkBai];
      var linkId = extractLinkId(linkVal);
      if (linkId) allowed[linkId] = true;
    }
  }
  Logger.log("[BTVN Azota] Khoảng Format " + startFormat + " - " + endFormat + " -> " + Object.keys(allowed).length + " link");
  return allowed;
}

/**
 * Tải dữ liệu BTVN Azota từ sheet ngoài.
 * - "Tổng hợp HS": cột id (Azota ID) -> identificationNumber (6 số) -> HV-######
 * - "Danh sách Bài": Format (H), Link Bài (I) -> lấy link IDs trong khoảng btvnRange
 * - "Tổng hợp BTVN": ID Học Sinh, Link Bài Làm (D), Điểm - filter theo allowedLinkIds nếu có
 * @param {Object} [btvnRange] - { buoiStart, thangStart, namStart, buoiEnd, thangEnd, namEnd } hoặc null
 * @return {Object} { "HV-000385": { total: 5, completed: 3, scores: [9.2, 5.2, 4] }, ... }
 */
function loadBTVNAzotaFromExternalSheet(btvnRange) {
  var result = {};
  Logger.log("[BTVN Azota] Bắt đầu load từ sheet ngoài, ID=" + EXTERNAL_BTVN_SHEET_ID);
  try {
    var externalSS = SpreadsheetApp.openById(EXTERNAL_BTVN_SHEET_ID);
    Logger.log("[BTVN Azota] Đã mở sheet ngoài, tên: " + externalSS.getName());
  } catch (e) {
    Logger.log("[BTVN Azota] LỖI: Không mở được sheet ngoài - " + e.toString());
    return result;
  }
  var tongHopHS = externalSS.getSheetByName("Tổng hợp HS");
  if (!tongHopHS) {
    Logger.log("[BTVN Azota] LỖI: Không tìm thấy sheet 'Tổng hợp HS'");
    return result;
  }
  var mappingHS = {};
  if (typeof createColumnMapping === "function") {
    mappingHS = createColumnMapping(tongHopHS, {
      id: ["id", "ID", "Id"],
      identificationNumber: ["identificationNumber", "IdentificationNumber", "Mã định danh"]
    });
  }
  var idxId = mappingHS.id !== undefined ? mappingHS.id : 10;
  var idxIdent = mappingHS.identificationNumber !== undefined ? mappingHS.identificationNumber : 18;
  var dataHS = tongHopHS.getDataRange().getValues();
  var azotaIdToHv = {};
  for (var i = 1; i < dataHS.length; i++) {
    var azotaId = dataHS[i][idxId];
    var ident = dataHS[i][idxIdent];
    if (azotaId === "" || azotaId === null || azotaId === undefined) continue;
    var azotaIdStr = String(azotaId).trim();
    if (ident !== "" && ident !== null && ident !== undefined) {
      var num = parseInt(ident, 10);
      if (!isNaN(num)) {
        azotaIdToHv[azotaIdStr] = "HV-" + ("000000" + num).slice(-6);
      }
    }
  }
  var allowedLinkIds = getAllowedLinkIdsFromDanhSachBai(btvnRange, externalSS);

  var tongHopBTVN = externalSS.getSheetByName("Tổng hợp BTVN");
  if (!tongHopBTVN) {
    Logger.log("[BTVN Azota] LỖI: Không tìm thấy sheet 'Tổng hợp BTVN'");
    return result;
  }
  var mappingBTVN = {};
  if (typeof createColumnMapping === "function") {
    mappingBTVN = createColumnMapping(tongHopBTVN, {
      idHocSinh: ["ID Học Sinh", "Id Học Sinh", "ID Học Sinh"],
      diem: ["Điểm", "Score", "Điểm số"],
      linkBaiLam: ["Link Bài Làm", "Link", "D"]
    });
  }
  var idxIdHocSinh = mappingBTVN.idHocSinh !== undefined ? mappingBTVN.idHocSinh : 4;
  var idxDiem = mappingBTVN.diem !== undefined ? mappingBTVN.diem : 7;
  var idxLinkBaiLam = mappingBTVN.linkBaiLam !== undefined ? mappingBTVN.linkBaiLam : 3;
  var dataBTVN = tongHopBTVN.getDataRange().getValues();
  for (var j = 1; j < dataBTVN.length; j++) {
    var row = dataBTVN[j];
    if (allowedLinkIds !== null) {
      var linkBaiLamVal = row[idxLinkBaiLam];
      var linkId = extractLinkId(linkBaiLamVal);
      if (!linkId || !allowedLinkIds[linkId]) continue;
    }
    var idHocSinh = row[idxIdHocSinh];
    if (idHocSinh === "" || idHocSinh === null || idHocSinh === undefined) continue;
    var hvCode = azotaIdToHv[String(idHocSinh).trim()];
    if (!hvCode) continue;
    if (!result[hvCode]) result[hvCode] = { total: 0, completed: 0, scores: [] };
    result[hvCode].total++;
    var diemVal = row[idxDiem];
    var diemStr = diemVal !== "" && diemVal !== null && diemVal !== undefined ? String(diemVal).trim() : "";
    if (diemStr !== "") {
      result[hvCode].completed++;
      var scoreNum = parseScore(diemStr);
      if (scoreNum !== null) result[hvCode].scores.push(scoreNum);
    }
  }
  return result;
}
