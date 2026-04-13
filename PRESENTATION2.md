# Presentation 2 — Split It | Milestone 2
**Course:** [Course Name]
**Team:** [Team Name]
**Date:** [Date]
**Duration:** ~10 minutes max

---

## Slide 1 — Title (30 sec)

**Split It** — Real-Time Bill Splitting App

> *"Scan a receipt, split the bill live with your group."*

- Team members: [Name 1], [Name 2], [Name 3]
- Course, section, date

---

## Slide 2 — Update of Progress (1.5 min)

Review of requirements / user stories against current build.

| Feature | Status |
|---|---|
| User authentication (sign up / sign in / sign out) | ✅ Complete |
| Receipt scanning + OCR | ✅ Complete |
| AI-powered receipt extraction (Gemini) | ✅ Complete |
| Editable receipt review screen | ✅ Complete |
| Save receipt to Supabase database | ✅ Complete |
| Split Live Sessions (real-time multi-user) | ✅ Complete |
| Item claiming with real-time sync | ✅ Complete |
| Per-user bill summary with tax/tip proportion | ✅ Complete |
| Session joining via 6-char code + QR code | ✅ Complete |
| [Planned feature — e.g. payment integration] | 🔲 Planned |
| [Planned feature] | 🔲 Planned |

---

## Slide 3 — Project Walk-Through (3 min)

Live demo or screenshots of the full user flow:

1. **Sign In** → lands on Scanner (home) screen
2. **Take photo or pick from gallery** → process receipt
3. **Review & Edit screen** → correct OCR mistakes, adjust items/totals, save
4. **"Start Split Session"** prompt → session lobby opens with join code + QR code
5. **Friend joins** by entering the 6-char code on their home screen → appears in lobby in real time
6. **Host taps "Start Splitting"** → both devices navigate to the Claim screen simultaneously
7. **Tap to claim items** → claims sync in real time across all devices; shared items show split cost
8. **Host taps "Finish & See Totals"** → all users navigate to their personal Summary screen
9. **Summary screen** shows each user's claimed items, share of unclaimed items, proportional tax/tip, and grand total

### Planned Features Not Yet Implemented
- [e.g. Venmo / PayPal payment link generation from summary screen]
- [e.g. Receipt history / past sessions view]
- [e.g. Push notifications when host starts the session]
- [Add your own]

---

## Slide 4 — Architecture Overview (30 sec)

| Layer | Technology |
|---|---|
| Frontend | Expo (React Native) + Expo Router |
| Backend / Database | Supabase (Postgres + Auth + Row-Level Security) |
| Real-Time Sync | Supabase Realtime (WebSocket subscriptions) |
| AI Receipt Parsing | Google Gemini API |
| OCR | [Your OCR service] |
| Build / Distribution | EAS Build (Android APK for beta testing) |

**Key database tables:** `receipts`, `sessions`, `session_participants`, `item_claims`

---

## Slide 5 — Test Plan (1.5 min)

### Functional Test Cases

| # | Test Case | Expected Result | Status |
|---|---|---|---|
| 1 | Sign up with valid email | Account created, redirected to app | ✅ |
| 2 | Sign up with mismatched passwords | Validation error shown | ✅ |
| 3 | Sign up with existing email | Appropriate error message shown | ✅ |
| 4 | Sign in with correct credentials | Session established, app loads | ✅ |
| 5 | Sign out | Session cleared, redirected to sign-in | ✅ |
| 6 | Scan a receipt image | Structured data extracted and pre-filled | ✅ |
| 7 | Edit items on review screen | Changes reflected in saved receipt | ✅ |
| 8 | Save receipt | Stored in Supabase, receipt ID returned | ✅ |
| 9 | Start a split session | Session row created, lobby shown with join code | ✅ |
| 10 | Second user joins by 6-char code | Appears in lobby for all participants in real time | ✅ |
| 11 | User claims an item | Claim syncs to all devices instantly | ✅ |
| 12 | User unclaims an item | Claim removed from all devices instantly | ✅ |
| 13 | Two users claim the same item | Each user's summary shows lineTotal ÷ 2 | ✅ |
| 14 | Item left unclaimed | Cost split evenly among all participants | ✅ |
| 15 | Host taps Finish | All devices navigate to individual summary | ✅ |
| 16 | Summary tax/tip calculation | Each user's share is proportional to their item subtotal | ✅ |
| 17 | Enter invalid join code | "Not Found" error alert | ✅ |
| 18 | Join session that is already finished | Session not found (filtered by status) | ✅ |

### User Testing
- [Describe any real-user testing done — e.g. tested full session flow with two Android devices using preview APK build]
- [Planned: broader beta distribution via EAS Android build link]

---

## Slide 6 — Issues & Strategies (1.5 min)

| Issue | Strategy / Resolution |
|---|---|
| Node.js version mismatch (v20.18.3 vs required ≥20.19.4) | Warnings only — does not affect functionality; will upgrade Node before production |
| EAS project owner mismatch between `app.json` fields | Resolved by re-running `eas init` to re-link project to correct account |
| No Apple Developer account for iOS distribution | Pivoted to Android APK for friend/beta testing; iOS support deferred |
| QR code component requires native dev build | Installed `react-native-svg` + `react-native-qrcode-svg`; new dev build required before QR renders on device |
| Realtime DELETE events need `old` record in payload | Enabled `REPLICA IDENTITY FULL` on `item_claims` table in Supabase |
| [Any other issue you encountered] | [How you resolved or plan to resolve it] |

---

## Slide 7 — Individual Responsibilities (1.5 min)

*Each team member presents their own section.*

---

### [Team Member 1 — Aaron]

**Completed:**
- Receipt scanning pipeline (OCR + Google Gemini integration)
- Editable receipt review screen
- Save receipt to Supabase with ID return
- Split Live Sessions full architecture (Supabase schema, RLS policies, Realtime)
- Session lobby, claim, summary, and deep-link join screens
- Home screen "Join a Session" UI with 6-char code input

**Remaining tasks:**
- [e.g. QR code deep-link testing once new dev build is created]
- [e.g. Any remaining planned features]

---

### [Team Member 2 — Name]

**Completed:**
- [Their tasks]

**Remaining tasks:**
- [Their plan]

---

### [Team Member 3 — Name] *(if applicable)*

**Completed:**
- [Their tasks]

**Remaining tasks:**
- [Their plan]

---

## Slide 8 — What's Next (30 sec)

- Complete remaining planned features: [list them]
- Expand user testing with Android APK distribution
- Obtain Apple Developer account for iOS distribution
- [Any other next steps]

---

## Slide 9 — Q&A

> *"Thank you — any questions?"*

---

## Submission Checklist

- [ ] PDF of slides exported
- [ ] YouTube video uploaded (under 10 min)
- [ ] All cameras on during recording
- [ ] Business casual attire
- [ ] Each team member presents their own section
- [ ] One submission per group
