"use client";

import { useState } from "react";

type OpportunityRow = {
  id: string;
  title: string;
  funder_name: string | null;
  deadline_at: string | null;
  amount_min: string | null;
  amount_max: string | null;
  currency: string;
  status: string;
  application_url: string | null;
  source_name: string;
  fit_score: number;
  fit_reasons: string[];
  pipeline_stage: string;
  starred: boolean;
  notes: string | null;
};

export default function DiscoverPage() {
  const [organizationProfileId, setOrganizationProfileId] = useState(
    "fdb54db0-6de7-4974-8705-1562bb3c7447"
  );
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [opportunities, setOpportunities] = useState<OpportunityRow[]>([]);

  async function loadOpportunities(orgId: string) {
    const res = await fetch(
      `/api/opportunities?organizationProfileId=${encodeURIComponent(orgId)}`
    );

    if (!res.ok) {
      throw new Error("Failed to load opportunities");
    }

    const data = await res.json();
    setOpportunities(data);
  }

  async function handleScan() {
    try {
      setLoading(true);
      setMessage("");

      const res = await fetch("/api/discovery/run", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          organizationProfileId,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data?.error || "Scan failed");
      }

      setMessage(
        `Scan complete. Discovered ${data.discovered} opportunity(s).`
      );

      await loadOpportunities(organizationProfileId);
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : "Something went wrong";
      setMessage(errorMessage);
    } finally {
      setLoading(false);
    }
  }

  async function handleLoadExisting() {
    try {
      setLoading(true);
      setMessage("");
      await loadOpportunities(organizationProfileId);
      setMessage("Loaded saved opportunities.");
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : "Failed to load opportunities";
      setMessage(errorMessage);
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen bg-white text-black p-8">
      <div className="max-w-5xl mx-auto space-y-8">
        <div className="space-y-3">
          <h1 className="text-3xl font-bold">GrantFish Discover</h1>
          <p className="text-sm text-gray-600">
            Run a grant scan for a nonprofit profile and load matched
            opportunities.
          </p>
        </div>

        <div className="border rounded-xl p-4 space-y-4">
          <label className="block space-y-2">
            <span className="text-sm font-medium">Organization Profile ID</span>
            <input
              className="w-full border rounded-lg px-3 py-2 text-sm"
              value={organizationProfileId}
              onChange={(e) => setOrganizationProfileId(e.target.value)}
              placeholder="Enter organization profile UUID"
            />
          </label>

          <div className="flex gap-3">
            <button
              onClick={handleScan}
              disabled={loading || !organizationProfileId}
              className="rounded-lg bg-black text-white px-4 py-2 text-sm disabled:opacity-50"
            >
              {loading ? "Scanning..." : "Scan for Grants"}
            </button>

            <button
              onClick={handleLoadExisting}
              disabled={loading || !organizationProfileId}
              className="rounded-lg border px-4 py-2 text-sm disabled:opacity-50"
            >
              Load Saved Opportunities
            </button>
          </div>

          {message ? (
            <div className="text-sm rounded-lg bg-gray-100 px-3 py-2">
              {message}
            </div>
          ) : null}
        </div>

        <div className="border rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b font-semibold">Opportunities</div>

          {opportunities.length === 0 ? (
            <div className="p-4 text-sm text-gray-600">
              No opportunities loaded yet.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-left">
                  <tr>
                    <th className="px-4 py-3">Title</th>
                    <th className="px-4 py-3">Funder</th>
                    <th className="px-4 py-3">Deadline</th>
                    <th className="px-4 py-3">Amount</th>
                    <th className="px-4 py-3">Fit</th>
                    <th className="px-4 py-3">Stage</th>
                    <th className="px-4 py-3">Source</th>
                  </tr>
                </thead>
                <tbody>
                  {opportunities.map((opp) => {
                    const amount =
                      opp.amount_min && opp.amount_max
                        ? `${opp.currency} ${opp.amount_min}–${opp.amount_max}`
                        : opp.amount_min
                        ? `${opp.currency} ${opp.amount_min}+`
                        : "—";

                    const deadline = opp.deadline_at
                      ? new Date(opp.deadline_at).toLocaleDateString()
                      : "—";

                    return (
                      <tr key={opp.id} className="border-t align-top">
                        <td className="px-4 py-3">
                          <div className="font-medium">{opp.title}</div>
                          {opp.application_url ? (
                            <a
                              href={opp.application_url}
                              target="_blank"
                              rel="noreferrer"
                              className="text-xs text-blue-600 underline"
                            >
                              Apply link
                            </a>
                          ) : null}
                        </td>
                        <td className="px-4 py-3">{opp.funder_name || "—"}</td>
                        <td className="px-4 py-3">{deadline}</td>
                        <td className="px-4 py-3">{amount}</td>
                        <td className="px-4 py-3">
                          <div className="font-medium">{opp.fit_score}</div>
                          {Array.isArray(opp.fit_reasons) &&
                          opp.fit_reasons.length > 0 ? (
                            <ul className="mt-1 text-xs text-gray-600 list-disc ml-4">
                              {opp.fit_reasons.map((reason, idx) => (
                                <li key={idx}>{reason}</li>
                              ))}
                            </ul>
                          ) : null}
                        </td>
                        <td className="px-4 py-3">{opp.pipeline_stage}</td>
                        <td className="px-4 py-3">{opp.source_name}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}