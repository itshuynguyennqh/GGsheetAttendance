/**
 * Chức năng: Tự động gộp TẤT CẢ các sheet có tên chứa "Tháng"
 * Hàm này sẽ tự động chạy khi có thay đổi trong spreadsheet
 * Sử dụng cache để tránh chạy quá nhiều lần trong thời gian ngắn
 */
function autoJoinAllMonthlySheets() {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const cache = CacheService.getScriptCache();
    const cacheKey = 'lastAutoJoinTime';
    
    // Kiểm tra cache - chỉ chạy lại nếu đã qua ít nhất 10 giây từ lần chạy trước
    const lastRun = cache.get(cacheKey);
    const now = Date.now();
    if (lastRun && (now - parseInt(lastRun)) < 10000) {
      Logger.log("Bỏ qua auto-join: vừa chạy cách đây chưa đủ 10 giây");
      return;
    }
    
    const sheets = ss.getSheets().map(s => s.getName());
    const monthlySheets = sheets.filter(name => name.includes("Tháng"));
    
    if (monthlySheets.length === 0) {
      Logger.log("Không tìm thấy sheet nào có tên chứa 'Tháng'");
      return;
    }
    
    // Lưu thời gian chạy vào cache
    cache.put(cacheKey, now.toString(), 60); // Cache 60 giây
    
    // Gọi hàm processJoinSheets với tất cả sheet "Tháng"
    processJoinSheets(monthlySheets);
    Logger.log("✅ Đã tự động gộp " + monthlySheets.length + " sheet: " + monthlySheets.join(", "));
  } catch (error) {
    Logger.log("❌ Lỗi khi tự động gộp sheet: " + error.toString());
    // Không throw error để tránh làm gián đoạn trigger
  }
}

/**
 * Chức năng: Kiểm tra xem tính năng tự động gộp có được bật không
 */
function isAutoJoinEnabled() {
  const properties = PropertiesService.getScriptProperties();
  return properties.getProperty('autoJoinEnabled') === 'true';
}

// ======================================================
// DEBOUNCE + QUEUE CHO INCREMENTAL UPDATES
// ======================================================

const DEBOUNCE_MS = 30000; // 30 giây
const QUEUE_KEY = 'pendingGopQueue';
const LAST_EDIT_TIME_KEY = 'lastGopEditTime';

/**
 * Lấy queue hiện tại từ PropertiesService
 */
function getPendingGopQueue() {
  const properties = PropertiesService.getScriptProperties();
  const queueStr = properties.getProperty(QUEUE_KEY);
  if (!queueStr) return [];
  try {
    return JSON.parse(queueStr);
  } catch (e) {
    Logger.log("⚠️ [getPendingGopQueue] Lỗi parse queue: " + e.toString());
    return [];
  }
}

/**
 * Lưu queue vào PropertiesService
 */
function setPendingGopQueue(queue) {
  const properties = PropertiesService.getScriptProperties();
  properties.setProperty(QUEUE_KEY, JSON.stringify(queue));
}

/**
 * Xóa queue
 */
function clearPendingGopQueue() {
  const properties = PropertiesService.getScriptProperties();
  properties.deleteProperty(QUEUE_KEY);
}

/**
 * Lấy thời gian edit cuối cùng
 */
function getLastGopEditTime() {
  const properties = PropertiesService.getScriptProperties();
  const timeStr = properties.getProperty(LAST_EDIT_TIME_KEY);
  return timeStr ? parseInt(timeStr, 10) : 0;
}

/**
 * Cập nhật thời gian edit cuối cùng
 */
function setLastGopEditTime() {
  const properties = PropertiesService.getScriptProperties();
  properties.setProperty(LAST_EDIT_TIME_KEY, Date.now().toString());
}

/**
 * Thêm edit vào queue (dedupe theo sheetName, row, col)
 */
function enqueueGopEdit(sheetName, row, col, type) {
  const queue = getPendingGopQueue();
  const key = `${sheetName}|${row}|${col}`;
  
  // Dedupe: xóa item cũ nếu có cùng key
  const filtered = queue.filter(item => `${item.sheetName}|${item.row}|${item.col}` !== key);
  
  // Thêm item mới
  filtered.push({ type, sheetName, row, col });
  
  setPendingGopQueue(filtered);
  setLastGopEditTime();
  
  Logger.log("📝 [enqueueGopEdit] Đã thêm vào queue: " + type + " - " + sheetName + " (" + row + "," + col + "). Tổng: " + filtered.length + " items");
}

/**
 * Chức năng: Xử lý auto-join khi có edit
 */
function handleAutoJoinEdit(e) {
  const startTime = Date.now();
  Logger.log("🔔 [handleAutoJoinEdit] Trigger được kích hoạt...");
  
  try {
    // Kiểm tra xem tính năng tự động có được bật không
    Logger.log("⚙️ [handleAutoJoinEdit] Đang kiểm tra tính năng auto-join có được bật...");
    if (!isAutoJoinEnabled()) {
      Logger.log("ℹ️ [handleAutoJoinEdit] Tính năng auto-join chưa được bật, bỏ qua");
      return;
    }
    Logger.log("✅ [handleAutoJoinEdit] Tính năng auto-join đã được bật");

    // Kiểm tra xem có thông tin về edit không
    if (!e || !e.source) {
      Logger.log("⚠️ [handleAutoJoinEdit] Không có thông tin edit event, bỏ qua");
      return;
    }

    Logger.log("📋 [handleAutoJoinEdit] Đang lấy thông tin sheet...");
    const sheet = e.source.getActiveSheet();
    if (!sheet) {
      Logger.log("⚠️ [handleAutoJoinEdit] Không lấy được active sheet, bỏ qua");
      return;
    }

    const sheetName = sheet.getName();
    Logger.log("📄 [handleAutoJoinEdit] Sheet được edit: '" + sheetName + "'");
    
    // Bỏ qua nếu đang edit trong sheet "Gộp_Nối_Tiếp" để tránh vòng lặp vô hạn
    if (sheetName === "Gộp_Nối_Tiếp") {
      Logger.log("⏭️ [handleAutoJoinEdit] Bỏ qua vì đang edit trong sheet 'Gộp_Nối_Tiếp' (tránh vòng lặp)");
      return;
    }

    // Chỉ xử lý nếu thay đổi trong sheet có tên chứa "Tháng"
    if (!sheetName.includes("Tháng")) {
      Logger.log("⏭️ [handleAutoJoinEdit] Sheet '" + sheetName + "' không chứa 'Tháng', bỏ qua");
      return;
    }
    
    // Lấy thông tin cell được edit
    if (!e.range) {
      Logger.log("⚠️ [handleAutoJoinEdit] Không có thông tin range, bỏ qua");
      return;
    }
    
    const range = e.range;
    const row = range.getRow();
    const col = range.getColumn();
    const cellAddress = range.getA1Notation();
    Logger.log("📍 [handleAutoJoinEdit] Cell được edit: " + cellAddress + " (Dòng " + row + ", Cột " + col + ")");
    
    // Phân loại theo cột: cột A (1) = student, cột B/C/D (2-4) = student, cột Buổi = attendance
    let type = null;
    
    if (col === 1) {
      // Cột A - Mã HV
      type = "student";
      Logger.log("📝 [handleAutoJoinEdit] Phân loại: STUDENT (cột A - Mã HV)");
    } else if (col >= 2 && col <= 4) {
      // Cột B/C/D - Họ tên, Tên, Lớp (coi là student)
      type = "student";
      Logger.log("📝 [handleAutoJoinEdit] Phân loại: STUDENT (cột " + col + " - thông tin học viên)");
    } else {
      // Kiểm tra xem có phải cột Buổi không
      const buoiCols = findBuoiColumns(sheet);
      const isBuoiCol = buoiCols.some(c => c.index + 1 === col); // col là 1-based, index là 0-based
      
      if (isBuoiCol) {
        type = "attendance";
        Logger.log("📝 [handleAutoJoinEdit] Phân loại: ATTENDANCE (cột " + col + " - Buổi)");
      } else {
        Logger.log("⏭️ [handleAutoJoinEdit] Cột " + col + " không phải cột quan trọng, bỏ qua");
        return;
      }
    }
    
    // Enqueue thay vì gọi autoJoinAllMonthlySheets ngay
    enqueueGopEdit(sheetName, row, col, type);
    Logger.log("✅ [handleAutoJoinEdit] Đã thêm vào queue, sẽ xử lý sau khi hết đếm ngược");
    
    const totalDuration = Date.now() - startTime;
    Logger.log("✅ [handleAutoJoinEdit] Hoàn thành sau " + (totalDuration / 1000).toFixed(2) + " giây");
  } catch (error) {
    const totalDuration = Date.now() - startTime;
    Logger.log("❌ [handleAutoJoinEdit] Lỗi sau " + (totalDuration / 1000).toFixed(2) + " giây: " + error.toString());
    Logger.log("❌ [handleAutoJoinEdit] Stack trace: " + error.stack);
  }
}

/**
 * Hàm cho installable trigger
 */
function onEditTrigger(e) {
  const startTime = Date.now();
  Logger.log("🚀 [onEditTrigger] Installable trigger được kích hoạt...");
  
  try {
    handleAutoJoinEdit(e);
    const duration = Date.now() - startTime;
    Logger.log("✅ [onEditTrigger] Hoàn thành sau " + (duration / 1000).toFixed(2) + " giây");
  } catch (error) {
    const duration = Date.now() - startTime;
    Logger.log("❌ [onEditTrigger] Lỗi sau " + (duration / 1000).toFixed(2) + " giây: " + error.toString());
    Logger.log("❌ [onEditTrigger] Stack trace: " + error.stack);
  }
}

/**
 * Simple trigger mặc định (nếu không cài installable trigger)
 */
function onEdit(e) {
  const startTime = Date.now();
  Logger.log("🚀 [onEdit] Simple trigger được kích hoạt...");
  
  try {
    handleAutoJoinEdit(e);
    const duration = Date.now() - startTime;
    Logger.log("✅ [onEdit] Hoàn thành sau " + (duration / 1000).toFixed(2) + " giây");
  } catch (error) {
    const duration = Date.now() - startTime;
    Logger.log("❌ [onEdit] Lỗi sau " + (duration / 1000).toFixed(2) + " giây: " + error.toString());
    Logger.log("❌ [onEdit] Stack trace: " + error.stack);
  }
}

/**
 * Chức năng: Thiết lập trigger tự động để gộp sheet khi có thay đổi
 * Chỉ cần chạy hàm này 1 lần để bật tính năng tự động
 * Sử dụng PropertiesService để lưu trạng thái bật/tắt
 */
function setupAutoJoinTrigger() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();

  // Lưu trạng thái "bật" vào PropertiesService
  const properties = PropertiesService.getScriptProperties();
  properties.setProperty('autoJoinEnabled', 'true');

  // Xóa trigger cũ nếu có
  const triggers = ScriptApp.getProjectTriggers();
  triggers.forEach(trigger => {
    if (trigger.getHandlerFunction() === 'onEditTrigger') {
      ScriptApp.deleteTrigger(trigger);
    }
  });

  // Tạo installable trigger cho spreadsheet (cần forSpreadsheet)
  ScriptApp.newTrigger('onEditTrigger')
    .forSpreadsheet(ss)
    .onEdit()
    .create();

  // Tạo time trigger cho processPendingGopQueue (mỗi 1 phút)
  const timeTriggers = ScriptApp.getProjectTriggers().filter(t => 
    t.getHandlerFunction() === 'processPendingGopQueue'
  );
  if (timeTriggers.length === 0) {
    ScriptApp.newTrigger('processPendingGopQueue')
      .timeBased()
      .everyMinutes(1)
      .create();
    Logger.log("✅ Đã tạo time trigger cho processPendingGopQueue (mỗi 1 phút)");
  } else {
    Logger.log("ℹ️ Time trigger cho processPendingGopQueue đã tồn tại");
  }

  SpreadsheetApp.getUi().alert('✅ Đã thiết lập tự động gộp sheet!\n\nHệ thống sẽ tự động cập nhật sheet "Gộp_Nối_Tiếp" khi có thay đổi trong các sheet "Tháng".\n\n⏱️ Có cơ chế debounce (30s) và queue để tối ưu hiệu suất.');

  // Chạy một lần ngay để cập nhật dữ liệu hiện tại
  autoJoinAllMonthlySheets();
}

/**
 * Chức năng: Tắt tính năng tự động gộp sheet
 */
function removeAutoJoinTrigger() {
  // Lưu trạng thái "tắt" vào PropertiesService
  const properties = PropertiesService.getScriptProperties();
  properties.setProperty('autoJoinEnabled', 'false');

  // Xóa installable trigger và time trigger
  const triggers = ScriptApp.getProjectTriggers();
  let removedEdit = 0;
  let removedTime = 0;
  triggers.forEach(trigger => {
    if (trigger.getHandlerFunction() === 'onEditTrigger') {
      ScriptApp.deleteTrigger(trigger);
      removedEdit++;
    } else if (trigger.getHandlerFunction() === 'processPendingGopQueue') {
      ScriptApp.deleteTrigger(trigger);
      removedTime++;
    }
  });

  // Xóa queue và lastEditTime
  clearPendingGopQueue();
  properties.deleteProperty(LAST_EDIT_TIME_KEY);

  const msg = '✅ Đã tắt tính năng tự động gộp sheet!\n\nĐã xóa ' + removedEdit + ' edit trigger và ' + removedTime + ' time trigger.';
  SpreadsheetApp.getUi().alert(msg);
}

/**
 * Chức năng: Chạy thủ công để gộp tất cả sheet "Tháng" ngay lập tức
 * Hàm này bỏ qua cache và chạy luôn, đồng thời tự động thiết lập trigger để cập nhật khi có thay đổi
 */
function manualJoinAllMonthlySheets() {
  const startTime = Date.now();
  Logger.log("🚀 [manualJoinAllMonthlySheets] Bắt đầu chạy...");
  
  try {
    Logger.log("📋 [manualJoinAllMonthlySheets] Đang lấy danh sách sheet...");
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheets = ss.getSheets().map(s => s.getName());
    const monthlySheets = sheets.filter(name => name.includes("Tháng"));
    
    Logger.log("📋 [manualJoinAllMonthlySheets] Tìm thấy " + monthlySheets.length + " sheet 'Tháng': " + monthlySheets.join(", "));
    
    if (monthlySheets.length === 0) {
      SpreadsheetApp.getUi().alert('Không tìm thấy sheet nào có tên chứa "Tháng"!');
      return;
    }
    
    // Kiểm tra xem đã có tính năng tự động được bật chưa
    Logger.log("⚙️ [manualJoinAllMonthlySheets] Đang kiểm tra cài đặt...");
    const properties = PropertiesService.getScriptProperties();
    const isEnabled = properties.getProperty('autoJoinEnabled') === 'true';
    
    // Gọi hàm processJoinSheets với tất cả sheet "Tháng"
    Logger.log("🔄 [manualJoinAllMonthlySheets] Bắt đầu gọi processJoinSheets...");
    const processStartTime = Date.now();
    const result = processJoinSheets(monthlySheets);
    const processDuration = Date.now() - processStartTime;
    Logger.log("✅ [manualJoinAllMonthlySheets] processJoinSheets hoàn thành sau " + (processDuration / 1000).toFixed(2) + " giây");
    
    // Nếu chưa có tính năng tự động được bật, tự động thiết lập
    if (!isEnabled) {
      Logger.log("⚙️ [manualJoinAllMonthlySheets] Đang thiết lập trigger tự động...");
      properties.setProperty('autoJoinEnabled', 'true');

      // Đảm bảo có installable trigger
      const triggers = ScriptApp.getProjectTriggers();
      const hasTrigger = triggers.some(t => t.getHandlerFunction() === 'onEditTrigger');
      if (!hasTrigger) {
        ScriptApp.newTrigger('onEditTrigger')
          .forSpreadsheet(ss)
          .onEdit()
          .create();
        Logger.log("✅ [manualJoinAllMonthlySheets] Đã tạo trigger mới");
      } else {
        Logger.log("ℹ️ [manualJoinAllMonthlySheets] Trigger đã tồn tại");
      }

      SpreadsheetApp.getUi().alert('✅ ' + result + '\n\n🔄 Đã tự động bật tính năng cập nhật tự động! Sheet sẽ tự động cập nhật khi có thay đổi trong các sheet "Tháng".');
    } else {
      SpreadsheetApp.getUi().alert('✅ ' + result);
    }
    
    const totalDuration = Date.now() - startTime;
    Logger.log("✅ [manualJoinAllMonthlySheets] Hoàn thành sau " + (totalDuration / 1000).toFixed(2) + " giây");
  } catch (error) {
    const totalDuration = Date.now() - startTime;
    Logger.log("❌ [manualJoinAllMonthlySheets] Lỗi sau " + (totalDuration / 1000).toFixed(2) + " giây: " + error.toString());
    Logger.log("❌ [manualJoinAllMonthlySheets] Stack trace: " + error.stack);
    SpreadsheetApp.getUi().alert('❌ Lỗi: ' + error.toString());
  }
}

// ======================================================
// BINARY SEARCH CHO INCREMENTAL UPDATES
// ======================================================

/**
 * So sánh một dòng Gộp với key (maHV, thang, buoi)
 * @return {number} -1 nếu row < key, 0 nếu bằng, 1 nếu row > key
 */
function compareGopRow(row, maHV, thang, buoi) {
  // So sánh Mã HV (cột 0)
  const maHVCompare = String(row[0] || '').localeCompare(String(maHV || ''));
  if (maHVCompare !== 0) return maHVCompare < 0 ? -1 : 1;
  
  // So sánh Tháng (cột 4)
  const thangCompare = String(row[4] || '').localeCompare(String(thang || ''));
  if (thangCompare !== 0) return thangCompare < 0 ? -1 : 1;
  
  // So sánh Buổi (cột 5) - số
  const buoiRow = Number(row[5]) || 0;
  const buoiKey = Number(buoi) || 0;
  if (buoiRow < buoiKey) return -1;
  if (buoiRow > buoiKey) return 1;
  return 0;
}

/**
 * Binary search trong mảng dataRows (đã sort) để tìm dòng có (maHV, thang, buoi)
 * @return {number} Index của dòng tìm thấy, hoặc -1 nếu không tìm thấy
 */
function binarySearchGop(dataRows, maHV, thang, buoi) {
  let left = 0;
  let right = dataRows.length - 1;
  
  while (left <= right) {
    const mid = Math.floor((left + right) / 2);
    const cmp = compareGopRow(dataRows[mid], maHV, thang, buoi);
    
    if (cmp === 0) {
      return mid; // Tìm thấy
    } else if (cmp < 0) {
      left = mid + 1;
    } else {
      right = mid - 1;
    }
  }
  
  return -1; // Không tìm thấy
}

/**
 * Binary search để tìm vị trí chèn (lower bound) cho dòng mới
 * @return {number} Index để chèn dòng mới (đảm bảo sort order)
 */
function binarySearchInsertPosition(dataRows, maHV, thang, buoi) {
  let left = 0;
  let right = dataRows.length;
  
  while (left < right) {
    const mid = Math.floor((left + right) / 2);
    const cmp = compareGopRow(dataRows[mid], maHV, thang, buoi);
    
    if (cmp < 0) {
      left = mid + 1;
    } else {
      right = mid;
    }
  }
  
  return left;
}

/**
 * Build long format rows từ một hoặc nhiều sheet Tháng (không ghi ra Gộp)
 * @param {Array<string>} sheetNames - Tên các sheet cần xử lý
 * @return {Array} Mảng các dòng long format [header, ...dataRows]
 */
function buildLongRowsForSheets(sheetNames) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const studentMap = {};
  const VALID_DIEM_DANH = { "M": "M", "B": "B", "X": "X", "P": "P" };
  
  function parseThangFromSheetName(name) {
    if (!name || typeof name !== "string") return "";
    const m = name.replace(/^Tháng\s*/i, "").trim();
    return m || "";
  }
  function parseBuoiFromHeader(header) {
    if (!header || typeof header !== "string") return null;
    const match = header.match(/Buổi\s*(\d+)/i);
    return match ? parseInt(match[1], 10) : null;
  }
  
  // Cache sheet objects và buoiColumns
  const sheetCache = {};
  sheetNames.forEach(sheetName => {
    const sheet = ss.getSheetByName(sheetName);
    if (!sheet) return;
    const buoiCols = findBuoiColumns(sheet);
    if (buoiCols.length === 0) return;
    const thang = parseThangFromSheetName(sheetName);
    sheetCache[sheetName] = { sheet, buoiCols, thang };
  });
  
  // Thu thập dữ liệu từ các sheet
  Object.keys(sheetCache).forEach(sheetName => {
    const cached = sheetCache[sheetName];
    const sheet = cached.sheet;
    const data = sheet.getDataRange().getValues();
    
    for (let i = 1; i < data.length; i++) {
      const row = data[i];
      const maHV = String(row[0] || '').trim();
      if (!maHV || /^Cột\s*\d+$/i.test(maHV)) continue;
      
      if (!studentMap[maHV]) {
        studentMap[maHV] = { info: [row[0], row[1], row[2], row[3]], rawAttendance: [] };
      }
      
      const monthAttendance = cached.buoiCols.map(col => {
        const cellValue = row[col.index];
        if (cellValue === "" || cellValue === null) return "";
        const buoiLabel = col.header || "Buổi";
        return sheetName + "||" + buoiLabel + "||" + cellValue;
      });
      studentMap[maHV].rawAttendance = studentMap[maHV].rawAttendance.concat(monthAttendance);
    }
  });
  
  // Build long format
  const allHeaders = ["Mã HV", "Họ tên", "Tên", "Lớp", "Tháng", "Buổi", "Điểm danh"];
  const finalData = [allHeaders];
  
  Object.keys(studentMap).forEach(id => {
    const info = studentMap[id].info;
    const raw = studentMap[id].rawAttendance;
    let colIdx = 0;
    
    Object.keys(sheetCache).forEach(sheetName => {
      const cached = sheetCache[sheetName];
      cached.buoiCols.forEach(col => {
        const val = raw[colIdx];
        colIdx++;
        if (val === undefined || val === null || String(val).trim() === "") return;
        const parts = String(val).split("||");
        const rawValue = parts.length >= 3 ? parts[2].trim() : String(val).trim();
        if (!rawValue) return;
        const normalizedValue = VALID_DIEM_DANH[rawValue.toUpperCase()] || "";
        if (!normalizedValue) return;
        const thang = cached.thang;
        const buoi = parseBuoiFromHeader(col.header);
        if (thang && buoi != null) {
          finalData.push([info[0], info[1], info[2], info[3], thang, buoi, normalizedValue]);
        }
      });
    });
  });
  
  // Sort data rows
  const header = finalData[0];
  const dataRows = finalData.slice(1);
  dataRows.sort((a, b) => {
    if (a[0] !== b[0]) return String(a[0]).localeCompare(String(b[0]));
    if (a[4] !== b[4]) return String(a[4]).localeCompare(String(b[4]));
    return (Number(a[5]) || 0) - (Number(b[5]) || 0);
  });
  
  return [header].concat(dataRows);
}

/**
 * Sync một sheet Tháng vào Gộp (thay thế tất cả dòng của tháng đó)
 */
function syncSingleMonthToGop(sheetName) {
  const startTime = Date.now();
  Logger.log("🔄 [syncSingleMonthToGop] Bắt đầu sync sheet: '" + sheetName + "'");
  
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const thang = sheetName.replace(/^Tháng\s*/i, "").trim();
    
    // Đọc Gộp hiện tại
    let destSheet = ss.getSheetByName("Gộp_Nối_Tiếp");
    if (!destSheet) {
      Logger.log("⚠️ [syncSingleMonthToGop] Sheet Gộp chưa tồn tại, gọi processJoinSheets...");
      const allSheets = ss.getSheets().map(s => s.getName()).filter(n => n.includes("Tháng"));
      processJoinSheets(allSheets);
      return;
    }
    
    const gopData = destSheet.getDataRange().getValues();
    if (gopData.length <= 1) {
      Logger.log("⚠️ [syncSingleMonthToGop] Gộp không có dữ liệu, gọi processJoinSheets...");
      const allSheets = ss.getSheets().map(s => s.getName()).filter(n => n.includes("Tháng"));
      processJoinSheets(allSheets);
      return;
    }
    
    const header = gopData[0];
    const otherMonthsRows = gopData.slice(1).filter(row => String(row[4] || '').trim() !== thang);
    
    // Build long rows cho sheet này
    const newMonthRows = buildLongRowsForSheets([sheetName]);
    const newDataRows = newMonthRows.slice(1); // Bỏ header
    
    // Nối và sort
    const allDataRows = otherMonthsRows.concat(newDataRows);
    allDataRows.sort((a, b) => {
      if (a[0] !== b[0]) return String(a[0]).localeCompare(String(b[0]));
      if (a[4] !== b[4]) return String(a[4]).localeCompare(String(b[4]));
      return (Number(a[5]) || 0) - (Number(b[5]) || 0);
    });
    
    const finalData = [header].concat(allDataRows);
    
    // Ghi lại Gộp
    destSheet.clear();
    const lastRow = finalData.length;
    const lastCol = finalData[0].length;
    const range = destSheet.getRange(1, 1, lastRow, lastCol);
    range.setValues(finalData);
    
    // Áp dụng định dạng
    applyGopFormatting(destSheet, lastRow, lastCol);
    
    const duration = Date.now() - startTime;
    Logger.log("✅ [syncSingleMonthToGop] Hoàn thành sync '" + sheetName + "' sau " + (duration / 1000).toFixed(2) + " giây");
  } catch (error) {
    Logger.log("❌ [syncSingleMonthToGop] Lỗi: " + error.toString());
    throw error;
  }
}

/**
 * Xử lý incremental update một ô điểm danh trong Gộp
 * @param {string} sheetName - Tên sheet Tháng
 * @param {number} row - Dòng trong sheet Tháng (1-based)
 * @param {number} col - Cột trong sheet Tháng (1-based)
 * @return {boolean} true nếu thành công, false nếu cần fallback
 */
function processIncrementalAttendanceUpdate(sheetName, row, col) {
  Logger.log("🔄 [processIncrementalAttendanceUpdate] Xử lý: " + sheetName + " (" + row + "," + col + ")");
  
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName(sheetName);
    if (!sheet) {
      Logger.log("⚠️ [processIncrementalAttendanceUpdate] Sheet không tồn tại");
      return false;
    }
    
    // Chiếu dọc: đọc dòng row để lấy thông tin học viên
    const lastCol = sheet.getLastColumn();
    const rowData = sheet.getRange(row, 1, row, lastCol).getValues()[0];
    const maHV = String(rowData[0] || '').trim();
    const hoTen = String(rowData[1] || '').trim();
    const ten = String(rowData[2] || '').trim();
    const lop = String(rowData[3] || '').trim();
    
    if (!maHV) {
      Logger.log("⚠️ [processIncrementalAttendanceUpdate] Không có Mã HV ở dòng " + row);
      return false;
    }
    
    // Chiếu ngang: đọc header để map col → buoi
    const headerRow = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
    const buoiCols = findBuoiColumns(sheet);
    const buoiCol = buoiCols.find(c => c.index + 1 === col); // col là 1-based, index là 0-based
    
    if (!buoiCol) {
      Logger.log("⚠️ [processIncrementalAttendanceUpdate] Cột " + col + " không phải cột Buổi");
      return false;
    }
    
    const buoi = parseInt(buoiCol.header.match(/Buổi\s*(\d+)/i)?.[1] || '0', 10);
    if (!buoi || buoi < 1) {
      Logger.log("⚠️ [processIncrementalAttendanceUpdate] Không parse được Buổi từ header: " + buoiCol.header);
      return false;
    }
    
    // Parse thang từ tên sheet
    const thang = sheetName.replace(/^Tháng\s*/i, "").trim();
    
    // Đọc giá trị ô mới
    const cellValue = sheet.getRange(row, col).getValue();
    const rawValue = String(cellValue || '').trim().toUpperCase();
    const VALID_DIEM_DANH = { "M": "M", "B": "B", "X": "X", "P": "P" };
    const normalizedValue = VALID_DIEM_DANH[rawValue] || "";
    
    // Đọc Gộp hiện tại
    let destSheet = ss.getSheetByName("Gộp_Nối_Tiếp");
    if (!destSheet) {
      Logger.log("⚠️ [processIncrementalAttendanceUpdate] Sheet Gộp chưa tồn tại");
      return false;
    }
    
    const gopData = destSheet.getDataRange().getValues();
    if (gopData.length <= 1) {
      Logger.log("⚠️ [processIncrementalAttendanceUpdate] Gộp không có dữ liệu");
      return false;
    }
    
    const header = gopData[0];
    const dataRows = gopData.slice(1);
    
    // Binary search để tìm dòng
    const index = binarySearchGop(dataRows, maHV, thang, buoi);
    
    if (normalizedValue === "") {
      // Xóa: ô trống hoặc không hợp lệ
      if (index >= 0) {
        dataRows.splice(index, 1);
        Logger.log("🗑️ [processIncrementalAttendanceUpdate] Đã xóa record: " + maHV + ", " + thang + ", Buổi " + buoi);
      } else {
        Logger.log("ℹ️ [processIncrementalAttendanceUpdate] Không tìm thấy record để xóa");
      }
    } else {
      // Thêm hoặc sửa
      const newRow = [maHV, hoTen, ten, lop, thang, buoi, normalizedValue];
      
      if (index >= 0) {
        // Sửa: cập nhật giá trị
        dataRows[index][6] = normalizedValue;
        Logger.log("✏️ [processIncrementalAttendanceUpdate] Đã sửa record: " + maHV + ", " + thang + ", Buổi " + buoi + " = " + normalizedValue);
      } else {
        // Thêm: tìm vị trí chèn
        const insertIdx = binarySearchInsertPosition(dataRows, maHV, thang, buoi);
        dataRows.splice(insertIdx, 0, newRow);
        Logger.log("➕ [processIncrementalAttendanceUpdate] Đã thêm record: " + maHV + ", " + thang + ", Buổi " + buoi + " = " + normalizedValue);
      }
    }
    
    // Ghi lại Gộp
    const finalData = [header].concat(dataRows);
    destSheet.clear();
    const lastRow = finalData.length;
    const numCols = finalData[0].length;
    destSheet.getRange(1, 1, lastRow, numCols).setValues(finalData);
    
    // Áp dụng định dạng
    applyGopFormatting(destSheet, lastRow, numCols);
    
    Logger.log("✅ [processIncrementalAttendanceUpdate] Hoàn thành");
    return true;
  } catch (error) {
    Logger.log("❌ [processIncrementalAttendanceUpdate] Lỗi: " + error.toString());
    return false;
  }
}

/**
 * Xử lý queue các edit đang chờ (được gọi bởi time trigger)
 */
function processPendingGopQueue() {
  const startTime = Date.now();
  Logger.log("⏰ [processPendingGopQueue] Bắt đầu kiểm tra queue...");
  
  try {
    const queue = getPendingGopQueue();
    const lastEditTime = getLastGopEditTime();
    const now = Date.now();
    
    if (queue.length === 0) {
      Logger.log("ℹ️ [processPendingGopQueue] Queue rỗng, bỏ qua");
      return;
    }
    
    const timeSinceLastEdit = now - lastEditTime;
    if (timeSinceLastEdit < DEBOUNCE_MS) {
      Logger.log("⏳ [processPendingGopQueue] Chưa hết đếm ngược (" + (timeSinceLastEdit / 1000).toFixed(1) + "s / " + (DEBOUNCE_MS / 1000) + "s), bỏ qua");
      return;
    }
    
    Logger.log("🔄 [processPendingGopQueue] Bắt đầu xử lý " + queue.length + " items trong queue...");
    
    // Gom theo sheet
    const bySheet = {};
    queue.forEach(item => {
      if (!bySheet[item.sheetName]) {
        bySheet[item.sheetName] = { student: [], attendance: [] };
      }
      if (item.type === 'student') {
        bySheet[item.sheetName].student.push(item);
      } else {
        bySheet[item.sheetName].attendance.push(item);
      }
    });
    
    // Xử lý từng sheet
    const sheetsToSync = new Set();
    const attendanceItems = [];
    
    Object.keys(bySheet).forEach(sheetName => {
      const sheetData = bySheet[sheetName];
      if (sheetData.student.length > 0) {
        // Có student edit → sync toàn bộ sheet, bỏ qua attendance của sheet đó
        sheetsToSync.add(sheetName);
        Logger.log("📋 [processPendingGopQueue] Sheet '" + sheetName + "': có " + sheetData.student.length + " student edits → sẽ sync toàn bộ");
      } else {
        // Chỉ có attendance → xử lý incremental
        attendanceItems.push(...sheetData.attendance);
        Logger.log("📋 [processPendingGopQueue] Sheet '" + sheetName + "': có " + sheetData.attendance.length + " attendance edits → sẽ xử lý incremental");
      }
    });
    
    // Sync các sheet có student edit
    sheetsToSync.forEach(sheetName => {
      try {
        syncSingleMonthToGop(sheetName);
      } catch (error) {
        Logger.log("❌ [processPendingGopQueue] Lỗi sync sheet '" + sheetName + "': " + error.toString());
      }
    });
    
    // Xử lý incremental attendance (chỉ cho các sheet không có student edit)
    let successCount = 0;
    let failCount = 0;
    attendanceItems.forEach(item => {
      const success = processIncrementalAttendanceUpdate(item.sheetName, item.row, item.col);
      if (success) {
        successCount++;
      } else {
        failCount++;
        Logger.log("⚠️ [processPendingGopQueue] Không xử lý được: " + item.sheetName + " (" + item.row + "," + item.col + ")");
      }
    });
    
    // Xóa queue
    clearPendingGopQueue();
    
    const duration = Date.now() - startTime;
    Logger.log("✅ [processPendingGopQueue] Hoàn thành sau " + (duration / 1000).toFixed(2) + " giây");
    Logger.log("📊 [processPendingGopQueue] Kết quả: " + sheetsToSync.size + " sheet sync, " + successCount + " attendance thành công, " + failCount + " attendance thất bại");
  } catch (error) {
    Logger.log("❌ [processPendingGopQueue] Lỗi: " + error.toString());
    Logger.log("❌ [processPendingGopQueue] Stack: " + error.stack);
  }
}

/**
 * Áp dụng định dạng cho sheet Gộp (tách riêng để dùng lại)
 */
function applyGopFormatting(destSheet, lastRow, lastCol) {
  if (lastRow <= 1) {
    destSheet.getRange(1, 1, 1, lastCol).setBackground("#cccccc").setFontWeight("bold");
    return;
  }
  
  const range = destSheet.getRange(1, 1, lastRow, lastCol);
  range.setBorder(true, true, true, true, true, true, "#cccccc", SpreadsheetApp.BorderStyle.SOLID);
  
  const diemDanhCol = 7;
  const diemDanhRange = destSheet.getRange(2, diemDanhCol, lastRow - 1, 1);
  diemDanhRange.setHorizontalAlignment("center");
  
  destSheet.getRange(1, 1, 1, lastCol)
           .setBackground("#38761d")
           .setFontColor("white")
           .setFontWeight("bold")
           .setHorizontalAlignment("center");
  
  const rules = [];
  rules.push(SpreadsheetApp.newConditionalFormatRule()
    .whenTextEqualTo("X")
    .setBackground("#6aa84f")
    .setFontColor("#ffffff")
    .setRanges([diemDanhRange])
    .build());
  rules.push(SpreadsheetApp.newConditionalFormatRule()
    .whenTextEqualTo("B")
    .setBackground("#6aa84f")
    .setFontColor("#ffffff")
    .setRanges([diemDanhRange])
    .build());
  rules.push(SpreadsheetApp.newConditionalFormatRule()
    .whenTextEqualTo("M")
    .setBackground("#6aa84f")
    .setFontColor("#ffffff")
    .setRanges([diemDanhRange])
    .build());
  rules.push(SpreadsheetApp.newConditionalFormatRule()
    .whenTextEqualTo("P")
    .setBackground("#ea4335")
    .setFontColor("#ffffff")
    .setRanges([diemDanhRange])
    .build());
  destSheet.setConditionalFormatRules(rules);
  
  destSheet.setFrozenColumns(4);
  destSheet.setFrozenRows(1);
}

/**
 * Chức năng: Tìm các cột có header bắt đầu bằng "Buổi" trong sheet
 * @param {Sheet} sheet - Sheet cần kiểm tra
 * @return {Array} Mảng các cột { index, header } đã sắp xếp theo thứ tự
 */
function findBuoiColumns(sheet) {
  const lastCol = sheet.getLastColumn();
  if (lastCol === 0) return [];

  const headerRow = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
  const buoiColumns = [];

  for (let col = 0; col < headerRow.length; col++) {
    const headerValue = String(headerRow[col]).trim();
    // Kiểm tra nếu header bắt đầu bằng "Buổi" (không phân biệt hoa thường)
    if (headerValue && headerValue.toUpperCase().startsWith("BUỔI")) {
      buoiColumns.push({ index: col, header: headerValue });
    }
  }

  return buoiColumns;
}

/**
 * Chức năng: Gộp dữ liệu, dồn buổi và tự động định dạng bảng biểu
 * Tự động phát hiện các cột có header bắt đầu bằng "Buổi"
 */
function processJoinSheets(selectedSheets) {
  const startTime = Date.now();
  Logger.log("🔄 [processJoinSheets] Bắt đầu xử lý " + selectedSheets.length + " sheet...");
  
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const studentMap = {}; 

  if (!selectedSheets || selectedSheets.length === 0) {
    throw new Error("Vui lòng chọn ít nhất một sheet!");
  }

  // 1. Sắp xếp các sheet theo thời gian
  Logger.log("📊 [processJoinSheets] Đang sắp xếp sheet theo thời gian...");
  selectedSheets.sort((a, b) => {
    const parseDate = (name) => {
      const parts = name.replace("Tháng ", "").split(".");
      return new Date(parts[1], parts[0] - 1);
    };
    return parseDate(a) - parseDate(b);
  });
  Logger.log("✅ [processJoinSheets] Đã sắp xếp xong");

  // 2. Thu thập dữ liệu - tự động phát hiện cột "Buổi"
  Logger.log("📥 [processJoinSheets] Bắt đầu thu thập dữ liệu từ các sheet...");
  let totalBuoiColumns = 0;
  let sheetIndex = 0;
  
  selectedSheets.forEach(sheetName => {
    sheetIndex++;
    const sheetStartTime = Date.now();
    Logger.log("📄 [processJoinSheets] Đang xử lý sheet " + sheetIndex + "/" + selectedSheets.length + ": '" + sheetName + "'...");
    
    const sheet = ss.getSheetByName(sheetName);
    if (!sheet) {
      Logger.log("⚠️ [processJoinSheets] Sheet '" + sheetName + "' không tồn tại, bỏ qua");
      return;
    }
    
    // Tìm các cột có header bắt đầu bằng "Buổi"
    const buoiColumns = findBuoiColumns(sheet);
    if (buoiColumns.length === 0) {
      Logger.log("⚠️ Sheet '" + sheetName + "' không có cột nào bắt đầu bằng 'Buổi'");
      return;
    }
    
    totalBuoiColumns += buoiColumns.length;
    Logger.log("📋 Sheet '" + sheetName + "': Tìm thấy " + buoiColumns.length + " cột 'Buổi'");
    
    Logger.log("📊 [processJoinSheets] Đang đọc dữ liệu từ sheet '" + sheetName + "'...");
    const data = sheet.getDataRange().getValues();
    Logger.log("📊 [processJoinSheets] Sheet '" + sheetName + "' có " + data.length + " dòng dữ liệu");
    
    let processedRows = 0;
    for (let i = 1; i < data.length; i++) {
      const row = data[i];
      const maHV = String(row[0] || '').trim();
      if (!maHV) continue;
      // Bỏ qua hàng template/placeholder (vd: "Cột 1", "cột 2"...) — không phải Mã HV thật
      if (/^Cột\s*\d+$/i.test(maHV)) continue;
      
      if (!studentMap[maHV]) {
        studentMap[maHV] = { info: [row[0], row[1], row[2], row[3]], rawAttendance: [] };
      }
      
      // Chỉ lấy dữ liệu từ các cột có header bắt đầu bằng "Buổi"
      // Ghi kèm tháng + tên buổi để dễ split lại khi phân tích
      const monthAttendance = buoiColumns.map(col => {
        const cellValue = row[col.index];
        if (cellValue === "" || cellValue === null) return "";
        const buoiLabel = col.header || "Buổi";
        return sheetName + "||" + buoiLabel + "||" + cellValue;
      });
      studentMap[maHV].rawAttendance = studentMap[maHV].rawAttendance.concat(monthAttendance);
      processedRows++;
      
      // Log tiến độ mỗi 100 dòng
      if (processedRows % 100 === 0) {
        Logger.log("⏳ [processJoinSheets] Sheet '" + sheetName + "': Đã xử lý " + processedRows + " dòng...");
      }
    }
    
    const sheetDuration = Date.now() - sheetStartTime;
    Logger.log("✅ [processJoinSheets] Hoàn thành sheet '" + sheetName + "' sau " + (sheetDuration / 1000).toFixed(2) + " giây (" + processedRows + " dòng)");
  });
  
  Logger.log("✅ Tổng số cột 'Buổi' từ tất cả sheet: " + totalBuoiColumns);
  Logger.log("✅ Tổng số học viên đã thu thập: " + Object.keys(studentMap).length);
  
  // Kiểm tra nếu không tìm thấy cột "Buổi" nào
  if (totalBuoiColumns === 0) {
    throw new Error("Không tìm thấy cột nào có header bắt đầu bằng 'Buổi' trong các sheet đã chọn!");
  }

  // 3. Chuẩn bị dữ liệu dạng long: 1 dòng = 1 record điểm danh
  // Thêm/sửa/xóa trên sheet Tháng được phản ánh lên Gộp qua trigger onEdit -> autoJoinAllMonthlySheets -> processJoinSheets (rebuild từ đầu).
  Logger.log("🔄 [processJoinSheets] Bắt đầu chuẩn bị dữ liệu dạng long...");
  // Cấu trúc: Mã HV | Họ tên | Tên | Lớp | Tháng (M.YYYY) | Buổi (số) | Điểm danh (M/B/X/P)
  const allHeaders = ["Mã HV", "Họ tên", "Tên", "Lớp", "Tháng", "Buổi", "Điểm danh"];
  let finalData = [allHeaders];
  const VALID_DIEM_DANH = { "M": "M", "B": "B", "X": "X", "P": "P" };

  function parseThangFromSheetName(name) {
    if (!name || typeof name !== "string") return "";
    const m = name.replace(/^Tháng\s*/i, "").trim();
    return m || "";
  }
  function parseBuoiFromHeader(header) {
    if (!header || typeof header !== "string") return null;
    const match = header.match(/Buổi\s*(\d+)/i);
    return match ? parseInt(match[1], 10) : null;
  }

  // TỐI ƯU: Cache sheet objects và buoiColumns trước khi vào vòng lặp học viên
  // Tránh gọi getSheetByName() và findBuoiColumns() hàng nghìn lần
  Logger.log("⚡ [processJoinSheets] Đang cache sheet objects và buoiColumns...");
  const cacheStartTime = Date.now();
  const sheetCache = {}; // { sheetName: { sheet, buoiCols, thang } }
  
  selectedSheets.forEach(sheetName => {
    const sheet = ss.getSheetByName(sheetName);
    if (!sheet) {
      Logger.log("⚠️ [processJoinSheets] Sheet '" + sheetName + "' không tồn tại, bỏ qua");
      return;
    }
    const buoiCols = findBuoiColumns(sheet);
    if (buoiCols.length === 0) {
      Logger.log("⚠️ [processJoinSheets] Sheet '" + sheetName + "' không có cột Buổi, bỏ qua");
      return;
    }
    const thang = parseThangFromSheetName(sheetName);
    sheetCache[sheetName] = {
      sheet: sheet,
      buoiCols: buoiCols,
      thang: thang
    };
  });
  
  const cacheDuration = Date.now() - cacheStartTime;
  Logger.log("✅ [processJoinSheets] Đã cache " + Object.keys(sheetCache).length + " sheet sau " + (cacheDuration / 1000).toFixed(2) + " giây");

  const studentIds = Object.keys(studentMap);
  Logger.log("🔄 [processJoinSheets] Đang xử lý " + studentIds.length + " học viên để tạo dữ liệu long format...");
  let studentIndex = 0;
  const processDataStartTime = Date.now();
  let lastLogTime = processDataStartTime;
  
  studentIds.forEach(id => {
    studentIndex++;
    const info = studentMap[id].info;
    const raw = studentMap[id].rawAttendance;
    let colIdx = 0;
    
    // Sử dụng cache thay vì gọi getSheetByName() và findBuoiColumns() mỗi lần
    Object.keys(sheetCache).forEach(sheetName => {
      const cached = sheetCache[sheetName];
      cached.buoiCols.forEach(col => {
        const val = raw[colIdx];
        colIdx++;
        if (val === undefined || val === null || String(val).trim() === "") return;
        const parts = String(val).split("||");
        const rawValue = parts.length >= 3 ? parts[2].trim() : String(val).trim();
        if (!rawValue) return;
        const normalizedValue = VALID_DIEM_DANH[rawValue.toUpperCase()] || "";
        if (!normalizedValue) return;
        const thang = cached.thang;
        const buoi = parseBuoiFromHeader(col.header);
        if (thang && buoi != null) {
          finalData.push([info[0], info[1], info[2], info[3], thang, buoi, normalizedValue]);
        }
      });
    });
    
    // Log tiến độ: mỗi 25 học viên hoặc mỗi 5 giây (tùy điều kiện nào đến trước)
    const now = Date.now();
    const elapsed = now - processDataStartTime;
    const timeSinceLastLog = now - lastLogTime;
    const shouldLog = (studentIndex % 25 === 0) || (timeSinceLastLog >= 5000) || (studentIndex === 1) || (studentIndex === studentIds.length);
    
    if (shouldLog) {
      const progressPercent = ((studentIndex / studentIds.length) * 100).toFixed(1);
      const speed = studentIndex / (elapsed / 1000); // học viên/giây
      const remaining = studentIds.length - studentIndex;
      const estimatedTimeLeft = remaining / speed; // giây
      
      Logger.log("⏳ [processJoinSheets] Tiến độ: " + studentIndex + "/" + studentIds.length + " học viên (" + progressPercent + "%) | " + 
                 "Đã qua: " + (elapsed / 1000).toFixed(2) + "s | " +
                 "Tốc độ: " + speed.toFixed(1) + " HV/s | " +
                 "Còn lại: ~" + estimatedTimeLeft.toFixed(1) + "s");
      lastLogTime = now;
    }
  });
  
  const processDataDuration = Date.now() - processDataStartTime;
  Logger.log("✅ [processJoinSheets] Hoàn thành chuẩn bị dữ liệu sau " + (processDataDuration / 1000).toFixed(2) + " giây");
  Logger.log("📊 [processJoinSheets] Tổng số record trong finalData: " + finalData.length);

  // 3.5. Sắp xếp dữ liệu theo (Mã HV, Tháng, Buổi) để hỗ trợ binary search
  Logger.log("📊 [processJoinSheets] Đang sắp xếp dữ liệu theo (Mã HV, Tháng, Buổi)...");
  const sortStartTime = Date.now();
  const header = finalData[0];
  const dataRows = finalData.slice(1);
  dataRows.sort((a, b) => {
    // So sánh Mã HV (cột 0)
    if (a[0] !== b[0]) return String(a[0]).localeCompare(String(b[0]));
    // So sánh Tháng (cột 4)
    if (a[4] !== b[4]) return String(a[4]).localeCompare(String(b[4]));
    // So sánh Buổi (cột 5) - số
    return (Number(a[5]) || 0) - (Number(b[5]) || 0);
  });
  finalData = [header].concat(dataRows);
  const sortDuration = Date.now() - sortStartTime;
  Logger.log("✅ [processJoinSheets] Đã sắp xếp " + dataRows.length + " dòng sau " + (sortDuration / 1000).toFixed(2) + " giây");

  // 4. Xuất dữ liệu ra sheet
  Logger.log("💾 [processJoinSheets] Bắt đầu ghi dữ liệu ra sheet 'Gộp_Nối_Tiếp'...");
  const writeStartTime = Date.now();
  
  let destSheet = ss.getSheetByName("Gộp_Nối_Tiếp");
  if (!destSheet) { 
    destSheet = ss.insertSheet("Gộp_Nối_Tiếp");
    Logger.log("📄 [processJoinSheets] Đã tạo sheet mới 'Gộp_Nối_Tiếp'");
  } else { 
    destSheet.clear();
    Logger.log("📄 [processJoinSheets] Đã xóa dữ liệu cũ trong sheet 'Gộp_Nối_Tiếp'");
  }

  const lastRow = finalData.length;
  const lastCol = finalData[0].length;
  Logger.log("📊 [processJoinSheets] Đang ghi " + lastRow + " dòng x " + lastCol + " cột...");
  
  const range = destSheet.getRange(1, 1, lastRow, lastCol);
  range.setValues(finalData);
  
  const writeDuration = Date.now() - writeStartTime;
  Logger.log("✅ [processJoinSheets] Đã ghi dữ liệu xong sau " + (writeDuration / 1000).toFixed(2) + " giây");

  // 5. THIẾT LẬP ĐỊNH DẠNG (Chỉ chạy khi có ít nhất 1 record)
  Logger.log("🎨 [processJoinSheets] Bắt đầu định dạng sheet...");
  const formatStartTime = Date.now();
  
  applyGopFormatting(destSheet, lastRow, lastCol);
  
  const formatDuration = Date.now() - formatStartTime;
  Logger.log("✅ [processJoinSheets] Hoàn thành định dạng sau " + (formatDuration / 1000).toFixed(2) + " giây");
  
  if (lastRow <= 1) {
    const totalDuration = Date.now() - startTime;
    Logger.log("⚠️ [processJoinSheets] Không có dữ liệu. Tổng thời gian: " + (totalDuration / 1000).toFixed(2) + " giây");
    return "Cảnh báo: Không tìm thấy dữ liệu học viên trong các sheet đã chọn.";
  }

  // 6. Tự động cập nhật dashboard nếu đã tồn tại
  try {
    Logger.log("🔄 [processJoinSheets] Kiểm tra dashboard...");
    const dashboardSheet = ss.getSheetByName("Dashboard_Streak");
    if (dashboardSheet) {
      Logger.log("🔄 [processJoinSheets] Đang cập nhật Dashboard Streak...");
      // Cập nhật dashboard trong background (không chặn UI)
      Utilities.sleep(500); // Đợi một chút để đảm bảo dữ liệu đã được ghi
      const dashboardStartTime = Date.now();
      updateStreakDashboard();
      const dashboardDuration = Date.now() - dashboardStartTime;
      Logger.log("✅ [processJoinSheets] Đã tự động cập nhật Dashboard Streak sau " + (dashboardDuration / 1000).toFixed(2) + " giây");
    } else {
      Logger.log("ℹ️ [processJoinSheets] Không tìm thấy Dashboard_Streak, bỏ qua");
    }
  } catch (error) {
    // Không throw error để tránh làm gián đoạn quá trình gộp sheet
    Logger.log("⚠️ Không thể tự động cập nhật dashboard: " + error.toString());
  }
  
  const totalDuration = Date.now() - startTime;
  Logger.log("✅ [processJoinSheets] Hoàn thành toàn bộ sau " + (totalDuration / 1000).toFixed(2) + " giây");
  
  return "Đã gộp và định dạng thành công " + (lastRow - 1) + " record điểm danh!";
}


/**
 * Phân tích streak từ sheet Gộp_Nối_Tiếp (long format).
 * Ghi kết quả ra sheet "Streak_Tổng hợp" – 1 dòng = 1 học sinh.
 */
function analyzeAttendanceStreaks() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName("Gộp_Nối_Tiếp");
  if (!sheet) return;

  const data = sheet.getDataRange().getValues();
  const header = data[0];
  if (!header || header.length < 7) {
    SpreadsheetApp.getUi().alert("Sheet Gộp_Nối_Tiếp cần format long: Mã HV, Họ tên, Tên, Lớp, Tháng, Buổi, Điểm danh.");
    return;
  }
  const colThang = 4, colBuoi = 5, colDiemDanh = 6;

  const byStudent = {};
  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    const maHV = row[0];
    if (!maHV) continue;
    const thang = String(row[colThang] || "").trim();
    const buoi = parseInt(row[colBuoi], 10);
    const val = String(row[colDiemDanh] || "").trim();
    if (!thang || isNaN(buoi)) continue;
    if (!byStudent[maHV]) byStudent[maHV] = { info: [row[0], row[1], row[2], row[3]], recs: [] };
    byStudent[maHV].recs.push({ thang, buoi, val });
  }

  const parseThang = (t) => {
    const p = String(t || "").trim().split(/[.\/]/);
    return { month: parseInt(p[0], 10) || 0, year: parseInt(p[1], 10) || 0 };
  };
  const cmp = (a, b) => {
    const pa = parseThang(a.thang), pb = parseThang(b.thang);
    if (pa.year !== pb.year) return pa.year - pb.year;
    if (pa.month !== pb.month) return pa.month - pb.month;
    return (a.buoi || 0) - (b.buoi || 0);
  };

  const isAttend = (v) => ["X", "B", "M"].includes(String(v).trim().toUpperCase());
  const isAbsence = (v) => String(v).trim().toUpperCase() === "P";

  const results = [["Mã HV", "Họ tên", "Tên", "Lớp", "Streak hiện tại", "Chuỗi đi học Max", "Chuỗi nghỉ Max"]];

  for (const maHV in byStudent) {
    const st = byStudent[maHV];
    st.recs.sort(cmp);
    const vals = st.recs.map(r => r.val).filter(v => ["X", "B", "M", "P"].includes(String(v).trim().toUpperCase()));

    let maxAttend = 0, currentAttend = 0, maxAbsence = 0, currentAbsence = 0, latestStreak = 0;
    vals.forEach(v => {
      if (isAttend(v)) {
        currentAttend++;
        currentAbsence = 0;
        if (currentAttend > maxAttend) maxAttend = currentAttend;
      } else if (isAbsence(v)) {
        currentAbsence++;
        currentAttend = 0;
        if (currentAbsence > maxAbsence) maxAbsence = currentAbsence;
      }
    });
    if (vals.length > 0) {
      const last = vals[vals.length - 1];
      let j = vals.length - 1;
      while (j >= 0 && (isAttend(vals[j]) === isAttend(last))) { latestStreak++; j--; }
      if (!isAttend(last)) latestStreak = -latestStreak;
    }

    results.push([...st.info, latestStreak, maxAttend, maxAbsence]);
  }

  let outSheet = ss.getSheetByName("Streak_Tổng hợp");
  if (!outSheet) outSheet = ss.insertSheet("Streak_Tổng hợp");
  outSheet.clear();
  outSheet.getRange(1, 1, results.length, 7).setValues(results);
  outSheet.getRange(1, 1, 1, 7).setBackground("#45818e").setFontColor("white").setFontWeight("bold");
  outSheet.autoResizeColumns(1, 7);
  const streakCol = outSheet.getRange(2, 5, results.length, 5);
  outSheet.setConditionalFormatRules([
    SpreadsheetApp.newConditionalFormatRule().whenNumberGreaterThan(0).setBackground("#b7e1cd").setRanges([streakCol]).build(),
    SpreadsheetApp.newConditionalFormatRule().whenNumberLessThan(0).setBackground("#f4cccc").setRanges([streakCol]).build()
  ]);

  SpreadsheetApp.getUi().alert("Đã phân tích xong Streak cho " + (results.length - 1) + " học sinh! (Sheet Streak_Tổng hợp)");
}