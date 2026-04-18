# Frontend - Điểm Danh App

React app sử dụng Vite, Material-UI, React Router.

## Yêu cầu

- Node.js (v18+ khuyến nghị)
- npm hoặc yarn

## Cài đặt Dependencies

Lần đầu tiên hoặc sau khi clone repo:

```powershell
cd app
npm install
```

## Chạy Development Server

```powershell
npm run dev
```

Server sẽ chạy tại: **http://localhost:5173**

Frontend tự động proxy API requests đến backend tại `http://localhost:3001`.

## Build cho Production

```powershell
npm run build
```

Output sẽ ở trong thư mục `dist/`.

## Preview Production Build

```powershell
npm run preview
```

## Cấu trúc

- `src/` - Source code
  - `pages/` - Các trang/views
  - `components/` - React components
  - `api.js` - API client
  - `theme.js` - Material-UI theme
- `public/` - Static files
- `vite.config.js` - Vite configuration

## Debug API Calls

Để bật debug logging cho API calls:

1. Mở Browser Console (F12)
2. Chạy: `localStorage.setItem('DEBUG_API', '1')`
3. Reload trang

Hoặc tự động bật khi chạy `npm run dev` (development mode).

## Lưu ý

- **Backend phải chạy trước** tại `http://localhost:3001`
- Nếu backend chạy ở port khác, sửa `vite.config.js` → `proxy` → `target`

## Chạy cả Backend và Frontend

### Cách 1: Dùng script helper (Khuyến nghị)

Từ thư mục root của project:

```powershell
.\start-dev.ps1
```

Script sẽ tự động:
- Kiểm tra và khởi động backend nếu chưa chạy
- Khởi động frontend

### Cách 2: Chạy thủ công

**Terminal 1 - Backend:**
```powershell
cd server
node index.js
```

**Terminal 2 - Frontend:**
```powershell
cd app
npm run dev
```

### Cách 3: Chỉ chạy Backend

```powershell
.\start-backend.ps1
```
