# Archive: V1 Report (BTVN Azota + Hardcoded Tags)

Archived: 2026-03-31

This folder contains the complete v1 report generation code before the refactor that:
- Removed BTVN Azota checking from the report pipeline
- Replaced hardcoded comment tags with Gemini-powered dynamic tag analysis

These files are NOT loaded by Apps Script. They are preserved for reference only.

## Files
- ReportGeneration.js - Main report generation logic with BTVN Azota
- MessageTemplates.js - Message templates (3 groups + 4 random templates)
- MessageRegenerate.js - V2 message regeneration with BTVN analysis
- CorrelationMatrix.js - Correlation matrix including Azota columns
- CommentAnalysis.js - Hardcoded keyword matching (analyzeCommentText etc.)
- DateRangePicker.html - Report dialog with BTVN Azota range inputs
- BTVNAzotaExternal.js - External BTVN Azota sheet loader
- Config.js - Config with EXTERNAL_BTVN_SHEET_ID
