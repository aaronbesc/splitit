# Split It

**Scan a receipt. Claim your items. Settle up in seconds.**

Split It is a mobile app that turns the worst part of a group dinner (figuring out who owes what) into a 30-second live session. Point your camera at the receipt, invite friends via QR, everyone taps what they had, and Venmo does the rest.

Built for **CIS 4914: Senior Project** at the University of Florida.

---

## Demo

**Final presentation:** _link pending_

<!-- Drop a hero screenshot or GIF here once you record one -->

---

## Why we built it

Splitting a bill by hand is slow, awkward, and almost always wrong by a dollar or two. Existing apps make you type every line item. We wanted something that feels like opening the camera — scan, tap, done — with live multi-user sessions so nobody has to read the receipt out loud.

---

## Features

- **Receipt OCR**: snap a photo, get a parsed itemized list
- **Live sessions**: host generates a QR; guests join in one tap
- **Real-time claiming**: watch claims update live across every phone
- ½ **Half-unit splits**: share a margarita without spreadsheet math
- **Venmo handoff**: one-tap deep link into Venmo with the right amount pre-filled
- **Debts ledger**: aggregate what you owe and what's owed to you across sessions
- **Dark-first design**: custom design system, Space Grotesk, glassmorphic cards

---

## Tech stack

| Layer | Tech |
|---|---|
| App | React Native (Expo SDK 54), Expo Router, TypeScript |
| Auth & DB | Supabase (Postgres + RLS + Realtime) |
| OCR | Gemini 2.0 Flash (vision) + Tesseract.js fallback |
| Payments | Venmo deep links (`venmo://`) |
| Styling | Custom dark design system, Space Grotesk |

---

## Architecture at a glance

```
┌───────────────┐        Supabase Realtime         ┌───────────────┐
│  Host device  │◄────── item_claims channel ─────►│ Guest devices │
│ (creates      │                                  │ (claim items) │
│  session)     │◄────── sessions channel ────────►│               │
└──────┬────────┘                                  └───────┬───────┘
       │                                                   │
       └──────────────► Supabase Postgres ◄────────────────┘
                        (RLS-protected)
                              │
                              ▼
                         debts table
                    (generated on finish)
```

- **`app/`**: expo Router screens (file-based routing)
- **`services/`**: supabase data access (`sessionService`, `debtsService`, `receiptService`, `splitCalc`)
- **`context/auth.tsx`**: session provider + auto-redirect logic
- **`constants/design.ts`**: single source of truth for colors and typography

---

## Quickstart

**Prereqs:** Node 20+, a Supabase project, a Gemini API key, Expo Go or a dev build.

```bash
# 1. Install
npm install

# 2. Configure env (copy and fill in)
cp .env.example .env.local
#   EXPO_PUBLIC_SUPABASE_URL=...
#   EXPO_PUBLIC_SUPABASE_ANON_KEY=...
#   EXPO_PUBLIC_GEMINI_API_KEY=...

# 3. Run the Supabase migrations (see /supabase/schema.sql)

# 4. Start
npm run start
```

Scan the QR with Expo Go (or run `npm run ios` / `npm run android` for a dev build).

---

## Database

Five core tables, all with RLS enabled and Realtime enabled where it matters:

- `receipts`: parsed receipt snapshot (items, subtotal, tax, tip)
- `sessions`: live-split session metadata (host, join code, payer)
- `session_participants`: who's in, with a Venmo snapshot
- `item_claims`: who claimed what, with fractional `units`
- `debts`: denormalized ledger generated on session finish

Schema and policies live in `/supabase/schema.sql`.

---

## Project status

**Shipped and demoable.** Core flow works end-to-end: scan -> session -> claim -> Venmo payout -> ledger.

Known limitations and backlog live in the project's GitHub Issues.

---

## Team

Built by **GatorML** for CIS 4914 - Senior Project, Spring 2026.

| Name | Role |
|---|---|
| Aaron Beschorner | Software Engineer |
| Eva Nastevska | Machine Learning Engineer |

**Advisors:** Dr. Jie Xu · Yuanzhe Peng (PhD candidate)
**Course instructor:** Dr. Sanethia Thomas

---

## Acknowledgments

Thanks to our faculty advisors Dr. Jie Xu and Yuanzhe Peng for weekly guidance, and to Dr. Sanethia Thomas for running CIS 4914. Thanks also to the Expo, Supabase, and React Native communities for the tooling that made a two-semester project feel tractable.

---

**Keywords:** mobile, React Native, Expo, Supabase, real-time, OCR, bill splitting, fintech, Venmo, group payments
