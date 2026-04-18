const API = '/api';

const DEBUG_API = typeof window !== 'undefined' && (
  window.localStorage?.getItem('DEBUG_API') === '1' ||
  import.meta.env?.DEV
);

function debugLog(...args) {
  if (DEBUG_API) {
    console.debug('[API]', ...args);
  }
}

async function request(path, options = {}) {
  const method = options.method || 'GET';
  const url = `${API}${path}`;
  const body = options.body;
  const start = performance.now();

  debugLog(`${method} ${url}`, body ? { body: body.length > 200 ? body.slice(0, 200) + '…' : body } : '');

  const res = await fetch(url, {
    headers: { 'Content-Type': 'application/json', ...options.headers },
    ...options,
  });

  const duration = Math.round(performance.now() - start);
  const contentType = res.headers.get('content-type') || '';

  if (res.status === 204) {
    debugLog(`← ${res.status} (${duration}ms) ${method} ${path}`);
    return null;
  }

  const raw = await res.text();
  const data = raw ? (() => {
    try {
      return contentType.includes('application/json') ? JSON.parse(raw) : raw;
    } catch {
      return raw;
    }
  })() : {};

  const preview = Array.isArray(data)
    ? `[${data.length} items]`
    : typeof data === 'object' && data !== null
      ? (data.error ? { error: data.error } : { ...Object.fromEntries(Object.entries(data).slice(0, 3)), _keys: Object.keys(data).length })
      : data;
  debugLog(`← ${res.status} (${duration}ms) ${method} ${path}`, preview);

  if (!res.ok) throw new Error(data.error || data.message || res.statusText);
  if (options.returnMeta) {
    return { data, headers: Object.fromEntries(res.headers.entries()) };
  }
  return data;
}

// Generic cache utility
function createCacheApi(prefix) {
  const CACHE_PREFIX = `${prefix}_cache_`;
  const CACHE_TIMESTAMP_PREFIX = `${prefix}_timestamp_`;

  function getCacheKey(params) {
    if (!params) return 'all';
    const q = new URLSearchParams(params).toString();
    return q || 'all';
  }

  function getCache(params) {
    try {
      const key = getCacheKey(params);
      const cacheKey = CACHE_PREFIX + key;
      const timestampKey = CACHE_TIMESTAMP_PREFIX + key;
      const cached = localStorage.getItem(cacheKey);
      const cachedTimestamp = localStorage.getItem(timestampKey);
      if (cached && cachedTimestamp) {
        return {
          data: JSON.parse(cached),
          timestamp: cachedTimestamp,
        };
      }
    } catch (e) {
      console.warn(`[Cache:${prefix}] Failed to read cache:`, e);
    }
    return null;
  }

  function setCache(params, data, timestamp) {
    try {
      const key = getCacheKey(params);
      const cacheKey = CACHE_PREFIX + key;
      const timestampKey = CACHE_TIMESTAMP_PREFIX + key;
      localStorage.setItem(cacheKey, JSON.stringify(data));
      localStorage.setItem(timestampKey, timestamp);
    } catch (e) {
      console.warn(`[Cache:${prefix}] Failed to write cache:`, e);
      // Clear old cache if storage is full
      try {
        const keys = Object.keys(localStorage);
        const cacheKeys = keys.filter(k => k.startsWith(CACHE_PREFIX));
        if (cacheKeys.length > 10) {
          // Remove oldest 5 entries
          const timestamps = cacheKeys.map(k => ({
            key: k,
            timestamp: localStorage.getItem(k.replace(CACHE_PREFIX, CACHE_TIMESTAMP_PREFIX)) || '0',
          }));
          timestamps.sort((a, b) => a.timestamp.localeCompare(b.timestamp));
          for (let i = 0; i < Math.min(5, timestamps.length); i++) {
            const k = timestamps[i].key;
            localStorage.removeItem(k);
            localStorage.removeItem(k.replace(CACHE_PREFIX, CACHE_TIMESTAMP_PREFIX));
          }
        }
      } catch (clearError) {
        console.warn(`[Cache:${prefix}] Failed to clear old cache:`, clearError);
      }
    }
  }

  function clearCache(params) {
    if (params) {
      const key = getCacheKey(params);
      localStorage.removeItem(CACHE_PREFIX + key);
      localStorage.removeItem(CACHE_TIMESTAMP_PREFIX + key);
    } else {
      // Clear all cache for this prefix
      const keys = Object.keys(localStorage);
      keys.forEach(k => {
        if (k.startsWith(CACHE_PREFIX) || k.startsWith(CACHE_TIMESTAMP_PREFIX)) {
          localStorage.removeItem(k);
        }
      });
    }
  }

  return { getCache, setCache, clearCache, getCacheKey };
}

// Cache utilities for different APIs
const attendanceCache = createCacheApi('attendance');
const studentsCache = createCacheApi('students');
const classesCache = createCacheApi('classes');

export const coursesApi = {
  list: () => request('/courses'),
  get: (id) => request(`/courses/${id}`),
  create: (body) => request('/courses', { method: 'POST', body: JSON.stringify(body) }),
  update: (id, body) => request(`/courses/${id}`, { method: 'PUT', body: JSON.stringify(body) }),
  delete: (id) => request(`/courses/${id}`, { method: 'DELETE' }),
};

export const classesApi = {
  getTimestamp: async (params) => {
    const q = new URLSearchParams(params).toString();
    const result = await request('/classes/timestamp' + (q ? `?${q}` : ''));
    return result?.timestamp || null;
  },
  list: async (params) => {
    // Check cache first
    const cached = classesCache.getCache(params);
    if (cached) {
      // Check if data is still valid by comparing timestamps
      const serverTimestamp = await classesApi.getTimestamp(params).catch(() => null);
      if (serverTimestamp && serverTimestamp === cached.timestamp) {
        debugLog('[Cache] Using cached classes data', params);
        return cached.data;
      }
      debugLog('[Cache] Classes cache invalid, fetching fresh data', { cached: cached.timestamp, server: serverTimestamp });
    }
    
    // Fetch fresh data
    const data = await request('/classes' + (params?.courseId ? `?courseId=${params.courseId}` : ''));
    
    // Get timestamp and cache the data
    const timestamp = await classesApi.getTimestamp(params).catch(() => null);
    if (timestamp) {
      classesCache.setCache(params, data, timestamp);
      debugLog('[Cache] Cached fresh classes data with timestamp', timestamp);
    }
    
    return data;
  },
  get: (id) => request(`/classes/${id}`),
  create: (body) => request('/classes', { method: 'POST', body: JSON.stringify(body) }),
  update: (id, body) => request(`/classes/${id}`, { method: 'PUT', body: JSON.stringify(body) }),
  delete: (id) => request(`/classes/${id}`, { method: 'DELETE' }),
  getSchedule: (id) => request(`/classes/${id}/schedule-template`),
  addSchedule: (id, body) => request(`/classes/${id}/schedule-template`, { method: 'POST', body: JSON.stringify(body) }),
  generateSessions: (id, body) => request(`/classes/${id}/generate-sessions`, { method: 'POST', body: JSON.stringify(body) }),
  clearCache: classesCache.clearCache,
};

export const studentsApi = {
  getTimestamp: async (params) => {
    const q = new URLSearchParams(params).toString();
    const result = await request('/students/timestamp' + (q ? `?${q}` : ''));
    return result?.timestamp || null;
  },
  list: async (params) => {
    const skipCache = !!(params?.q || params?.search || params?.excludeClassId);
    if (skipCache) {
      const q = new URLSearchParams(params).toString();
      return request('/students' + (q ? `?${q}` : ''));
    }
    // Check cache first
    const cached = studentsCache.getCache(params);
    if (cached) {
      // Check if data is still valid by comparing timestamps
      const serverTimestamp = await studentsApi.getTimestamp(params).catch(() => null);
      if (serverTimestamp && serverTimestamp === cached.timestamp) {
        debugLog('[Cache] Using cached students data', params);
        return cached.data;
      }
      debugLog('[Cache] Students cache invalid, fetching fresh data', { cached: cached.timestamp, server: serverTimestamp });
    }
    
    // Fetch fresh data
    const q = new URLSearchParams(params).toString();
    const data = await request('/students' + (q ? `?${q}` : ''));
    
    // Get timestamp and cache the data
    const timestamp = await studentsApi.getTimestamp(params).catch(() => null);
    if (timestamp) {
      studentsCache.setCache(params, data, timestamp);
      debugLog('[Cache] Cached fresh students data with timestamp', timestamp);
    }
    
    return data;
  },
  get: (id) => request(`/students/${id}`),
  create: (body) => request('/students', { method: 'POST', body: JSON.stringify(body) }),
  update: (id, body) => request(`/students/${id}`, { method: 'PUT', body: JSON.stringify(body) }),
  delete: (id) => request(`/students/${id}`, { method: 'DELETE' }),
  bulkImport: (body) => request('/students/bulk-import', { method: 'POST', body: JSON.stringify(body) }),
  getStatusHistory: (id) => request(`/students/${id}/status-history`),
  addStatusHistory: (id, body) => request(`/students/${id}/status-history`, { method: 'POST', body: JSON.stringify(body) }),
  getTransferHistory: (id) => request(`/students/${id}/class-transfer-history`),
  addTransferHistory: (id, body) => request(`/students/${id}/class-transfer-history`, { method: 'POST', body: JSON.stringify(body) }),
  clearCache: studentsCache.clearCache,
};

// In-memory cache for sessions list (short TTL to avoid re-fetch when switching filter back)
let sessionsListCache = null;

function invalidateSessionsListCache() {
  sessionsListCache = null;
}

export const sessionsApi = {
  /** Gọi sau khi ca học thay đổi ngoài create/update/delete (nếu cần). */
  invalidateListCache: invalidateSessionsListCache,
  list: async (params) => {
    const q = new URLSearchParams(params).toString();
    const cacheKey = 'sessions_list_' + q;
    const now = Date.now();
    const CACHE_TTL_MS = 20 * 1000; // 20s
    if (sessionsListCache && sessionsListCache.key === cacheKey && (now - sessionsListCache.ts) < CACHE_TTL_MS) {
      debugLog('[Cache] Using in-memory sessions list', { key: cacheKey });
      return sessionsListCache.data;
    }
    const result = await request('/sessions' + (q ? `?${q}` : ''), { returnMeta: true });
    const data = result?.data ?? result;
    const total = result?.headers ? (parseInt(result.headers['x-total-count'], 10) || 0) : (Array.isArray(data) ? data.length : 0);
    const out = { data: Array.isArray(data) ? data : [], total };
    sessionsListCache = { key: cacheKey, data: out, ts: now };
    return out;
  },
  get: (id) => request(`/sessions/${id}`),
  getSeatMap: (id) => request(`/sessions/${id}/seat-map`),
  saveSeatMap: (id, body) => request(`/sessions/${id}/seat-map`, { method: 'PUT', body: JSON.stringify(body) }),
  saveStudentReports: (id, body) => request(`/sessions/${id}/student-reports`, { method: 'PUT', body: JSON.stringify(body) }),
  patchStudentReport: (id, studentId, body) => request(`/sessions/${id}/student-reports/${studentId}`, { method: 'PATCH', body: JSON.stringify(body) }),
  create: async (body) => {
    const row = await request('/sessions', { method: 'POST', body: JSON.stringify(body) });
    invalidateSessionsListCache();
    return row;
  },
  update: async (id, body) => {
    const row = await request(`/sessions/${id}`, { method: 'PUT', body: JSON.stringify(body) });
    invalidateSessionsListCache();
    return row;
  },
  delete: async (id) => {
    const result = await request(`/sessions/${id}`, { method: 'DELETE' });
    invalidateSessionsListCache();
    return result;
  },
};

export const dashboardApi = {
  streak: (params) => {
    const q = new URLSearchParams(params).toString();
    return request('/dashboard/streak' + (q ? `?${q}` : ''));
  },
};

export const azotaApiRegistryApi = {
  get: () => request('/azota-api-registry'),
  put: (body) => request('/azota-api-registry', { method: 'PUT', body: JSON.stringify(body) }),
  addEndpoint: (body) => request('/azota-api-registry/endpoints', { method: 'POST', body: JSON.stringify(body) }),
  updateEndpoint: (id, body) => request(`/azota-api-registry/endpoints/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
  deleteEndpoint: (id) => request(`/azota-api-registry/endpoints/${id}`, { method: 'DELETE' }),
};

export const azotaExamResultApi = {
  saveHandwritingSample: (body) =>
    request('/azota-exam-result/save-sample', { method: 'POST', body: JSON.stringify(body) }),
  process: async (body) => {
    // #region agent log
    fetch('http://127.0.0.1:7244/ingest/620c0b57-0b89-4c67-a9b0-3e34c7b86c53',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'api.js:azotaExamResultApi.process',message:'API request',data:{path:'/azota-exam-result/process',bodyKeys:Object.keys(body||{})},timestamp:Date.now(),runId:'run1',hypothesisId:'D'})}).catch(()=>{});
    // #endregion agent log
    try {
      const result = await request('/azota-exam-result/process', { method: 'POST', body: JSON.stringify(body) });
      // #region agent log
      fetch('http://127.0.0.1:7244/ingest/620c0b57-0b89-4c67-a9b0-3e34c7b86c53',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'api.js:azotaExamResultApi.process',message:'API success',data:{hasResult:!!result},timestamp:Date.now(),runId:'run1',hypothesisId:'D'})}).catch(()=>{});
      // #endregion agent log
      return result;
    } catch (e) {
      // #region agent log
      fetch('http://127.0.0.1:7244/ingest/620c0b57-0b89-4c67-a9b0-3e34c7b86c53',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'api.js:azotaExamResultApi.process',message:'API error',data:{error:e?.message,status:e?.status},timestamp:Date.now(),runId:'run1',hypothesisId:'D'})}).catch(()=>{});
      // #endregion agent log
      throw e;
    }
  },
};

export const layoutApi = {
  get: (classId) => request(`/classes/${classId}/layout`),
  save: (classId, body) => request(`/classes/${classId}/layout`, { method: 'PUT', body: JSON.stringify(body) }),
};

export const noteTagsApi = {
  list: (params) => {
    const q = params ? new URLSearchParams(params).toString() : '';
    return request('/note-tags' + (q ? `?${q}` : ''));
  },
  create: (body) => request('/note-tags', { method: 'POST', body: JSON.stringify(body) }),
  update: (id, body) => request(`/note-tags/${id}`, { method: 'PUT', body: JSON.stringify(body) }),
  delete: (id) => request(`/note-tags/${id}`, { method: 'DELETE' }),
  seed: () => request('/note-tags/seed', { method: 'POST' }),
};

export const studentNotesApi = {
  list: (params) => {
    const q = new URLSearchParams(params).toString();
    return request('/student-notes' + (q ? `?${q}` : ''));
  },
  create: (body) => request('/student-notes', { method: 'POST', body: JSON.stringify(body) }),
  delete: (id) => request(`/student-notes/${id}`, { method: 'DELETE' }),
  timeline: (studentId) => request(`/student-notes/timeline?studentId=${studentId}`),
  summary: (params) => {
    const q = new URLSearchParams(params).toString();
    return request(`/student-notes/summary?${q}`);
  },
};

export const imageOcrApi = {
  recognizeSeatingChart: (image, mimeType) =>
    request('/image-ocr/seating-chart', {
      method: 'POST',
      body: JSON.stringify({ image, mimeType }),
    }),
};

export const attendanceApi = {
  getTimestamp: async (params) => {
    const q = new URLSearchParams(params).toString();
    const result = await request('/attendance/timestamp' + (q ? `?${q}` : ''));
    return result?.timestamp || null;
  },
  /** Sync read of cache for stale-while-revalidate (no network). Returns null if miss. */
  getCached: (params) => {
    const cached = attendanceCache.getCache(params);
    return cached?.data ?? null;
  },
  get: async (params, options = {}) => {
    const { skipCacheValidation } = options;
    // Check cache (skip validation on initial load to avoid blocking on /timestamp)
    const cached = attendanceCache.getCache(params);
    if (cached && !skipCacheValidation) {
      const serverTimestamp = await attendanceApi.getTimestamp(params).catch(() => null);
      if (serverTimestamp && serverTimestamp === cached.timestamp) {
        debugLog('[Cache] Using cached attendance data', params);
        return cached.data;
      }
      debugLog('[Cache] Attendance cache invalid, fetching fresh data', { cached: cached.timestamp, server: serverTimestamp });
    }

    const qs = new URLSearchParams(params);
    if (skipCacheValidation) qs.set('includeTimestamp', '0');
    const q = qs.toString();
    const data = await request('/attendance' + (q ? `?${q}` : ''));

    // Use timestamp from response (server includes it when classId provided)
    const timestamp = data?.timestamp ?? (skipCacheValidation ? null : (await attendanceApi.getTimestamp(params).catch(() => null)));
    if (timestamp) {
      attendanceCache.setCache(params, data, timestamp);
      debugLog('[Cache] Cached fresh attendance data with timestamp', timestamp);
    }

    return data;
  },
  put: (body) => request('/attendance', { method: 'PUT', body: JSON.stringify(body) }),
  clearCache: attendanceCache.clearCache,
  validateImport: (body) => request('/attendance/validate-import', { method: 'POST', body: JSON.stringify(body) }),
  bulkImport: (body) => request('/attendance/bulk-import', { method: 'POST', body: JSON.stringify(body) }),
};
