# AmbiVerify — Requirements Ambiguity Review Study

A web platform for collecting human judgements about **ambiguity in software
requirements**. Reviewers are assigned a requirement excerpt together with a
list of machine-extracted findings, and asked to say which findings are
genuine.

The interface is a direct port of the
[summer-intern-eval](https://github.com/HIPREL-Group/summer-intern-eval)
platform (VerusBench): same layout, same components, same admin tooling. Only
the domain, the wording and the data behind it differ.

| | summer-intern-eval | this repo |
|---|---|---|
| Item | Competitive-programming problem | Requirement excerpt from an SRS / user story / RFC |
| Formal artifact | Verus specification (Rust) | Acceptance criteria (Gherkin) |
| Checklist 1 | `requires` — pre-conditions | **Ambiguities** — phrases with two incompatible readings |
| Checklist 2 | `ensures` — post-conditions | **Clarifications** — rewrites that pick one reading |
| Free-text | Missing requires / ensures | Missing ambiguities / clarifications |

## What a reviewer does

1. Signs in and presses **Request Requirement**.
2. Reads the requirement and its acceptance criteria.
3. For each flagged **ambiguity**, ticks the box if the phrase really does admit
   two incompatible readings; otherwise writes why it does not.
4. For each proposed **clarification**, ticks the box if the rewrite resolves
   the ambiguity without changing intent; otherwise writes why it does not.
5. Optionally describes ambiguities or clarifications the extraction missed.
6. Submits. Submissions are final, and the next request draws a new requirement.

Reviewers never see each other's verdicts — everything is served through
callable functions, and direct Firestore access is denied by the security rules.

## Repository layout

```
src/                      React frontend (Vite + Tailwind)
  pages/                  LoginPage, ReviewerDashboard, AdminDashboard, ResetPasswordPage
  components/             RequirementView, FindingChecklist, AdminStats,
                          LeaderboardManager, UserManager, AssignmentManager, …
  contexts/AuthContext    Firebase auth + custom-claim state
functions/                Cloud Functions (Node 20, ESM)
  index.js                All callables
  scoring.js              Leaderboard maths, mirrored by the UI's criterion cards
  config.js               Admin email, default password, submission limit, region
  seed/requirements.js    The study corpus
  seed/seed.js            Idempotent Firestore loader
firestore.rules           Deny-all; every access goes through a callable
```

## Firestore data model

| Collection | Doc id | Shape |
|---|---|---|
| `requirements` | numeric id | `{ id, description, spec, ambiguities[], clarifications[], active, submissionCount }` |
| `assignments` | reviewer uid | `{ uid, email, requirementId, assignedAt }` — deleted on submit |
| `submissions` | auto | `{ uid, email, requirementId, ambiguities[], clarifications[], missingAmbiguities, missingClarifications, submittedAt }` |
| `reviewers` | uid | `{ uid, email, submissionCount, completedRequirementIds[], createdAt }` |
| `leaderboard` | `latest` | `{ rows[], params, computedAtMs }` |

Allocation hands out the least-reviewed active requirement the reviewer has not
already completed, breaking ties at random so concurrent requests spread out.

## Callables

| Name | Who | Purpose |
|---|---|---|
| `getMyAssignment` | reviewer | Current assignment + requirement, submission count |
| `allocateRequirement` | reviewer | Assign the next requirement |
| `submitResponse` | reviewer | Record a review (transactional) |
| `clearMustResetPassword` | reviewer | Drop the forced-reset claim |
| `bootstrapAdmin` | study owner | One-time admin self-promotion |
| `createUsers` | admin | Single or bulk account creation |
| `setUserPassword` | admin | Set a reviewer's password |
| `resetAssignment` | admin | Release a stuck assignment |
| `getAdminStats` | admin | Totals and submission histograms |
| `getResponseAnalytics` | admin | Per-finding vote distributions (full scan) |
| `computeLeaderboard` | admin | Score every submission, cache the result |
| `getLatestLeaderboard` | admin | Read the cached leaderboard |

## Leaderboard scoring

Three signals per submission, each in `[0, 1]`, each multiplied by a time
penalty and summed per reviewer. The criterion cards in the admin UI state the
same formulas as `functions/scoring.js`; keep them in sync.

- **Agreement** — leave-one-out peer consensus per finding. The first submitter
  on a requirement scores 1.0.
- **Length** — word count of the free-text fields, ramping linearly from 0 at
  `minWords` to 1 at `maxWords`. No text fields → 1.0.
- **Missing consensus** — per side, was a missing-finding note written, and did
  peers agree?
- **Time multiplier** — a gap shorter than `minTimeSec` from the previous
  submission collapses that submission's contribution to `tooShortPenalty`.

Weights are applied client-side, so the three sliders re-rank the table
instantly; only the threshold knobs require a recompute.

## Setup

```bash
npm install
(cd functions && npm install)
```

### Local development

```bash
npx firebase emulators:start --only auth,functions,firestore
FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 node functions/seed/seed.js
npm run dev
```

`src/firebase.js` points at the emulators automatically whenever
`import.meta.env.DEV` is set, so `npm run dev` needs no extra configuration.

### Production

```bash
npx firebase deploy --only functions,firestore:rules
GOOGLE_APPLICATION_CREDENTIALS=./service-account.json node functions/seed/seed.js
```

Re-running the seed is idempotent and preserves `submissionCount`; pass
`--reset` to zero the counters as well.

The frontend deploys to GitHub Pages on every push to `main`
(`.github/workflows/deploy.yml`). `vite.config.js` and the router `basename`
are both pinned to `/software-ambiguities-verify/`.

### First admin

`ADMIN_EMAIL` in `functions/config.js` and in `src/pages/ReviewerDashboard.jsx`
must match. Create that account, sign in, and press **Activate Admin** on the
banner that appears — this is the only path to the first admin claim.

## Configuration

Everything tunable lives in `functions/config.js`: `ADMIN_EMAIL`,
`DEFAULT_PASSWORD` (`HIPREL#REQ26`, which forces a reset on first sign-in),
`SUBMISSION_LIMIT` and `REGION`. The frontend's copies of the admin email and
the default password are in `src/pages/ReviewerDashboard.jsx` and
`src/components/UserManager.jsx`.

Firebase web config is in `.env.production` — public by design, as Firebase web
keys are not secrets.

## The corpus

`functions/seed/requirements.js` holds 10 requirements drawn from the shapes
that recur in real specifications: session expiry, bulk export, rate limiting,
duplicate detection, availability, password reset, search, refunds, audit
logging and notification preferences. Each carries 5 flagged ambiguities and 5
proposed clarifications.

The findings are deliberately imperfect. Some are genuine, some are pedantic
non-issues, and some clarifications quietly change behaviour the acceptance
criteria already fix. The file records no ground truth — separating the two is
what the study measures.
