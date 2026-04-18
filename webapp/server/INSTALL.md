# Hướng dẫn cài đặt Dependencies

## ⚠️ Vấn đề hiện tại

Bạn đang dùng **Node.js v24.13.0** - phiên bản quá mới, `better-sqlite3` chưa có prebuilt binaries cho version này.

Lỗi: `No prebuilt binaries found (target=24.13.0 runtime=node arch=x64 libc= platform=win32)`

## ✅ Giải pháp (Chọn 1 trong 3)

### 🚀 Cách 1: Dùng Node.js LTS (Khuyến nghị - Nhanh nhất)

**Đây là cách đơn giản nhất!**

1. **Tải Node.js LTS:**
   - Link: https://nodejs.org/
   - Chọn phiên bản **LTS** (v20 hoặc v22) - có sẵn prebuilt binaries

2. **Cài đặt** (giữ nguyên các cài đặt mặc định)

3. **Mở PowerShell/CMD mới** (quan trọng!) và chạy:
   ```powershell
   node --version  # Kiểm tra version mới
   cd C:\Users\Huy\GGsheetDiemDanh\server
   npm install
   ```

4. **Kiểm tra:**
   ```powershell
   node index.js
   ```

### 🔧 Cách 2: Cài Visual Studio Build Tools (Nếu muốn giữ Node.js v24)

**Chỉ làm nếu bạn muốn giữ Node.js v24.13.0**

1. **Tải Visual Studio Build Tools:**
   - Link trực tiếp: https://aka.ms/vs/17/release/vs_buildtools.exe
   - Hoặc: https://visualstudio.microsoft.com/downloads/#build-tools-for-visual-studio-2022

2. **Chạy installer và chọn:**
   - ✅ **"Desktop development with C++"** workload
   - Đảm bảo các components sau được chọn:
     - ✅ MSVC v143 - VS 2022 C++ x64/x86 build tools (Latest)
     - ✅ Windows 10/11 SDK (Latest)
     - ✅ C++ CMake tools for Windows

3. **Cài đặt** (có thể mất 5-10 phút, ~3-4 GB)

4. **Mở PowerShell/CMD mới** và chạy:
   ```powershell
   cd C:\Users\Huy\GGsheetDiemDanh\server
   npm install
   ```

### 🔄 Cách 3: Dùng nvm-windows (Quản lý nhiều phiên bản Node.js)

**Hữu ích nếu bạn cần nhiều phiên bản Node.js**

1. **Cài nvm-windows:**
   - Link: https://github.com/coreybutler/nvm-windows/releases
   - Tải file `nvm-setup.exe` và cài đặt

2. **Mở PowerShell/CMD mới** và chạy:
   ```powershell
   nvm install 20.11.0
   nvm use 20.11.0
   node --version  # Kiểm tra
   cd C:\Users\Huy\GGsheetDiemDanh\server
   npm install
   ```

3. **Chuyển đổi giữa các phiên bản:**
   ```powershell
   nvm use 20.11.0  # Dùng Node.js 20
   nvm use 24.13.0  # Dùng Node.js 24
   ```

## 📋 Kiểm tra cài đặt thành công

Sau khi `npm install` thành công (không có lỗi), chạy:
```powershell
node index.js
```

Bạn sẽ thấy:
```
[db] Schema initialized

[server] API: http://localhost:3001
[server] Docs: http://localhost:3001/api-docs
```

✅ **Nếu không có lỗi "Cannot find module 'better-sqlite3'", nghĩa là đã cài đặt thành công!**

## 🆘 Vẫn gặp lỗi?

1. **Đảm bảo đã mở terminal mới** sau khi cài Node.js/Build Tools
2. **Xóa cache npm:**
   ```powershell
   npm cache clean --force
   rm -r node_modules
   npm install
   ```
3. **Kiểm tra PATH:** Đảm bảo Node.js trong PATH:
   ```powershell
   where node
   ```
