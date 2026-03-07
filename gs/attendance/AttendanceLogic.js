function processAttendanceExport(startRow, endRow, sessionNumber, selectedColumn) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sourceSheet = ss.getActiveSheet();
  const destSheet = ss.getSheetByName("BaoCao");
  
  if (!destSheet) throw new Error("Không tìm thấy sheet 'BaoCao'!");

  // 1. Cấu hình màu mới theo yêu cầu
  const TARGET_COLOR = "#6aa84f"; 

  // Xác định cột của buổi
  let colIndex = -1;
  
  // Nếu có cột được chọn, sử dụng cột đó
  if (selectedColumn) {
    colIndex = selectedColumn;
  } else {
    // Nếu không, tìm cột theo số buổi (tương thích ngược)
    const headerRange = sourceSheet.getRange("E1:N1").getValues()[0];
    for (let i = 0; i < headerRange.length; i++) {
      if (headerRange[i] == "Buổi " + sessionNumber) {
        colIndex = i + 5; 
        break;
      }
    }
  }
  
  if (colIndex === -1) throw new Error("Không tìm thấy cột 'Buổi " + sessionNumber + "'");

  // 2. Lấy dữ liệu
  const numRows = endRow - startRow + 1;
  const values = sourceSheet.getRange(startRow, 1, numRows, colIndex).getValues();
  const backgrounds = sourceSheet.getRange(startRow, colIndex, numRows, 1).getBackgrounds();
  
  let extractedData = [];

  for (let i = 0; i < values.length; i++) {
    let cellValue = values[i][colIndex - 1];
    let cellColor = backgrounds[i][0].toLowerCase();
    
    var valUpper = cellValue.toString().toUpperCase().trim();
    if ((valUpper === "X" || valUpper === "M") && cellColor === TARGET_COLOR) {
      extractedData.push({
        ma: values[i][0],
        hoTen: values[i][1],
        ten: values[i][2],
        lop: values[i][3]
      });
    }
  }

  if (extractedData.length === 0) return "Không tìm thấy dữ liệu khớp màu #6aa84f.";

  // Sắp xếp theo Tên
  extractedData.sort((a, b) => a.ten.localeCompare(b.ten, 'vi'));

  const today = new Date();
  const sheetName = sourceSheet.getName();
  const sessionId = sheetName.replace("Tháng ", "T") + "-B" + sessionNumber;

  // 3. Logic tìm dòng cuối thực sự của Cột D
  const colDValues = destSheet.getRange("D:D").getValues();
  let lastRowD = 0;
  for (let i = colDValues.length - 1; i >= 0; i--) {
    if (colDValues[i][0] !== "") {
      lastRowD = i + 1;
      break;
    }
  }

  // Cách xuống 3 dòng trống -> Dán vào dòng (lastRowD + 4)
  const targetRow = lastRowD + 4;

  // Tạo dữ liệu với công thức động cho từng dòng
  let finalRows = extractedData.map((item, index) => {
    const rowNum = targetRow + index;
    const formula = `=IFERROR( XLOOKUP(D${rowNum};INDIRECT(CONCATENATE("'"; REPLACE(INDEX(SPLIT(B${rowNum};"-"); 1; 1);1;1;"Tháng "); "'"; "!$A$2:$A371"));XLOOKUP(REPLACE( INDEX(SPLIT(B${rowNum};"-"); 1; 2); 1; 1; "Buổi ");INDIRECT(CONCATENATE("'"; REPLACE(INDEX(SPLIT(B${rowNum};"-"); 1; 1);1;1;"Tháng "); "'"; "!$E$1:$N$1"));INDIRECT(CONCATENATE("'"; REPLACE(INDEX(SPLIT(B${rowNum};"-"); 1; 1);1;1;"Tháng "); "'"; "!$E$2:$N371")); "")))`;
    return [
      today, sessionId, formula, item.ma, item.hoTen, item.ten, item.lop
    ];
  });

  const targetRange = destSheet.getRange(targetRow, 1, finalRows.length, 7);
  targetRange.setValues(finalRows);
  
  // 4. Chuyển màn hình đến nội dung vừa dán
  destSheet.activate();
  targetRange.activate();
  
  return "Đã dán " + finalRows.length + " học viên vào dòng " + targetRow;
}