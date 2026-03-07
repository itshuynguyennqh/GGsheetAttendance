/**
 * Logger chi tiết cho hệ thống Azota Exam Result
 * Ghi log: lỗi (đầy đủ), kết quả (tóm tắt + chi tiết), quá trình (từng bước).
 */
const fs = require('fs');
const path = require('path');

const LOG_DIR = path.join(__dirname, '..', 'logs');
const LOG_FILE_PREFIX = 'azota-exam-result';

if (!fs.existsSync(LOG_DIR)) {
  fs.mkdirSync(LOG_DIR, { recursive: true });
}

function getLogFilePath() {
  const today = new Date().toISOString().split('T')[0];
  return path.join(LOG_DIR, `${LOG_FILE_PREFIX}-${today}.log`);
}

function formatTimestamp() {
  return new Date().toISOString().replace('T', ' ').substring(0, 23);
}

function writeLog(level, category, message, data = null) {
  const timestamp = formatTimestamp();
  const logEntry = {
    timestamp,
    level,
    category,
    message,
    ...(data != null && data !== undefined && { data }),
  };
  const logLine = JSON.stringify(logEntry) + '\n';
  const consoleLine = `[${timestamp}] [${level}] [${category}] ${message}${data != null && data !== undefined ? ' ' + JSON.stringify(data) : ''}`;

  if (level === 'ERROR' || level === 'WARN') {
    console.error(consoleLine);
  } else {
    console.log(consoleLine);
  }
  try {
    fs.appendFileSync(getLogFilePath(), logLine, 'utf8');
  } catch (err) {
    console.error('[azota-logger] Failed to write log file:', err.message);
  }
}

const logger = {
  // --- Quá trình (process steps) ---
  processStep: (stepName, state, detail = null) => {
    writeLog('INFO', 'PROCESS', `[${stepName}] ${state}`, detail);
  },

  processStepStart: (stepName, inputSummary) => {
    logger.processStep(stepName, 'START', inputSummary);
  },

  processStepEnd: (stepName, outputSummary, durationMs = null) => {
    const detail = durationMs != null ? { ...outputSummary, durationMs } : outputSummary;
    logger.processStep(stepName, 'END', detail);
  },

  // --- Lỗi (errors) ---
  error: (context, err, extra = null) => {
    const message = err && typeof err === 'object' ? (err.message || String(err)) : String(err);
    const stack = err && err.stack ? err.stack : '';
    writeLog('ERROR', 'ERROR', message, {
      context,
      errorMessage: message,
      stack,
      ...(extra && typeof extra === 'object' ? extra : { extra }),
    });
  },

  errorOcr: (itemIndex, err, imageUrl = null) => {
    logger.error('OCR', err, { itemIndex, imageUrl: imageUrl ? imageUrl.substring(0, 120) + (imageUrl.length > 120 ? '...' : '') : null });
  },

  errorImageFetch: (itemIndex, err, imageUrl = null) => {
    logger.error('IMAGE_FETCH', err, { itemIndex, imageUrl: imageUrl ? imageUrl.substring(0, 120) + (imageUrl.length > 120 ? '...' : '') : null });
  },

  errorMatch: (err) => {
    logger.error('MATCH_NAMES', err, { serviceUrl: process.env.OCR_SERVICE_URL || 'http://localhost:8000' });
  },

  errorRequest: (examId, err) => {
    logger.error('REQUEST', err, { examId });
  },

  // --- Kết quả (results) ---
  resultSummary: (examId, summary) => {
    writeLog('INFO', 'RESULT_SUMMARY', 'Kết quả xử lý', {
      examId,
      ...summary,
    });
  },

  resultItems: (examId, results) => {
    if (!Array.isArray(results) || results.length === 0) return;
    writeLog('INFO', 'RESULT_ITEMS', 'Chi tiết từng kết quả', {
      examId,
      count: results.length,
      items: results.map((r, i) => ({
        index: i,
        studentName: r.studentName,
        recognizedName: r.recognizedName,
        mark: r.mark,
        score: r.score,
        matched: r.matched,
        matchFallback: r.matchFallback,
        studentId: r.studentId,
      })),
    });
  },

  // --- API / Fetch ---
  apiFetch: (url, status, bodyLength, bodyPreview = null) => {
    writeLog('INFO', 'API_FETCH', 'Gọi API', {
      url: url.length > 100 ? url.substring(0, 100) + '...' : url,
      status,
      bodyLength,
      bodyPreview: bodyPreview != null ? String(bodyPreview).substring(0, 150) : null,
    });
  },

  // --- OCR ---
  ocrItem: (itemIndex, status, detail) => {
    writeLog('INFO', 'OCR', `Item ${itemIndex} ${status}`, { itemIndex, ...detail });
  },

  // --- Match ---
  matchCall: (recognizedCount, studentCount, threshold) => {
    writeLog('INFO', 'MATCH', 'Gọi match-names', { recognizedCount, studentCount, threshold });
  },

  matchCallResult: (matchCount, totalCount, fallbackUsed) => {
    writeLog('INFO', 'MATCH', 'Kết quả match-names', { matchCount, totalCount, fallbackUsed });
  },

  /** Gọi khi matchCount === 0 để debug: log recognized names và mẫu student names */
  matchZeroDetail: (recognizedNames, studentNames, threshold) => {
    writeLog('WARN', 'MATCH', 'Khớp 0 học sinh – chi tiết để debug', {
      recognizedCount: recognizedNames?.length ?? 0,
      studentCount: studentNames?.length ?? 0,
      threshold,
      recognizedNames: Array.isArray(recognizedNames) ? recognizedNames : [],
      studentNamesSample: Array.isArray(studentNames) ? studentNames.slice(0, 10) : [],
    });
  },

  // --- Validation ---
  validation: (field, reason) => {
    writeLog('WARN', 'VALIDATION', 'Validation', { field, reason });
  },
};

module.exports = logger;
