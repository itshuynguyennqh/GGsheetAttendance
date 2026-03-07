/**
 * Template Excel Kiểu dài (7 cột): Mã HV, Họ tên, Tên, Lớp, Tháng, Buổi, Điểm danh.
 */

import * as XLSX from 'xlsx';

function getTemplateData() {
  const year = new Date().getFullYear();
  const month = new Date().getMonth() + 1;
  const thang = `${month}.${year}`;
  const header = ['Mã HV', 'Họ tên', 'Tên', 'Lớp', 'Tháng', 'Buổi', 'Điểm danh'];
  const sampleRows = [
    ['HV-0000431', 'Nguyễn Uyển Nhi', 'Nhi', 'Lớp 11', thang, 1, 'X'],
    ['HV-0000431', 'Nguyễn Uyển Nhi', 'Nhi', 'Lớp 11', thang, 2, 'M'],
    ['HV-0000431', 'Nguyễn Uyển Nhi', 'Nhi', 'Lớp 11', thang, 3, 'X'],
    ['HV-0000432', 'Nguyễn Phương Linh', 'Linh', 'Lớp 11', thang, 1, 'X'],
    ['HV-0000432', 'Nguyễn Phương Linh', 'Linh', 'Lớp 11', thang, 2, 'X'],
    ['HV-0000432', 'Nguyễn Phương Linh', 'Linh', 'Lớp 11', thang, 3, 'P'],
    ['HV-0000237', 'Nguyễn Thị Như Quỳnh', 'Quỳnh', 'Lớp 11', thang, 1, 'X'],
    ['HV-0000237', 'Nguyễn Thị Như Quỳnh', 'Quỳnh', 'Lớp 11', thang, 2, 'X'],
    ['HV-0000237', 'Nguyễn Thị Như Quỳnh', 'Quỳnh', 'Lớp 11', thang, 3, 'X'],
  ];
  return [header, ...sampleRows];
}

export function downloadAttendanceImportTemplate() {
  const data = getTemplateData();
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet(data);
  ws['!cols'] = [
    { wch: 14 },
    { wch: 22 },
    { wch: 10 },
    { wch: 10 },
    { wch: 12 },
    { wch: 8 },
    { wch: 12 },
  ];
  XLSX.utils.book_append_sheet(wb, ws, 'Điểm danh');
  XLSX.writeFile(wb, 'Mau_Import_Diem_Danh.xlsx');
}
