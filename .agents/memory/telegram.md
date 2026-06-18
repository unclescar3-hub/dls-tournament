---
name: Telegram integration
description: server/telegram.js helper + /api/telegram routes for channel broadcasts and match sharing
---

**Rule:** Telegram silently skips (returns {skipped:true}) when TELEGRAM_BOT_TOKEN or TELEGRAM_CHANNEL_ID not set.

**Why:** Telegram is optional — platform works without it.

**How to apply:**
- Helper: server/telegram.js → sendTelegramMessage(text, extra?)
- Player endpoint: POST /api/telegram/share-match {match_id} — shares approved match result to channel
- Admin endpoint: POST /api/telegram/broadcast {message} — sends custom HTML message to channel
- Admin endpoint: POST /api/telegram/announce-fixture {fixture_id} — shares a scheduled fixture
- Secrets needed: TELEGRAM_BOT_TOKEN (from @BotFather), TELEGRAM_CHANNEL_ID (@username or numeric ID)
- Bot must be added as admin to the Telegram channel before it can post
