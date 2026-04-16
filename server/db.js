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
    -- KhÃ³a há»c (lá»›p lá»›n, cha cá»§a lá»›p con)
    CREATE TABLE IF NOT EXISTS courses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      azotaClassId TEXT,
      createdAt TEXT DEFAULT (datetime('now')),
      lastEditAt TEXT,
      lastEditBy TEXT
    );

    -- Lá»›p con (thuá»™c khÃ³a há»c)
    CREATE TABLE IF NOT EXISTS classes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      courseId INTEGER NOT NULL REFERENCES courses(id),
      name TEXT NOT NULL,
      scheduleConfig TEXT,
      createdAt TEXT DEFAULT (datetime('now')),
      lastEditAt TEXT,
      lastEditBy TEXT
    );

    -- Há»c sinh
    CREATE TABLE IF NOT EXISTS students (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      maHV TEXT NOT NULL UNIQUE,
      hoTen TEXT NOT NULL,
      ten TEXT,
      classId INTEGER NOT NULL REFERENCES classes(id),
      status TEXT DEFAULT 'Ä‘i há»c',
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

    -- Lá»‹ch sá»­ tÃ¬nh tráº¡ng há»c sinh
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

    -- Lá»‹ch sá»­ chuyá»ƒn lá»›p
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

    -- Lá»‹ch láº·p láº¡i má»—i tuáº§n
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

    -- Lá»‹ch sá»­ thay Ä‘á»•i lá»‹ch há»c
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

    -- Ca há»c
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

    -- Äiá»ƒm danh
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

    -- BÃ¡o cÃ¡o buá»•i - files
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

    -- BÃ¡o cÃ¡o buá»•i - há»c sinh (Ä‘iá»ƒm, Azota, nháº­n xÃ©t)
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

    -- SÆ¡ Ä‘á»“ chá»— ngá»“i theo ca há»c (7x4 = 28 gháº¿)
    CREATE TABLE IF NOT EXISTS session_seat_map (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      sessionId INTEGER NOT NULL REFERENCES sessions(id),
      seatRow INTEGER NOT NULL,
      seatCol INTEGER NOT NULL,
      studentId INTEGER REFERENCES students(id),
      seatLabel TEXT,
      meta TEXT,
      createdAt TEXT DEFAULT (datetime('now')),
      lastEditAt TEXT,
      lastEditBy TEXT,
      UNIQUE(sessionId, seatRow, seatCol),
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
    CREATE INDEX IF NOT EXISTS idx_session_seat_map_session ON session_seat_map(sessionId);
    CREATE INDEX IF NOT EXISTS idx_session_seat_map_student ON session_seat_map(studentId);

    -- HV lop khach dang ky tham gia ca
    CREATE TABLE IF NOT EXISTS session_guest_students (
      sessionId INTEGER NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
      studentId INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
      createdAt TEXT DEFAULT (datetime('now')),
      PRIMARY KEY (sessionId, studentId)
    );
    CREATE INDEX IF NOT EXISTS idx_session_guest_session ON session_guest_students(sessionId);
    CREATE INDEX IF NOT EXISTS idx_session_guest_student ON session_guest_students(studentId);

    CREATE TABLE IF NOT EXISTS class_layout_config (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      classId INTEGER NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
      rows INTEGER NOT NULL DEFAULT 4,
      cols INTEGER NOT NULL DEFAULT 7,
      disabledSeats TEXT DEFAULT '[]',
      createdAt TEXT DEFAULT (datetime('now')),
      updatedAt TEXT DEFAULT (datetime('now')),
      UNIQUE(classId)
    );

    CREATE TABLE IF NOT EXISTS note_tags (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      label TEXT NOT NULL,
      type TEXT DEFAULT 'neutral' CHECK(type IN ('positive','negative','neutral')),
      icon TEXT,
      sortOrder INTEGER DEFAULT 0,
      isActive INTEGER DEFAULT 1,
      createdAt TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS student_session_notes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      studentId INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
      sessionId INTEGER NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
      tagId INTEGER REFERENCES note_tags(id),
      content TEXT,
      type TEXT DEFAULT 'neutral' CHECK(type IN ('positive','negative','neutral')),
      createdAt TEXT DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_student_notes_student ON student_session_notes(studentId);
    CREATE INDEX IF NOT EXISTS idx_student_notes_session ON student_session_notes(sessionId);
    CREATE INDEX IF NOT EXISTS idx_student_notes_student_session ON student_session_notes(studentId, sessionId);
  `);
  migrateSessionsThangYYYYMM();
  console.log('[db] Schema initialized');
}

/** Chuáº©n hÃ³a sessions.thang â†’ YYYY.MM (vÃ  Ä‘á»•i báº£n ghi cÅ© MM.YYYY) */
function migrateSessionsThangYYYYMM() {
  try {
    const { normalizeThang } = require('./routes/attendanceImportHelpers');
    const rows = db.prepare("SELECT id, thang FROM sessions WHERE thang IS NOT NULL AND thang != ''").all();
    let updated = 0;
    for (const r of rows) {
      const norm = normalizeThang(r.thang);
      if (norm && norm !== r.thang) {
        db.prepare('UPDATE sessions SET thang = ? WHERE id = ?').run(norm, r.id);
        updated++;
      }
    }
    if (updated) console.log('[db] sessions.thang â†’ YYYY.MM:', updated, 'rows');
  } catch (e) {
    console.warn('[db] migrateSessionsThangYYYYMM:', e.message);
  }
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
