---
name: Platform rebrand
description: Full rename from Unclescar Studios → Game Day Royal Tournaments — all files, emails, templates, routes
---

**Rule:** Every user-facing string, email template, and server log must say "Game Day Royal Tournaments" or "Game Day Royal" (short form). Never "Unclescar".

**Why:** User rebranded the platform in this session.

**How to apply:**
- Email sender: `process.env.GMAIL_USER || 'gamedayroyaltournaments@gmail.com'` in server/email.js
- All email headers: `GAME DAY <span>ROYAL</span>` (not Studios)
- Nav/footer brand: `GAME DAY <span>ROYAL</span>` via sed on HTML files
- Paystack payment references now use prefix `gameday-payout-` (not `unclescar-payout-`)
- Admin seed account: `admin@gamedayroyal.com`
- GMAIL_USER secret must match GMAIL_APP_PASSWORD account
