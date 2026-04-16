const express = require('express');
const router = express.Router();

function getGeminiApiKey() {
  return (
    process.env.GEMINI_API_KEY
    || process.env.GOOGLE_API_KEY
    || process.env.GOOGLE_GENAI_API_KEY
    || process.env.GOOGLE_AI_API_KEY
    || ''
  );
}

function getGeminiModel() {
  return (process.env.GEMINI_MODEL || 'gemini-3.1-flash-lite-preview').trim();
}

const SEATING_PROMPT = `Bạn là trợ lý AI chuyên đọc sơ đồ chỗ ngồi viết tay trong lớp học.

Phân tích ảnh sơ đồ chỗ ngồi viết tay này và trích xuất tên học sinh theo vị trí trong bảng.

Quy tắc:
1. Xác định bảng/lưới với các hàng và cột. Đếm từ trên xuống dưới (row 0, 1, 2...) và trái sang phải (col 0, 1, 2...).
2. Đọc tên học sinh trong mỗi ô. Giữ nguyên tên tiếng Việt có dấu.
3. Nếu ô có dấu X → mark: "present". Dấu O → mark: "absent". Không có dấu → mark: null.
4. Nếu có tên nằm ngoài bảng (ví dụ: học sinh đến muộn, ghi chú thêm), đưa vào mảng "extras".
5. Nếu có thông tin lớp, ngày tháng, ghi vào "meta".
6. Ô trống hoặc không đọc được → bỏ qua, KHÔNG tạo entry.

Trả về ĐÚNG JSON (không markdown, không giải thích), theo format:
{
  "rows": <số hàng trong bảng>,
  "cols": <số cột trong bảng>,
  "cells": [
    { "row": 0, "col": 0, "name": "Tên HS", "mark": "present" },
    { "row": 0, "col": 1, "name": "Tên HS 2", "mark": null }
  ],
  "extras": [
    { "name": "Tên HS", "note": "Muộn" }
  ],
  "meta": {
    "class": "tên lớp nếu có",
    "date": "ngày nếu có"
  }
}`;

router.post('/seating-chart', async (req, res) => {
  try {
    const { image, mimeType = 'image/jpeg' } = req.body;

    if (!image) {
      return res.status(400).json({ error: 'Thiếu dữ liệu ảnh (image base64)' });
    }

    const geminiApiKey = getGeminiApiKey();
    const geminiModel = getGeminiModel();

    if (!geminiApiKey) {
      return res.status(500).json({
        error: 'Chưa cấu hình Gemini API key.',
        hint: 'Đặt một trong các biến môi trường: GEMINI_API_KEY, GOOGLE_API_KEY, GOOGLE_GENAI_API_KEY, GOOGLE_AI_API_KEY. Sau đó restart server.',
      });
    }

    const base64Data = image.includes(',') ? image.split(',')[1] : image;

    const url = `https://generativelanguage.googleapis.com/v1beta/models/${geminiModel}:generateContent?key=${geminiApiKey}`;

    const payload = {
      contents: [{
        parts: [
          {
            inlineData: {
              mimeType,
              data: base64Data,
            },
          },
          { text: SEATING_PROMPT },
        ],
      }],
      generationConfig: {
        temperature: 0.1,
        maxOutputTokens: 4096,
        responseMimeType: 'application/json',
      },
    };

    console.log(`[imageOcr] Calling Gemini (${geminiModel}) for seating chart OCR...`);
    const startTime = Date.now();

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error(`[imageOcr] Gemini API error ${response.status}:`, errText);
      return res.status(502).json({
        error: `Gemini API lỗi: ${response.status}`,
        detail: errText,
      });
    }

    const result = await response.json();
    const duration = Date.now() - startTime;
    console.log(`[imageOcr] Gemini response received (${duration}ms)`);

    const text = result?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) {
      return res.status(502).json({
        error: 'Gemini không trả về kết quả text',
        raw: result,
      });
    }

    let parsed;
    try {
      const cleaned = text.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();
      parsed = JSON.parse(cleaned);
    } catch (parseErr) {
      return res.status(502).json({
        error: 'Không parse được JSON từ Gemini',
        rawText: text,
      });
    }

    if (!parsed.cells || !Array.isArray(parsed.cells)) {
      return res.status(502).json({
        error: 'Gemini trả về format không hợp lệ (thiếu cells)',
        parsed,
      });
    }

    res.json({
      ...parsed,
      _model: geminiModel,
      _durationMs: duration,
    });
  } catch (err) {
    console.error('[imageOcr] Unexpected error:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
