# Vì sao ~20 buổi dễ treo (và đã xử lý gì)

## Nguyên nhân

1. **Số nút DOM rất lớn**  
   Mỗi ô = `<select>` + 5 `<option>` + `TableCell`.  
   Ví dụ: 20 cột × 150 học sinh ≈ **3.000 select**, mỗi lớp thêm một khối dòng → dễ lên **hàng chục nghìn** node. Một lần commit layout/paint hết → main thread bận lâu.

2. **Render hết mọi dòng (không virtual)**  
   Trước đây mọi dòng mount cùng lúc. Scroll không giảm số node — trình duyệt vẫn giữ full cây.

3. **Cập nhật state theo từng lớp khi load** (`mergeAndUpdate` cũ)  
   Mỗi API `attendance` của 1 lớp xong → `setAllClassesData` + `setAttendance` → **React vẽ lại cả lưới**.  
   8 lớp ≈ **8 lần** vẽ full (hoặc gần full) trong vài trăm ms → cảm giác treo / long task.

4. **Mỗi lần sửa ô**  
   `setAttendance` làm parent re-render; may nhờ `memo` trên ô, nhưng vẫn reconcile cả vùng scroll nếu không virtual.

## Đã làm

- **Virtual theo dòng** (`@tanstack/react-virtual`): chỉ mount ~viewport + `overscan` (khoảng vài chục dòng), không còn 150×20 select cùng lúc.
- **Một lần gắn dữ liệu sau khi tải xong**: bỏ cập nhật từng lớp; chỉ `setAllClassesData` / `setAttendance` sau `Promise.all`.
- Ô vẫn dùng **`<select>` native** (nhẹ hơn MUI Select rất nhiều).

## Nếu vẫn nặng

- Giảm khoảng ngày / số buổi hiển thị (filter server).
- Hoặc ô chỉ hiển thị chữ, mở editor khi click (giảm thêm DOM).
