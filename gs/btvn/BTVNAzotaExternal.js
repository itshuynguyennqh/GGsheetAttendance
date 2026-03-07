// ======================================================
// BTVN AZOTA TỪ SHEET NGOÀI (Báo cáo tổng hợp)
// ======================================================
// EXTERNAL_BTVN_SHEET_ID từ Config.js

/**
 * Tải dữ liệu BTVN Azota từ sheet ngoài.
 * - "Tổng hợp HS": cột id (Azota ID) -> identificationNumber (6 số) -> HV-######
 * - "Tổng hợp BTVN": ID Học Sinh (Azota id), Điểm (trống = chưa làm, có = đã làm)
 * @return {Object} { "HV-000385": { total: 5, completed: 3, scores: [9.2, 5.2, 4] }, ... }
 */
function loadBTVNAzotaFromExternalSheet() {
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
  var tongHopBTVN = externalSS.getSheetByName("Tổng hợp BTVN");
  if (!tongHopBTVN) {
    Logger.log("[BTVN Azota] LỖI: Không tìm thấy sheet 'Tổng hợp BTVN'");
    return result;
  }
  var mappingBTVN = {};
  if (typeof createColumnMapping === "function") {
    mappingBTVN = createColumnMapping(tongHopBTVN, {
      idHocSinh: ["ID Học Sinh", "Id Học Sinh", "ID Học Sinh"],
      diem: ["Điểm", "Score", "Điểm số"]
    });
  }
  var idxIdHocSinh = mappingBTVN.idHocSinh !== undefined ? mappingBTVN.idHocSinh : 4;
  var idxDiem = mappingBTVN.diem !== undefined ? mappingBTVN.diem : 7;
  var dataBTVN = tongHopBTVN.getDataRange().getValues();
  for (var j = 1; j < dataBTVN.length; j++) {
    var row = dataBTVN[j];
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
