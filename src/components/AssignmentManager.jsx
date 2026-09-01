import { useState } from "react";
import { httpsCallable } from "firebase/functions";
import { functions } from "../firebase";

export default function AssignmentManager({ onRefresh }) {
  const [reviewerEmail, setReviewerEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState(null);

  const handleReset = async (e) => {
    e.preventDefault();
    if (
      !window.confirm(
        `Reset the current assignment for ${reviewerEmail}? This cannot be undone.`
      )
    ) {
      return;
    }

    setLoading(true);
    setMessage(null);
    try {
      const resetAssignment = httpsCallable(functions, "resetAssignment");
      const result = await resetAssignment({ email: reviewerEmail });
      setMessage({
        type: "success",
        text: result.data.message || "Assignment reset successfully.",
      });
      setReviewerEmail("");
      onRefresh?.();
    } catch (err) {
      setMessage({
        type: "error",
        text: err.message || "Failed to reset assignment.",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 max-w-md">
        <h3 className="font-semibold text-gray-800 mb-4">
          Reset Reviewer Assignment
        </h3>
        <p className="text-sm text-gray-500 mb-4">
          Remove a reviewer&apos;s current active assignment, allowing them to request
          a new requirement.
        </p>
        <form onSubmit={handleReset} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Reviewer Email
            </label>
            <input
              type="email"
              value={reviewerEmail}
              onChange={(e) => setReviewerEmail(e.target.value)}
              required
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none"
              placeholder="reviewer@example.com"
            />
          </div>
          <button
            type="submit"
            disabled={loading}
            className="px-6 py-2 bg-amber-600 text-white rounded-lg font-medium hover:bg-amber-700 disabled:opacity-50 transition-colors"
          >
            {loading ? "Resetting..." : "Reset Assignment"}
          </button>
        </form>

        {message && (
          <div
            className={`mt-4 px-4 py-3 rounded-lg text-sm ${
              message.type === "success"
                ? "bg-green-50 text-green-700 border border-green-200"
                : "bg-red-50 text-red-700 border border-red-200"
            }`}
          >
            {message.text}
          </div>
        )}
      </div>
    </div>
  );
}
