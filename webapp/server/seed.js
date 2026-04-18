const { db, initSchema } = require('./db');

initSchema();

const existingCourse = db.prepare('SELECT id FROM courses LIMIT 1').get();
if (!existingCourse) {

const course = db.prepare('INSERT INTO courses (name) VALUES (?)').run('Khóa 9');
const courseId = course.lastInsertRowid;

const cls = db.prepare('INSERT INTO classes (courseId, name) VALUES (?, ?)').run(courseId, '9.1');
const classId = cls.lastInsertRowid;

['Nguyễn Văn A', 'Trần Thị B', 'Lê Văn C', 'Phạm Thị D'].forEach((name, i) => {
  const parts = name.split(' ');
  const ten = parts[parts.length - 1];
  const maHV = `HV${String(i + 1).padStart(3, '0')}`;
  db.prepare(
    'INSERT INTO students (maHV, hoTen, ten, classId) VALUES (?, ?, ?, ?)'
  ).run(maHV, name, ten, classId);
});

db.prepare(
  'INSERT INTO class_schedule_template (classId, dayOfWeek, startTime, noiDungHoc) VALUES (?, 1, ?, ?), (?, 3, ?, ?), (?, 5, ?, ?)'
).run(classId, '19:00', 'Toán', classId, '19:00', 'Văn', classId, '19:00', 'Anh');

const sess = db.prepare(
  'INSERT INTO sessions (classId, ngayHoc, startTime, thang, buoi, noiDungHoc, sourceType) VALUES (?, ?, ?, ?, ?, ?, ?)'
).run(classId, new Date().toISOString().slice(0, 10), '19:00', '2026.01', 1, 'Buổi 1', 'manual');

console.log('[seed] Created course, class 9.1, 4 students, 3 schedule slots, 1 session');
} else {
  const classRow = db.prepare('SELECT id FROM classes LIMIT 1').get();
  if (classRow) {
    const tid = db.prepare('SELECT id FROM class_schedule_template WHERE classId = ? LIMIT 1').get(classRow.id);
    if (!tid) {
      db.prepare(
        'INSERT INTO class_schedule_template (classId, dayOfWeek, startTime, noiDungHoc) VALUES (?, 1, ?, ?), (?, 3, ?, ?), (?, 5, ?, ?)'
      ).run(classRow.id, '19:00', 'Toán', classRow.id, '19:00', 'Văn', classRow.id, '19:00', 'Anh');
      db.prepare(
        'INSERT INTO sessions (classId, ngayHoc, startTime, thang, buoi, noiDungHoc, sourceType) VALUES (?, ?, ?, ?, ?, ?, ?)'
      ).run(classRow.id, new Date().toISOString().slice(0, 10), '19:00', '2026.01', 1, 'Buổi 1', 'manual');
      console.log('[seed] Added schedule slots and 1 session');
    }
  }
}
