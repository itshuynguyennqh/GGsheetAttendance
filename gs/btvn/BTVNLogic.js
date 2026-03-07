// ======================================================
// XỬ LÝ BTVN AZOTA - LOGIC HOÀN CHỈNH
// ======================================================
// 
// MÔ TẢ TỔNG QUAN:
// Hàm này kéo dữ liệu điểm BTVN Azota từ Google Sheet ngoài về sheet "BaoCao"
// 
// FLOW CHÍNH:
// 1. Đọc dữ liệu từ sheet "BaoCao" (vùng được chọn)
// 2. Tìm hashid từ sheet "Danh sách Bài" dựa trên Format
// 3. Tạo dictionary học viên từ sheet "Tổng hợp HS"
// 4. Match hashid + mã HV trong sheet "Tổng hợp BTVN" để lấy điểm
// 5. Ghi kết quả về sheet "BaoCao"
//
// ======================================================

// ======================================================
// PHẦN 1: HELPER FUNCTIONS - Tìm cột tự động
// ======================================================

/** Prefix log theo bước: [TÌM CỘT] [DANH SÁCH BÀI] [TỔNG HỢP HS] [TỔNG HỢP BTVN] [GHI KẾT QUẢ] [KẾT QUẢ] */
function _log(prefix, msg) { Logger.log('[' + prefix + '] ' + msg); }

/**
 * Chuyển đổi tên cột Excel (A, B, C, ..., Z, AA, AB, ...) sang index (0-based)
 * @param {string} columnLetter - Tên cột Excel (ví dụ: "A", "B", "Z", "AA")
 * @return {number} - Index của cột (0-based), -1 nếu không hợp lệ
 */
function columnLetterToIndex(columnLetter) {
  if (!columnLetter || typeof columnLetter !== 'string') {
    _log('TÌM CỘT', 'columnLetterToIndex(' + (typeof columnLetter) + ') → -1 (input rỗng/không hợp lệ)');
    return -1;
  }
  const col = columnLetter.trim().toUpperCase();
  // Chỉ chấp nhận tên cột Excel hợp lệ: 1-3 ký tự A-Z
  if (col.length === 0 || col.length > 3) {
    _log('TÌM CỘT', 'columnLetterToIndex("' + columnLetter + '") → -1 (độ dài 0 hoặc >3)');
    return -1;
  }
  let index = 0;
  for (let i = 0; i < col.length; i++) {
    const char = col.charCodeAt(i);
    if (char < 65 || char > 90) {
      _log('TÌM CỘT', 'columnLetterToIndex("' + columnLetter + '") → -1 (ký tự không phải A-Z)');
      return -1;
    }
    index = index * 26 + (char - 64);
  }
  
  const result = index - 1; // Chuyển từ 1-based sang 0-based

  // Validate: index phải hợp lý (Google Sheets thường có tối đa ~1000 cột)
  if (result < 0 || result >= 1000) {
    _log('TÌM CỘT', 'columnLetterToIndex("' + columnLetter + '") → -1 (ngoài khoảng 0..999)');
    return -1;
  }

  _log('TÌM CỘT', 'columnLetterToIndex("' + columnLetter + '") → ' + result);
  return result;
}

/**
 * Tìm index của cột dựa trên header row hoặc tên cột Excel
 * @param {Sheet} sheet - Sheet cần tìm
 * @param {string|Array} columnName - Tên cột hoặc mảng các tên cột có thể (để linh hoạt)
 * @param {number} headerRow - Dòng header (mặc định 1)
 * @return {number} - Index của cột (0-based), -1 nếu không tìm thấy
 */
function findColumnIndex(sheet, columnName, headerRow = 1) {
  try {
    // Nếu columnName là mảng, tìm cột đầu tiên khớp
    const searchNames = Array.isArray(columnName) ? columnName : [columnName];
    
    // Bước 0: Nếu tên chỉ có 1 chữ cái (vd: "Y", "K", "D") → dùng index Excel trực tiếp
    for (let j = 0; j < searchNames.length; j++) {
      const searchName = String(searchNames[j] || '').trim();
      if (searchName.length === 1 && /^[A-Za-z]$/.test(searchName)) {
        const excelIndex = columnLetterToIndex(searchName);
        if (excelIndex >= 0 && excelIndex < 1000) {
          _log('TÌM CỘT', '  → "' + searchName + '" (1 chữ cái → Excel index) index ' + excelIndex);
          return excelIndex;
        }
      }
    }
    
    // Lấy header row
    const lastCol = sheet.getLastColumn();
    if (lastCol === 0) return -1;
    
    const headerRange = sheet.getRange(headerRow, 1, 1, lastCol);
    const headers = headerRange.getValues()[0];
    
    // Bước 1: ƯU TIÊN - Tìm chính xác tên header trong hàng 1
    for (let i = 0; i < headers.length; i++) {
      const headerValue = String(headers[i] || '').trim();
      for (let j = 0; j < searchNames.length; j++) {
        const searchName = String(searchNames[j] || '').trim();
        
        // So sánh chính xác (không phân biệt hoa thường)
        if (headerValue.toLowerCase() === searchName.toLowerCase()) {
          const colLetter = i < 26 ? String.fromCharCode(65 + i) : 'Column ' + (i + 1);
          _log('TÌM CỘT', '  → "' + searchNames[j] + '" (chính xác header) index ' + i + ' (cột ' + colLetter + ')');
          return i;
        }
      }
    }
    
    // Bước 2: Tìm linh hoạt hơn (chứa) trong header
    for (let i = 0; i < headers.length; i++) {
      const headerValue = String(headers[i] || '').trim().toLowerCase();
      for (let j = 0; j < searchNames.length; j++) {
        const searchName = String(searchNames[j] || '').trim().toLowerCase();
        
        // So sánh linh hoạt (chứa)
        if (headerValue.includes(searchName) || searchName.includes(headerValue)) {
          const colLetter = i < 26 ? String.fromCharCode(65 + i) : 'Column ' + (i + 1);
          _log('TÌM CỘT', '  → "' + searchNames[j] + '" (linh hoạt header) index ' + i + ' (cột ' + colLetter + ')');
          return i;
        }
      }
    }
    
    // Bước 3: Fallback - (1 chữ cái đã xử lý ở Bước 0; ở đây chỉ còn tên dài không khớp header)
    _log('TÌM CỘT', '  → Không tìm thấy: "' + (Array.isArray(columnName) ? columnName.join(' hoặc ') : columnName) + '" → findColumnIndex trả về -1');
    return -1;
  } catch (e) {
    _log('TÌM CỘT', '  → Error: ' + e.toString() + ' → findColumnIndex trả về -1');
    return -1;
  }
}

/**
 * Tạo column mapping object cho một sheet
 * Tự động tìm các cột dựa trên header, giúp code linh hoạt khi thêm/xóa cột
 * @param {Sheet} sheet - Sheet cần tạo mapping
 * @param {Object} columnConfig - Object định nghĩa tên cột cần tìm
 * @param {number} headerRow - Dòng header (mặc định 1)
 * @return {Object} - Object mapping tên -> index, ví dụ: {x: 1, hv: 3}
 */
function createColumnMapping(sheet, columnConfig, headerRow = 1) {
  const mapping = {};
  for (const key in columnConfig) {
    const columnName = columnConfig[key];
    const index = findColumnIndex(sheet, columnName, headerRow);
    
    if (index >= 0 && index < 1000) {
      // Tìm thấy cột theo header hoặc tên Excel
      mapping[key] = index;
    } else {
      // Fallback: thử dùng tên cột như là index (nếu là số)
      if (typeof columnName === 'string') {
        const numIndex = parseInt(columnName, 10);
        if (!isNaN(numIndex) && numIndex >= 0 && numIndex < 1000) {
          mapping[key] = numIndex;
          _log('TÌM CỘT', '  → "' + key + '" fallback index ' + numIndex);
        } else {
          _log('TÌM CỘT', '  → "' + key + '" không tìm thấy, tên: "' + columnName + '"');
        }
      } else if (Array.isArray(columnName)) {
        const lastItem = columnName[columnName.length - 1];
        if (typeof lastItem === 'string') {
          const numIndex = parseInt(lastItem, 10);
          if (!isNaN(numIndex) && numIndex >= 0 && numIndex < 1000) {
            mapping[key] = numIndex;
            _log('TÌM CỘT', '  → "' + key + '" fallback index ' + numIndex + ' từ mảng');
          } else {
            _log('TÌM CỘT', '  → "' + key + '" không tìm thấy, mảng: ' + columnName.join(', '));
          }
        }
      }
    }
  }
  _log('TÌM CỘT', 'createColumnMapping → ' + JSON.stringify(mapping));
  return mapping;
}

// ======================================================
// PHẦN 2: HÀM CHÍNH - processBTVNAzota
// ======================================================

/**
 * HÀM CHÍNH: Xử lý BTVN Azota
 * 
 * FLOW:
 * 1. Đọc dữ liệu từ sheet "BaoCao" (vùng được chọn)
 *    - Lấy x (Format/Mã BTVN) từ dòng đầu tiên
 *    - Lấy mảng hv (mã học viên) từ tất cả các dòng
 * 
 * 2. Mở Google Sheet ngoài (ID: 1D0JR4CNSGdCqelFQwYpVdjP8DkJkRUqoKPdUVnIs1lo)
 * 
 * 3. extractHashids(): Tìm hashid từ sheet "Danh sách Bài"
 *    - Tìm x trong cột "Format"
 *    - Lấy hashid từ cột "Link Kết quả" (extract từ URL)
 * 
 * 4. createStudentDictionary(): Tạo dictionary từ sheet "Tổng hợp HS"
 *    - Lấy 3 số cuối của mã HV
 *    - Match với cột Y (3 số cuối) trong sheet
 *    - Tạo dict: {mãHV: giá_trị_cột_K}
 * 
 * 5. matchAndGetScores(): Match và lấy điểm từ sheet "Tổng hợp BTVN"
 *    - Tìm dòng có hashid khớp VÀ mã HV khớp
 *    - Lấy điểm và đánh giá
 * 
 * 6. writeResultsToBaoCao(): Ghi kết quả về sheet "BaoCao"
 */
function processBTVNAzota() {
  try {
    // ==========================================
    // BƯỚC 1: Lấy sheet "BaoCao" và vùng được chọn
    // ==========================================
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const baoCaoSheet = ss.getSheetByName('BaoCao');
    
    if (!baoCaoSheet) {
      SpreadsheetApp.getUi().alert('❌ Không tìm thấy sheet "BaoCao"!');
      return;
    }
    
    const activeRange = baoCaoSheet.getActiveRange();
    if (!activeRange) {
      SpreadsheetApp.getUi().alert('⚠️ Vui lòng chọn vùng dữ liệu trong sheet "BaoCao"!');
      return;
    }
    
    // ==========================================
    // BƯỚC 2: Tạo column mapping cho sheet "BaoCao"
    // ==========================================
    _log('TÌM CỘT', 'BaoCao: bắt đầu tìm cột x, hv, result');
    const baoCaoColumnMapping = createColumnMapping(baoCaoSheet, {
      x: ['Mã BTVN', 'Mã', 'BTVN', 'B'],           // Cột chứa Format/Mã BTVN
      hv: ['Mã HV', 'Mã học viên', 'HV', 'D'],     // Cột chứa mã học viên
      result: ['Kết quả', 'Nhận xét', 'I']         // Cột ghi kết quả
    });
    
    // Fallback về index mặc định nếu không tìm thấy
    if (baoCaoColumnMapping.x === undefined) baoCaoColumnMapping.x = 1;      // Cột B
    if (baoCaoColumnMapping.hv === undefined) baoCaoColumnMapping.hv = 3;    // Cột D
    if (baoCaoColumnMapping.result === undefined) baoCaoColumnMapping.result = 8; // Cột I
    
    _log('TÌM CỘT', 'BaoCao: x=index ' + baoCaoColumnMapping.x + ', hv=index ' + baoCaoColumnMapping.hv + ', result=index ' + baoCaoColumnMapping.result);
    _log('TÌM CỘT', 'BaoCao: JSON ' + JSON.stringify(baoCaoColumnMapping));
    
    // ==========================================
    // BƯỚC 3: Trích xuất dữ liệu từ vùng chọn
    // ==========================================
    const selectedRows = activeRange.getRow();
    const selectedLastRow = activeRange.getLastRow();
    const numRows = selectedLastRow - selectedRows + 1;
    
    // Validate các index
    if (baoCaoColumnMapping.x < 0 || baoCaoColumnMapping.x >= 1000) {
      SpreadsheetApp.getUi().alert('❌ Lỗi: Không tìm thấy cột x trong sheet "BaoCao"!');
      return;
    }
    if (baoCaoColumnMapping.hv < 0 || baoCaoColumnMapping.hv >= 1000) {
      SpreadsheetApp.getUi().alert('❌ Lỗi: Không tìm thấy cột hv trong sheet "BaoCao"!');
      return;
    }
    
    // Lấy toàn bộ dữ liệu của các dòng được chọn
    const lastCol = Math.max(baoCaoSheet.getLastColumn(), baoCaoColumnMapping.x + 1, baoCaoColumnMapping.hv + 1, baoCaoColumnMapping.result + 1, 9);
    const selectedData = baoCaoSheet.getRange(selectedRows, 1, numRows, lastCol).getValues();
    
    // Validate: đảm bảo có đủ cột
    if (selectedData.length === 0 || selectedData[0].length <= baoCaoColumnMapping.x) {
      SpreadsheetApp.getUi().alert('❌ Lỗi: Dữ liệu không đủ cột!');
      return;
    }
    
    // Lấy x (Format/Mã BTVN) từ dòng đầu tiên được chọn
    const x = selectedData[0][baoCaoColumnMapping.x];
    if (!x || x === '') {
      SpreadsheetApp.getUi().alert('❌ Không tìm thấy giá trị ở cột x của dòng đầu tiên được chọn!');
      return;
    }
    
    // Lấy mảng hv (mã học viên) từ tất cả các dòng được chọn
    const hv = [];
    const rowMapping = []; // Lưu mapping: index trong mảng -> dòng thực tế trong sheet
    for (let i = 0; i < selectedData.length; i++) {
      const hvValue = selectedData[i][baoCaoColumnMapping.hv];
      if (hvValue && hvValue !== '') {
        hv.push(hvValue);
        rowMapping.push(selectedRows + i);
      }
    }
    
    if (hv.length === 0) {
      SpreadsheetApp.getUi().alert('❌ Không tìm thấy mã học viên trong vùng đã chọn!');
      return;
    }
    
    _log('KẾT QUẢ', 'BaoCao: x="' + x + '", số HV=' + hv.length + ', hv=' + hv.slice(0, 5).join(', ') + (hv.length > 5 ? '...' : ''));
    
    // ==========================================
    // BƯỚC 4: Mở Google Sheet ngoài
    // ==========================================
    const externalSheetId = '1D0JR4CNSGdCqelFQwYpVdjP8DkJkRUqoKPdUVnIs1lo';
    let externalSS;
    try {
      externalSS = SpreadsheetApp.openById(externalSheetId);
    } catch (e) {
      SpreadsheetApp.getUi().alert('❌ Không thể truy cập Google Sheet ngoài. Vui lòng kiểm tra quyền truy cập!\nLỗi: ' + e.message);
      return;
    }
    
    // ==========================================
    // BƯỚC 5: Lấy hashid từ sheet "Danh sách Bài"
    // ==========================================
    const hashidArray = extractHashids(externalSS, x);
    _log('KẾT QUẢ', 'Hashid: ' + JSON.stringify(hashidArray));
    if (hashidArray.length === 0) {
      SpreadsheetApp.getUi().alert('⚠️ Không tìm thấy hashid nào cho giá trị x = "' + x + '" trong sheet "Danh sách Bài"');
      return;
    }
    
    // ==========================================
    // BƯỚC 6: Tạo dictionary học viên từ sheet "Tổng hợp HS"
    // ==========================================
    const studentDict = createStudentDictionary(externalSS, hv);
    
    if (Object.keys(studentDict).length === 0) {
      SpreadsheetApp.getUi().alert('⚠️ Không tìm thấy dữ liệu trong sheet "Tổng hợp HS" cho các mã học viên: ' + hv.join(', '));
      return;
    }
    
    // ==========================================
    // BƯỚC 7: Match và lấy điểm từ sheet "Tổng hợp BTVN"
    // ==========================================
    const results = matchAndGetScores(externalSS, hashidArray, studentDict);
    
    // ==========================================
    // BƯỚC 8: Ghi kết quả về sheet "BaoCao"
    // ==========================================
    writeResultsToBaoCao(baoCaoSheet, hv, results, rowMapping, baoCaoColumnMapping);
    
    const foundCount = Object.keys(results).length;
    _log('KẾT QUẢ', 'Tổng kết: x="' + x + '", HV=' + hv.length + ', hashid=' + (hashidArray ? hashidArray.length : 0) + ', dict=' + Object.keys(studentDict).length + ', match=' + foundCount + ', không tìm thấy=' + (hv.length - foundCount));
    _log('KẾT QUẢ', 'results=' + JSON.stringify(results));
    SpreadsheetApp.getUi().alert('✅ Đã xử lý xong!\n- Tìm thấy: ' + foundCount + '/' + hv.length + ' học viên có dữ liệu\n- Không tìm thấy: ' + (hv.length - foundCount) + ' học viên');
    
  } catch (error) {
    SpreadsheetApp.getUi().alert('❌ Lỗi: ' + error.message);
    Logger.log('Error in processBTVNAzota: ' + error.stack);
  }
}

// ======================================================
// PHẦN 3: extractHashids - Lấy hashid từ "Danh sách Bài"
// ======================================================

/**
 * So sánh hai giá trị Format để tìm giá trị nhỏ hơn
 * Format thường có dạng: "T{số}.{năm}-B{số}" (ví dụ: "T02.2026-B1")
 * 
 * Logic so sánh:
 * 1. Parse format: T số, năm, B số
 * 2. So sánh theo thứ tự: T số → năm → B số
 * 3. Nếu không match format chuẩn, so sánh theo string
 * 
 * @param {string} format1 - Format thứ nhất
 * @param {string} format2 - Format thứ hai
 * @return {number} - -1 nếu format1 < format2, 1 nếu format1 > format2, 0 nếu bằng nhau
 */
function compareFormat(format1, format2) {
  const str1 = String(format1).trim();
  const str2 = String(format2).trim();
  
  // Parse format: T{số}.{năm}-B{số}
  const parseFormat = function(formatStr) {
    const match = formatStr.match(/^T(\d+)\.(\d+)-B(\d+)$/i);
    if (match) {
      return {
        tNumber: parseInt(match[1], 10),
        year: parseInt(match[2], 10),
        bNumber: parseInt(match[3], 10),
        valid: true
      };
    }
    return { valid: false };
  };
  
  const parsed1 = parseFormat(str1);
  const parsed2 = parseFormat(str2);
  
  // Nếu cả 2 đều parse được → so sánh theo T số, năm, B số
  if (parsed1.valid && parsed2.valid) {
    if (parsed1.tNumber !== parsed2.tNumber) {
      return parsed1.tNumber < parsed2.tNumber ? -1 : 1;
    }
    if (parsed1.year !== parsed2.year) {
      return parsed1.year < parsed2.year ? -1 : 1;
    }
    if (parsed1.bNumber !== parsed2.bNumber) {
      return parsed1.bNumber < parsed2.bNumber ? -1 : 1;
    }
    return 0;
  }
  
  // Nếu không parse được → so sánh theo string
  if (str1 < str2) return -1;
  if (str1 > str2) return 1;
  return 0;
}

/**
 * Trích xuất hashid từ sheet "Danh sách Bài"
 * 
 * LOGIC MỚI:
 * 1. Thu thập tất cả các giá trị Format trong sheet
 * 2. Tìm x trong cột Format
 * 3. Tìm y là giá trị Format nhỏ hơn x gần nhất
 *    - Ví dụ: x = "T02.2026-B1" → y = "T01.2026-B8" (nhỏ hơn x gần nhất)
 * 4. Lấy hashid từ tất cả các dòng có Format = y
 * 5. Extract hashid từ URL trong cột "Link Kết quả":
 *    - URL format: https://azota.vn/de-thi/pkarzl (hoặc ...?query)
 *    - Hashid = đoạn path cuối (trước ?), thường 6 ký tự: pkarzl
 *    - VD: https://azota.vn/de-thi/pkarzl → hashid = "pkarzl"
 * 
 * @param {Spreadsheet} externalSS - Google Sheet ngoài
 * @param {*} x - Giá trị Format cần tìm (ví dụ: "T02.2026-B1")
 * @return {Array} - Mảng các hashid
 */
function extractHashids(externalSS, x) {
  const danhSachSheet = externalSS.getSheetByName('Danh sách Bài');
  if (!danhSachSheet) {
    throw new Error('Không tìm thấy sheet "Danh sách Bài"');
  }
  
  // Tạo column mapping
  _log('TÌM CỘT', 'Danh sách Bài: tìm Format, Link Kết quả');
  const columnMapping = createColumnMapping(danhSachSheet, {
    format: ['Format', 'Mã Format', 'Mã BTVN'],
    linkKetQua: ['Link Bài']
  });
  
  // Fallback về index mặc định
  if (columnMapping.format === undefined) columnMapping.format = 7;      // Cột H
  if (columnMapping.linkKetQua === undefined) columnMapping.linkKetQua = 9; // Cột J
  
  _log('TÌM CỘT', 'Danh sách Bài: Format=index ' + columnMapping.format + ', Link Kết quả=index ' + columnMapping.linkKetQua);
  
  const data = danhSachSheet.getDataRange().getValues();
  const hashids = [];
  
  // Tìm x trong cột Format
  const xStr = String(x).trim();
  _log('DANH SÁCH BÀI', 'Tìm x = "' + xStr + '" trong cột Format (index ' + columnMapping.format + ')');
  
  // Bước 1: Thu thập tất cả các giá trị Format trong sheet
  const allFormats = new Set(); // Dùng Set để loại bỏ trùng lặp
  let foundX = false;
  let firstXRow = -1;
  
  for (let i = 0; i < data.length; i++) {
    const cellValue = data[i][columnMapping.format];
    const cellValueStr = cellValue ? String(cellValue).trim() : '';
    
    if (!cellValueStr) continue;
    
    allFormats.add(cellValueStr);
    
    // Kiểm tra nếu là x
    if (cellValueStr.toLowerCase() === xStr.toLowerCase()) {
      if (!foundX) {
        firstXRow = i + 1;
        foundX = true;
        _log('DANH SÁCH BÀI', 'Tìm thấy x = "' + xStr + '" lần đầu ở dòng ' + firstXRow);
      }
    }
  }
  
  if (!foundX) {
    _log('DANH SÁCH BÀI', 'Kết quả: KHÔNG tìm thấy x = "' + xStr + '" trong sheet');
    const formats = Array.from(allFormats).sort();
    const sample = formats.length <= 12 ? formats.join(' | ') : formats.slice(0, 12).join(' | ') + ' | ... (tổng ' + formats.length + ' giá trị)';
    _log('DANH SÁCH BÀI', '  → Các giá trị Format trong sheet: ' + sample);
    return hashids;
  }
  
  // Bước 2: Tìm y là giá trị Format nhỏ hơn x gần nhất
  const formatsArray = Array.from(allFormats);
  let y = null;
  let maxSmallerFormat = null;
  
  for (let i = 0; i < formatsArray.length; i++) {
    const format = formatsArray[i];
    
    // Bỏ qua chính x
    if (format.toLowerCase() === xStr.toLowerCase()) {
      continue;
    }
    
    // So sánh với x: nếu format < x
    const comparison = compareFormat(format, xStr);
    if (comparison < 0) {
      // format < x, kiểm tra xem có lớn hơn maxSmallerFormat hiện tại không
      if (maxSmallerFormat === null || compareFormat(format, maxSmallerFormat) > 0) {
        maxSmallerFormat = format;
      }
    }
  }
  
  y = maxSmallerFormat;
  
  if (y === null) {
    _log('DANH SÁCH BÀI', 'Kết quả: KHÔNG tìm thấy giá trị Format nào nhỏ hơn x = "' + xStr + '"');
    _log('DANH SÁCH BÀI', '  → Tất cả các Format trong sheet đều >= x');
    return hashids;
  }
  
  _log('DANH SÁCH BÀI', 'Tìm thấy y = "' + y + '" (giá trị Format nhỏ hơn x = "' + xStr + '" gần nhất)');
  
  // Bước 3: Lấy hashid từ tất cả các dòng có Format = y
  let countFormatY = 0;
  let countWithLink = 0;
  
  for (let i = 0; i < data.length; i++) {
    const cellValue = data[i][columnMapping.format];
    const cellValueStr = cellValue ? String(cellValue).trim() : '';
    
    // Bỏ qua dòng trống
    if (!cellValueStr) continue;
    
    // Chỉ lấy hashid từ các dòng có Format = y
    if (cellValueStr.toLowerCase() === y.toLowerCase()) {
      countFormatY++;
      const linkKetQuaValue = data[i][columnMapping.linkKetQua];
      if (linkKetQuaValue && linkKetQuaValue !== '') {
        countWithLink++;
        const linkKetQuaStr = String(linkKetQuaValue).trim();
        
        // Extract hashid từ URL
        // Định dạng: https://azota.vn/de-thi/pkarzl → hashid = "pkarzl" (đoạn path cuối, thường 6 ký tự)
        let hashid = null;
        const beforeQuery = linkKetQuaStr.split('?')[0].trim();
        const segments = beforeQuery.split('/').filter(function (s) { return s.length > 0; });
        if (segments.length > 0) {
          hashid = segments[segments.length - 1];
          Logger.log('Tìm thấy hashid từ URL (đoạn path cuối): ' + hashid);
        }
        
        // Validate: thường 6 ký tự, chấp nhận 4–32 ký tự (chữ hoặc số)
        if (hashid && hashid.length >= 4 && hashid.length <= 32) {
          if (!hashids.includes(hashid)) {
            hashids.push(hashid);
            Logger.log('Thêm hashid: ' + hashid + ' từ dòng ' + (i + 1) + ' (Format = "' + y + '")');
          }
        } else {
          Logger.log('Warning: Không thể extract hashid từ URL: ' + linkKetQuaStr);
        }
      } else {
        Logger.log('Warning: Dòng ' + (i + 1) + ' không có giá trị trong cột "Link Kết quả"');
      }
    }
  }
  
  if (hashids.length === 0) {
    _log('DANH SÁCH BÀI', 'Kết quả: KHÔNG tìm thấy hashid cho x = "' + xStr + '"');
    _log('DANH SÁCH BÀI', '  → Tìm thấy x: ' + (foundX ? 'CÓ (dòng ' + firstXRow + ')' : 'KHÔNG'));
    _log('DANH SÁCH BÀI', '  → Lấy được y: ' + (y !== null ? 'CÓ, y="' + y + '"' : 'KHÔNG'));
    _log('DANH SÁCH BÀI', '  → Số dòng Format=y: ' + countFormatY + ', trong đó có Link Kết quả: ' + countWithLink);
    
    // Liệt kê các giá trị Format trong sheet (sample) để so với x
    const formats = Array.from(allFormats).sort();
    const sample = formats.length <= 12 ? formats.join(' | ') : formats.slice(0, 12).join(' | ') + ' | ... (tổng ' + formats.length + ' giá trị)';
    _log('DANH SÁCH BÀI', '  → Các giá trị Format trong sheet: ' + sample);
    
    // Gợi ý các giá trị nhỏ hơn x
    if (y === null && formats.length > 0) {
      const smallerFormats = formats.filter(function (f) {
        return f.toLowerCase() !== xStr.toLowerCase() && compareFormat(f, xStr) < 0;
      });
      if (smallerFormats.length > 0) {
        _log('DANH SÁCH BÀI', '  → Các giá trị nhỏ hơn x (sample): ' + smallerFormats.slice(0, 5).join(', '));
      } else {
        _log('DANH SÁCH BÀI', '  → Không có giá trị nào nhỏ hơn x. Tất cả Format đều >= x.');
      }
    }
  } else {
    _log('DANH SÁCH BÀI', 'Kết quả: tìm thấy ' + hashids.length + ' hashid từ Format y = "' + y + '": ' + hashids.join(', '));
  }

  _log('DANH SÁCH BÀI', '→ extractHashids(x="' + xStr + '") → y="' + (y || 'null') + '" → trả về: ' + hashids.length + ' phần tử = ' + JSON.stringify(hashids));
  return hashids;
}

// ======================================================
// PHẦN 4: createStudentDictionary - Tạo dictionary từ "Tổng hợp HS"
// ======================================================

/**
 * Tạo dictionary mã học viên -> giá trị cột K từ sheet "Tổng hợp HS"
 * 
 * LOGIC:
 * 1. Lấy 3 số cuối của mỗi mã HV (ví dụ: "HV-0000164" -> "164")
 * 2. Tìm trong sheet "Tổng hợp HS" các dòng có cột Y = 3 số cuối
 * 3. Tạo dictionary: {mãHV: giá_trị_cột_K}
 * 
 * @param {Spreadsheet} externalSS - Google Sheet ngoài
 * @param {Array} hvArray - Mảng mã học viên
 * @return {Object} - Dictionary {hv: value_from_K}
 */
function createStudentDictionary(externalSS, hvArray) {
  const tongHopHSSheet = externalSS.getSheetByName('Tổng hợp HS');
  if (!tongHopHSSheet) {
    throw new Error('Không tìm thấy sheet "Tổng hợp HS"');
  }
  
  // Tạo column mapping
  _log('TÌM CỘT', 'Tổng hợp HS: tìm last3 (Y), value (K)');
  const columnMapping = createColumnMapping(tongHopHSSheet, {
    last3: ['Y', '3 số cuối', 'Last3', 'Mã 3 số cuối'],
    value: ['K', 'Mã HV', 'Mã học viên', 'Value']
  });
  
  // Fallback về index mặc định
  if (columnMapping.last3 === undefined) columnMapping.last3 = 24; // Cột Y
  if (columnMapping.value === undefined) columnMapping.value = 10; // Cột K
  
  _log('TÌM CỘT', 'Tổng hợp HS: last3=index ' + columnMapping.last3 + ', value=index ' + columnMapping.value);
  
  const data = tongHopHSSheet.getDataRange().getValues();
  const dict = {};
  
  // Bước 1: Tạo map của 3 số cuối -> danh sách hv
  const hvByLast3 = {};
  for (let i = 0; i < hvArray.length; i++) {
    let hv = String(hvArray[i]).trim();
    
    if (hv.length < 3) {
      Logger.log('Warning: HV "' + hv + '" có ít hơn 3 ký tự, bỏ qua');
      continue;
    }
    
    // Lấy 3 số cuối và ép kiểu int
    const last3Str = hv.slice(-3);
    const last3Int = parseInt(last3Str, 10);
    
    if (isNaN(last3Int)) {
      Logger.log('Warning: HV "' + hv + '" không thể parse 3 số cuối "' + last3Str + '" thành int, bỏ qua');
      continue;
    }
    
    if (!hvByLast3[last3Int]) {
      hvByLast3[last3Int] = [];
    }
    hvByLast3[last3Int].push(hv);
  }
  
  if (Object.keys(hvByLast3).length === 0) {
    _log('TỔNG HỢP HS', 'Warning: Không có HV nào có đủ 3 số cuối → createStudentDictionary trả về {}');
    return dict;
  }
  
  // Bước 2: Duyệt qua sheet "Tổng hợp HS" để tìm khớp
  _log('TỔNG HỢP HS', 'Duyệt ' + data.length + ' dòng. Cột last3=index ' + columnMapping.last3 + ', value=index ' + columnMapping.value);
  _log('TỔNG HỢP HS', 'Các 3 số cuối cần tìm: ' + Object.keys(hvByLast3).join(', '));
  
  // Thống kê các giá trị trong cột last3 để debug
  const foundLast3Values = new Set();
  const sampleLast3Values = [];
  
  for (let i = 0; i < data.length; i++) {
    const colLast3Value = data[i][columnMapping.last3];
    if (!colLast3Value || colLast3Value === '') continue;
    
    // Ép kiểu int cho cột last3
    const colLast3Int = parseInt(colLast3Value, 10);
    if (isNaN(colLast3Int)) {
      // Log các giá trị không parse được (để debug)
      if (sampleLast3Values.length < 5) {
        sampleLast3Values.push('"' + String(colLast3Value) + '" (type: ' + typeof colLast3Value + ')');
      }
      continue;
    }
    
    foundLast3Values.add(colLast3Int);
    
    // Kiểm tra nếu colLast3 khớp với 3 số cuối của bất kỳ hv nào
    if (hvByLast3[colLast3Int] !== undefined) {
      const valueCol = data[i][columnMapping.value];
      
      // Gán giá trị cho tất cả hv có 3 số cuối này
      for (let j = 0; j < hvByLast3[colLast3Int].length; j++) {
        const hv = hvByLast3[colLast3Int][j];
        if (!dict[hv]) {
          dict[hv] = valueCol;
          Logger.log('Tìm thấy match: ' + hv + ' (last3_int=' + colLast3Int + ', colLast3Value="' + colLast3Value + '") -> valueCol=' + valueCol);
        }
      }
    }
  }
  
  // Log thống kê để debug
  const foundLast3Array = Array.from(foundLast3Values).sort((a, b) => a - b);
  _log('TỔNG HỢP HS', '3 số cuối có trong sheet (sample): ' + foundLast3Array.slice(0, 20).join(', ') + (foundLast3Array.length > 20 ? '... (tổng ' + foundLast3Array.length + ')' : ''));
  
  if (sampleLast3Values.length > 0) {
    _log('TỔNG HỢP HS', 'Giá trị không parse được (sample): ' + sampleLast3Values.join(', '));
  }
  
  const needToFind = Object.keys(hvByLast3).map(k => parseInt(k, 10));
  const notFound = needToFind.filter(v => !foundLast3Values.has(v));
  if (notFound.length > 0) {
    _log('TỔNG HỢP HS', '3 số cuối CẦN TÌM nhưng KHÔNG CÓ trong sheet: ' + notFound.join(', '));
  }
  
  _log('TỔNG HỢP HS', 'Kết quả: match ' + Object.keys(dict).length + ' HV. Keys: ' + Object.keys(dict).join(', '));
  _log('TỔNG HỢP HS', 'Kết quả: dict=' + JSON.stringify(dict));
  _log('TỔNG HỢP HS', '→ createStudentDictionary(hvArray.length=' + hvArray.length + ') trả về: ' + Object.keys(dict).length + ' entries');

  return dict;
}

// ======================================================
// PHẦN 5: matchAndGetScores - Match và lấy điểm từ "Tổng hợp BTVN"
// ======================================================

/**
 * Match hashid và mã học viên, lấy điểm và đánh giá
 * 
 * LOGIC:
 * 1. Duyệt qua sheet "Tổng hợp BTVN"
 * 2. Với mỗi dòng:
 *    - Kiểm tra hashid (cột D) có trong hashidArray không
 *    - Kiểm tra mã HV (cột E) có match với value trong studentDict không
 *      * Match chính xác: 68453203 === 68453203
 *      * Match theo 3 số cuối: "620" === "203" (nếu không match chính xác)
 * 3. Nếu cả 2 đều match -> lấy điểm (cột H) và đánh giá:
 *    - Không có điểm -> "Chưa làm BTVN Azota"
 *    - Điểm < 5 -> "Làm chưa đạt yêu cầu: X.X điểm"
 *    - Điểm 5-7 -> "Đã làm bài ở mức điểm khá: X.X điểm"
 *    - Điểm >= 7 -> "Đã làm bài tốt với: X.X điểm"
 * 4. Nếu 1 HV khớp nhiều dòng (nhiều bài) -> lấy bài điểm cao nhất để báo:
 *    - 2 bài đều chưa làm -> "Chưa làm BTVN Azota"
 *    - ≥1 bài khá/tốt -> báo theo bài điểm cao nhất (khá hoặc tốt)
 *    - 2 bài đều điểm thấp -> "Làm chưa đạt yêu cầu: X.X điểm" (điểm cao nhất trong 2)
 * 
 * @param {Spreadsheet} externalSS - Google Sheet ngoài
 * @param {Array} hashidArray - Mảng hashid
 * @param {Object} studentDict - Dictionary {hv: value_from_K}
 * @return {Object} - Dictionary {hv: result_string}
 */
function matchAndGetScores(externalSS, hashidArray, studentDict) {
  const tongHopBTVNSheet = externalSS.getSheetByName('Tổng hợp BTVN');
  if (!tongHopBTVNSheet) {
    throw new Error('Không tìm thấy sheet "Tổng hợp BTVN"');
  }
  
  // Tạo column mapping
  _log('TÌM CỘT', 'Tổng hợp BTVN: tìm hashid (D), hv (E), score (H)');
  const columnMapping = createColumnMapping(tongHopBTVNSheet, {
    hashid: ['D', 'Hashid', 'Hash ID', 'ID'],
    hv: ['E', 'Mã HV', 'Mã học viên', 'HV'],
    score: ['H', 'Điểm', 'Score', 'Điểm số']
  });
  
  // Fallback về index mặc định
  if (columnMapping.hashid === undefined) columnMapping.hashid = 3;  // Cột D
  if (columnMapping.hv === undefined) columnMapping.hv = 4;         // Cột E
  if (columnMapping.score === undefined) columnMapping.score = 7;   // Cột H
  
  _log('TÌM CỘT', 'Tổng hợp BTVN: hashid=index ' + columnMapping.hashid + ', hv=index ' + columnMapping.hv + ', score=index ' + columnMapping.score);
  
  const data = tongHopBTVNSheet.getDataRange().getValues();
  const results = {};
  
  // Tạo map hashid -> true để lookup nhanh
  const hashidMap = {};
  for (let i = 0; i < hashidArray.length; i++) {
    hashidMap[String(hashidArray[i]).trim()] = true;
  }
  
  _log('TỔNG HỢP BTVN', 'Duyệt ' + data.length + ' dòng. Hashid cần: ' + hashidArray.join(', ') + '. HV trong dict: ' + Object.keys(studentDict).join(', '));
  _log('TỔNG HỢP BTVN', 'Công thức đánh giá: colScore rỗng/NaN→"Chưa làm BTVN Azota"; score<5→"Chưa đạt"; 5≤score<7→"Khá"; score≥7→"Tốt". Nhiều bài→chọn score cao nhất.');

  let matchCount = 0;

  // Duyệt qua sheet "Tổng hợp BTVN"
  for (let i = 0; i < data.length; i++) {
    const colHashidValue = data[i][columnMapping.hashid];
    const colHvValue = data[i][columnMapping.hv];
    const colScoreValue = data[i][columnMapping.score];
    
    if (!colHashidValue || !colHvValue) continue;
    
    // Xử lý dữ liệu - chuyển sang chuỗi và trim
    let hashid = String(colHashidValue).trim();
    let hv = String(colHvValue).trim();
    
    // Kiểm tra hashid match
    const hashidMatch = hashidMap[hashid] === true;
    
    // Kiểm tra hv match
    let hvMatch = false;
    let matchedHV = null;
    
    // Thử match chính xác trước
    for (const dictKey in studentDict) {
      const dictValue = studentDict[dictKey];
      if (String(dictValue) === String(hv)) {
        hvMatch = true;
        matchedHV = dictKey;
        break;
      }
    }
    
    // Nếu không match chính xác, thử match theo 3 số cuối
    if (!hvMatch && hv.length >= 3) {
      const hvLast3 = String(hv).slice(-3);
      
      for (const dictKey in studentDict) {
        const dictValue = studentDict[dictKey];
        const dictValueStr = String(dictValue).trim();
        
        if (dictValueStr.length >= 3) {
          const dictValueLast3 = dictValueStr.slice(-3);
          
          if (dictValueLast3 === hvLast3) {
            hvMatch = true;
            matchedHV = dictKey;
            break;
          }
        }
      }
    }
    
    // Nếu cả 2 đều match -> lấy điểm và đánh giá
    if (hashidMatch && hvMatch) {
      matchCount++;
      Logger.log('Match ' + matchCount + ': hashid=' + hashid + ', hv_in_sheet=' + hv + ', matchedHV=' + matchedHV);

      let resultStr;
      var scoreForCompare = -1; // Chưa làm = -1 (thấp nhất) để so sánh "điểm"

      if (!colScoreValue || colScoreValue === '' || colScoreValue === null || colScoreValue === undefined) {
        resultStr = 'Chưa làm BTVN Azota';
      } else {
        const score = parseFloat(colScoreValue);
        if (isNaN(score)) {
          resultStr = 'Chưa làm BTVN Azota';
        } else {
          scoreForCompare = score;
          const roundedScore = score.toFixed(1);
          if (score < 5) {
            resultStr = 'Làm chưa đạt yêu cầu: ' + roundedScore + ' điểm';
          } else if (score < 7) {
            resultStr = 'Đã làm bài ở mức điểm khá: ' + roundedScore + ' điểm';
          } else {
            resultStr = 'Đã làm bài tốt với: ' + roundedScore + ' điểm';
          }
        }
      }

      _log('TỔNG HỢP BTVN', '  [dòng ' + (i + 1) + '] colScore=' + (colScoreValue === '' || colScoreValue == null ? 'rỗng' : colScoreValue) + ' → scoreForCompare=' + scoreForCompare + ' → resultStr="' + resultStr + '"');

      // Gom nhiều bài: lưu { result, score } để sau chọn bài điểm cao nhất
      if (!results[matchedHV]) results[matchedHV] = [];
      results[matchedHV].push({ result: resultStr, score: scoreForCompare });
    }
  }
  
  // Chuẩn hóa: 1 bài giữ nguyên; nhiều bài -> lấy bài có score cao nhất để báo
  for (const hv in results) {
    const arr = results[hv];
    if (Array.isArray(arr)) {
      if (arr.length === 1) {
        results[hv] = arr[0].result;
      } else {
        var best = arr[0];
        for (var idx = 1; idx < arr.length; idx++) {
          if (arr[idx].score > best.score) best = arr[idx];
        }
        results[hv] = best.result;
        _log('TỔNG HỢP BTVN', '  HV "' + hv + '": ' + arr.length + ' bài, scores=[' + arr.map(function (a) { return a.score; }).join(', ') + '] → chọn score max → result="' + best.result + '"');
      }
    }
  }

  _log('TỔNG HỢP BTVN', 'Kết quả: match ' + matchCount + ' dòng. results=' + JSON.stringify(results));
  _log('TỔNG HỢP BTVN', '→ matchAndGetScores trả về: ' + Object.keys(results).length + ' HV');

  return results;
}

// ======================================================
// PHẦN 6: writeResultsToBaoCao - Ghi kết quả về sheet
// ======================================================

/**
 * Ghi kết quả về cột result của sheet "BaoCao"
 * 
 * LOGIC:
 * 1. Tạo mảng giá trị để ghi
 * 2. Đánh dấu các dòng cần tô màu cam (Chưa làm hoặc Chưa đạt)
 * 3. Ghi tất cả cùng lúc nếu các dòng liên tiếp, hoặc ghi từng dòng
 * 4. Tô màu cam cho các ô cần thiết
 * 
 * @param {Sheet} baoCaoSheet - Sheet BaoCao
 * @param {Array} hvArray - Mảng mã học viên ban đầu
 * @param {Object} results - Dictionary {hv: result_string}
 * @param {Array} rowMapping - Mảng mapping index -> dòng thực tế
 * @param {Object} columnMapping - Column mapping object
 */
function writeResultsToBaoCao(baoCaoSheet, hvArray, results, rowMapping, columnMapping) {
  const valuesToWrite = [];
  const rowsToColor = []; // Lưu các dòng cần tô màu cam
  
  // Lấy column number cho cột result (1-based)
  const resultColNum = (columnMapping.result || 8) + 1; // index 8 = column 9 (I)
  
  _log('GHI KẾT QUẢ', 'Cột ghi: index ' + (columnMapping.result || 8) + ' → cột số ' + resultColNum);
  _log('GHI KẾT QUẢ', 'Công thức tô cam: result chứa "Chưa làm BTVN Azota" HOẶC "Làm chưa đạt yêu cầu"');

  for (let i = 0; i < hvArray.length; i++) {
    const hv = String(hvArray[i]).trim();
    const result = results[hv] || 'Không tìm thấy dữ liệu';
    valuesToWrite.push([result]);

    // Đánh dấu các dòng cần tô màu cam (kể cả khi nhiều bài: Bài 1: X, Bài 2: Chưa làm...)
    if (result.includes('Chưa làm BTVN Azota') || result.includes('Làm chưa đạt yêu cầu')) {
      rowsToColor.push(rowMapping[i]);
    }
  }

  _log('GHI KẾT QUẢ', 'Số dòng ghi: ' + valuesToWrite.length + ', số dòng tô cam: ' + rowsToColor.length + ', dòng: ' + rowMapping.join(', '));
  // Mẫu valuesToWrite để debug
  var sampleParts = valuesToWrite.slice(0, 3).map(function (v) {
    var t = String(v[0] || '');
    return '"' + t.slice(0, 50) + (t.length > 50 ? '...' : '') + '"';
  });
  var sample = sampleParts.join(' | ');
  if (valuesToWrite.length > 3) sample += ' ... [tổng ' + valuesToWrite.length + ']';
  _log('GHI KẾT QUẢ', 'Mẫu valuesToWrite: ' + sample);
  
  if (valuesToWrite.length > 0) {
    // Kiểm tra xem các dòng có liên tiếp không
    const sortedRows = [...rowMapping].sort((a, b) => a - b);
    const isConsecutive = sortedRows.every((row, index) => {
      if (index === 0) return true;
      return row === sortedRows[index - 1] + 1;
    });
    
    if (isConsecutive && sortedRows.length === valuesToWrite.length) {
      // Ghi tất cả cùng lúc (tối ưu)
      const firstRow = sortedRows[0];
      const range = baoCaoSheet.getRange(firstRow, resultColNum, valuesToWrite.length, 1);
      range.setValues(valuesToWrite);
      
      // Tô màu cam
      if (rowsToColor.length > 0) {
        rowsToColor.forEach(row => {
          baoCaoSheet.getRange(row, resultColNum).setBackground('#ff9800');
        });
      }
    } else {
      // Ghi từng dòng nếu không liên tiếp
      for (let i = 0; i < rowMapping.length; i++) {
        const cell = baoCaoSheet.getRange(rowMapping[i], resultColNum);
        cell.setValue(valuesToWrite[i][0]);
        
        // Tô màu cam (kể cả chuỗi nhiều bài: Bài 1: X, Bài 2: Chưa làm...)
        const resultValue = valuesToWrite[i][0];
        if (resultValue && (resultValue.includes('Chưa làm BTVN Azota') || resultValue.includes('Làm chưa đạt yêu cầu'))) {
          cell.setBackground('#ff9800');
        }
      }
    }
  }
  
  _log('GHI KẾT QUẢ', 'Kết quả: đã ghi ' + valuesToWrite.length + ' ô vào cột ' + resultColNum + ', tô cam ' + rowsToColor.length + ' ô.');
  _log('GHI KẾT QUẢ', '→ writeResultsToBaoCao hoàn thành. valuesToWrite.length=' + valuesToWrite.length + ', rowsToColor=' + JSON.stringify(rowsToColor));
}
