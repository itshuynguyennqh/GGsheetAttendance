function taoDashboardNhanXet() {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheetBaoCao = ss.getSheetByName("BaoCao");
    const sheetDashboard = ss.getSheetByName("DashboardBaoCao");

    // 1. Đọc mốc thời gian lọc từ Dashboard (Ô C1 và C2)
    let tuNgay = sheetDashboard.getRange("C1").getValue();
    if (tuNgay instanceof Date) {
      tuNgay.setHours(0, 0, 0, 0); // Chuẩn hóa về đầu ngày
    }
    let denNgay = sheetDashboard.getRange("C2").getValue();
    if (denNgay instanceof Date) {
      denNgay.setHours(23, 59, 59, 999); // Chuẩn hóa về cuối ngày
    }
  
    // 2. Lấy toàn bộ dữ liệu từ BaoCao (bắt đầu từ dòng 2, lấy 9 cột đến cột Nhận xét)
    const lastRowBaoCao = sheetBaoCao.getLastRow();
    if (lastRowBaoCao < 2) return; 
    const data = sheetBaoCao.getRange(2, 1, lastRowBaoCao - 1, 9).getValues();
  
    let danhSachHocSinh = new Map(); // Lưu: Mã HV -> {Họ tên, Lớp}
    let danhSachBuoi = new Set();    // Lưu các mã buổi (dateId) duy nhất
    let duLieuNhanXet = new Map();   // Lưu: "Mã HV|BuoiId" -> [Nhận xét 1, Nhận xét 2]
  
    // 3. Quét và xử lý dữ liệu
    data.forEach(row => {
      let ngay = row[0];
      // Chuẩn hóa 'ngay' từ dữ liệu về đầu ngày để đảm bảo tính duy nhất và so sánh nhất quán
      if (ngay instanceof Date) {
        ngay.setHours(0, 0, 0, 0); // Vẫn cần để lọc theo tuNgay/denNgay
      }

      let dateId = row[1] != null ? String(row[1]).trim() : ""; // Ép kiểu về chuỗi để xử lý an toàn
      let maHV = row[3];     // Cột D: Mã Học viên
      let hoTen = row[4];    // Cột E
      let lop = row[6];      // Cột G
      let nhanXet = row[8];  // Cột I
  
      if (!maHV || !ngay || !dateId) return;
  
      // Kiểm tra điều kiện lọc theo ngày
      const isHopLe = (!tuNgay || !(tuNgay instanceof Date) || ngay >= tuNgay) && // tuNgay đã được chuẩn hóa về 00:00:00
                      (!denNgay || !(denNgay instanceof Date) || ngay <= denNgay); // denNgay đã được chuẩn hóa về 23:59:59
  
      if (isHopLe && dateId) { // Đảm bảo dateId tồn tại
        danhSachBuoi.add(dateId); // Lưu mã buổi duy nhất
  
        if (!danhSachHocSinh.has(maHV)) {
          danhSachHocSinh.set(maHV, { hoTen: hoTen, lop: lop });
        }
  
        // Nếu có nhận xét thì gom lại
        if (nhanXet && nhanXet.toString().trim() !== "") {
          let key = maHV + "|" + dateId; // Sử dụng dateId cho key
          if (!duLieuNhanXet.has(key)) duLieuNhanXet.set(key, []);
          duLieuNhanXet.get(key).push(nhanXet);
        }
      }
    });
  
    // 4. Lọc và sắp xếp timeline buổi tăng dần
    let mangBuoi = Array.from(danhSachBuoi).filter(id => {
        // Kiểm tra định dạng trước khi đưa vào mảng
        const isValid = String(id || "").match(/T(\d{2})\.(\d{4})-B(\d+)/);
        if (!isValid) {
            Logger.log(`Cảnh báo: Định dạng Mã Buổi không khớp: ${id}. Đã loại bỏ khỏi timeline.`);
            return false; // Loại bỏ
        }
        return true; // Giữ lại
    });

    mangBuoi.sort((a, b) => {
        // Định dạng Mã Buổi: "TMM.YYYY-BN" (ví dụ: "T01.2025-B6")
        const parseBuoiId = (id) => {
            const match = String(id || "").match(/T(\d{2})\.(\d{4})-B(\d+)/); // Đảm bảo id là string trước khi dùng regex
            return {
                year: parseInt(match[2], 10),
                month: parseInt(match[1], 10),
                session: parseInt(match[3], 10)
            };
        };

        const buoiA = parseBuoiId(a);
        const buoiB = parseBuoiId(b);

        if (buoiA.year !== buoiB.year) return buoiA.year - buoiB.year;
        if (buoiA.month !== buoiB.month) return buoiA.month - buoiB.month;
        return buoiA.session - buoiB.session;
    });
    
    let mangBuoiStr = mangBuoi; // mangBuoi đã chứa các chuỗi dateId đã sắp xếp
  
    let ketQua = [];
  
    // Tạo dòng Tiêu đề (Header)
    let header = ["Mã HV", "Họ và tên", "Lớp"].concat(mangBuoiStr);
    ketQua.push(header);
  
    // Tạo các dòng dữ liệu Học sinh
    for (let [maHV, info] of danhSachHocSinh) {
      let row = [maHV, info.hoTen, info.lop];
      
      // Đối chiếu nhận xét theo từng ngày
      for (let buoiId of mangBuoiStr) { // Lặp qua các mã buổi đã sắp xếp
        let key = maHV + "|" + buoiId;
        if (duLieuNhanXet.has(key)) {
          row.push(duLieuNhanXet.get(key).join(";\n")); // Ghép nhiều nhận xét bằng dấu chấm phẩy và xuống dòng
        } else {
          row.push(""); // Không có nhận xét thì để trống
        }
      }
      ketQua.push(row);
    }
  
    // 5. In kết quả ra Dashboard
    // Xóa dữ liệu cũ từ dòng 4
    let lastRowDash = sheetDashboard.getLastRow();
    let lastColDash = sheetDashboard.getLastColumn();
    if (lastRowDash >= 4 && lastColDash >= 1) {
      sheetDashboard.getRange(4, 1, lastRowDash - 3, lastColDash).clearContent();
    }
  
    // Đổ dữ liệu mới vào bắt đầu từ ô A4
    if (ketQua.length > 0) {
      sheetDashboard.getRange(4, 1, ketQua.length, ketQua[0].length).setValues(ketQua);
    }
  }