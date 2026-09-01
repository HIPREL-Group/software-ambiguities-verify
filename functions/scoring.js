/**
 * Leaderboard scoring.
 *
 * Every formula here is mirrored verbatim in the criterion cards rendered by
 * src/components/LeaderboardManager.jsx — if you change one, change both.
 *
 * All three per-submission signals land in [0, 1]. A submission's contribution
 * to a reviewer's total is `signal × timeMultiplier`, so the totals grow with
 * both volume and quality while fast-fired submissions are discounted.
 */

export const SIDES = ["ambiguities", "clarifications"];

export const DEFAULT_PARAMS = {
  minWords: 3,
  maxWords: 15,
  minTimeSec: 180,
  tooShortPenalty: 0.1,
};

/** Coerce untrusted client params into the documented ranges. */
export function normalizeParams(raw) {
  const p = { ...DEFAULT_PARAMS, ...(raw || {}) };
  const minWords = Math.max(0, Math.floor(num(p.minWords, DEFAULT_PARAMS.minWords)));
  const maxWords = Math.max(1, Math.floor(num(p.maxWords, DEFAULT_PARAMS.maxWords)));
  return {
    minWords,
    maxWords,
    minTimeSec: Math.max(0, num(p.minTimeSec, DEFAULT_PARAMS.minTimeSec)),
    tooShortPenalty: clamp01(num(p.tooShortPenalty, DEFAULT_PARAMS.tooShortPenalty)),
  };
}

function num(v, fallback) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function clamp01(n) {
  return Math.min(1, Math.max(0, n));
}

function mean(xs) {
  return xs.length === 0 ? 1 : xs.reduce((a, b) => a + b, 0) / xs.length;
}

function wordCount(text) {
  if (typeof text !== "string") return 0;
  const trimmed = text.trim();
  return trimmed === "" ? 0 : trimmed.split(/\s+/).length;
}

/** True when the reviewer wrote a non-empty note for this side. */
function flaggedMissing(submission, side) {
  const key = side === "ambiguities" ? "missingAmbiguities" : "missingClarifications";
  return typeof submission[key] === "string" && submission[key].trim() !== "";
}

/**
 * Agreement — leave-one-out peer consensus per finding.
 *
 * Per finding: the fraction of *other* submissions on the same requirement
 * that reached the same genuine/spurious verdict. The submission's score is
 * the mean across its findings. With no peers (first submitter) or no
 * findings, the score is 1.0 — see the "seed of consensus" note in the UI.
 */
export function agreementScore(submission, peers) {
  const perFinding = [];
  for (const side of SIDES) {
    const entries = submission[side] || [];
    for (let i = 0; i < entries.length; i++) {
      const mine = !!entries[i].correct;
      let agree = 0;
      let total = 0;
      for (const peer of peers) {
        const peerEntry = (peer[side] || [])[i];
        if (!peerEntry) continue;
        total++;
        if (!!peerEntry.correct === mine) agree++;
      }
      perFinding.push(total === 0 ? 1 : agree / total);
    }
  }
  return mean(perFinding);
}

/**
 * Length — effort visible in the free-text fields the reviewer actually wrote.
 *
 * Ramps linearly from 0 at `minWords` to 1 at `maxWords`. A submission with no
 * text fields at all (every finding accepted, no missing notes) scores 1:
 * there is nothing to penalize.
 */
export function lengthScore(submission, params) {
  const { minWords, maxWords } = params;
  const texts = [];
  for (const side of SIDES) {
    for (const entry of submission[side] || []) {
      if (typeof entry.explanation === "string" && entry.explanation.trim() !== "") {
        texts.push(entry.explanation);
      }
    }
  }
  for (const key of ["missingAmbiguities", "missingClarifications"]) {
    if (typeof submission[key] === "string" && submission[key].trim() !== "") {
      texts.push(submission[key]);
    }
  }

  const scores = texts.map((t) => {
    const words = wordCount(t);
    if (words < minWords) return 0;
    if (maxWords <= minWords) return 1;
    return clamp01((words - minWords) / (maxWords - minWords));
  });
  return mean(scores);
}

/**
 * Missing-finding consensus — per side, treat "did they flag anything missing?"
 * as a binary and score it against how the peers on this requirement voted.
 */
export function missingScore(submission, peers) {
  const perSide = SIDES.map((side) => {
    const n = peers.length;
    if (n === 0) return 1;
    const othersFlagged = peers.filter((p) => flaggedMissing(p, side)).length;

    if (flaggedMissing(submission, side)) {
      if (othersFlagged >= 2) return 1;
      if (othersFlagged === 1) return 0.75;
      return 0;
    }
    if (othersFlagged === 0) return 1;
    if (othersFlagged > n / 2) return 0;
    return 0.5;
  });
  return mean(perSide);
}

/**
 * Time multipliers for one reviewer's submissions, in chronological order.
 *
 * The gap to the *previous* submission is the proxy for time spent. Gaps below
 * `minTimeSec` collapse the multiplier to `tooShortPenalty`. Long gaps earn
 * nothing extra — idle wall-clock time is not engagement — and the first
 * submission has no predecessor, so it is never penalized.
 */
export function timeMultipliers(sortedSubmissions, params) {
  const { minTimeSec, tooShortPenalty } = params;
  return sortedSubmissions.map((s, i) => {
    if (i === 0) return 1;
    const gapSec = (s.submittedAtMs - sortedSubmissions[i - 1].submittedAtMs) / 1000;
    return gapSec < minTimeSec ? tooShortPenalty : 1;
  });
}

/**
 * Score every submission and fold them into one row per reviewer.
 *
 * @param {Array} submissions every submission, each carrying uid, email,
 *   requirementId, submittedAtMs and the two finding arrays.
 * @param {object} rawParams client-supplied knobs; normalized here.
 * @return {{rows: Array, params: object}} rows ready for the leaderboard table.
 */
export function buildLeaderboardRows(submissions, rawParams) {
  const params = normalizeParams(rawParams);

  // Group by requirement so peer comparisons are cheap and leave-one-out.
  const byRequirement = new Map();
  for (const s of submissions) {
    const key = String(s.requirementId);
    if (!byRequirement.has(key)) byRequirement.set(key, []);
    byRequirement.get(key).push(s);
  }

  const scored = submissions.map((s) => {
    const peers = byRequirement
        .get(String(s.requirementId))
        .filter((other) => other.id !== s.id);
    return {
      ...s,
      agreement: agreementScore(s, peers),
      length: lengthScore(s, params),
      missing: missingScore(s, peers),
    };
  });

  const byReviewer = new Map();
  for (const s of scored) {
    if (!byReviewer.has(s.uid)) byReviewer.set(s.uid, []);
    byReviewer.get(s.uid).push(s);
  }

  const rows = [];
  for (const [uid, subs] of byReviewer) {
    subs.sort((a, b) => a.submittedAtMs - b.submittedAtMs);
    const multipliers = timeMultipliers(subs, params);

    let agreementTotal = 0;
    let lengthTotal = 0;
    let missingTotal = 0;
    subs.forEach((s, i) => {
      agreementTotal += s.agreement * multipliers[i];
      lengthTotal += s.length * multipliers[i];
      missingTotal += s.missing * multipliers[i];
    });

    rows.push({
      uid,
      email: subs[subs.length - 1].email || null,
      submissionCount: subs.length,
      agreementTotal,
      lengthTotal,
      missingTotal,
      avgTimeMultiplier:
        multipliers.reduce((a, b) => a + b, 0) / multipliers.length,
    });
  }

  // Default ordering matches the table's default sort (composite desc under
  // equal weights); the client re-sorts anyway.
  rows.sort(
      (a, b) =>
        b.agreementTotal + b.lengthTotal + b.missingTotal -
      (a.agreementTotal + a.lengthTotal + a.missingTotal),
  );

  return { rows, params };
}
