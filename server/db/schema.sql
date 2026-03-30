-- Renai Điểm Danh – SQLite schema
-- Courses (khóa học): one Azota class → one course → many classes
CREATE TABLE IF NOT EXISTS courses (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  azotaClassId TEXT,
  lastEditAt TEXT,
  lastEditBy TEXT,
  createdAt TEXT DEFAULT (datetime('now')),
  updatedAt TEXT DEFAULT (datetime('now'))
);

-- Classes (lớp học)
CREATE TABLE IF NOT EXISTS classes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  courseId INTEGER NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  scheduleConfig TEXT, -- JSON: defaultEnableAttendance, etc.
  lastEditAt TEXT,
  lastEditBy TEXT,
  createdAt TEXT DEFAULT (datetime('now')),
  updatedAt TEXT DEFAULT (datetime('now'))
);

-- Students (học sinh)
CREATE TABLE IF NOT EXISTS students (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  classId INTEGER NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  maHV TEXT NOT NULL,
  hoTen TEXT,
  ten TEXT,
  namSinh TEXT,
  soDTRieng TEXT,
  sdtPhuHuynh TEXT,
  tenPhuHuynh TEXT,
  diaChi TEXT,
  gioiTinh TEXT,
  status TEXT DEFAULT 'dang_hoc', -- dang_hoc | nghi | bao_luu
  lastEditAt TEXT,
  lastEditBy TEXT,
  createdAt TEXT DEFAULT (datetime('now')),
  updatedAt TEXT DEFAULT (datetime('now')),
  UNIQUE(classId, maHV)
);

-- Student status history (lịch sử tình trạng)
CREATE TABLE IF NOT EXISTS student_status_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  studentId INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  ngayThucHien TEXT NOT NULL,
  note TEXT,
  trangThaiMoi TEXT NOT NULL,
  createdAt TEXT DEFAULT (datetime('now'))
);

-- Student class transfer history (lịch sử chuyển lớp)
CREATE TABLE IF NOT EXISTS student_class_transfer_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  studentId INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  fromClassId INTEGER REFERENCES classes(id),
  toClassId INTEGER NOT NULL REFERENCES classes(id),
  ngayThucHien TEXT NOT NULL,
  lyDo TEXT,
  loaiChuyen TEXT NOT NULL, -- tam_thoi | lau_dai
  createdAt TEXT DEFAULT (datetime('now'))
);

-- Class schedule template (ca lặp lại mỗi tuần)
CREATE TABLE IF NOT EXISTS class_schedule_template (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  classId INTEGER NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  dayOfWeek INTEGER NOT NULL, -- 0=Sunday, 1=Monday, ...
  startTime TEXT NOT NULL,
  noiDungHoc TEXT,
  isActive INTEGER DEFAULT 1,
  createdAt TEXT DEFAULT (datetime('now')),
  updatedAt TEXT DEFAULT (datetime('now'))
);

-- Class schedule template history (track thay đổi lịch)
CREATE TABLE IF NOT EXISTS class_schedule_template_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  classId INTEGER NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  templateId INTEGER REFERENCES class_schedule_template(id),
  action TEXT NOT NULL,
  dayOfWeek INTEGER,
  startTime TEXT,
  noiDungHoc TEXT,
  isActive INTEGER,
  createdAt TEXT DEFAULT (datetime('now')),
  note TEXT
);

-- Sessions (ca học): Tháng, Buổi, Nội dung học
CREATE TABLE IF NOT EXISTS sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  classId INTEGER NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  thang TEXT NOT NULL,
  buoi INTEGER NOT NULL,
  noiDungHoc TEXT,
  ngayHoc TEXT NOT NULL,
  startTime TEXT,
  sourceType TEXT NOT NULL, -- template | manual
  enableAttendance INTEGER DEFAULT 1,
  lastEditAt TEXT,
  lastEditBy TEXT,
  createdAt TEXT DEFAULT (datetime('now')),
  updatedAt TEXT DEFAULT (datetime('now')),
  UNIQUE(classId, thang, buoi)
);

-- Attendance (điểm danh)
CREATE TABLE IF NOT EXISTS attendance (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  studentId INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  sessionId INTEGER NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  value TEXT NOT NULL, -- X | B | M | P
  note TEXT,
  ngayDiemDanh TEXT,
  lastEditAt TEXT,
  lastEditBy TEXT,
  createdAt TEXT DEFAULT (datetime('now')),
  updatedAt TEXT DEFAULT (datetime('now')),
  UNIQUE(studentId, sessionId)
);

-- Session report files (upload: đáp án, GV, HV)
CREATE TABLE IF NOT EXISTS session_report_files (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  sessionId INTEGER NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  fileType TEXT NOT NULL, -- answer | teacher | student
  filePath TEXT NOT NULL,
  createdAt TEXT DEFAULT (datetime('now'))
);

-- Session report per student (điểm, Azota, nhận xét GV)
CREATE TABLE IF NOT EXISTS session_report_student (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  sessionId INTEGER NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  studentId INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  score TEXT,
  azotaResult TEXT,
  teacherComment TEXT,
  createdAt TEXT DEFAULT (datetime('now')),
  updatedAt TEXT DEFAULT (datetime('now')),
  UNIQUE(sessionId, studentId)
);

-- Session seat map (sơ đồ chỗ ngồi theo ca học)
CREATE TABLE IF NOT EXISTS session_seat_map (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  sessionId INTEGER NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  seatRow INTEGER NOT NULL,
  seatCol INTEGER NOT NULL,
  studentId INTEGER REFERENCES students(id) ON DELETE SET NULL,
  seatLabel TEXT,
  meta TEXT,
  createdAt TEXT DEFAULT (datetime('now')),
  lastEditAt TEXT,
  lastEditBy TEXT,
  UNIQUE(sessionId, seatRow, seatCol),
  UNIQUE(sessionId, studentId)
);

-- Azota cache tables
CREATE TABLE IF NOT EXISTS azota_classroom_cache (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  raw_json TEXT,
  fetched_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS azota_student_cache (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  classroom_id TEXT,
  raw_json TEXT,
  fetched_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS azota_document_cache (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  raw_json TEXT,
  fetched_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS azota_btvn_result_cache (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  raw_json TEXT,
  fetched_at TEXT DEFAULT (datetime('now'))
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_students_classId ON students(classId);
CREATE INDEX IF NOT EXISTS idx_students_maHV ON students(maHV);
CREATE INDEX IF NOT EXISTS idx_sessions_classId ON sessions(classId);
CREATE INDEX IF NOT EXISTS idx_sessions_ngayHoc ON sessions(ngayHoc);
CREATE INDEX IF NOT EXISTS idx_attendance_studentId ON attendance(studentId);
CREATE INDEX IF NOT EXISTS idx_attendance_sessionId ON attendance(sessionId);
CREATE INDEX IF NOT EXISTS idx_session_seat_map_sessionId ON session_seat_map(sessionId);
CREATE INDEX IF NOT EXISTS idx_session_seat_map_studentId ON session_seat_map(studentId);
