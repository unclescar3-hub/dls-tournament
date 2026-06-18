---
name: Online presence tracking
description: Players marked online via last_active column; fixture/code scheduling dropdowns show 🟢 if active within 30 min
---

**Rule:** authMiddleware updates `last_active=NOW()` non-blocking on every authenticated request.

**Why:** Admin needs to schedule fixtures prioritising currently-online registered players.

**How to apply:**
- Column: `ALTER TABLE users ADD COLUMN IF NOT EXISTS last_active TIMESTAMP`
- Updated in server/auth.js authMiddleware (non-blocking pool.query with .catch(() => {}))
- Standings query in GET /api/tournaments/:id includes `u.last_active`
- fix-tournament and code-tournament change handlers in admin.html check `(now - lastActive) < 30 * 60 * 1000`
