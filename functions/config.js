/**
 * Single source of truth for the study's tunable constants.
 *
 * ADMIN_EMAIL must match the constant of the same name in
 * src/pages/ReviewerDashboard.jsx — that address is the only one allowed to
 * self-promote through the bootstrapAdmin callable.
 */
export const ADMIN_EMAIL = "wenxiw@virginia.edu";

/** Assigned when an account is created without an explicit password. */
export const DEFAULT_PASSWORD = "HIPREL#REQ26";

/** Maximum reviews a single reviewer may submit. */
export const SUBMISSION_LIMIT = 100;

/** Region for every callable; mirrored by getFunctions() in src/firebase.js. */
export const REGION = "us-east1";
