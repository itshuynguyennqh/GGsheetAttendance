// ======================================================
// TEST ĐỌC NỘI DUNG GOOGLE DOC (BVN)
// Chạy từ Script Editor: testReadBVNDoc() hoặc testReadGoogleDocById()
// ======================================================

/** ID document từ link (phần /d/.../edit) */
var BVN_DOC_ID = '1RWrQk-tq0FaSQSv779UmU_UeSqgi1aLuxX2VplIPA7g';

/**
 * Đọc toàn bộ text từ body của Google Doc theo ID.
 * @param {string} docId - ID document (từ URL: docs.google.com/document/d/{docId}/edit...)
 * @return {string} Nội dung text của document
 */
function readGoogleDocContent(docId) {
  if (!docId || typeof docId !== 'string') {
    throw new Error('docId phải là chuỗi không rỗng');
  }
  var doc = DocumentApp.openById(docId.trim());
  var body = doc.getBody();
  return body ? body.getText() : '';
}

/**
 * Test đọc file BVN (link cố định).
 * Ghi log và hiển thị alert với 500 ký tự đầu.
 */
function testReadBVNDoc() {
  try {
    var content = readGoogleDocContent(BVN_DOC_ID);
    var len = content ? content.length : 0;
    Logger.log('[testReadBVNDoc] Số ký tự: ' + len);
    Logger.log('[testReadBVNDoc] Nội dung (full):\n' + content);

    var preview = content ? content.slice(0, 500) : '(trống)';
    if (content && content.length > 500) preview += '\n... [' + (content.length - 500) + ' ký tự nữa]';
    SpreadsheetApp.getUi().alert('Đã đọc Google Doc BVN\n\nSố ký tự: ' + len + '\n\nPreview (500 ký tự đầu):\n' + preview);
    return content;
  } catch (e) {
    Logger.log('[testReadBVNDoc] Lỗi: ' + e.message);
    SpreadsheetApp.getUi().alert('Lỗi đọc doc: ' + e.message);
    throw e;
  }
}

/**
 * Test đọc Google Doc theo ID bất kỳ (truyền ID khi gọi).
 * Ví dụ: testReadGoogleDocById('1RWrQk-tq0FaSQSv779UmU_UeSqgi1aLuxX2VplIPA7g')
 * @param {string} docId - ID document
 */
function testReadGoogleDocById(docId) {
  docId = docId || BVN_DOC_ID;
  var content = readGoogleDocContent(docId);
  Logger.log('[testReadGoogleDocById] docId=' + docId + ', length=' + (content ? content.length : 0));
  Logger.log(content);
  return content;
}

/**
 * Trích xuất document ID từ URL Google Doc.
 * VD: https://docs.google.com/document/d/1RWrQk-tq0FaSQSv779UmU_UeSqgi1aLuxX2VplIPA7g/edit?tab=t.93l09hnwddxs
 * @param {string} url - URL đầy đủ
 * @return {string|null} Document ID hoặc null nếu không parse được
 */
function extractDocIdFromUrl(url) {
  if (!url || typeof url !== 'string') return null;
  var m = url.trim().match(/\/document\/d\/([a-zA-Z0-9_-]+)/);
  return m ? m[1] : null;
}

/**
 * Test đọc từ URL (tự trích ID rồi đọc).
 * @param {string} url - URL Google Doc (optional, mặc định dùng link BVN)
 */
function testReadGoogleDocByUrl(url) {
  var defaultUrl = 'https://docs.google.com/document/d/1RWrQk-tq0FaSQSv779UmU_UeSqgi1aLuxX2VplIPA7g/edit?tab=t.93l09hnwddxs';
  url = url || defaultUrl;
  var docId = extractDocIdFromUrl(url);
  if (!docId) {
    Logger.log('[testReadGoogleDocByUrl] Không parse được docId từ URL: ' + url);
    throw new Error('URL không hợp lệ (cần dạng .../document/d/{id}/...)');
  }
  return testReadGoogleDocById(docId);
}
