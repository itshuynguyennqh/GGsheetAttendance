/**
 * Chiết xuất ảnh từ kết quả đề thi Azota.
 * Usage: node scripts/extract-azota-exam-images.js <examId> <bearerToken>
 * Example: node scripts/extract-azota-exam-images.js 13024100 "eyJhbGciOiJIUzI1NiIs..."
 *
 * Ảnh được lưu vào: data/azota-exam-<examId>-images/
 */

const fs = require('fs');
const path = require('path');

const AZOTA_EXAM_RESULT_BASE = 'https://azota.vn/private-api/exams';
const AZOTA_TEACHER_API_BASE = 'https://azt-teacher-api.azota.vn';

function normalizeToken(s) {
  if (s == null || typeof s !== 'string') return '';
  const t = s.trim();
  if (t.toLowerCase().startsWith('bearer ')) return t.slice(7).trim();
  return t;
}

/** Thu thập tất cả URL ảnh (http/https hoặc data:image/...;base64,...) từ object/array. */
function collectImageUrls(obj, seen = new Set(), urls = []) {
  if (obj == null) return urls;
  if (typeof obj === 'string') {
    const s = obj.trim();
    if (!s || seen.has(s)) return urls;
    if (s.startsWith('data:image/') && s.includes(';base64,')) {
      seen.add(s);
      urls.push({ type: 'data', value: s });
    } else if ((s.startsWith('http://') || s.startsWith('https://')) && !seen.has(s)) {
      const lower = s.toLowerCase();
      if (
        lower.includes('image') || lower.includes('cdn') || lower.includes('storage') ||
        lower.includes('cloud') || /\.(jpg|jpeg|png|gif|webp)(\?|$)/i.test(s)
      ) {
        seen.add(s);
        urls.push({ type: 'http', value: s });
      } else if (!s.includes('.js') && !s.includes('.css') && !s.includes('fonts')) {
        seen.add(s);
        urls.push({ type: 'http', value: s });
      }
    }
    return urls;
  }
  if (Array.isArray(obj)) {
    for (const item of obj) collectImageUrls(item, seen, urls);
    return urls;
  }
  if (typeof obj === 'object') {
    for (const key of Object.keys(obj)) {
      const v = obj[key];
      const keyLower = key.toLowerCase();
      if (
        (keyLower === 'url' || keyLower === 'image' || keyLower.includes('image') || keyLower.includes('url')) &&
        typeof v === 'string'
      ) {
        const s = v.trim();
        if (s.startsWith('data:image/') && s.includes(';base64,')) {
          if (!seen.has(s)) {
            seen.add(s);
            urls.push({ type: 'data', value: s });
          }
        } else if ((s.startsWith('http://') || s.startsWith('https://')) && !seen.has(s)) {
          seen.add(s);
          urls.push({ type: 'http', value: s });
        }
      } else {
        collectImageUrls(v, seen, urls);
      }
    }
  }
  return urls;
}

async function fetchWithRetry(url, options, maxRetries = 2) {
  for (let i = 0; i <= maxRetries; i++) {
    const res = await fetch(url, options);
    if (res.ok) return res;
    if (i < maxRetries) await new Promise((r) => setTimeout(r, 1000 * (i + 1)));
  }
  return null;
}

async function fetchExamResult(examId, token) {
  const headers = {
    Authorization: 'Bearer ' + token,
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    Referer: 'https://azota.vn/',
    Origin: 'https://azota.vn',
    Accept: 'application/json',
  };
  const urls = [
    `${AZOTA_EXAM_RESULT_BASE}/${encodeURIComponent(examId)}/exam-result`,
    `${AZOTA_TEACHER_API_BASE}/private-api/exams/${encodeURIComponent(examId)}/exam-result`,
    `${AZOTA_TEACHER_API_BASE}/api/ExamPageResult/ListResults?examId=${encodeURIComponent(examId)}`,
  ];
  for (const url of urls) {
    const res = await fetchWithRetry(url, { method: 'GET', headers });
    if (!res || res.status !== 200) continue;
    const text = await res.text();
    if (!text || text.trim().charAt(0) === '<') continue;
    let json;
    try {
      json = JSON.parse(text);
    } catch (_) {
      continue;
    }
    let items = [];
    if (json.data && Array.isArray(json.data)) items = json.data;
    else if (json.data && json.data.objs && Array.isArray(json.data.objs)) items = json.data.objs;
    else if (json.items && Array.isArray(json.items)) items = json.items;
    else if (json.students && Array.isArray(json.students)) items = json.students;
    else if (json.data && typeof json.data === 'object' && !Array.isArray(json.data)) {
      if (json.data.objs) items = json.data.objs;
      else {
        for (const k of Object.keys(json.data)) {
          const v = json.data[k];
          if (Array.isArray(v)) {
            items = v;
            break;
          }
        }
      }
    }
    if (items.length > 0) {
      console.log(`[OK] Lấy được ${items.length} kết quả từ ${url.split('/').pop().split('?')[0]}`);
      return { items, raw: json };
    }
  }
  throw new Error('Không lấy được danh sách kết quả từ Azota. Kiểm tra examId và token.');
}

async function downloadImage(url, token, outPath) {
  const headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    Referer: 'https://azota.vn/',
    Accept: 'image/*,*/*',
  };
  if (token) headers['Authorization'] = 'Bearer ' + token;
  const res = await fetchWithRetry(url, { method: 'GET', headers });
  if (!res || res.status !== 200) return false;
  const buf = Buffer.from(await res.arrayBuffer());
  fs.writeFileSync(outPath, buf);
  return true;
}

function safeFilename(s) {
  return s.replace(/[<>:"/\\|?*]/g, '_').replace(/\s+/g, '_').slice(0, 80);
}

async function main() {
  const examId = process.argv[2] || '13024100';
  const rawToken = process.argv[3] || '';
  const token = normalizeToken(rawToken);
  if (!token) {
    console.error('Usage: node scripts/extract-azota-exam-images.js <examId> <bearerToken>');
    process.exit(1);
  }

  const outDir = path.join(process.cwd(), 'data', `azota-exam-${examId}-images`);
  fs.mkdirSync(outDir, { recursive: true });
  console.log(`[INFO] Thư mục output: ${outDir}`);

  const { items, raw } = await fetchExamResult(examId, token);

  function writeDataUrlToFile(dataUrl, outPath) {
    const match = dataUrl.match(/^data:image\/(\w+);base64,(.+)$/);
    if (!match) return false;
    try {
      const buf = Buffer.from(match[2], 'base64');
      fs.writeFileSync(outPath, buf);
      return true;
    } catch {
      return false;
    }
  }

  const manifest = [];
  let idx = 0;
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const name = (item.attendeeName || item.studentName || item.fullName || item.name || `item_${i + 1}`) || `item_${i + 1}`;
    const mark = item.mark ?? item.markPercent ?? item.score ?? '';

    const imageEntries = [];
    const added = new Set();
    const addUrl = (url, t) => {
      if (url && !added.has(url)) {
        added.add(url);
        imageEntries.push({ url, type: t });
      }
    };
    const ni = item.nameImages;
    if (ni && ni.url) addUrl(ni.url, 'name');
    else if (ni && Array.isArray(ni) && ni[0] && ni[0].url) addUrl(ni[0].url, 'name');
    const ani = item.attendeeNameImage;
    if (ani && ani.url) addUrl(ani.url, 'name');

    const extra = collectImageUrls(item, new Set(), []);
    for (const u of extra) {
      const url = (u && u.value) ? u.value : u;
      if (url && typeof url === 'string') addUrl(url, 'answer');
    }

    for (const { url, type } of imageEntries) {
      if (!url) continue;
      idx++;
      let ext = 'jpg';
      if (url.startsWith('data:image/')) {
        const m = url.match(/data:image\/(\w+)/);
        ext = m ? (m[1] === 'jpeg' ? 'jpg' : m[1]) : 'jpg';
      } else {
        const m = url.match(/\.(jpg|jpeg|png|gif|webp)(\?|$)/i);
        if (m) ext = m[1].toLowerCase() === 'jpeg' ? 'jpg' : m[1].toLowerCase();
      }
      const fname = `${String(idx).padStart(3, '0')}_${safeFilename(String(name))}_${type}.${ext}`;
      const outPath = path.join(outDir, fname);
      process.stdout.write(`  [${idx}] ${fname}... `);
      let ok = false;
      if (url.startsWith('data:image/') && url.includes(';base64,')) {
        ok = writeDataUrlToFile(url, outPath);
      } else {
        ok = await downloadImage(url, token, outPath);
      }
      console.log(ok ? 'OK' : 'FAIL');
      manifest.push({
        index: idx,
        studentName: name,
        mark,
        type,
        file: fname,
        success: ok,
      });
    }
  }

  if (manifest.length === 0) {
    const flatUrls = collectImageUrls(raw, new Set(), []);
    for (let i = 0; i < flatUrls.length; i++) {
      const u = flatUrls[i];
      const url = u.value || u;
      idx++;
      let ext = 'jpg';
      if (typeof url === 'string' && url.startsWith('data:image/')) {
        const m = url.match(/data:image\/(\w+)/);
        ext = m ? (m[1] === 'jpeg' ? 'jpg' : m[1]) : 'jpg';
      }
      const fname = `${String(idx).padStart(3, '0')}_image.${ext}`;
      const outPath = path.join(outDir, fname);
      process.stdout.write(`  [${idx}] ${fname}... `);
      let ok = false;
      if (typeof url === 'string' && url.startsWith('data:image/') && url.includes(';base64,')) {
        ok = writeDataUrlToFile(url, outPath);
      } else {
        ok = await downloadImage(url, token, outPath);
      }
      console.log(ok ? 'OK' : 'FAIL');
      manifest.push({ index: idx, type: 'unknown', file: fname, success: ok });
    }
  }

  if (manifest.length === 0) {
    fs.writeFileSync(path.join(outDir, '_raw_response.json'), JSON.stringify(raw, null, 2), 'utf8');
    console.log('[WARN] Không tìm thấy ảnh. Đã lưu _raw_response.json để kiểm tra.');
  }

  fs.writeFileSync(path.join(outDir, '_manifest.json'), JSON.stringify(manifest, null, 2), 'utf8');
  const successCount = manifest.filter((m) => m.success).length;
  console.log(`\n[DONE] Đã tải ${successCount}/${manifest.length} ảnh vào ${outDir}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
