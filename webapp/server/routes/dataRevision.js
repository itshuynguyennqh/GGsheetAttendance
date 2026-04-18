const express = require('express');
const fs = require('fs');
const path = require('path');
const router = express.Router();
const { db } = require('../db');

/** Fingerprint nhẹ để client có thể so sánh phiên bản dữ liệu (điểm danh / khách ca học / registry). */
router.get('/', (req, res) => {
  try {
    const guestRow = db.prepare('SELECT MAX(createdAt) AS t FROM session_guest_students').get();
    const regPath = path.join(__dirname, '..', 'data', 'azota-api-registry.json');
    let regMtime = '';
    try {
      regMtime = String(fs.statSync(regPath).mtimeMs || '');
    } catch (_) {
      regMtime = '';
    }
    const fingerprint = JSON.stringify({
      sessionGuestStudents: guestRow?.t || null,
      azotaApiRegistryMtime: regMtime,
    });
    res.json({ fingerprint });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
