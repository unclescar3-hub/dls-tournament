---
name: 6 new features
description: Referral System, Proving Ground Upgrades, Competition Size Control, Staff Invite System, Staff Chat, Promotions — all backend + frontend
---

## Feature Summary

### F1 — Referral System
- New DB columns on users: referral_code, referred_by, referral_points, referral_cash
- Tables: referral_settings (points per free ref), referral_tiers (min_paid → cash reward)
- referral_code = LOWER(username), back-filled at boot for existing users
- Registration: `?ref=` param reads referrer, grants points immediately + email
- Payment verification: checks referrer's total paid referrals, grants highest qualifying tier cash reward
- Frontend: dashboard "My Referrals" tab with shareable link, stats, copy/share buttons
- Admin: "🔗 Referrals" tab with settings, tier CRUD, auto-calculator, referral dashboard table
- All arena/registration pages pass `ref` param from URL query string

### F2 — Proving Ground Upgrades
- Tables: proving_ground_settings (is_paid, entry_fee, is_active), proving_ground_sessions
- Auto-match: when 2nd player joins queue, both are instantly matched with a shared game code
- Notifications: in-app + email (sendProvingGroundMatchEmail) sent to both players
- Admin: "⚡ Proving Ground" tab — settings form, live queue/sessions viewer
- Frontend: dashboard "⚡ Proving Ground" tab — join/leave/matched state machine

### F3 — Competition Size Control
- Tournaments table gains `is_unlimited BOOLEAN DEFAULT FALSE`
- Create form: number input + "Unlimited players" checkbox, stored as max_players=999999 + is_unlimited=true
- Display: shows "∞" for unlimited, skips "Registration Closed" check when is_unlimited=true
- Admin list and public tournament page both show ∞ symbol

### F4 — Staff Invite System (Enhanced)
- New endpoints: GET /admin/invites (list + status), POST /admin/invites/:id/resend, DELETE /admin/invites/:id
- New endpoints: GET /admin/staff, DELETE /admin/staff/:id (demote), PATCH /admin/staff/:id/title
- GET /admin/me — current admin's own profile (used by chat tab)
- Admin Team tab redesigned: invite form + full invite list (resend/cancel) + staff list (remove/change title)
- Invite statuses: pending / accepted / expired

### F5 — Internal Staff Chat
- Table: staff_messages (sender_id, recipient_id, content, type=group/dm, dm_read)
- Routes: GET/POST /staff-chat/group, GET/POST /staff-chat/dm/:userId, GET /staff-chat/unread
- DM restriction: non-Super-Admin staff can only DM Super Admin
- Admin: "💬 Staff Chat" tab — group chat panel + DM panel with staff dropdown
- Polls every 8s, auto-scrolls to bottom, "mine" vs "theirs" message bubbles

### F6 — Promotions with Photo Upload
- Table: promotions (title, description, image_path, visibility=internal/public/both, active)
- multer upload to public/uploads/promotions/, 5MB limit, image types only
- Routes: GET /promotions/public (public), GET /promotions (admin all), POST/PATCH/DELETE
- Admin: "🎯 Promotions" tab — create form with photo upload + list with toggle/delete

**Why:** All referenced as DB tables/columns; this documents what was added so future agents don't recreate them.
**How to apply:** Any feature touching referrals, PG sessions, staff chat, or promotions should query the relevant tables above.
