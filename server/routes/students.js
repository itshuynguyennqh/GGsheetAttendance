const express = require('express');
const router = express.Router();
const { db, setLastEdit } = require('../db');

router.get('/timestamp', (req, res) => {
  try {
    const { classId } = req.query;
    
    // Get max lastEditAt from students and classes tables
    let sql = `
      SELECT MAX(ts) as maxTimestamp FROM (
        SELECT MAX(lastEditAt) as ts FROM students
        UNION ALL
        SELECT MAX(lastEditAt) as ts FROM classes
      )
    `;
    
    // If classId is provided, filter students by classId
    if (classId) {
      sql = `
        SELECT MAX(ts) as maxTimestamp FROM (
          SELECT MAX(lastEditAt) as ts FROM students WHERE classId = ?
          UNION ALL
          SELECT MAX(lastEditAt) as ts FROM classes WHERE id = ?
        )
      `;
      const result = db.prepare(sql).get(classId, classId);
      return res.json({ timestamp: result?.maxTimestamp || null });
    }
    
    const result = db.prepare(sql).get();
    res.json({ timestamp: result?.maxTimestamp || null });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.get('/', (req, res) => {
  try {
    let sql = 'SELECT s.*, c.name as className FROM students s LEFT JOIN classes c ON s.classId = c.id WHERE 1=1';
    const params = [];
    if (req.query.classId) {
      sql += ' AND s.classId = ?';
      params.push(req.query.classId);
    }
    if (req.query.status) {
      sql += ' AND s.status = ?';
      params.push(req.query.status);
    }
    sql += ' ORDER BY s.id';
    const rows = db.prepare(sql).all(...params);
    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.get('/:id', (req, res) => {
  try {
    const row = db.prepare(
      'SELECT s.*, c.name as className FROM students s LEFT JOIN classes c ON s.classId = c.id WHERE s.id = ?'
    ).get(req.params.id);
    if (!row) return res.status(404).json({ error: 'Not found' });
    res.json(row);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/', (req, res) => {
  try {
    const {
      maHV, hoTen, ten, classId, status, namSinh, soDTRieng, soDTPhuHuynh, tenPhuHuynh,
      diaChi, gioiTinh, addToAzota
    } = req.body;
    const result = db.prepare(
      `INSERT INTO students (maHV, hoTen, ten, classId, status, namSinh, soDTRieng, soDTPhuHuynh, tenPhuHuynh, diaChi, gioiTinh)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      maHV || '', hoTen || '', ten || null, classId,
      status || 'đi học', namSinh ?? null, soDTRieng || null, soDTPhuHuynh || null, tenPhuHuynh || null,
      diaChi || null, gioiTinh || null
    );
    const row = db.prepare('SELECT * FROM students WHERE id = ?').get(result.lastInsertRowid);
    res.status(201).json(row);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/bulk-import', (req, res) => {
  try {
    const { students } = req.body;
    if (!Array.isArray(students) || students.length === 0) {
      return res.status(400).json({ error: 'Danh sách học sinh không hợp lệ' });
    }

    // Lấy danh sách tất cả các lớp để validate
    const allClasses = db.prepare('SELECT id FROM classes').all();
    const validClassIds = new Set(allClasses.map(c => c.id));

    const insertStmt = db.prepare(
      `INSERT INTO students (maHV, hoTen, ten, classId, status, namSinh, soDTRieng, soDTPhuHuynh, tenPhuHuynh, diaChi, gioiTinh)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    );

    const results = { success: [], errors: [] };
    const transaction = db.transaction((students) => {
      for (let i = 0; i < students.length; i++) {
        const s = students[i];
        try {
          // Validate required fields - both maHV and hoTen are required
          const maHV = (s.maHV || '').trim();
          const hoTen = (s.hoTen || '').trim();
          
          if (!maHV || !hoTen) {
            results.errors.push({ 
              index: i + 1, 
              maHV: maHV || '—', 
              hoTen: hoTen || '—', 
              error: maHV ? 'Thiếu Họ tên' : hoTen ? 'Thiếu Mã HV' : 'Thiếu Mã HV và Họ tên'
            });
            continue;
          }

          // Validate classId
          if (!s.classId) {
            results.errors.push({ 
              index: i + 1, 
              maHV: maHV, 
              hoTen: hoTen, 
              error: 'Thiếu thông tin lớp (classId)' 
            });
            continue;
          }

          const classId = Number(s.classId);
          if (isNaN(classId) || !validClassIds.has(classId)) {
            results.errors.push({ 
              index: i + 1, 
              maHV: maHV, 
              hoTen: hoTen, 
              error: `Lớp không hợp lệ (classId: ${s.classId}). Vui lòng kiểm tra lại tên lớp trong file Excel.` 
            });
            continue;
          }

          // Check for duplicate maHV in the same class
          const existing = db.prepare('SELECT id FROM students WHERE maHV = ? AND classId = ?').get(maHV, classId);
          if (existing) {
            results.errors.push({ 
              index: i + 1, 
              maHV: maHV, 
              hoTen: hoTen, 
              error: `Mã HV "${maHV}" đã tồn tại trong lớp này` 
            });
            continue;
          }

          try {
            const result = insertStmt.run(
              maHV, hoTen, (s.ten || '').trim() || null, classId,
              s.status || 'đi học', s.namSinh ?? null, (s.soDTRieng || '').trim() || null, 
              (s.soDTPhuHuynh || '').trim() || null, (s.tenPhuHuynh || '').trim() || null,
              (s.diaChi || '').trim() || null, (s.gioiTinh || '').trim() || null
            );
            
            // Verify the inserted row exists
            const row = db.prepare('SELECT * FROM students WHERE id = ?').get(result.lastInsertRowid);
            if (!row) {
              throw new Error('Không thể tìm thấy học sinh vừa được thêm vào');
            }
            results.success.push(row);
          } catch (insertError) {
            const msg = insertError.message || '';
            const friendlyMessage =
              msg.includes('UNIQUE') || msg.includes('SQLITE_CONSTRAINT')
                ? `Mã HV "${maHV}" đã tồn tại trong hệ thống (trùng với học sinh khác).`
                : msg.includes('NOT NULL')
                  ? 'Thiếu thông tin bắt buộc (Mã HV hoặc Họ tên).'
                  : insertError.message || 'Lỗi khi thêm học sinh vào cơ sở dữ liệu.';
            results.errors.push({
              index: i + 1,
              maHV: maHV,
              hoTen: hoTen,
              error: friendlyMessage,
            });
          }
        } catch (e) {
          const msg = e.message || '';
          const friendlyMessage =
            msg.includes('UNIQUE') || msg.includes('SQLITE_CONSTRAINT')
              ? 'Mã HV đã tồn tại trong hệ thống (trùng với học sinh khác).'
              : msg.includes('NOT NULL')
                ? 'Thiếu thông tin bắt buộc (Mã HV hoặc Họ tên).'
                : msg || 'Lỗi không xác định.';
          results.errors.push({
            index: i + 1,
            maHV: (s.maHV || '').toString().trim(),
            hoTen: (s.hoTen || '').toString().trim(),
            error: friendlyMessage,
          });
        }
      }
    });

    transaction(students);
    res.json(results);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.put('/:id', (req, res) => {
  try {
    const {
      maHV, hoTen, ten, classId, status, namSinh, soDTRieng, soDTPhuHuynh, tenPhuHuynh,
      diaChi, gioiTinh
    } = req.body;
    const stmt = db.prepare(
      `UPDATE students SET
        maHV = COALESCE(?, maHV), hoTen = COALESCE(?, hoTen), ten = COALESCE(?, ten),
        classId = COALESCE(?, classId), status = COALESCE(?, status), namSinh = ?,
        soDTRieng = COALESCE(?, soDTRieng), soDTPhuHuynh = COALESCE(?, soDTPhuHuynh),
        tenPhuHuynh = COALESCE(?, tenPhuHuynh), diaChi = COALESCE(?, diaChi), gioiTinh = COALESCE(?, gioiTinh)
       WHERE id = ?`
    );
    stmt.run(
      maHV ?? undefined, hoTen ?? undefined, ten ?? undefined, classId ?? undefined, status ?? undefined,
      namSinh ?? undefined, soDTRieng ?? undefined, soDTPhuHuynh ?? undefined, tenPhuHuynh ?? undefined,
      diaChi ?? undefined, gioiTinh ?? undefined, req.params.id
    );
    setLastEdit('students', req.params.id);
    const row = db.prepare('SELECT * FROM students WHERE id = ?').get(req.params.id);
    if (!row) return res.status(404).json({ error: 'Not found' });
    res.json(row);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.delete('/:id', (req, res) => {
  try {
    // Xóa các bản ghi liên quan trước để tránh lỗi FK constraint
    db.prepare('DELETE FROM attendance WHERE studentId = ?').run(req.params.id);
    db.prepare('DELETE FROM session_report_student WHERE studentId = ?').run(req.params.id);
    db.prepare('DELETE FROM session_report_files WHERE studentId = ?').run(req.params.id);
    db.prepare('DELETE FROM student_status_history WHERE studentId = ?').run(req.params.id);
    db.prepare('DELETE FROM student_class_transfer_history WHERE studentId = ?').run(req.params.id);
    
    const result = db.prepare('DELETE FROM students WHERE id = ?').run(req.params.id);
    if (result.changes === 0) return res.status(404).json({ error: 'Not found' });
    res.status(204).send();
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Status history
router.get('/:id/status-history', (req, res) => {
  try {
    const rows = db.prepare(
      'SELECT * FROM student_status_history WHERE studentId = ? ORDER BY ngayThucHien DESC'
    ).all(req.params.id);
    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/:id/status-history', (req, res) => {
  try {
    const { ngayThucHien, note, trangThaiMoi } = req.body;
    const studentId = parseInt(req.params.id, 10);
    const result = db.prepare(
      'INSERT INTO student_status_history (studentId, ngayThucHien, note, trangThaiMoi) VALUES (?, ?, ?, ?)'
    ).run(studentId, ngayThucHien || new Date().toISOString().slice(0, 10), note || null, trangThaiMoi || 'đi học');
    db.prepare('UPDATE students SET status = ? WHERE id = ?').run(trangThaiMoi, studentId);
    setLastEdit('students', studentId);
    const row = db.prepare('SELECT * FROM student_status_history WHERE id = ?').get(result.lastInsertRowid);
    res.status(201).json(row);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Class transfer history
router.get('/:id/class-transfer-history', (req, res) => {
  try {
    const rows = db.prepare(
      'SELECT * FROM student_class_transfer_history WHERE studentId = ? ORDER BY ngayThucHien DESC'
    ).all(req.params.id);
    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/:id/class-transfer-history', (req, res) => {
  try {
    const { classIdFrom, classIdTo, ngayThucHien, loaiChuyen, lyDo, note } = req.body;
    const studentId = parseInt(req.params.id, 10);
    const result = db.prepare(
      'INSERT INTO student_class_transfer_history (studentId, classIdFrom, classIdTo, ngayThucHien, loaiChuyen, lyDo, note) VALUES (?, ?, ?, ?, ?, ?, ?)'
    ).run(studentId, classIdFrom, classIdTo, ngayThucHien || new Date().toISOString().slice(0, 10), loaiChuyen || 'lau_dai', lyDo || null, note || null);
    db.prepare('UPDATE students SET classId = ? WHERE id = ?').run(classIdTo, studentId);
    setLastEdit('students', studentId);
    const row = db.prepare('SELECT * FROM student_class_transfer_history WHERE id = ?').get(result.lastInsertRowid);
    res.status(201).json(row);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
