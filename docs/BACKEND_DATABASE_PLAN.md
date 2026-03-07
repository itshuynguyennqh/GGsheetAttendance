# 📋 TÀI LIỆU KỸ THUẬT BACKEND & DATABASE

**Mục đích**: Tài liệu này cung cấp thông tin chi tiết về kiến trúc backend và database hiện tại để hỗ trợ việc lập kế hoạch và phát triển.

**Ngày tạo**: 2026-02-02  
**Phiên bản**: 1.0

---

## 📊 TỔNG QUAN HỆ THỐNG

### Stack Công nghệ
- **Runtime**: Node.js
- **Framework**: Express.js 4.21.0
- **Database**: SQLite (better-sqlite3 11.0.0)
- **API Documentation**: Swagger UI (swagger-ui-express 5.0.0)
- **CORS**: cors 2.8.5
- **YAML Parser**: yaml 2.5.0

### Cấu trúc Thư mục
```
server/
├── index.js              # Entry point, Express app setup
├── db.js                 # Database connection & schema initialization
├── package.json          # Dependencies
├── routes/               # API route handlers
│   ├── courses.js
│   ├── classes.js
│   ├── students.js
│   ├── sessions.js
│   ├── attendance.js
│   └── dashboard.js
├── data/                 # Database storage
│   └── attendance.db     # SQLite database file
└── scripts/              # Utility scripts
```

---

## 🗄️ DATABASE SCHEMA

### Tổng quan
Database sử dụng SQLite với các tính năng:
- **WAL Mode**: Write-Ahead Logging để tối ưu concurrent access
- **Foreign Keys**: Bật để đảm bảo referential integrity
- **Location**: `data/attendance.db`

### Bảng Dữ liệu Chính

#### 1. `courses` - Khóa học (Lớp lớn)
```sql
CREATE TABLE courses (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  azotaClassId TEXT,                    -- ID lớp trên Azota
  createdAt TEXT DEFAULT (datetime('now')),
  lastEditAt TEXT,
  lastEditBy TEXT
);
```
**Mục đích**: Quản lý các khóa học lớn, cha của các lớp con (classes)

#### 2. `classes` - Lớp con
```sql
CREATE TABLE classes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  courseId INTEGER NOT NULL REFERENCES courses(id),
  name TEXT NOT NULL,
  scheduleConfig TEXT,                  -- JSON config cho lịch học
  createdAt TEXT DEFAULT (datetime('now')),
  lastEditAt TEXT,
  lastEditBy TEXT
);
```
**Mục đích**: Quản lý các lớp học cụ thể thuộc một khóa học

#### 3. `students` - Học sinh
```sql
CREATE TABLE students (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  maHV TEXT NOT NULL UNIQUE,            -- Mã học viên (unique)
  hoTen TEXT NOT NULL,
  ten TEXT,
  classId INTEGER NOT NULL REFERENCES classes(id),
  status TEXT DEFAULT 'đi học',         -- Trạng thái: đi học, nghỉ học, etc.
  namSinh INTEGER,
  soDTRieng TEXT,
  soDTPhuHuynh TEXT,
  tenPhuHuynh TEXT,
  diaChi TEXT,
  gioiTinh TEXT,
  azotaId TEXT,                         -- ID trên Azota
  azotaCode TEXT,                       -- Mã code Azota
  azotaSyncedAt TEXT,                   -- Thời điểm sync với Azota
  azotaSyncStatus TEXT,                 -- Trạng thái sync
  createdAt TEXT DEFAULT (datetime('now')),
  lastEditAt TEXT,
  lastEditBy TEXT
);
```
**Mục đích**: Lưu thông tin học sinh, có thể sync với Azota

#### 4. `sessions` - Ca học
```sql
CREATE TABLE sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  classId INTEGER NOT NULL REFERENCES classes(id),
  ngayHoc TEXT NOT NULL,                -- Format: YYYY-MM-DD
  startTime TEXT DEFAULT '19:00',       -- Format: HH:mm
  thang TEXT,                           -- Format: "M.YYYY" (ví dụ: "1.2025")
  buoi INTEGER,                         -- Số buổi trong tháng
  noiDungHoc TEXT,
  sourceType TEXT DEFAULT 'manual',     -- 'manual' hoặc 'template'
  enableAttendance INTEGER DEFAULT 1,   -- Có cho phép điểm danh không
  createdAt TEXT DEFAULT (datetime('now')),
  lastEditAt TEXT,
  lastEditBy TEXT,
  UNIQUE(classId, ngayHoc, startTime)    -- Một lớp không thể có 2 ca cùng ngày giờ
);
```
**Mục đích**: Quản lý các buổi học, có thể tạo tự động từ template hoặc thủ công

#### 5. `attendance` - Điểm danh
```sql
CREATE TABLE attendance (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  studentId INTEGER NOT NULL REFERENCES students(id),
  sessionId INTEGER NOT NULL REFERENCES sessions(id),
  ngayDiemDanh TEXT,                    -- Ngày điểm danh thực tế
  value TEXT,                           -- Giá trị: X, B, M, P, etc.
  note TEXT,
  createdAt TEXT DEFAULT (datetime('now')),
  lastEditAt TEXT,
  lastEditBy TEXT,
  UNIQUE(studentId, sessionId)           -- Một học sinh chỉ có 1 điểm danh/buổi
);
```
**Mục đích**: Lưu kết quả điểm danh của học sinh cho từng buổi học

### Bảng Lịch sử & Audit

#### 6. `student_status_history` - Lịch sử thay đổi trạng thái học sinh
```sql
CREATE TABLE student_status_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  studentId INTEGER NOT NULL REFERENCES students(id),
  ngayThucHien TEXT NOT NULL,
  note TEXT,
  trangThaiMoi TEXT NOT NULL,
  createdAt TEXT DEFAULT (datetime('now')),
  lastEditAt TEXT,
  lastEditBy TEXT
);
```

#### 7. `student_class_transfer_history` - Lịch sử chuyển lớp
```sql
CREATE TABLE student_class_transfer_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  studentId INTEGER NOT NULL REFERENCES students(id),
  classIdFrom INTEGER NOT NULL REFERENCES classes(id),
  classIdTo INTEGER NOT NULL REFERENCES classes(id),
  ngayThucHien TEXT NOT NULL,
  loaiChuyen TEXT NOT NULL,            -- 'lau_dai' hoặc 'tam_thoi'
  lyDo TEXT,
  note TEXT,
  createdAt TEXT DEFAULT (datetime('now')),
  lastEditAt TEXT,
  lastEditBy TEXT
);
```

### Bảng Lịch học Template

#### 8. `class_schedule_template` - Template lịch học theo tuần
```sql
CREATE TABLE class_schedule_template (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  classId INTEGER NOT NULL REFERENCES classes(id),
  dayOfWeek INTEGER NOT NULL,           -- 1=Chủ nhật, 2=Thứ 2, ..., 7=Thứ 7
  startTime TEXT DEFAULT '19:00',
  noiDungHoc TEXT,
  isActive INTEGER DEFAULT 1,            -- 1=active, 0=inactive
  createdAt TEXT DEFAULT (datetime('now')),
  lastEditAt TEXT,
  lastEditBy TEXT
);
```
**Mục đích**: Lưu lịch học định kỳ theo tuần, dùng để tự động tạo sessions

#### 9. `class_schedule_template_history` - Lịch sử thay đổi template
```sql
CREATE TABLE class_schedule_template_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  classId INTEGER NOT NULL REFERENCES classes(id),
  templateId INTEGER REFERENCES class_schedule_template(id),
  action TEXT NOT NULL,                 -- 'create', 'update', 'delete'
  dayOfWeek INTEGER,
  startTime TEXT,
  noiDungHoc TEXT,
  isActive INTEGER,
  createdAt TEXT DEFAULT (datetime('now')),
  note TEXT
);
```

### Bảng Báo cáo Buổi học

#### 10. `session_report_files` - Files báo cáo buổi học
```sql
CREATE TABLE session_report_files (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  sessionId INTEGER NOT NULL REFERENCES sessions(id),
  studentId INTEGER REFERENCES students(id),  -- NULL nếu là file chung
  fileType TEXT NOT NULL,                -- Loại file: 'homework', 'report', etc.
  filePath TEXT NOT NULL,                -- Đường dẫn file
  originalName TEXT,
  aiSummary TEXT,                        -- Tóm tắt từ AI (nếu có)
  createdAt TEXT DEFAULT (datetime('now')),
  lastEditAt TEXT,
  lastEditBy TEXT
);
```

#### 11. `session_report_student` - Báo cáo học sinh trong buổi học
```sql
CREATE TABLE session_report_student (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  sessionId INTEGER NOT NULL REFERENCES sessions(id),
  studentId INTEGER NOT NULL REFERENCES students(id),
  diem TEXT,                             -- Điểm số
  azotaResult TEXT,                      -- Kết quả từ Azota
  nhanXetGiangVien TEXT,                 -- Nhận xét của giảng viên
  createdAt TEXT DEFAULT (datetime('now')),
  lastEditAt TEXT,
  lastEditBy TEXT,
  UNIQUE(sessionId, studentId)
);
```

### Bảng Cache Azota

#### 12. `azota_classroom_cache` - Cache thông tin lớp học Azota
```sql
CREATE TABLE azota_classroom_cache (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  azota_classroom_id TEXT NOT NULL UNIQUE,
  name TEXT,
  group_name TEXT,
  year TEXT,
  count_students INTEGER,
  hash_id TEXT,
  raw_json TEXT,                         -- JSON raw data từ API
  fetched_at TEXT DEFAULT (datetime('now'))
);
```

#### 13. `azota_student_cache` - Cache thông tin học sinh Azota
```sql
CREATE TABLE azota_student_cache (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  azota_classroom_id TEXT NOT NULL,
  azota_student_id TEXT NOT NULL,
  code TEXT,
  full_name TEXT,
  phone TEXT,
  parent_phone TEXT,
  parent_full_name TEXT,
  birthday TEXT,
  gender TEXT,
  raw_json TEXT,
  fetched_at TEXT DEFAULT (datetime('now')),
  UNIQUE(azota_classroom_id, azota_student_id)
);
```

#### 14. `azota_document_cache` - Cache bài tập/đề thi Azota
```sql
CREATE TABLE azota_document_cache (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  azota_classroom_id TEXT NOT NULL,
  exam_id TEXT,
  hash_id TEXT,
  name TEXT,
  attended INTEGER,
  start_time TEXT,
  end_time TEXT,
  raw_json TEXT,
  fetched_at TEXT DEFAULT (datetime('now'))
);
```

#### 15. `azota_btvn_result_cache` - Cache kết quả bài tập về nhà
```sql
CREATE TABLE azota_btvn_result_cache (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  exam_id TEXT NOT NULL,
  azota_classroom_id TEXT NOT NULL,
  azota_student_id TEXT,
  student_code TEXT,
  score TEXT,
  test_status INTEGER,
  raw_json TEXT,
  fetched_at TEXT DEFAULT (datetime('now'))
);
```

---

## 🔌 API ENDPOINTS

### Base URL
```
http://localhost:3001/api
```

### Health Check
- **GET** `/api/health` - Kiểm tra server status

### 1. Courses API (`/api/courses`)

| Method | Endpoint | Mô tả |
|--------|----------|-------|
| GET | `/api/courses` | Lấy danh sách tất cả khóa học |
| GET | `/api/courses/:id` | Lấy thông tin một khóa học |
| POST | `/api/courses` | Tạo khóa học mới |
| PUT | `/api/courses/:id` | Cập nhật khóa học |
| DELETE | `/api/courses/:id` | Xóa khóa học (cascade xóa classes, students, sessions) |

**Request Body (POST/PUT)**:
```json
{
  "name": "Tên khóa học",
  "azotaClassId": "azota_class_id_optional"
}
```

### 2. Classes API (`/api/classes`)

| Method | Endpoint | Mô tả |
|--------|----------|-------|
| GET | `/api/classes` | Lấy danh sách lớp (có thể filter `?courseId=X`) |
| GET | `/api/classes/:id` | Lấy thông tin một lớp |
| POST | `/api/classes` | Tạo lớp mới |
| PUT | `/api/classes/:id` | Cập nhật lớp |
| DELETE | `/api/classes/:id` | Xóa lớp (cascade xóa students, sessions) |
| GET | `/api/classes/:id/schedule-template` | Lấy template lịch học của lớp |
| GET | `/api/classes/:id/schedule-template-history` | Lấy lịch sử thay đổi template |
| POST | `/api/classes/:id/schedule-template` | Tạo template lịch học mới |
| PUT | `/api/classes/:id/schedule-template/:tid` | Cập nhật template |
| DELETE | `/api/classes/:id/schedule-template/:tid` | Xóa template |
| POST | `/api/classes/:id/generate-sessions` | Tạo sessions tự động từ template |

**Request Body (POST classes)**:
```json
{
  "courseId": 1,
  "name": "Tên lớp",
  "scheduleConfig": "{\"defaultEnableAttendance\": true}"
}
```

**Request Body (POST schedule-template)**:
```json
{
  "dayOfWeek": 2,           // 1=CN, 2=T2, ..., 7=T7
  "startTime": "19:00",
  "noiDungHoc": "Nội dung học",
  "isActive": 1
}
```

**Request Body (POST generate-sessions)**:
```json
{
  "startDate": "2025-02-01",
  "endDate": "2025-02-28"
}
```

### 3. Students API (`/api/students`)

| Method | Endpoint | Mô tả |
|--------|----------|-------|
| GET | `/api/students` | Lấy danh sách học sinh (filter: `?classId=X&status=Y`) |
| GET | `/api/students/:id` | Lấy thông tin một học sinh |
| POST | `/api/students` | Tạo học sinh mới |
| POST | `/api/students/bulk-import` | Import nhiều học sinh cùng lúc |
| PUT | `/api/students/:id` | Cập nhật học sinh |
| DELETE | `/api/students/:id` | Xóa học sinh (cascade xóa attendance, reports) |
| GET | `/api/students/:id/status-history` | Lấy lịch sử thay đổi trạng thái |
| POST | `/api/students/:id/status-history` | Thêm bản ghi thay đổi trạng thái |
| GET | `/api/students/:id/class-transfer-history` | Lấy lịch sử chuyển lớp |
| POST | `/api/students/:id/class-transfer-history` | Thêm bản ghi chuyển lớp |

**Request Body (POST students)**:
```json
{
  "maHV": "HV001",
  "hoTen": "Nguyễn Văn A",
  "ten": "A",
  "classId": 1,
  "status": "đi học",
  "namSinh": 2010,
  "soDTRieng": "0123456789",
  "soDTPhuHuynh": "0987654321",
  "tenPhuHuynh": "Nguyễn Văn B",
  "diaChi": "Địa chỉ",
  "gioiTinh": "Nam"
}
```

**Request Body (POST bulk-import)**:
```json
{
  "students": [
    {
      "maHV": "HV001",
      "hoTen": "Nguyễn Văn A",
      "classId": 1,
      ...
    },
    ...
  ]
}
```

**Response (bulk-import)**:
```json
{
  "success": [...],  // Danh sách học sinh import thành công
  "errors": [        // Danh sách lỗi
    {
      "index": 1,
      "maHV": "HV001",
      "hoTen": "Nguyễn Văn A",
      "error": "Mã HV đã tồn tại"
    }
  ]
}
```

### 4. Sessions API (`/api/sessions`)

| Method | Endpoint | Mô tả |
|--------|----------|-------|
| GET | `/api/sessions` | Lấy danh sách buổi học (filter: `?classId=X&ngayHoc=Y&enableAttendance=1`) |
| GET | `/api/sessions/:id` | Lấy thông tin một buổi học |
| POST | `/api/sessions` | Tạo buổi học mới |
| PUT | `/api/sessions/:id` | Cập nhật buổi học |
| DELETE | `/api/sessions/:id` | Xóa buổi học (cascade xóa attendance, reports) |

**Request Body (POST sessions)**:
```json
{
  "classId": 1,
  "ngayHoc": "2025-02-01",
  "startTime": "19:00",
  "noiDungHoc": "Nội dung học",
  "enableAttendance": 1
}
```

### 5. Attendance API (`/api/attendance`)

| Method | Endpoint | Mô tả |
|--------|----------|-------|
| GET | `/api/attendance` | Lấy dữ liệu điểm danh (filter: `?sessionId=X` hoặc `?classId=X&thang=Y&buoi=Z`) |
| PUT | `/api/attendance` | Cập nhật điểm danh (có thể gửi array hoặc object đơn) |

**Request Body (PUT attendance)**:
```json
[
  {
    "studentId": 1,
    "sessionId": 1,
    "ngayDiemDanh": "2025-02-01",
    "value": "X",        // X=đi học, B=bận, M=muộn, P=vắng
    "note": "Ghi chú"
  },
  ...
]
```

**Response (GET attendance)**:
```json
{
  "sessions": [...],
  "students": [...],
  "attendance": {
    "1-1": {              // Key format: "studentId-sessionId"
      "id": 1,
      "studentId": 1,
      "sessionId": 1,
      "value": "X",
      ...
    }
  }
}
```

### 6. Dashboard API (`/api/dashboard`)

| Method | Endpoint | Mô tả |
|--------|----------|-------|
| GET | `/api/dashboard/streak` | Tính toán streak điểm danh (filter: `?classId=X`) |

**Response (GET streak)**:
```json
{
  "students": [
    {
      "id": 1,
      "maHV": "HV001",
      "hoTen": "Nguyễn Văn A",
      "currentStreak": 5,        // >0: streak đi học, <0: streak vắng
      "maxAttendStreak": 10,
      "maxAbsenceStreak": 2
    },
    ...
  ],
  "sessions": 20,
  "positiveStreak": 15,
  "negativeStreak": 3
}
```

---

## 🔧 CẤU HÌNH & MÔI TRƯỜNG

### Environment Variables
- `PORT`: Port server (mặc định: 3001)
- `DEBUG_API`: Bật debug logging (set `DEBUG_API=1` hoặc `DEBUG=1`)
- `NODE_ENV`: Môi trường (`development`, `production`)

### Database Configuration
- **Path**: `data/attendance.db` (tự động tạo thư mục `data/` nếu chưa có)
- **Journal Mode**: WAL (Write-Ahead Logging)
- **Foreign Keys**: Enabled
- **Connection**: Singleton pattern (một instance duy nhất)

### Middleware
1. **CORS**: Cho phép tất cả origins
2. **JSON Parser**: Express built-in JSON parser
3. **Request Logger**: Tự động log request/response với timing
4. **Error Handler**: Xử lý lỗi và log stack trace (nếu DEBUG_API)

---

## 📈 QUAN HỆ DỮ LIỆU (Entity Relationships)

```
courses (1) ──< (N) classes (1) ──< (N) students
                              │
                              │ (1)
                              │
                              ▼ (N)
                          sessions (1) ──< (N) attendance
                              │
                              │ (1)
                              │
                              ▼ (N)
                    session_report_student
                    session_report_files

classes (1) ──< (N) class_schedule_template
              └──< (N) class_schedule_template_history

students (1) ──< (N) student_status_history
              └──< (N) student_class_transfer_history
```

### Cascade Delete Rules
- Xóa `course` → xóa tất cả `classes` → xóa tất cả `students`, `sessions`, `attendance`, `reports`
- Xóa `class` → xóa tất cả `students`, `sessions`, `attendance`, `reports`, `schedule_templates`
- Xóa `student` → xóa tất cả `attendance`, `reports`, `status_history`, `transfer_history`
- Xóa `session` → xóa tất cả `attendance`, `reports`

---

## 🎯 CÁC TÍNH NĂNG CHÍNH

### 1. Quản lý Khóa học & Lớp học
- Tạo/sửa/xóa khóa học và lớp học
- Phân cấp: Course → Classes → Students
- Liên kết với Azota qua `azotaClassId`

### 2. Quản lý Học sinh
- CRUD học sinh
- Bulk import từ Excel/CSV
- Quản lý trạng thái học sinh (đi học, nghỉ học, etc.)
- Lịch sử thay đổi trạng thái
- Lịch sử chuyển lớp (lâu dài/tạm thời)

### 3. Quản lý Lịch học
- Template lịch học theo tuần (dayOfWeek + startTime)
- Tự động tạo sessions từ template trong khoảng thời gian
- Lịch sử thay đổi template
- Quản lý sessions thủ công hoặc tự động

### 4. Điểm danh
- Điểm danh theo buổi học
- Giá trị: X (đi học), B (bận), M (muộn), P (vắng)
- Batch update nhiều điểm danh cùng lúc
- Filter theo class, session, tháng, buổi

### 5. Dashboard & Analytics
- Tính toán streak (chuỗi đi học/vắng)
- Thống kê điểm danh
- Leaderboard

### 6. Cache Azota
- Cache thông tin lớp học Azota
- Cache thông tin học sinh Azota
- Cache bài tập/đề thi
- Cache kết quả bài tập về nhà

---

## ⚠️ VẤN ĐỀ & HẠN CHẾ HIỆN TẠI

### 1. Database
- **SQLite**: Không phù hợp cho production scale lớn (concurrent writes hạn chế)
- **No Migration System**: Schema được tạo trực tiếp trong code, không có versioning
- **No Backup Strategy**: Chưa có cơ chế backup tự động
- **No Indexing**: Một số query có thể chậm khi dữ liệu lớn

### 2. API
- **No Authentication**: Chưa có authentication/authorization
- **No Rate Limiting**: Có thể bị abuse
- **No Input Validation**: Chưa có validation middleware (Joi, express-validator)
- **Error Messages**: Một số error message chưa rõ ràng cho frontend

### 3. Code Structure
- **No Service Layer**: Business logic nằm trực tiếp trong routes
- **No Repository Pattern**: Database queries nằm trực tiếp trong routes
- **No Unit Tests**: Chưa có test coverage
- **No API Versioning**: Chưa có versioning cho API

### 4. Performance
- **No Caching**: Chưa có caching layer (Redis, memory cache)
- **No Pagination**: Một số endpoint trả về toàn bộ dữ liệu
- **N+1 Queries**: Có thể có vấn đề N+1 trong một số query

### 5. Security
- **SQL Injection**: Sử dụng prepared statements (an toàn) nhưng cần kiểm tra kỹ
- **No HTTPS**: Chưa có SSL/TLS
- **CORS**: Cho phép tất cả origins (không an toàn cho production)

---

## 🚀 KẾ HOẠCH CẢI THIỆN ĐỀ XUẤT

### Phase 1: Cải thiện Code Structure
1. **Tách Service Layer**
   - Tạo `services/` folder
   - Di chuyển business logic từ routes sang services
   - Routes chỉ xử lý HTTP request/response

2. **Tách Repository Layer**
   - Tạo `repositories/` folder
   - Tách database queries ra khỏi routes/services
   - Dễ dàng test và maintain

3. **Input Validation**
   - Thêm express-validator hoặc Joi
   - Validate tất cả input từ client
   - Trả về error messages rõ ràng

### Phase 2: Database Improvements
1. **Migration System**
   - Sử dụng `node-sqlite3` migrations hoặc tự build
   - Version control cho schema changes
   - Rollback support

2. **Indexing**
   - Thêm indexes cho các cột thường query:
     - `students.maHV`
     - `students.classId`
     - `sessions.classId`
     - `sessions.ngayHoc`
     - `attendance.studentId`, `attendance.sessionId`

3. **Backup Strategy**
   - Scheduled backup (daily/weekly)
   - Backup trước khi migration
   - Restore procedure

### Phase 3: API Improvements
1. **Authentication & Authorization**
   - JWT-based authentication
   - Role-based access control (RBAC)
   - Protected routes

2. **API Versioning**
   - `/api/v1/...` structure
   - Backward compatibility

3. **Pagination**
   - Thêm pagination cho các list endpoints
   - Query params: `?page=1&limit=20`

4. **Rate Limiting**
   - express-rate-limit middleware
   - Different limits cho different endpoints

### Phase 4: Performance
1. **Caching**
   - Redis cho cache layer
   - Cache frequently accessed data
   - Cache invalidation strategy

2. **Query Optimization**
   - Review và optimize slow queries
   - Sử dụng EXPLAIN QUERY PLAN
   - Batch operations

3. **Connection Pooling**
   - Nếu migrate sang PostgreSQL/MySQL
   - Connection pool configuration

### Phase 5: Testing & Documentation
1. **Unit Tests**
   - Jest hoặc Mocha
   - Test services và repositories
   - Mock database

2. **Integration Tests**
   - Test API endpoints
   - Test database operations
   - Test error scenarios

3. **API Documentation**
   - Hoàn thiện OpenAPI/Swagger spec
   - Examples cho mỗi endpoint
   - Error response documentation

### Phase 6: Production Readiness
1. **Monitoring & Logging**
   - Winston hoặc Pino cho logging
   - Error tracking (Sentry)
   - Performance monitoring

2. **Security Hardening**
   - HTTPS/SSL
   - CORS configuration
   - Security headers (helmet.js)
   - Input sanitization

3. **Deployment**
   - Docker containerization
   - CI/CD pipeline
   - Environment-specific configs

---

## 📝 GHI CHÚ QUAN TRỌNG

### Database File Location
- Database file: `data/attendance.db`
- Thư mục `data/` được tạo tự động nếu chưa có
- **Lưu ý**: Cần backup file này trước khi deploy hoặc migrate

### Foreign Key Constraints
- Foreign keys được bật (`PRAGMA foreign_keys = ON`)
- Cascade delete được implement trong code (không phải database level)
- Cần đảm bảo thứ tự xóa đúng để tránh constraint violations

### Date/Time Format
- Tất cả dates lưu dạng TEXT với format ISO: `YYYY-MM-DD`
- Times lưu dạng TEXT với format: `HH:mm`
- Timestamps lưu dạng TEXT với format ISO: `YYYY-MM-DDTHH:mm:ss.sssZ`

### Azota Integration
- Các bảng cache Azota được thiết kế để lưu raw JSON từ API
- Có thể sync dữ liệu từ Azota vào hệ thống
- Cần implement sync logic riêng (chưa có trong code hiện tại)

### Session Generation Logic
- `generate-sessions` endpoint tự động tính `thang` và `buoi`
- `thang` format: `"M.YYYY"` (ví dụ: `"1.2025"`)
- `buoi` được tính tự động dựa trên tháng và lớp

---

## 🔍 CÁC QUERY QUAN TRỌNG CẦN REVIEW

### 1. Streak Calculation
- Logic tính streak trong `dashboard.js`
- Có thể cần optimize khi dữ liệu lớn

### 2. Bulk Import
- Transaction được sử dụng để đảm bảo atomicity
- Cần test với large datasets

### 3. Cascade Delete
- Logic xóa cascade trong routes (courses, classes, students, sessions)
- Cần đảm bảo thứ tự xóa đúng

### 4. Session Generation
- Logic tính `buoi` dựa trên `MAX(buoi)` trong tháng
- Cần test với concurrent requests

---

## 📚 TÀI LIỆU THAM KHẢO

- [Express.js Documentation](https://expressjs.com/)
- [better-sqlite3 Documentation](https://github.com/WiseLibs/better-sqlite3)
- [SQLite Documentation](https://www.sqlite.org/docs.html)
- [Swagger/OpenAPI Specification](https://swagger.io/specification/)

---

**Tài liệu này sẽ được cập nhật khi có thay đổi trong hệ thống.**
