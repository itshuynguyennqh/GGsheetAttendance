/**
 * SQLite schema for Điểm danh app.
 * Tables: courses, classes, students, sessions, attendance,
 * student_status_history, student_class_transfer_history,
 * class_schedule_template, session_report_*, azota cache.
 */

function runSchema(db) {
  db.exec(`
    -- Khóa học (lớp lớn, sync với Azota)
    CREATE TABLE IF NOT EXISTS courses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      azota_class_id TEXT,
      last_edit_at TEXT,
      last_edit_by TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );

    -- Lớp con (thuộc khóa học)
    CREATE TABLE IF NOT EXISTS classes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      course_id INTEGER NOT NULL REFERENCES courses(id),
      name TEXT NOT NULL,
      schedule_config_default_enable_attendance INTEGER DEFAULT 1,
      last_edit_at TEXT,
      last_edit_by TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );

    -- Học sinh
    CREATE TABLE IF NOT EXISTS students (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      class_id INTEGER NOT NULL REFERENCES classes(id),
      ma_hv TEXT NOT NULL,
      ho_ten TEXT NOT NULL,
      ten TEXT,
      nam_sinh TEXT,
      so_dt_rieng TEXT,
      sdt_phu_huynh TEXT,
      ten_phu_huynh TEXT,
      dia_chi TEXT,
      gioi_tinh TEXT,
      last_edit_at TEXT,
      last_edit_by TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      UNIQUE(class_id, ma_hv)
    );

    -- Lịch học mẫu (ca lặp mỗi tuần)
    CREATE TABLE IF NOT EXISTS class_schedule_template (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      class_id INTEGER NOT NULL REFERENCES classes(id),
      day_of_week INTEGER NOT NULL,
      start_time TEXT NOT NULL,
      last_edit_at TEXT,
      last_edit_by TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );

    -- Ca học (Tháng, Buổi, Nội dung học)
    CREATE TABLE IF NOT EXISTS sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      class_id INTEGER NOT NULL REFERENCES classes(id),
      thang TEXT NOT NULL,
      buoi INTEGER NOT NULL,
      noi_dung_hoc TEXT,
      ngay_hoc TEXT NOT NULL,
      start_time TEXT,
      source_type TEXT DEFAULT 'manual',
      enable_attendance INTEGER DEFAULT 1,
      last_edit_at TEXT,
      last_edit_by TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );

    -- Điểm danh
    CREATE TABLE IF NOT EXISTS attendance (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      student_id INTEGER NOT NULL REFERENCES students(id),
      session_id INTEGER REFERENCES sessions(id),
      ngay_diem_danh TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'P',
      note TEXT,
      last_edit_at TEXT,
      last_edit_by TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );

    -- Lịch sử tình trạng học sinh (đi học, nghỉ, bảo lưu)
    CREATE TABLE IF NOT EXISTS student_status_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      student_id INTEGER NOT NULL REFERENCES students(id),
      ngay_thuc_hien TEXT NOT NULL,
      trang_thai_moi TEXT NOT NULL,
      note TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );

    -- Lịch sử chuyển lớp
    CREATE TABLE IF NOT EXISTS student_class_transfer_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      student_id INTEGER NOT NULL REFERENCES students(id),
      from_class_id INTEGER NOT NULL REFERENCES classes(id),
      to_class_id INTEGER NOT NULL REFERENCES classes(id),
      ngay_thuc_hien TEXT NOT NULL,
      ly_do TEXT,
      loai_chuyen TEXT DEFAULT 'lau_dai',
      created_at TEXT DEFAULT (datetime('now'))
    );

    -- Báo cáo buổi: file upload
    CREATE TABLE IF NOT EXISTS session_report_files (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id INTEGER NOT NULL REFERENCES sessions(id),
      file_type TEXT NOT NULL,
      file_path TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now'))
    );

    -- Báo cáo buổi: điểm/nhận xét từng học sinh
    CREATE TABLE IF NOT EXISTS session_report_student (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id INTEGER NOT NULL REFERENCES sessions(id),
      student_id INTEGER NOT NULL REFERENCES students(id),
      score TEXT,
      azota_result TEXT,
      teacher_comment TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );

    -- Azota cache: lớp (classroom)
    CREATE TABLE IF NOT EXISTS azota_classroom_cache (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      course_id INTEGER REFERENCES courses(id),
      azota_class_id TEXT NOT NULL,
      raw_json TEXT,
      fetched_at TEXT NOT NULL,
      UNIQUE(course_id, azota_class_id)
    );

    -- Azota cache: học sinh
    CREATE TABLE IF NOT EXISTS azota_student_cache (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      azota_class_id TEXT NOT NULL,
      azota_student_id TEXT NOT NULL,
      raw_json TEXT,
      fetched_at TEXT NOT NULL
    );

    -- Azota cache: tài liệu/BTVN
    CREATE TABLE IF NOT EXISTS azota_document_cache (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      azota_class_id TEXT NOT NULL,
      document_id TEXT NOT NULL,
      raw_json TEXT,
      fetched_at TEXT NOT NULL
    );

    -- Azota cache: kết quả BTVN
    CREATE TABLE IF NOT EXISTS azota_btvn_result_cache (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      document_id TEXT NOT NULL,
      raw_json TEXT,
      fetched_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_classes_course ON classes(course_id);
    CREATE INDEX IF NOT EXISTS idx_students_class ON students(class_id);
    CREATE INDEX IF NOT EXISTS idx_sessions_class ON sessions(class_id);
    CREATE INDEX IF NOT EXISTS idx_attendance_student ON attendance(student_id);
    CREATE INDEX IF NOT EXISTS idx_attendance_session ON attendance(session_id);
    CREATE INDEX IF NOT EXISTS idx_attendance_ngay ON attendance(ngay_diem_danh);
    CREATE INDEX IF NOT EXISTS idx_sessions_ngay ON sessions(ngay_hoc);
  `);
}

module.exports = { runSchema };
