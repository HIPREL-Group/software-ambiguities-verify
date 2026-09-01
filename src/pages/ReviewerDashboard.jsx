import { useState, useEffect, useCallback } from "react";
import { httpsCallable } from "firebase/functions";
import { functions } from "../firebase";
import { useAuth } from "../contexts/AuthContext";
import RequirementView from "../components/RequirementView";
import FindingChecklist from "../components/FindingChecklist";
import ConfirmDialog from "../components/ConfirmDialog";

const ADMIN_EMAIL = "wenxiw@virginia.edu";

function InstructionsBody() {
  return (
    <>
      <p>
        Each <strong className="text-gray-700">AmbiVerify</strong> item consists of:
      </p>
      <ul className="list-disc pl-5 space-y-1">
        <li>
          A <strong className="text-gray-700">requirement</strong> excerpted from a real software requirements document (an SRS, a user story, or an RFC).
        </li>
        <li>
          A set of <strong className="text-gray-700">acceptance criteria</strong> written in Gherkin, together with two lists of automatically extracted findings:{" "}
          <strong className="text-gray-700">ambiguities</strong> (phrases that admit more than one reading) and{" "}
          <strong className="text-gray-700">clarifications</strong> (rewrites proposed to remove them).
        </li>
      </ul>
      <p>
        An ambiguity is a phrase a reasonable implementer could act on in two <em>incompatible</em> ways. A clarification is a rewrite that picks one reading while leaving the requirement&apos;s intent, and everything the acceptance criteria already pin down, unchanged.
      </p>
      <p>
        Your task is to judge whether each flagged finding is genuine, and whether the findings together cover the requirement.
      </p>
      <div className="border-l-4 border-amber-500 bg-amber-50 text-amber-900 px-4 py-3 rounded-r-md">
        Your work will be evaluated on three criteria, in order of priority: (1) the quality of your reviews, (2) the number of requirements you review, and (3) the time taken to review them. Quality comes first — submitting more reviews with errors is less valuable than submitting fewer but correct ones.
      </div>
      <p className="font-semibold text-gray-800">
        The deadline for this task is Sunday, October 11, 2026 at 23:59:59 AoE.
      </p>
      <p className="text-xs text-gray-400">
        New to requirements ambiguity? Check out the{" "}
        <a
          href="https://cucumber.io/docs/gherkin/reference/"
          target="_blank"
          rel="noopener noreferrer"
          className="text-primary-600 hover:text-primary-700"
        >
          Gherkin reference
        </a>.
      </p>
    </>
  );
}

export default function ReviewerDashboard() {
  const { user, isAdmin, bootstrapAdmin } = useAuth();
  const [assignment, setAssignment] = useState(null);
  const [requirement, setRequirement] = useState(null);
  const [loading, setLoading] = useState(true);
  const [requesting, setRequesting] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [bootstrapping, setBootstrapping] = useState(false);
  const [submissionCount, setSubmissionCount] = useState(0);
  const [submissionLimit, setSubmissionLimit] = useState(100);

  // Response state
  const [ambiguityResponses, setAmbiguityResponses] = useState([]);
  const [clarificationResponses, setClarificationResponses] = useState([]);
  const [missingAmbiguities, setMissingAmbiguities] = useState("");
  const [missingClarifications, setMissingClarifications] = useState("");

  const fetchAssignment = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const getMyAssignment = httpsCallable(functions, "getMyAssignment");
      const result = await getMyAssignment();
      const data = result.data;
      setSubmissionCount(data?.submissionCount ?? 0);
      setSubmissionLimit(data?.submissionLimit ?? 100);
      if (data?.assignment) {
        setAssignment(data.assignment);
        setRequirement(data.requirement);
        // Initialize response arrays
        setAmbiguityResponses(
          (data.requirement.ambiguities || []).map(() => ({
            correct: false,
            explanation: "",
          }))
        );
        setClarificationResponses(
          (data.requirement.clarifications || []).map(() => ({
            correct: false,
            explanation: "",
          }))
        );
        setMissingAmbiguities("");
        setMissingClarifications("");
      } else {
        setAssignment(null);
        setRequirement(null);
      }
    } catch (err) {
      setError("Failed to load your assignment. Please try again.");
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAssignment();
  }, [fetchAssignment]);

  const handleRequestRequirement = async () => {
    setRequesting(true);
    setError("");
    setSuccess("");
    try {
      const allocateRequirement = httpsCallable(functions, "allocateRequirement");
      await allocateRequirement();
      await fetchAssignment();
      setSuccess("A new requirement has been assigned to you!");
      setTimeout(() => setSuccess(""), 3000);
    } catch (err) {
      const msg =
        err.details?.message || err.message || "Failed to request a requirement.";
      setError(msg);
    } finally {
      setRequesting(false);
    }
  };

  const toggleAmbiguity = (idx) => {
    setAmbiguityResponses((prev) =>
      prev.map((r, i) =>
        i === idx ? { ...r, correct: !r.correct, explanation: r.correct ? r.explanation : "" } : r
      )
    );
  };

  const toggleClarification = (idx) => {
    setClarificationResponses((prev) =>
      prev.map((r, i) =>
        i === idx ? { ...r, correct: !r.correct, explanation: r.correct ? r.explanation : "" } : r
      )
    );
  };

  const updateAmbiguityExplanation = (idx, text) => {
    setAmbiguityResponses((prev) =>
      prev.map((r, i) => (i === idx ? { ...r, explanation: text } : r))
    );
  };

  const updateClarificationExplanation = (idx, text) => {
    setClarificationResponses((prev) =>
      prev.map((r, i) => (i === idx ? { ...r, explanation: text } : r))
    );
  };

  const validateResponses = () => {
    for (let i = 0; i < ambiguityResponses.length; i++) {
      const r = ambiguityResponses[i];
      if (!r.correct && !r.explanation.trim()) {
        return `Please check or explain Ambiguity #${i + 1}.`;
      }
    }
    for (let i = 0; i < clarificationResponses.length; i++) {
      const r = clarificationResponses[i];
      if (!r.correct && !r.explanation.trim()) {
        return `Please check or explain Clarification #${i + 1}.`;
      }
    }
    return null;
  };

  const handleSubmitClick = () => {
    const validationError = validateResponses();
    if (validationError) {
      setError(validationError);
      return;
    }
    setError("");
    setShowConfirm(true);
  };

  const handleConfirmSubmit = async () => {
    setSubmitting(true);
    setError("");
    try {
      const submitResponse = httpsCallable(functions, "submitResponse");
      await submitResponse({
        ambiguities: ambiguityResponses.map((r, i) => ({
          index: i,
          correct: r.correct,
          explanation: r.correct ? null : r.explanation.trim(),
        })),
        clarifications: clarificationResponses.map((r, i) => ({
          index: i,
          correct: r.correct,
          explanation: r.correct ? null : r.explanation.trim(),
        })),
        missingAmbiguities: missingAmbiguities.trim() || null,
        missingClarifications: missingClarifications.trim() || null,
      });
      setShowConfirm(false);
      setAssignment(null);
      setRequirement(null);
      setSuccess("Your review has been submitted successfully!");
    } catch (err) {
      setError(err.message || "Failed to submit. Please try again.");
      setShowConfirm(false);
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      {error && !requirement && (
        <div className="mb-4 bg-red-50 text-red-700 px-4 py-3 rounded-lg text-sm border border-red-200">
          {error}
        </div>
      )}
      {success && (
        <div className="mb-4 bg-green-50 text-green-700 px-4 py-3 rounded-lg text-sm border border-green-200">
          {success}
        </div>
      )}

      {/* Admin bootstrap banner */}
      {user?.email === ADMIN_EMAIL && !isAdmin && (
        <div className="mb-6 bg-amber-50 border border-amber-200 rounded-xl p-5 flex items-center justify-between">
          <div>
            <p className="font-semibold text-amber-800">Admin Setup</p>
            <p className="text-sm text-amber-700">
              Activate your admin privileges to access the admin dashboard.
            </p>
          </div>
          <button
            onClick={async () => {
              setBootstrapping(true);
              try {
                await bootstrapAdmin();
                setSuccess("Admin privileges activated! The Admin tab is now available.");
              } catch (err) {
                setError(err.message || "Failed to activate admin.");
              } finally {
                setBootstrapping(false);
              }
            }}
            disabled={bootstrapping}
            className="px-5 py-2 bg-amber-600 text-white rounded-lg font-medium hover:bg-amber-700 disabled:opacity-50 transition-colors whitespace-nowrap"
          >
            {bootstrapping ? "Activating..." : "Activate Admin"}
          </button>
        </div>
      )}

      {!requirement ? (
        /* No active assignment — show request button */
        <div className="text-center pt-8 pb-20">
          <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-primary-50 mb-6">
            <svg
              className="w-10 h-10 text-primary-600"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
              />
            </svg>
          </div>
          <h2 className="text-2xl font-semibold text-gray-800 mb-4">
            Ready for a new requirement?
          </h2>
          <div className="text-gray-500 mb-8 max-w-2xl mx-auto text-left space-y-3 text-sm leading-relaxed">
            <InstructionsBody />
          </div>
          <button
            onClick={handleRequestRequirement}
            disabled={requesting || submissionCount >= submissionLimit}
            className="px-8 py-3 bg-primary-600 text-white rounded-xl font-medium text-lg hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors shadow-lg shadow-primary-200"
          >
            {submissionCount >= submissionLimit ? (
              "Submission limit reached"
            ) : requesting ? (
              <span className="flex items-center gap-2">
                <span className="animate-spin h-5 w-5 border-2 border-white border-t-transparent rounded-full" />
                Allocating...
              </span>
            ) : (
              "Request Requirement"
            )}
          </button>
          <p className="text-sm text-gray-500 mt-6">
            You have reviewed{" "}
            <span className="font-semibold text-gray-700">
              {submissionCount}
            </span>{" "}
            / {submissionLimit} requirements.
          </p>
        </div>
      ) : (
        /* Active requirement */
        <div className="space-y-6">
          <details className="bg-gray-50 rounded-xl border border-gray-200 px-5 py-3">
            <summary className="cursor-pointer text-sm font-medium text-gray-600 hover:text-gray-800 select-none">
              Instructions
            </summary>
            <div className="mt-3 text-gray-500 text-sm leading-relaxed space-y-3 pb-1">
              <InstructionsBody />
            </div>
          </details>

          <RequirementView
            requirement={requirement}
            submissionCount={submissionCount}
            submissionLimit={submissionLimit}
          />

          <FindingChecklist
            title="Ambiguities"
            findings={requirement.ambiguities || []}
            responses={ambiguityResponses}
            onToggle={toggleAmbiguity}
            onExplanationChange={updateAmbiguityExplanation}
            missingText={missingAmbiguities}
            onMissingChange={setMissingAmbiguities}
            disabled={false}
          />

          <FindingChecklist
            title="Clarifications"
            findings={requirement.clarifications || []}
            responses={clarificationResponses}
            onToggle={toggleClarification}
            onExplanationChange={updateClarificationExplanation}
            missingText={missingClarifications}
            onMissingChange={setMissingClarifications}
            disabled={false}
          />

          <div className="pt-4 pb-8 space-y-3">
            {error && (
              <div className="bg-red-50 text-red-700 px-4 py-3 rounded-lg text-sm border border-red-200">
                {error}
              </div>
            )}
            <div className="flex justify-end">
              <button
                onClick={handleSubmitClick}
                className="px-8 py-3 bg-primary-600 text-white rounded-xl font-medium hover:bg-primary-700 transition-colors shadow-lg shadow-primary-200"
              >
                Submit Review
              </button>
            </div>
          </div>

          <ConfirmDialog
            open={showConfirm}
            onConfirm={handleConfirmSubmit}
            onCancel={() => setShowConfirm(false)}
            loading={submitting}
          />
        </div>
      )}
    </div>
  );
}
