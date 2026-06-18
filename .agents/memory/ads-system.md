---
name: Ads / Promotions system
description: ads table + /api/ads routes + public/js/ads.js auto-injects ticker/banner/promo on player pages
---

**Rule:** Ads are non-critical — ads.js fails silently (try/catch with no error display).

**Types:** ticker (scrolling strip below nav), banner (colorful stripe), promo (card in #promo-cards-slot)

**How to apply:**
- Public endpoint: GET /api/ads/active — returns active, non-expired ads
- Admin CRUD: GET/POST /api/ads, PATCH/DELETE /api/ads/:id (adminMiddleware)
- public/js/ads.js: included via `<script>` on index, dashboard, tournament, fixtures, leaderboard
- ads.js auto-finds nav element and inserts ticker strip after it; looks for #ad-banner-slot and #promo-cards-slot
- Table created via migration in server.js init (CREATE TABLE IF NOT EXISTS ads ...)
