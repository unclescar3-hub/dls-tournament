# DLS Tournament - Next.js MVP scaffold

This repository contains a starter scaffold for the Dream League Soccer / eFootball tournament platform.

Features included in the scaffold:
- Next.js (TypeScript)
- Prisma schema for core models (User, Profile, Tournament, Registration, GameCode, Payment, Payout)
- Placeholder Flutterwave endpoints (checkout + webhook)
- NextAuth integration point (configure in /pages/api/auth)

Next steps (developer):
1. Copy .env.example to .env and fill in real secrets (DATABASE_URL, NEXTAUTH_SECRET, FLUTTERWAVE keys, SENDGRID, etc.)
2. Install dependencies: npm install
3. Run Prisma migration and seed:
   - npx prisma migrate dev --name init
   - npm run seed
4. Start dev server: npm run dev

Important notes:
- Do NOT store raw bank credentials in plaintext in production. Use secure storage and follow provider requirements.
- Implement and test Flutterwave checkout and webhook flows before going live.
- Consult legal counsel for cash prize handling and local regulations.
