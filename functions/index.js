import { initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { onCall, HttpsError } from "firebase-functions/v2/https";
import { ADMIN_EMAIL, DEFAULT_PASSWORD, SUBMISSION_LIMIT, REGION } from "./config.js";
import { buildLeaderboardRows, SIDES } from "./scoring.js";

initializeApp();
const db = getFirestore();
const auth = getAuth();

const callable = (handler) => onCall({ region: REGION }, handler);

/* ------------------------------------------------------------------ *
 * Guards
 * ------------------------------------------------------------------ */

function requireAuth(request) {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "You must be signed in.");
  }
  return request.auth;
}

function requireAdmin(request) {
  const authCtx = requireAuth(request);
  if (!authCtx.token.admin) {
    throw new HttpsError("permission-denied", "Admin privileges required.");
  }
  return authCtx;
}

/**
 * A reviewer holding the mustResetPassword claim has not yet chosen their own
 * password, so nothing they submit can be attributed to them with confidence.
 */
function requireActiveReviewer(request) {
  const authCtx = requireAuth(request);
  if (authCtx.token.mustResetPassword) {
    throw new HttpsError(
        "failed-precondition",
        "Please set a new password before continuing.",
    );
  }
  return authCtx;
}

/* ------------------------------------------------------------------ *
 * Account lifecycle
 * ------------------------------------------------------------------ */

/**
 * One-time self-promotion for the study owner. Everyone else gets admin only
 * by an existing admin editing custom claims out-of-band.
 */
export const bootstrapAdmin = callable(async (request) => {
  const authCtx = requireAuth(request);
  if ((authCtx.token.email || "").toLowerCase() !== ADMIN_EMAIL.toLowerCase()) {
    throw new HttpsError("permission-denied", "Not eligible for admin bootstrap.");
  }
  const existing = (await auth.getUser(authCtx.uid)).customClaims || {};
  await auth.setCustomUserClaims(authCtx.uid, { ...existing, admin: true });
  return { message: "Admin privileges granted." };
});

/** Called right after a reviewer sets their own password. */
export const clearMustResetPassword = callable(async (request) => {
  const authCtx = requireAuth(request);
  const existing = (await auth.getUser(authCtx.uid)).customClaims || {};
  const next = { ...existing };
  delete next.mustResetPassword;
  await auth.setCustomUserClaims(authCtx.uid, next);
  return { message: "Password reset recorded." };
});

export const createUsers = callable(async (request) => {
  requireAdmin(request);
  const users = request.data?.users;
  if (!Array.isArray(users) || users.length === 0) {
    throw new HttpsError("invalid-argument", "Provide a non-empty users array.");
  }
  if (users.length > 500) {
    throw new HttpsError("invalid-argument", "At most 500 users per request.");
  }

  const results = [];
  for (const entry of users) {
    const email = String(entry?.email || "").trim().toLowerCase();
    if (!email) {
      results.push({ email: entry?.email || "", success: false, error: "Email is required." });
      continue;
    }
    const explicitPassword = typeof entry?.password === "string" && entry.password.trim() !== "" ?
      entry.password.trim() :
      null;
    if (explicitPassword && explicitPassword.length < 6) {
      results.push({ email, success: false, error: "Password must be at least 6 characters." });
      continue;
    }

    try {
      const record = await auth.createUser({
        email,
        password: explicitPassword || DEFAULT_PASSWORD,
      });
      // Default-password accounts are forced through the reset screen.
      if (!explicitPassword) {
        await auth.setCustomUserClaims(record.uid, { mustResetPassword: true });
      }
      await db.collection("reviewers").doc(record.uid).set({
        uid: record.uid,
        email,
        submissionCount: 0,
        completedRequirementIds: [],
        createdAt: FieldValue.serverTimestamp(),
      });
      results.push({
        email,
        success: true,
        uid: record.uid,
        usedDefaultPassword: !explicitPassword,
      });
    } catch (err) {
      results.push({ email, success: false, error: err.message || "Failed to create user." });
    }
  }
  return { results };
});

export const setUserPassword = callable(async (request) => {
  requireAdmin(request);
  const email = String(request.data?.email || "").trim().toLowerCase();
  const password = String(request.data?.password || "");
  if (!email) throw new HttpsError("invalid-argument", "Email is required.");
  if (password.length < 6) {
    throw new HttpsError("invalid-argument", "Password must be at least 6 characters.");
  }

  let record;
  try {
    record = await auth.getUserByEmail(email);
  } catch {
    throw new HttpsError("not-found", `No account found for ${email}.`);
  }
  await auth.updateUser(record.uid, { password });
  // An admin-set password is a known password: no forced reset.
  const existing = record.customClaims || {};
  const next = { ...existing };
  delete next.mustResetPassword;
  await auth.setCustomUserClaims(record.uid, next);
  return { message: `Password updated for ${email}.` };
});

/* ------------------------------------------------------------------ *
 * Assignment & submission
 * ------------------------------------------------------------------ */

/** Strip the answer-bearing bookkeeping fields before sending to a reviewer. */
function publicRequirement(doc) {
  const d = doc.data();
  return {
    id: d.id,
    description: d.description,
    spec: d.spec,
    ambiguities: d.ambiguities || [],
    clarifications: d.clarifications || [],
  };
}

async function reviewerDoc(uid, email) {
  const ref = db.collection("reviewers").doc(uid);
  const snap = await ref.get();
  if (!snap.exists) {
    const seed = {
      uid,
      email: email || null,
      submissionCount: 0,
      completedRequirementIds: [],
      createdAt: FieldValue.serverTimestamp(),
    };
    await ref.set(seed);
    return { ref, data: seed };
  }
  return { ref, data: snap.data() };
}

export const getMyAssignment = callable(async (request) => {
  const authCtx = requireActiveReviewer(request);
  const { data: reviewer } = await reviewerDoc(authCtx.uid, authCtx.token.email);

  const assignmentSnap = await db.collection("assignments").doc(authCtx.uid).get();
  const base = {
    submissionCount: reviewer.submissionCount || 0,
    submissionLimit: SUBMISSION_LIMIT,
  };
  if (!assignmentSnap.exists) {
    return { ...base, assignment: null, requirement: null };
  }

  const assignment = assignmentSnap.data();
  const requirementSnap = await db
      .collection("requirements")
      .doc(String(assignment.requirementId))
      .get();
  if (!requirementSnap.exists) {
    // The requirement was withdrawn after assignment; drop the stale pointer.
    await assignmentSnap.ref.delete();
    return { ...base, assignment: null, requirement: null };
  }

  return {
    ...base,
    assignment: {
      requirementId: assignment.requirementId,
      assignedAtMs: assignment.assignedAt?.toMillis?.() || null,
    },
    requirement: publicRequirement(requirementSnap),
  };
});

/**
 * Hand out the least-reviewed requirement this reviewer has not already done.
 * Ties are broken randomly so concurrent requesters don't pile onto one doc.
 */
export const allocateRequirement = callable(async (request) => {
  const authCtx = requireActiveReviewer(request);
  const { ref: reviewerRef, data: reviewer } = await reviewerDoc(
      authCtx.uid,
      authCtx.token.email,
  );

  if ((reviewer.submissionCount || 0) >= SUBMISSION_LIMIT) {
    throw new HttpsError(
        "failed-precondition",
        `You have reached the submission limit of ${SUBMISSION_LIMIT}.`,
    );
  }

  const assignmentRef = db.collection("assignments").doc(authCtx.uid);
  const done = new Set((reviewer.completedRequirementIds || []).map(String));
  const candidates = (await db.collection("requirements").where("active", "==", true).get())
      .docs
      .filter((d) => !done.has(String(d.data().id)));
  if (candidates.length === 0) {
    throw new HttpsError(
        "resource-exhausted",
        "No further requirements are available for you right now.",
    );
  }

  const minCount = Math.min(...candidates.map((d) => d.data().submissionCount || 0));
  const leastReviewed = candidates.filter(
      (d) => (d.data().submissionCount || 0) === minCount,
  );
  const chosen = leastReviewed[Math.floor(Math.random() * leastReviewed.length)];

  // Claim the assignment transactionally so a double-click cannot hand the
  // same reviewer two different requirements.
  await db.runTransaction(async (tx) => {
    if ((await tx.get(assignmentRef)).exists) {
      throw new HttpsError(
          "failed-precondition",
          "You already have an active assignment. Submit it before requesting another.",
      );
    }
    tx.set(assignmentRef, {
      uid: authCtx.uid,
      email: authCtx.token.email || null,
      requirementId: chosen.data().id,
      assignedAt: FieldValue.serverTimestamp(),
    });
    tx.set(reviewerRef, { email: authCtx.token.email || null }, { merge: true });
  });

  return { requirementId: chosen.data().id };
});

/** Coerce one side of the client payload into the stored shape. */
function normalizeFindings(raw, expectedLength, sideLabel) {
  if (!Array.isArray(raw)) {
    throw new HttpsError("invalid-argument", `${sideLabel} must be an array.`);
  }
  if (raw.length !== expectedLength) {
    throw new HttpsError(
        "invalid-argument",
        `Expected ${expectedLength} ${sideLabel}, received ${raw.length}.`,
    );
  }
  return raw.map((entry, i) => {
    const correct = !!entry?.correct;
    const explanation = typeof entry?.explanation === "string" ?
      entry.explanation.trim() :
      "";
    if (!correct && explanation === "") {
      throw new HttpsError(
          "invalid-argument",
          `${sideLabel} #${i + 1} is marked incorrect but has no explanation.`,
      );
    }
    return { index: i, correct, explanation: correct ? null : explanation };
  });
}

function normalizeNote(raw) {
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  return trimmed === "" ? null : trimmed;
}

export const submitResponse = callable(async (request) => {
  const authCtx = requireActiveReviewer(request);
  const assignmentRef = db.collection("assignments").doc(authCtx.uid);
  const assignmentSnap = await assignmentRef.get();
  if (!assignmentSnap.exists) {
    throw new HttpsError("failed-precondition", "You have no active assignment.");
  }
  const requirementId = assignmentSnap.data().requirementId;

  const requirementRef = db.collection("requirements").doc(String(requirementId));
  const requirementSnap = await requirementRef.get();
  if (!requirementSnap.exists) {
    throw new HttpsError("not-found", "The assigned requirement no longer exists.");
  }
  const requirement = requirementSnap.data();

  const ambiguities = normalizeFindings(
      request.data?.ambiguities,
      (requirement.ambiguities || []).length,
      "Ambiguities",
  );
  const clarifications = normalizeFindings(
      request.data?.clarifications,
      (requirement.clarifications || []).length,
      "Clarifications",
  );

  const submissionRef = db.collection("submissions").doc();
  const reviewerRef = db.collection("reviewers").doc(authCtx.uid);

  // One transaction so a submission can never be double-counted, and the
  // assignment can never survive a recorded submission. The assignment is
  // re-read *inside* the transaction: the check above raced with a concurrent
  // submit would let both callers through, and only a transactional read makes
  // Firestore abort the loser.
  await db.runTransaction(async (tx) => {
    const liveAssignment = await tx.get(assignmentRef);
    if (!liveAssignment.exists) {
      throw new HttpsError("failed-precondition", "You have no active assignment.");
    }
    if (liveAssignment.data().requirementId !== requirementId) {
      throw new HttpsError(
          "aborted",
          "Your assignment changed while the review was being submitted. Please reload.",
      );
    }

    const reviewerSnap = await tx.get(reviewerRef);
    const reviewer = reviewerSnap.exists ? reviewerSnap.data() : null;
    if ((reviewer?.submissionCount || 0) >= SUBMISSION_LIMIT) {
      throw new HttpsError(
          "failed-precondition",
          `You have reached the submission limit of ${SUBMISSION_LIMIT}.`,
      );
    }

    tx.set(submissionRef, {
      uid: authCtx.uid,
      email: authCtx.token.email || null,
      requirementId,
      ambiguities,
      clarifications,
      missingAmbiguities: normalizeNote(request.data?.missingAmbiguities),
      missingClarifications: normalizeNote(request.data?.missingClarifications),
      submittedAt: FieldValue.serverTimestamp(),
    });
    tx.set(
        reviewerRef,
        {
          uid: authCtx.uid,
          email: authCtx.token.email || null,
          submissionCount: FieldValue.increment(1),
          completedRequirementIds: FieldValue.arrayUnion(requirementId),
        },
        { merge: true },
    );
    tx.update(requirementRef, { submissionCount: FieldValue.increment(1) });
    tx.delete(assignmentRef);
  });

  return { message: "Review submitted.", submissionId: submissionRef.id };
});

export const resetAssignment = callable(async (request) => {
  requireAdmin(request);
  const email = String(request.data?.email || "").trim().toLowerCase();
  if (!email) throw new HttpsError("invalid-argument", "Email is required.");

  let record;
  try {
    record = await auth.getUserByEmail(email);
  } catch {
    throw new HttpsError("not-found", `No account found for ${email}.`);
  }

  const assignmentRef = db.collection("assignments").doc(record.uid);
  if (!(await assignmentRef.get()).exists) {
    return { message: `${email} has no active assignment.` };
  }
  await assignmentRef.delete();
  return { message: `Assignment reset for ${email}.` };
});

/* ------------------------------------------------------------------ *
 * Admin analytics
 * ------------------------------------------------------------------ */

export const getAdminStats = callable(async (request) => {
  requireAdmin(request);

  const [requirementsSnap, reviewersSnap, assignmentsSnap] = await Promise.all([
    db.collection("requirements").get(),
    db.collection("reviewers").get(),
    db.collection("assignments").get(),
  ]);

  const requirementStats = requirementsSnap.docs.map((d) => ({
    requirementId: d.data().id,
    submissionCount: d.data().submissionCount || 0,
  }));

  // Reviewers binned by how many reviews they have submitted, including the
  // zero bucket so idle accounts stay visible.
  const perReviewer = reviewersSnap.docs.map((d) => d.data().submissionCount || 0);
  const histCounts = new Map();
  for (const n of perReviewer) histCounts.set(n, (histCounts.get(n) || 0) + 1);
  const reviewerSubmissionHistogram = [...histCounts.entries()]
      .map(([submissions, reviewers]) => ({ submissions, reviewers }))
      .sort((a, b) => a.submissions - b.submissions);

  return {
    totalReviewers: reviewersSnap.size,
    totalSubmissions: perReviewer.reduce((a, b) => a + b, 0),
    totalRequirements: requirementsSnap.size,
    activeAssignments: assignmentsSnap.size,
    requirementStats,
    reviewerSubmissionHistogram,
  };
});

/**
 * Full scan over submissions, aggregated per requirement. Gated behind an
 * explicit button in the UI because it reads every submission document.
 */
export const getResponseAnalytics = callable(async (request) => {
  requireAdmin(request);

  const submissionsSnap = await db.collection("submissions").get();

  const findingVotes = {};
  const missingReports = {};

  for (const doc of submissionsSnap.docs) {
    const s = doc.data();
    const key = String(s.requirementId);

    if (!findingVotes[key]) {
      findingVotes[key] = { ambiguities: [], clarifications: [] };
    }
    for (const side of SIDES) {
      const bucket = findingVotes[key][side];
      (s[side] || []).forEach((entry, i) => {
        if (!bucket[i]) bucket[i] = { genuineVotes: 0, totalVotes: 0 };
        bucket[i].totalVotes++;
        if (entry.correct) bucket[i].genuineVotes++;
      });
    }

    if (!missingReports[key]) {
      missingReports[key] = {
        totalSubmissions: 0,
        missingAmbCount: 0,
        missingClarCount: 0,
        missingEitherCount: 0,
      };
    }
    const mr = missingReports[key];
    const amb = !!s.missingAmbiguities;
    const clar = !!s.missingClarifications;
    mr.totalSubmissions++;
    if (amb) mr.missingAmbCount++;
    if (clar) mr.missingClarCount++;
    if (amb || clar) mr.missingEitherCount++;
  }

  // A requirement whose findings are unevenly answered can leave holes in the
  // sparse arrays above; fill them so the client can iterate safely.
  for (const key of Object.keys(findingVotes)) {
    for (const side of SIDES) {
      findingVotes[key][side] = [...findingVotes[key][side]].map(
          (e) => e || { genuineVotes: 0, totalVotes: 0 },
      );
    }
  }

  return { findingVotes, missingReports };
});

/* ------------------------------------------------------------------ *
 * Leaderboard
 * ------------------------------------------------------------------ */

const LEADERBOARD_DOC = db.collection("leaderboard").doc("latest");

export const computeLeaderboard = callable(async (request) => {
  requireAdmin(request);

  const submissionsSnap = await db.collection("submissions").get();
  const submissions = submissionsSnap.docs.map((d) => {
    const s = d.data();
    return {
      id: d.id,
      uid: s.uid,
      email: s.email || null,
      requirementId: s.requirementId,
      submittedAtMs: s.submittedAt?.toMillis?.() || 0,
      ambiguities: s.ambiguities || [],
      clarifications: s.clarifications || [],
      missingAmbiguities: s.missingAmbiguities || null,
      missingClarifications: s.missingClarifications || null,
    };
  });

  const { rows, params } = buildLeaderboardRows(submissions, request.data);
  const computedAtMs = Date.now();

  await LEADERBOARD_DOC.set({ rows, params, computedAtMs });
  return { rows, params, computedAtMs };
});

export const getLatestLeaderboard = callable(async (request) => {
  requireAdmin(request);
  const snap = await LEADERBOARD_DOC.get();
  if (!snap.exists) {
    throw new HttpsError("not-found", "No leaderboard has been computed yet.");
  }
  return snap.data();
});
