const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const DATA_DIR = path.join(__dirname, '..', 'data');
const DB_PATH = path.join(DATA_DIR, 'attendance.db');

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

function initSchema() {
  db.exec(`
    -- Khóa học (lớp lớn, cha của lớp con)
    CREATE TABLE IF NOT EXISTS courses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      azotaClassId TEXT,
      createdAt TEXT DEFAULT (datetime('now')),
      lastEditAt TEXT,
      lastEditBy TEXT
    );

    -- Lớp con (thuộc khóa học)
    CREATE TABLE IF NOT EXISTS classes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      courseId INTEGER NOT NULL REFERENCES courses(id),
      name TEXT NOT NULL,
      scheduleConfig TEXT,
      createdAt TEXT DEFAULT (datetime('now')),
      lastEditAt TEXT,
      lastEditBy TEXT
    );

    -- Học sinh
    CREATE TABLE IF NOT EXISTS students (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      maHV TEXT NOT NULL UNIQUE,
      hoTen TEXT NOT NULL,
      ten TEXT,
      classId INTEGER NOT NULL REFERENCES classes(id),
      status TEXT DEFAULT 'đi học',
      namSinh INTEGER,
      soDTRieng TEXT,
      soDTPhuHuynh TEXT,
      tenPhuHuynh TEXT,
      diaChi TEXT,
      gioiTinh TEXT,
      azotaId TEXT,
      azotaCode TEXT,
      azotaSyncedAt TEXT,
      azotaSyncStatus TEXT,
      createdAt TEXT DEFAULT (datetime('now')),
      lastEditAt TEXT,
      lastEditBy TEXT
    );

    -- Lịch sử tình trạng học sinh
    CREATE TABLE IF NOT EXISTS student_status_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      studentId INTEGER NOT NULL REFERENCES students(id),
      ngayThucHien TEXT NOT NULL,
      note TEXT,
      trangThaiMoi TEXT NOT NULL,
      createdAt TEXT DEFAULT (datetime('now')),
      lastEditAt TEXT,
      lastEditBy TEXT
    );

    -- Lịch sử chuyển lớp
    CREATE TABLE IF NOT EXISTS student_class_transfer_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      studentId INTEGER NOT NULL REFERENCES students(id),
      classIdFrom INTEGER NOT NULL REFERENCES classes(id),
      classIdTo INTEGER NOT NULL REFERENCES classes(id),
      ngayThucHien TEXT NOT NULL,
      loaiChuyen TEXT NOT NULL,
      lyDo TEXT,
      note TEXT,
      createdAt TEXT DEFAULT (datetime('now')),
      lastEditAt TEXT,
      lastEditBy TEXT
    );

    -- Lịch lặp lại mỗi tuần
    CREATE TABLE IF NOT EXISTS class_schedule_template (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      classId INTEGER NOT NULL REFERENCES classes(id),
      dayOfWeek INTEGER NOT NULL,
      startTime TEXT DEFAULT '19:00',
      noiDungHoc TEXT,
      isActive INTEGER DEFAULT 1,
      createdAt TEXT DEFAULT (datetime('now')),
      lastEditAt TEXT,
      lastEditBy TEXT
    );

    -- Lịch sử thay đổi lịch học
    CREATE TABLE IF NOT EXISTS class_schedule_template_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      classId INTEGER NOT NULL REFERENCES classes(id),
      templateId INTEGER REFERENCES class_schedule_template(id),
      action TEXT NOT NULL,
      dayOfWeek INTEGER,
      startTime TEXT,
      noiDungHoc TEXT,
      isActive INTEGER,
      createdAt TEXT DEFAULT (datetime('now')),
      note TEXT
    );

    -- Ca học
    CREATE TABLE IF NOT EXISTS sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      classId INTEGER NOT NULL REFERENCES classes(id),
      ngayHoc TEXT NOT NULL,
      startTime TEXT DEFAULT '19:00',
      thang TEXT,
      buoi INTEGER,
      noiDungHoc TEXT,
      sourceType TEXT DEFAULT 'manual',
      enableAttendance INTEGER DEFAULT 1,
      createdAt TEXT DEFAULT (datetime('now')),
      lastEditAt TEXT,
      lastEditBy TEXT,
      UNIQUE(classId, ngayHoc, startTime)
    );

    -- Điểm danh
    CREATE TABLE IF NOT EXISTS attendance (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      studentId INTEGER NOT NULL REFERENCES students(id),
      sessionId INTEGER NOT NULL REFERENCES sessions(id),
      ngayDiemDanh TEXT,
      value TEXT,
      note TEXT,
      createdAt TEXT DEFAULT (datetime('now')),
      lastEditAt TEXT,
      lastEditBy TEXT,
      UNIQUE(studentId, sessionId)
    );

    -- Báo cáo buổi - files
    CREATE TABLE IF NOT EXISTS session_report_files (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      sessionId INTEGER NOT NULL REFERENCES sessions(id),
      studentId INTEGER REFERENCES students(id),
      fileType TEXT NOT NULL,
      filePath TEXT NOT NULL,
      originalName TEXT,
      aiSummary TEXT,
      createdAt TEXT DEFAULT (datetime('now')),
      lastEditAt TEXT,
      lastEditBy TEXT
    );

    -- Báo cáo buổi - học sinh (điểm, Azota, nhận xét)
    CREATE TABLE IF NOT EXISTS session_report_student (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      sessionId INTEGER NOT NULL REFERENCES sessions(id),
      studentId INTEGER NOT NULL REFERENCES students(id),
      diem TEXT,
      azotaResult TEXT,
      nhanXetGiangVien TEXT,
      createdAt TEXT DEFAULT (datetime('now')),
      lastEditAt TEXT,
      lastEditBy TEXT,
      UNIQUE(sessionId, studentId)
    );

    -- Cache Azota
    CREATE TABLE IF NOT EXISTS azota_classroom_cache (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      azota_classroom_id TEXT NOT NULL UNIQUE,
      name TEXT,
      group_name TEXT,
      year TEXT,
      count_students INTEGER,
      hash_id TEXT,
      raw_json TEXT,
      fetched_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS azota_student_cache (
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

    CREATE TABLE IF NOT EXISTS azota_document_cache (
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

    CREATE TABLE IF NOT EXISTS azota_btvn_result_cache (
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

    -- OCR handwriting samples: student_id + image (and hash) for match-by-image
    CREATE TABLE IF NOT EXISTS ocr_handwriting_samples (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      studentId INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
      classId INTEGER NOT NULL REFERENCES classes(id),
      image_base64 TEXT NOT NULL,
      image_hash TEXT,
      createdAt TEXT DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_ocr_samples_student ON ocr_handwriting_samples(studentId);
    CREATE INDEX IF NOT EXISTS idx_ocr_samples_class ON ocr_handwriting_samples(classId);

    -- Indexes for attendance timestamp query performance
    CREATE INDEX IF NOT EXISTS idx_sessions_class_ngay ON sessions(classId, ngayHoc);
    CREATE INDEX IF NOT EXISTS idx_sessions_class_ena_ngay ON sessions(classId, enableAttendance, ngayHoc);
    CREATE INDEX IF NOT EXISTS idx_sessions_class_ena_tb_ngay ON sessions(classId, enableAttendance, thang, buoi, ngayHoc);
    CREATE INDEX IF NOT EXISTS idx_attendance_session ON attendance(sessionId);
    CREATE INDEX IF NOT EXISTS idx_attendance_lastEditAt ON attendance(lastEditAt);
    CREATE INDEX IF NOT EXISTS idx_sessions_lastEditAt ON sessions(lastEditAt);
  `);
  console.log('[db] Schema initialized');
}

function setLastEdit(table, id, by = 'user') {
  const now = new Date().toISOString();
  db.prepare(`UPDATE ${table} SET lastEditAt = ?, lastEditBy = ? WHERE id = ?`).run(now, by, id);
}

const DEBUG_API = process.env.DEBUG_API === '1' || process.env.DEBUG === '1';
const DEBUG_ATTENDANCE_TIMING = process.env.DEBUG_ATTENDANCE_TIMING === '1' || DEBUG_API;

function logTiming(label, ms, extra = {}) {
  if (DEBUG_ATTENDANCE_TIMING && ms !== undefined) {
    console.log(`[attendance] ${label}: ${ms}ms`, Object.keys(extra).length ? extra : '');
  }
}

function logError(e, context = '') {
  if (DEBUG_API) {
    console.error(`[ERROR${context ? ' ' + context : ''}]`, e.message);
    console.error('[STACK]', e.stack);
  } else {
    console.error(`[ERROR${context ? ' ' + context : ''}]`, e.message);
  }
}

module.exports = { db, initSchema, setLastEdit, DB_PATH, logError, logTiming };
