#!/usr/bin/env node
/**
 * Load the seed corpus into Firestore.
 *
 * Usage:
 *   GOOGLE_APPLICATION_CREDENTIALS=./service-account.json \
 *   FIREBASE_PROJECT_ID=software-ambi \
 *   node functions/seed/seed.js [--reset]
 *
 * Against the emulator, set FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 instead of
 * providing credentials.
 *
 * Requirement documents are keyed by their numeric id so re-running is
 * idempotent. By default an existing document's submissionCount is preserved,
 * so re-seeding to fix a typo does not discard review progress; --reset zeroes
 * the counters instead.
 */
import { initializeApp, cert, applicationDefault } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { readFileSync } from "node:fs";
import { requirements } from "./requirements.js";

const reset = process.argv.includes("--reset");
const projectId = process.env.FIREBASE_PROJECT_ID || "software-ambi";
const credentialsPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;

initializeApp({
  projectId,
  credential: credentialsPath ?
    cert(JSON.parse(readFileSync(credentialsPath, "utf8"))) :
    applicationDefault(),
});

const db = getFirestore();

async function main() {
  const collection = db.collection("requirements");
  let created = 0;
  let updated = 0;

  for (const r of requirements) {
    const ref = collection.doc(String(r.id));
    const existing = await ref.get();
    const submissionCount = reset || !existing.exists ?
      0 :
      existing.data().submissionCount || 0;

    await ref.set({
      id: r.id,
      description: r.description,
      spec: r.spec,
      ambiguities: r.ambiguities,
      clarifications: r.clarifications,
      active: true,
      submissionCount,
    });

    if (existing.exists) updated++;
    else created++;
  }

  console.log(
      `Seeded ${requirements.length} requirements into ${projectId} ` +
    `(${created} created, ${updated} updated${reset ? ", counters reset" : ""}).`,
  );
}

main().catch((err) => {
  console.error("Seed failed:", err.message);
  process.exit(1);
});
