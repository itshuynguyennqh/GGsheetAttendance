# 🏗️ KIẾN TRÚC HỆ THỐNG

## 📐 Sơ đồ tổng quan

```
┌─────────────────────────────────────────────────────────────┐
│                    USER INTERFACE LAYER                      │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐      │
│  │ Google Sheets│  │  HTML Dialogs │  │  Web Dashboard│      │
│  │   (Menu)     │  │  (Input Forms)│  │  (Streak UI)  │      │
│  └──────────────┘  └──────────────┘  └──────────────┘      │
└─────────────────────────────────────────────────────────────┘
                            ↕
┌─────────────────────────────────────────────────────────────┐
│                  BUSINESS LOGIC LAYER                        │
│  ┌────────────────────────────────────────────────────┐     │
│  │              Menu.js, Config.js (Main Entry)                 │     │
│  │  - Menu Setup (onOpen)                             │     │
│  │  - Report Generation                                │     │
│  │  - AI Assistant                                     │     │
│  └────────────────────────────────────────────────────┘     │
│                                                               │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐     │
│  │ BTVNLogic    │  │ Attendance    │  │ Dashboard    │     │
│  │              │  │ Logic         │  │ Logic        │     │
│  │ - Extract    │  │ - Export      │  │ - Streak     │     │
│  │   Hashid     │  │   Attendance  │  │   Calculation│     │
│  │ - Match      │  │               │  │ - Dashboard  │     │
│  │   Scores     │  │               │  │   Generation │     │
│  └──────────────┘  └──────────────┘  └──────────────┘     │
│                                                               │
│  ┌──────────────┐                                           │
│  │ JoinLogic    │                                           │
│  │              │                                           │
│  │ - Merge      │                                           │
│  │   Sheets     │                                           │
│  │ - Auto-join  │                                           │
│  │   Trigger    │                                           │
│  └──────────────┘                                           │
└─────────────────────────────────────────────────────────────┘
                            ↕
┌─────────────────────────────────────────────────────────────┐
│                      DATA LAYER                              │
│  ┌────────────────────────────────────────────────────┐     │
│  │         Internal Google Sheets                      │     │
│  │  - BaoCao (Daily Reports)                          │     │
│  │  - Gộp_Nối_Tiếp (Merged Attendance)                │     │
│  │  - Tháng X.YYYY (Monthly Sheets)                    │     │
│  │  - Dashboard_Streak (Dashboard Data)               │     │
│  │  - Báo Cáo Tổng Hợp (Summary Reports)              │     │
│  └────────────────────────────────────────────────────┘     │
│                                                               │
│  ┌────────────────────────────────────────────────────┐     │
│  │      External Google Sheet (Azota Data)             │     │
│  │  ID: 1D0JR4CNSGdCqelFQwYpVdjP8DkJkRUqoKPdUVnIs1lo   │     │
│  │  - Danh sách Bài (Hashid mapping)                   │     │
│  │  - Tổng hợp HS (Student mapping)                    │     │
│  │  - Tổng hợp BTVN (Scores)                           │     │
│  └────────────────────────────────────────────────────┘     │
└─────────────────────────────────────────────────────────────┘
                            ↕
┌─────────────────────────────────────────────────────────────┐
│                   EXTERNAL SERVICES LAYER                    │
│  ┌──────────────┐  ┌──────────────┐                         │
│  │ Gemini API   │  │ Google Drive │                         │
│  │ (AI)         │  │ (File Read)  │                         │
│  └──────────────┘  └──────────────┘                         │
└─────────────────────────────────────────────────────────────┘
```

---

## 🔄 Data Flow Diagrams

### Flow 1: Xử lý BTVN Azota

```
┌─────────────┐
│ User Action │
│ (Chọn vùng) │
└──────┬──────┘
       │
       ▼
┌─────────────────────┐
│ processBTVNAzota()  │
│ (BTVNLogic.js)      │
└──────┬──────────────┘
       │
       ├──► Read "BaoCao" sheet
       │    - Extract x (Format)
       │    - Extract hv[] (Mã HV)
       │
       ├──► Open External Sheet
       │    (ID: 1D0JR4CNSG...)
       │
       ├──► extractHashids()
       │    └──► Read "Danh sách Bài"
       │         - Find x in Format column
       │         - When Format changes → get y
       │         - Extract hashid from URL
       │         └──► Return: [hashid1, hashid2, ...]
       │
       ├──► createStudentDictionary()
       │    └──► Read "Tổng hợp HS"
       │         - Get last 3 digits of mã HV
       │         - Match with column Y
       │         - Get value from column K
       │         └──► Return: {mãHV: value}
       │
       ├──► matchAndGetScores()
       │    └──► Read "Tổng hợp BTVN"
       │         - Match hashid (col D) + mã HV (col E)
       │         - Get score (col H)
       │         - Evaluate: Chưa làm / Chưa đạt / Khá / Tốt
       │         └──► Return: {mãHV: result_string}
       │
       └──► writeResultsToBaoCao()
            └──► Write to "BaoCao" sheet
                 - Column "Kết quả"
                 - Color orange for "Chưa làm" / "Chưa đạt"
```

### Flow 2: Gộp dữ liệu nhiều tháng

```
┌─────────────┐
│ User Action │
│ (Chọn sheets│
│  hoặc Auto) │
└──────┬──────┘
       │
       ▼
┌─────────────────────┐
│ processJoinSheets() │
│ (JoinLogic.js)      │
└──────┬──────────────┘
       │
       ├──► Sort sheets by date
       │    (Tháng 1.2025, Tháng 2.2025...)
       │
       ├──► For each sheet:
       │    ├──► findBuoiColumns()
       │    │    └──► Find headers starting with "Buổi"
       │    │
       │    ├──► Read data rows
       │    │
       │    └──► Group by Mã HV
       │         - Format: "Tháng X||Buổi Y||X/P"
       │         - Append to rawAttendance[]
       │
       ├──► Merge all rawAttendance
       │    - Shift to fill gaps
       │    - Create finalData[]
       │
       └──► Write to "Gộp_Nối_Tiếp"
            - Headers: Mã HV, Họ tên, Tên, Lớp, B1, B2...
            - Format: borders, colors, conditional formatting
            - Auto-update Dashboard (if exists)
```

### Flow 3: Tính toán Streak

```
┌─────────────┐
│ User Action │
│ (Tạo        │
│ Dashboard)  │
└──────┬──────┘
       │
       ▼
┌─────────────────────┐
│ getStreakData()     │
│ (DashboardLogic.js) │
└──────┬──────────────┘
       │
       ├──► Read "Gộp_Nối_Tiếp"
       │
       ├──► Parse column metadata
       │    - Format: "Tháng X||Buổi Y||X/P"
       │    - Extract {thang, buoi}
       │
       ├──► Apply filters (if any)
       │    - monthFilter
       │    - buoiFilter
       │
       ├──► For each student:
       │    ├──► Extract attendance values
       │    │    - Filter: only X, B, M, P
       │    │
       │    └──► calculateStreak()
       │         ├──► Forward scan: maxAttendStreak, maxAbsenceStreak
       │         └──► Backward scan: currentStreak
       │
       └──► Return: {students, months, buois}
            │
            ▼
┌─────────────────────┐
│ createStreakDashboard│
│ (DashboardLogic.js) │
└──────┬──────────────┘
       │
       ├──► Create/Delete "Dashboard_Streak" sheet
       │
       ├──► Section 1: Leaderboard (Top 20)
       │
       ├──► Section 2: Full List
       │
       ├──► Section 3: Class Statistics
       │
       └──► Section 4: Warnings
```

### Flow 4: AI Trợ lý

```
┌─────────────┐
│ User Action │
│ (Nhập File  │
│  ID + Chọn  │
│  danh sách) │
└──────┬──────┘
       │
       ▼
┌─────────────────────┐
│ processAiTasks()    │
│ (Menu.js)             │
└──────┬──────────────┘
       │
       ├──► Read selected range
       │    └──► Extract student list
       │
       ├──► Read file from Drive
       │    └──► DriveApp.getFileById(fileId)
       │         - Get blob
       │         - Convert to base64
       │         - Get MIME type
       │
       ├──► Build prompt
       │    - Task 1: Create answer key
       │    - Task 2: Create learning report
       │    - Include student list
       │
       ├──► Call Gemini API
       │    └──► POST to v1beta/models/gemini-2.0-flash
       │         - Headers: X-goog-api-key
       │         - Payload: text + inline_data (file)
       │
       ├──► Parse response
       │    └──► Extract text from candidates[0].content.parts[0].text
       │
       └──► Write to new sheet
            └──► "Kết quả AI HH:mm"
```

---

## 🗂️ Module Dependencies

```
Menu.js (Main)
├──► BTVNLogic.js
│    └──► Helper: findColumnIndex, createColumnMapping
│
├──► AttendanceLogic.js
│
├──► DashboardLogic.js
│    └──► Uses: "Gộp_Nối_Tiếp" (from JoinLogic)
│
├──► JoinLogic.js
│    └──► Auto-trigger: updateStreakDashboard (if exists)
│
└──► External Services
     ├──► Google Drive API (for AI)
     ├──► Gemini API (for AI)
     └──► External Google Sheet (for BTVN)
```

---

## 🔐 Security & Permissions

### Required Permissions

1. **Google Sheets API**
   - Read/Write current spreadsheet
   - Read external spreadsheet (Azota data)

2. **Google Drive API**
   - Read files (for AI feature)

3. **External APIs**
   - Gemini API (with API key)

### Data Access

- **Internal Sheets**: Full access (read/write)
- **External Sheet**: Read-only (Azota data)
- **Google Drive**: Read-only (file content for AI)

---

## 📊 Performance Considerations

### Bottlenecks

1. **External Sheet Access**
   - Solution: Cache data when possible
   - Impact: High (called frequently)

2. **Large Sheet Processing**
   - Solution: Batch operations, process in chunks
   - Impact: Medium (when merging many sheets)

3. **AI API Calls**
   - Solution: Rate limiting, retry logic
   - Impact: Medium (user-triggered)

### Optimization Strategies

1. **Batch Operations**
   ```javascript
   // Bad
   for (let i = 0; i < rows.length; i++) {
     sheet.getRange(i+1, 1).setValue(rows[i]);
   }
   
   // Good
   sheet.getRange(1, 1, rows.length, 1).setValues(rows);
   ```

2. **Caching**
   ```javascript
   const cache = CacheService.getScriptCache();
   const cached = cache.get(key);
   if (!cached) {
     const data = expensiveOperation();
     cache.put(key, JSON.stringify(data), 60); // 60 seconds
   }
   ```

3. **Lazy Loading**
   - Only load data when needed
   - Filter early to reduce processing

---

## 🔄 State Management

### Current State

- **No global state**: Each function is stateless
- **Data source**: Always read from Sheets (single source of truth)
- **Cache**: Used for auto-join trigger (10 seconds)

### Proposed Improvements

1. **Configuration Sheet**
   - Store settings (External Sheet ID, API keys...)
   - Avoid hardcoding

2. **Session State**
   - Store temporary data during processing
   - Reduce redundant reads

---

## 🧪 Testing Strategy

### Current State
- **No automated tests**
- **Manual testing** on Google Sheets

### Proposed Testing

1. **Unit Tests** (QUnit)
   - Test helper functions
   - Test calculation logic (streak, scores...)

2. **Integration Tests**
   - Test full flows (BTVN, Join, Dashboard...)
   - Mock external services

3. **E2E Tests**
   - Test user workflows
   - Test error scenarios

---

**Version**: 1.0  
**Last Updated**: 2026-01-26
