/**
 * Azota exam-result: fetch from Azota API, OCR via Python service, match names, return results.
 * POST /api/azota-exam-result/process
 * Body: examId, bearerToken, cookie?, classId? | studentNames?
 */
const express = require('express');
const router = express.Router();
const { db } = require('../db');
const logger = require('../utils/azotaLogger');

const OCR_SERVICE_URL = process.env.OCR_SERVICE_URL || 'http://localhost:8000';
const AZOTA_EXAM_RESULT_BASE = 'https://azota.vn/private-api/exams';
const AZOTA_TEACHER_API_BASE = 'https://azt-teacher-api.azota.vn';

function normalizeBearerToken(s) {
  if (s == null || typeof s !== 'string') return '';
  const t = s.trim();
  if (t.toLowerCase().startsWith('bearer ')) return t.slice(7).trim();
  return t;
}

function getMarkFromItem(item) {
  if (item == null) return '';
  if (item.mark != null && item.mark !== '') return String(item.mark);
  if (item.markPercent != null) return String(item.markPercent);
  if (item.statisticObj && item.statisticObj.avgMark != null) return String(item.statisticObj.avgMark);
  return '';
}

function getNameImageUrlFromItem(item) {
  if (item == null) return '';
  const ni = item.nameImages;
  if (ni && ni.url) return String(ni.url);
  if (ni && typeof ni === 'object' && ni[0] && ni[0].url) return String(ni[0].url);
  const ani = item.attendeeNameImage;
  if (ani && ani.url) return String(ani.url);
  return '';
}

/** Try to get grading/submit timestamp from item (Azota API may use various field names). */
function getItemTimestamp(item) {
  if (item == null) return null;
  const keys = ['submitTime', 'gradedAt', 'createdAt', 'lastModified', 'updatedAt', 'time', 'submitAt', 'graded_at', 'created_at'];
  for (const k of keys) {
    const v = item[k];
    if (v == null) continue;
    if (typeof v === 'number' && v > 0) return v;
    if (typeof v === 'string' && v.trim()) {
      const parsed = Date.parse(v);
      if (!Number.isNaN(parsed)) return parsed;
    }
  }
  return null;
}

/** Group item indices by 30-minute time windows. Returns [{ start, end, indices }, ...] sorted by start. */
function groupItemsByTimeSlots(items, windowMinutes = 30) {
  const windowMs = windowMinutes * 60 * 1000;
  const slotMap = new Map(); // slotKey -> { startMs, indices }
  for (let i = 0; i < items.length; i++) {
    const ts = getItemTimestamp(items[i]);
    const ms = ts != null ? Number(ts) : 0;
    const slotKey = ms > 0 ? Math.floor(ms / windowMs) * windowMs : null;
    if (slotKey == null) continue;
    if (!slotMap.has(slotKey)) slotMap.set(slotKey, { startMs: slotKey, indices: [] });
    slotMap.get(slotKey).indices.push(i);
  }
  const slots = Array.from(slotMap.values())
    .map(({ startMs, indices }) => ({
      start: new Date(startMs).toISOString(),
      end: new Date(startMs + windowMs).toISOString(),
      count: indices.length,
      indices,
    }))
    .sort((a, b) => a.start.localeCompare(b.start));
  return slots;
}

/**
 * Build processing order: "sắp xếp hình" – ưu tiên cửa sổ thời gian, rồi ưu tiên khớp điểm cao (ảnh rõ, khớp đúng) trước; còn lại để GV xử lý.
 * Returns indices sorted by (inPrioritySlot desc, score desc).
 */
function buildProcessingOrder(itemCount, timeSlots, selectedSlotIndex, matches) {
  const prioritySet = new Set();
  if (
    selectedSlotIndex != null &&
    timeSlots &&
    timeSlots[selectedSlotIndex] &&
    Array.isArray(timeSlots[selectedSlotIndex].indices)
  ) {
    timeSlots[selectedSlotIndex].indices.forEach((i) => prioritySet.add(i));
  }
  const indices = [];
  for (let r = 0; r < itemCount; r++) indices.push(r);
  indices.sort((a, b) => {
    const aSlot = prioritySet.has(a) ? 1 : 0;
    const bSlot = prioritySet.has(b) ? 1 : 0;
    if (bSlot !== aSlot) return bSlot - aSlot;
    const scoreA = (matches[a] && matches[a].score != null) ? Number(matches[a].score) : 0;
    const scoreB = (matches[b] && matches[b].score != null) ? Number(matches[b].score) : 0;
    return scoreB - scoreA;
  });
  return indices;
}

async function fetchExamResult(examId, token, cookie) {
  const headers = {
    'Authorization': 'Bearer ' + token,
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    'Referer': 'https://azota.vn/',
    'Origin': 'https://azota.vn',
    'Accept': 'application/json',
  };
  if (cookie && cookie.trim()) headers['Cookie'] = cookie.trim();

  const urls = [
    `${AZOTA_EXAM_RESULT_BASE}/${encodeURIComponent(examId)}/exam-result`,
    `${AZOTA_TEACHER_API_BASE}/private-api/exams/${encodeURIComponent(examId)}/exam-result`,
  ];

  for (const url of urls) {
    const res = await fetch(url, { method: 'get', headers });
    const text = await res.text();
    logger.apiFetch(url, res.status, text.length, text ? text.trim().slice(0, 150) : '');
    if (res.status !== 200) continue;
    if (!text || text.trim().charAt(0) === '<') continue;
    let json;
    try {
      json = JSON.parse(text);
    } catch (_) {
      continue;
    }
    if (json.data && Array.isArray(json.data)) return { items: json.data };
    if (json.items && Array.isArray(json.items)) return json;
    if (json.students && Array.isArray(json.students)) return { items: json.students };
    if (json.data === null && (json.success === 1 || json.code === 200)) {
      const listUrl = `${AZOTA_TEACHER_API_BASE}/api/ExamPageResult/ListResults?examId=${encodeURIComponent(examId)}`;
      const listRes = await fetch(listUrl, { method: 'get', headers });
      const listText = await listRes.text();
      logger.apiFetch(listUrl, listRes.status, listText.length, listText ? listText.trim().slice(0, 150) : '');
      if (listRes.status === 200 && listText && listText.trim().charAt(0) === '{') {
        try {
          const j = JSON.parse(listText);
          if (j.data && Array.isArray(j.data)) return { items: j.data };
          if (j.items && Array.isArray(j.items)) return { items: j.items };
          if (j.data && typeof j.data === 'object' && !Array.isArray(j.data)) {
            const dataKeys = Object.keys(j.data);
            for (const k of dataKeys) {
              if (Array.isArray(j.data[k])) return { items: j.data[k] };
              const val = j.data[k];
              if (val && typeof val === 'object' && !Array.isArray(val)) {
                for (const nk of Object.keys(val)) {
                  if (Array.isArray(val[nk])) return { items: val[nk] };
                }
              }
            }
          }
          const topKeys = Object.keys(j);
          for (const tk of topKeys) {
            const v = j[tk];
            if (Array.isArray(v)) return { items: v };
            if (v && typeof v === 'object' && !Array.isArray(v)) {
              for (const vk of Object.keys(v)) {
                if (Array.isArray(v[vk])) return { items: v[vk] };
              }
            }
          }
        } catch (_) {}
      }
    }
  }

  const listUrl = `${AZOTA_TEACHER_API_BASE}/api/ExamPageResult/ListResults?examId=${encodeURIComponent(examId)}`;
  const listRes = await fetch(listUrl, { method: 'get', headers });
  const listText = await listRes.text();
  logger.apiFetch(listUrl, listRes.status, listText.length, listText ? listText.trim().slice(0, 150) : '');
  if (listRes.status === 200 && listText && listText.trim().charAt(0) === '{') {
    try {
      const j = JSON.parse(listText);
      if (j.data && Array.isArray(j.data)) return { items: j.data };
      if (j.items && Array.isArray(j.items)) return { items: j.items };
      if (j.data && typeof j.data === 'object' && !Array.isArray(j.data)) {
        const dataKeys = Object.keys(j.data);
        for (const k of dataKeys) {
          if (Array.isArray(j.data[k])) return { items: j.data[k] };
          const val = j.data[k];
          if (val && typeof val === 'object' && !Array.isArray(val)) {
            for (const nk of Object.keys(val)) {
              if (Array.isArray(val[nk])) return { items: val[nk] };
            }
          }
        }
      }
      const topKeys = Object.keys(j);
      for (const tk of topKeys) {
        const v = j[tk];
        if (Array.isArray(v)) return { items: v };
        if (v && typeof v === 'object' && !Array.isArray(v)) {
          for (const vk of Object.keys(v)) {
            if (Array.isArray(v[vk])) return { items: v[vk] };
          }
        }
      }
    } catch (_) {}
  }

  const err = new Error('Không lấy được danh sách kết quả từ Azota. Kiểm tra examId và token.');
  logger.error('FETCH_EXAM_RESULT', err, { examId });
  throw err;
}

async function fetchImageAsBase64(imageUrl, token, cookie) {
  const headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    'Referer': 'https://azota.vn/',
    'Accept': 'image/*,*/*',
  };
  if (token) headers['Authorization'] = 'Bearer ' + token;
  if (cookie && cookie.trim()) headers['Cookie'] = cookie.trim();

  const res = await fetch(imageUrl, { method: 'get', headers });
  if (res.status !== 200) return null;
  const buf = Buffer.from(await res.arrayBuffer());
  return buf.toString('base64');
}

async function callOcrService(imageBase64, language = 'vi') {
  const base = OCR_SERVICE_URL.replace(/\/$/, '');
  try {
    const res = await fetch(`${base}/ocr`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ image_base64: imageBase64, language }),
      signal: AbortSignal.timeout(30000), // 30s timeout
    });
    if (!res.ok) {
      const err = await res.text();
      throw new Error('OCR service error: ' + (err || res.statusText));
    }
    const data = await res.json();
    return (data && data.text) ? String(data.text).trim() : '';
  } catch (err) {
    if (err.name === 'AbortError' || err.message.includes('fetch failed') || err.message.includes('ECONNREFUSED') || err.code === 'ECONNREFUSED') {
      throw new Error(`OCR service không chạy hoặc không thể kết nối đến ${base}. Vui lòng khởi động Python OCR service: cd python/ocr-service && uvicorn main:app --reload --port 8000`);
    }
    throw err;
  }
}

async function callMatchNames(recognizedNames, studentNames, threshold = 60, fallbackMinScore = 45) {
  const base = OCR_SERVICE_URL.replace(/\/$/, '');
  try {
    const res = await fetch(`${base}/match-names`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        recognized_names: recognizedNames,
        student_names: studentNames,
        threshold,
        fallback_min_score: fallbackMinScore,
      }),
      signal: AbortSignal.timeout(30000), // 30s timeout
    });
    if (!res.ok) {
      const err = await res.text();
      throw new Error('Match service error: ' + (err || res.statusText));
    }
    const data = await res.json();
    return (data && data.matches) ? data.matches : [];
  } catch (err) {
    if (err.name === 'AbortError' || err.message.includes('fetch failed') || err.message.includes('ECONNREFUSED') || err.code === 'ECONNREFUSED') {
      throw new Error(`Match-names service không chạy hoặc không thể kết nối đến ${base}. Vui lòng khởi động Python OCR service: cd python/ocr-service && uvicorn main:app --reload --port 8000`);
    }
    throw err;
  }
}

async function callImageHash(imageBase64) {
  const base = OCR_SERVICE_URL.replace(/\/$/, '');
  const res = await fetch(`${base}/image-hash`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ image_base64: imageBase64 }),
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error('Image-hash service error: ' + (err || res.statusText));
  }
  const data = await res.json();
  return (data && data.hash) ? String(data.hash) : null;
}

/** samples: [{ student_index, image_hash }]. Returns { student_index, score } or { student_index: -1 }. */
async function callMatchByImage(imageBase64, samples) {
  if (!samples || samples.length === 0) return { student_index: -1, score: 0 };
  const base = OCR_SERVICE_URL.replace(/\/$/, '');
  try {
    const res = await fetch(`${base}/match-by-image`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ image_base64: imageBase64, samples }),
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) return { student_index: -1, score: 0 };
    const data = await res.json();
    return {
      student_index: data.student_index != null ? Number(data.student_index) : -1,
      score: data.score != null ? Number(data.score) : 0,
    };
  } catch (e) {
    logger.processStep('MATCH_BY_IMAGE', e.message || 'match-by-image failed');
    return { student_index: -1, score: 0 };
  }
}

router.post('/process', async (req, res) => {
  const startTime = Date.now();
  let examId = (req.body && req.body.examId) != null ? String(req.body.examId).trim() : null;
  try {
    const { bearerToken, cookie, classId, studentNames: bodyStudentNames, selectedTimeSlot, slotIndex } = req.body || {};
    const token = normalizeBearerToken(bearerToken || '');
    if (!examId || !token) {
      logger.validation('examId/bearerToken', 'Thiếu examId hoặc bearerToken');
      return res.status(400).json({ error: 'Thiếu examId hoặc bearerToken.' });
    }
    if (!/^\d+$/.test(examId)) {
      logger.validation('examId', 'Exam ID phải là số');
      return res.status(400).json({ error: 'Exam ID phải là số.' });
    }

    let studentNames = Array.isArray(bodyStudentNames) ? bodyStudentNames : [];
    let studentsFromDb = [];
    if (classId) {
      const rows = db.prepare(
        'SELECT id, hoTen, maHV FROM students WHERE classId = ? ORDER BY id'
      ).all(classId);
      studentsFromDb = rows;
      if (!studentNames.length) {
        studentNames = rows.map((r) => (r.hoTen != null ? String(r.hoTen).trim() : ''));
      }
    }
    if (!studentNames.length) {
      logger.validation('studentNames/classId', 'Cần chọn lớp hoặc gửi danh sách tên học sinh');
      return res.status(400).json({ error: 'Cần chọn lớp hoặc gửi danh sách tên học sinh (studentNames).' });
    }

    logger.processStepStart('REQUEST', { examId, hasClassId: !!classId, studentCount: studentNames.length });

    logger.processStepStart('FETCH_EXAM_RESULT', { examId });
    const apiResponse = await fetchExamResult(examId, token, cookie || '');
    const items = apiResponse.items || [];
    logger.processStepEnd('FETCH_EXAM_RESULT', { itemsCount: items.length }, Date.now() - startTime);

    if (items.length === 0) {
      logger.resultSummary(examId, { itemsCount: 0, matchedCount: 0, durationMs: Date.now() - startTime });
      logger.processStepEnd('REQUEST', { itemsCount: 0, matchedCount: 0 }, Date.now() - startTime);
      return res.json({
        message: 'Không có kết quả nào trong đề thi này.',
        results: [],
        studentNames,
        timeSlots: [],
      });
    }

    const timeSlots = groupItemsByTimeSlots(items, 30);
    const selectedIdx = slotIndex != null ? Number(slotIndex) : (selectedTimeSlot && selectedTimeSlot.slotIndex != null ? Number(selectedTimeSlot.slotIndex) : null);
    if (items.length > 0 && items[0] && typeof items[0] === 'object') {
      logger.processStep('TIME_SLOTS', { timeSlotsCount: timeSlots.length, firstItemKeys: Object.keys(items[0]).slice(0, 15).join(',') });
    }

    const ocrLoopStart = Date.now();
    logger.processStepStart('OCR_LOOP', { itemsCount: items.length });
    const recognizedNames = [];
    const marks = [];
    const nameImageUrls = [];
    const nameImageDataUrls = [];
    const nameImageBase64s = []; // Để OCR lại khi không khớp tên
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      const mark = getMarkFromItem(item);
      const attendeeName = (item.attendeeName && String(item.attendeeName).trim()) || '';
      const imageUrl = getNameImageUrlFromItem(item);
      nameImageUrls.push(imageUrl || '');
      nameImageDataUrls.push(null);
      nameImageBase64s.push(null);
      let name = attendeeName;
      if (!name && imageUrl) {
        logger.ocrItem(i, 'START', { imageUrl: imageUrl.substring(0, 80) + (imageUrl.length > 80 ? '...' : '') });
        let base64;
        try {
          base64 = await fetchImageAsBase64(imageUrl, token, cookie || '');
        } catch (fetchErr) {
          logger.errorImageFetch(i, fetchErr, imageUrl);
          logger.ocrItem(i, 'FAIL', { reason: 'image_fetch', error: fetchErr.message });
        }
        if (base64) {
          nameImageBase64s[i] = base64;
          nameImageDataUrls[i] = 'data:image/jpeg;base64,' + base64;
          try {
            name = await callOcrService(base64, 'vi');
            logger.ocrItem(i, 'OK', { recognizedText: name ? name.substring(0, 100) : '' });
          } catch (e) {
            logger.errorOcr(i, e, imageUrl);
            logger.ocrItem(i, 'FAIL', { reason: 'ocr', error: e.message });
          }
        }
      } else if (name) {
        logger.ocrItem(i, 'OK', { source: 'api', recognizedText: name.substring(0, 100) });
      }
      recognizedNames.push(name || '');
      marks.push(mark);
    }
    logger.processStepEnd('OCR_LOOP', {
      recognizedCount: recognizedNames.length,
      withName: recognizedNames.filter(Boolean).length,
    }, Date.now() - ocrLoopStart);

    const MATCH_THRESHOLD = 75;
    const FALLBACK_MIN_SCORE = 60; // Tên gần nhất khi không đạt ngưỡng (để người dùng xác nhận)
    let matches;
    let matchFallbackUsed = false;
    logger.matchCall(recognizedNames.length, studentNames.length, MATCH_THRESHOLD);
    try {
      matches = await callMatchNames(recognizedNames, studentNames, MATCH_THRESHOLD, FALLBACK_MIN_SCORE);
      let matchCount = matches.filter((m) => m.index >= 0).length;
      const noMatchIndices = matches
        .map((m, idx) => (m.index < 0 && nameImageBase64s[idx] ? idx : -1))
        .filter((idx) => idx >= 0);
      if (noMatchIndices.length > 0) {
        logger.processStep('OCR_RETRY', `OCR lại ${noMatchIndices.length} ảnh không khớp tên`);
        for (const i of noMatchIndices) {
          try {
            const retryName = await callOcrService(nameImageBase64s[i], 'vi');
            if (retryName && String(retryName).trim() !== String(recognizedNames[i] || '').trim()) {
              recognizedNames[i] = String(retryName).trim();
              logger.ocrItem(i, 'OK', { source: 'retry', recognizedText: recognizedNames[i].substring(0, 80) });
            }
          } catch (e) {
            logger.ocrItem(i, 'FAIL', { reason: 'ocr_retry', error: e.message });
          }
        }
        matches = await callMatchNames(recognizedNames, studentNames, MATCH_THRESHOLD, FALLBACK_MIN_SCORE);
        matchCount = matches.filter((m) => m.index >= 0).length;
      }
      logger.matchCallResult(matchCount, matches.length, false);
      if (matchCount === 0 && recognizedNames.length > 0) {
        logger.matchZeroDetail(recognizedNames, studentNames, MATCH_THRESHOLD);
      }
    } catch (matchErr) {
      logger.errorMatch(matchErr);
      matchFallbackUsed = true;
      matches = recognizedNames.map((rec, idx) => ({
        recognized: rec,
        matched: '',
        index: -1,
        score: 0,
        fallback: false,
      }));
      logger.matchCallResult(0, matches.length, true);
    }

    const order = buildProcessingOrder(items.length, timeSlots, selectedIdx, matches);
    const usedStudentIndices = new Set();
    const assigned = Array(matches.length);
    for (let r = 0; r < matches.length; r++) assigned[r] = null;
    for (const r of order) {
      const m = matches[r];
      const studentIndex = m.index;
      if (studentIndex >= 0 && !usedStudentIndices.has(studentIndex)) {
        assigned[r] = { ...m };
        usedStudentIndices.add(studentIndex);
      } else {
        assigned[r] = {
          recognized: m.recognized,
          matched: '',
          index: -1,
          score: m.score != null ? m.score : 0,
          fallback: false,
        };
      }
    }

    if (classId && studentsFromDb.length > 0) {
      const sampleRows = db.prepare(
        'SELECT studentId, image_hash FROM ocr_handwriting_samples WHERE classId = ? AND image_hash IS NOT NULL AND image_hash != \'\''
      ).all(classId);
      const samples = sampleRows
        .map((row) => {
          const idx = studentsFromDb.findIndex((s) => s.id === row.studentId);
          if (idx < 0) return null;
          return { student_index: idx, image_hash: row.image_hash };
        })
        .filter(Boolean);
      if (samples.length > 0) {
        const noMatchWithImage = [];
        for (let r = 0; r < assigned.length; r++) {
          if (assigned[r].index < 0 && nameImageBase64s[r]) noMatchWithImage.push(r);
        }
        for (const r of noMatchWithImage) {
          try {
            const matchResult = await callMatchByImage(nameImageBase64s[r], samples);
            if (matchResult.student_index >= 0 && !usedStudentIndices.has(matchResult.student_index)) {
              const studentIndex = matchResult.student_index;
              assigned[r] = {
                recognized: assigned[r].recognized,
                matched: studentNames[studentIndex] || '',
                index: studentIndex,
                score: matchResult.score,
                fallback: false,
              };
              usedStudentIndices.add(studentIndex);
            }
          } catch (e) {
            logger.processStep('MATCH_BY_IMAGE_ITEM', e.message || '');
          }
        }
      }
    }

    const results = [];
    for (let r = 0; r < matches.length; r++) {
      const m = assigned[r] || matches[r];
      const studentIndex = m.index;
      const mark = marks[r] !== undefined ? marks[r] : '';
      const studentId = studentsFromDb[studentIndex] ? studentsFromDb[studentIndex].id : null;
      const studentName = (studentIndex >= 0 && studentNames[studentIndex]) ? studentNames[studentIndex] : '';
      results.push({
        studentId,
        studentName: studentName || m.matched || '',
        mark,
        recognizedName: m.recognized || '',
        score: m.score != null ? m.score : 0,
        matched: m.matched || '',
        matchFallback: m.fallback === true,
        nameImageUrl: nameImageUrls[r] || '',
        nameImageDataUrl: nameImageDataUrls[r] || null,
      });
    }

    const matchedCount = results.filter((x) => x.studentName).length;
    const durationMs = Date.now() - startTime;

    logger.resultSummary(examId, {
      itemsCount: items.length,
      matchedCount,
      totalResults: results.length,
      durationMs,
      matchFallbackUsed,
    });
    logger.resultItems(examId, results);
    logger.processStepEnd('REQUEST', {
      itemsCount: items.length,
      matchedCount,
      durationMs,
    }, durationMs);

    const payload = {
      message: `Đã xử lý ${items.length} kết quả, khớp ${matchedCount} học sinh.`,
      results,
      studentNames,
      timeSlots,
    };
    if (classId && studentsFromDb.length > 0) {
      payload.classStudents = studentsFromDb.map((s) => ({ id: s.id, hoTen: s.hoTen || '' }));
    }
    res.json(payload);
  } catch (e) {
    logger.errorRequest(examId != null ? examId : 'unknown', e);
    res.status(500).json({ error: e.message || 'Lỗi xử lý.' });
  }
});

router.post('/save-sample', async (req, res) => {
  try {
    const { studentId, classId, imageBase64 } = req.body || {};
    const sid = studentId != null ? Number(studentId) : NaN;
    const cid = classId != null ? Number(classId) : NaN;
    if (!Number.isInteger(sid) || sid <= 0 || !Number.isInteger(cid) || cid <= 0) {
      return res.status(400).json({ error: 'studentId và classId phải là số nguyên dương.' });
    }
    if (typeof imageBase64 !== 'string' || !imageBase64.trim()) {
      return res.status(400).json({ error: 'imageBase64 là bắt buộc.' });
    }
    const student = db.prepare('SELECT id, classId FROM students WHERE id = ?').get(sid);
    if (!student || student.classId !== cid) {
      return res.status(400).json({ error: 'Học sinh không thuộc lớp đã chọn.' });
    }
    const classRow = db.prepare('SELECT id FROM classes WHERE id = ?').get(cid);
    if (!classRow) {
      return res.status(400).json({ error: 'Lớp không tồn tại.' });
    }
    let imageHash = null;
    try {
      imageHash = await callImageHash(imageBase64.trim());
    } catch (e) {
      logger.processStep('SAVE_SAMPLE_HASH', e.message || 'image-hash failed');
    }
    db.prepare(
      'INSERT INTO ocr_handwriting_samples (studentId, classId, image_base64, image_hash) VALUES (?, ?, ?, ?)'
    ).run(sid, cid, imageBase64.trim(), imageHash);
    return res.json({ ok: true, message: 'Đã lưu mẫu chữ viết.' });
  } catch (e) {
    logger.errorRequest('save-sample', e);
    return res.status(500).json({ error: e.message || 'Lỗi lưu mẫu.' });
  }
});

module.exports = router;
