---
name: Admin panel new tabs
description: Three new tabs added to admin.html — Intelligence, Ads & Promos, Config
---

**Rule:** The AI/Gemini analysis system is NEVER referred to as "AI" or "Gemini" in the admin panel. It is called "Assistant Intelligence."

**Why:** User wants the AI system hidden/disguised so it appears as a proprietary internal tool.

**How to apply:**
- Intelligence tab: calls GET /api/admin/intelligence — shows ai_result JSONB (verified, confidence, notes)
- renderIntelligenceBadge() helper used in Match Reviews tab to show 🧠 Cleared/Flagged badge
- Ads tab: calls /api/ads (admin CRUD) + /api/telegram/broadcast
- Config tab: calls GET /api/admin/config — shows env var set/missing status (never values)
- All three loaders registered in switchTab loaders object in admin.html
