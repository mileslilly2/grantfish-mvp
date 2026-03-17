"use client";

import { useEffect, useMemo, useState } from "react";

const STAGE_OPTIONS = ["new", "review", "shortlist", "archived"] as const;

type PipelineStage = (typeof STAGE_OPTIONS)[number];

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

type Organization = {
  id: string;
  name: string;
  entity_type: string;
  mission: string;
  geographies: string[];
  focus_areas: string[];
  tax_status: string | null;
};

type CreateOrganizationForm = {
  name: string;
  entity_type: string;
  mission: string;
  geographies: string;
  focus_areas: string;
  tax_status: string;
};

export default function DiscoverPage() {
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [organizationProfileId, setOrganizationProfileId] = useState("");
  const [loading, setLoading] = useState(false);
  const [updatingStageId, setUpdatingStageId] = useState<string | null>(null);
  const [orgLoading, setOrgLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [lastScanCompletedAt, setLastScanCompletedAt] = useState<string | null>(
    null
  );
  const [opportunities, setOpportunities] = useState<OpportunityRow[]>([]);
  const [logs, setLogs] = useState<string[]>([]);
  const [createOrgForm, setCreateOrgForm] = useState<CreateOrganizationForm>({
    name: "",
    entity_type: "nonprofit",
    mission: "",
    geographies: "",
    focus_areas: "",
    tax_status: "",
  });

  const selectedOrganization = useMemo(() => {
    return (
      organizations.find((org) => org.id === organizationProfileId) ?? null
    );
  }, [organizations, organizationProfileId]);

  useEffect(() => {
    async function loadOrganizations() {
      try {
        setOrgLoading(true);

        const res = await fetch("/api/organizations");

        if (!res.ok) {
          throw new Error("Failed to load organizations");
        }

        const data: Organization[] = await res.json();
        setOrganizations(data);

        if (data.length > 0) {
          setOrganizationProfileId((current) => current || data[0].id);
        }
      } catch (err) {
        const errorMessage =
          err instanceof Error ? err.message : "Failed to load organizations";
        setMessage(errorMessage);
      } finally {
        setOrgLoading(false);
      }
    }

    loadOrganizations();
  }, []);

  useEffect(() => {
    const interval = setInterval(async () => {
      try {
        const res = await fetch("/api/logs", { cache: "no-store" });

        if (!res.ok) {
          return;
        }

        const data = await res.json();

        if (Array.isArray(data)) {
          const normalizedLogs = data.map((entry) => {
            if (typeof entry === "string") {
              return entry;
            }

            if (
              entry &&
              typeof entry === "object" &&
              "message" in entry &&
              typeof entry.message === "string"
            ) {
              return entry.message;
            }

            if (
              entry &&
              typeof entry === "object" &&
              "step" in entry &&
              typeof entry.step === "string"
            ) {
              return entry.step;
            }

            return JSON.stringify(entry);
          });

          setLogs(normalizedLogs);
        }
      } catch {
        // ignore polling errors
      }
    }, 500);

    return () => clearInterval(interval);
  }, []);

  async function loadOrganizationsAndSelect(newOrgId?: string) {
    const res = await fetch("/api/organizations");

    if (!res.ok) {
      throw new Error("Failed to load organizations");
    }

    const data: Organization[] = await res.json();
    setOrganizations(data);

    if (newOrgId) {
      setOrganizationProfileId(newOrgId);
      return;
    }

    if (!organizationProfileId && data.length > 0) {
      setOrganizationProfileId(data[0].id);
    }
  }

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
      if (!organizationProfileId) {
        throw new Error("Please select an organization");
      }

      setLoading(true);
      setMessage("");
      setLogs([]);

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
      setLastScanCompletedAt(new Date().toISOString());

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
      if (!organizationProfileId) {
        throw new Error("Please select an organization");
      }

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

  async function handleCreateOrganization(e: React.FormEvent) {
    e.preventDefault();

    try {
      setLoading(true);
      setMessage("");

      const payload = {
        name: createOrgForm.name.trim(),
        entity_type: createOrgForm.entity_type.trim() || "nonprofit",
        mission: createOrgForm.mission.trim(),
        geographies: createOrgForm.geographies
          .split(",")
          .map((item) => item.trim())
          .filter(Boolean),
        focus_areas: createOrgForm.focus_areas
          .split(",")
          .map((item) => item.trim())
          .filter(Boolean),
        tax_status: createOrgForm.tax_status.trim(),
      };

      const res = await fetch("/api/organizations", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data?.error || "Failed to create organization");
      }

      await loadOrganizationsAndSelect(data.id);

      setCreateOrgForm({
        name: "",
        entity_type: "nonprofit",
        mission: "",
        geographies: "",
        focus_areas: "",
        tax_status: "",
      });

      setMessage(`Created organization: ${data.name}`);
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : "Failed to create organization";
      setMessage(errorMessage);
    } finally {
      setLoading(false);
    }
  }

  async function handleStageChange(
    opportunityId: string,
    pipelineStage: PipelineStage
  ) {
    const previousOpportunities = opportunities;

    try {
      if (!organizationProfileId) {
        throw new Error("Please select an organization");
      }

      setUpdatingStageId(opportunityId);
      setMessage("");
      setOpportunities((current) =>
        current.map((opp) =>
          opp.id === opportunityId ? { ...opp, pipeline_stage: pipelineStage } : opp
        )
      );

      const res = await fetch("/api/opportunity-matches/stage", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          organizationProfileId,
          opportunityId,
          pipelineStage,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data?.error || "Failed to update stage");
      }

      setOpportunities((current) =>
        current.map((opp) =>
          opp.id === opportunityId
            ? { ...opp, pipeline_stage: data.pipeline_stage }
            : opp
        )
      );
    } catch (err) {
      setOpportunities(previousOpportunities);
      const errorMessage =
        err instanceof Error ? err.message : "Failed to update stage";
      setMessage(errorMessage);
    } finally {
      setUpdatingStageId(null);
    }
  }

  return (
    <main className="min-h-screen bg-white text-black p-8">
      <div className="max-w-6xl mx-auto space-y-8">
        <div className="space-y-3">
          <h1 className="text-3xl font-bold">GrantFish Discover</h1>
          <p className="text-sm text-gray-600">
            Run a grant scan for an organization profile and load matched
            opportunities.
          </p>
        </div>

        <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
          <div className="border rounded-xl p-4 space-y-4">
            <label className="block space-y-2">
              <span className="text-sm font-medium">Select Organization</span>
              <select
                className="w-full border rounded-lg px-3 py-2 text-sm bg-white"
                value={organizationProfileId}
                onChange={(e) => setOrganizationProfileId(e.target.value)}
                disabled={orgLoading || organizations.length === 0}
              >
                {orgLoading ? (
                  <option value="">Loading organizations...</option>
                ) : organizations.length === 0 ? (
                  <option value="">No organizations found</option>
                ) : (
                  organizations.map((org) => (
                    <option key={org.id} value={org.id}>
                      {org.name}
                    </option>
                  ))
                )}
              </select>
            </label>

            {selectedOrganization ? (
              <div className="border rounded-xl p-4 space-y-3">
                <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                  Organization Summary
                </div>

                <div className="text-2xl font-bold">
                  Searching for grants for: {selectedOrganization.name}
                </div>

                <div>
                  <span className="font-medium">Entity Type:</span>{" "}
                  <span className="text-gray-700">
                    {selectedOrganization.entity_type || "—"}
                  </span>
                </div>

                <div>
                  <span className="font-medium">Mission:</span>{" "}
                  {selectedOrganization.mission || "—"}
                </div>

                <div>
                  <span className="font-medium">Focus Areas:</span>{" "}
                  {selectedOrganization.focus_areas.length > 0
                    ? selectedOrganization.focus_areas.join(", ")
                    : "—"}
                </div>

                <div>
                  <span className="font-medium">Geographies:</span>{" "}
                  {selectedOrganization.geographies.length > 0
                    ? selectedOrganization.geographies.join(", ")
                    : "—"}
                </div>

                <div>
                  <span className="font-medium">Tax Status:</span>{" "}
                  {selectedOrganization.tax_status || "—"}
                </div>
              </div>
            ) : null}

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

            <div className="rounded-lg bg-black text-green-400 p-3 text-xs font-mono max-h-48 overflow-y-auto min-h-[72px]">
              {logs.length > 0 ? (
                logs.map((log, i) => <div key={i}>{">"} {log}</div>)
              ) : (
                <div>{">"}</div>
              )}
            </div>

            {message ? (
              <div className="text-sm rounded-lg bg-gray-100 px-3 py-2">
                {message}
              </div>
            ) : null}

            {lastScanCompletedAt ? (
              <div className="text-sm text-gray-600">
                Last scan completed at{" "}
                {new Date(lastScanCompletedAt).toLocaleString()}.
              </div>
            ) : null}
          </div>

          <div className="border rounded-xl p-4 space-y-4">
            <div className="text-xl font-semibold">Create Organization</div>

            <form onSubmit={handleCreateOrganization} className="space-y-4">
              <label className="block space-y-2">
                <span className="text-sm font-medium">Name</span>
                <input
                  className="w-full border rounded-lg px-3 py-2 text-sm"
                  value={createOrgForm.name}
                  onChange={(e) =>
                    setCreateOrgForm((prev) => ({
                      ...prev,
                      name: e.target.value,
                    }))
                  }
                  placeholder="Example Nonprofit"
                  required
                />
              </label>

              <label className="block space-y-2">
                <span className="text-sm font-medium">Entity Type</span>
                <input
                  className="w-full border rounded-lg px-3 py-2 text-sm"
                  value={createOrgForm.entity_type}
                  onChange={(e) =>
                    setCreateOrgForm((prev) => ({
                      ...prev,
                      entity_type: e.target.value,
                    }))
                  }
                  placeholder="nonprofit"
                />
              </label>

              <label className="block space-y-2">
                <span className="text-sm font-medium">Mission</span>
                <textarea
                  className="w-full border rounded-lg px-3 py-2 text-sm min-h-[120px]"
                  value={createOrgForm.mission}
                  onChange={(e) =>
                    setCreateOrgForm((prev) => ({
                      ...prev,
                      mission: e.target.value,
                    }))
                  }
                  placeholder="Supports arts and youth programs in Appalachia."
                />
              </label>

              <label className="block space-y-2">
                <span className="text-sm font-medium">
                  Geographies (comma-separated)
                </span>
                <input
                  className="w-full border rounded-lg px-3 py-2 text-sm"
                  value={createOrgForm.geographies}
                  onChange={(e) =>
                    setCreateOrgForm((prev) => ({
                      ...prev,
                      geographies: e.target.value,
                    }))
                  }
                  placeholder="West Virginia, Appalachia"
                />
              </label>

              <label className="block space-y-2">
                <span className="text-sm font-medium">
                  Focus Areas (comma-separated)
                </span>
                <input
                  className="w-full border rounded-lg px-3 py-2 text-sm"
                  value={createOrgForm.focus_areas}
                  onChange={(e) =>
                    setCreateOrgForm((prev) => ({
                      ...prev,
                      focus_areas: e.target.value,
                    }))
                  }
                  placeholder="arts, youth, education"
                />
              </label>

              <label className="block space-y-2">
                <span className="text-sm font-medium">Tax Status</span>
                <input
                  className="w-full border rounded-lg px-3 py-2 text-sm"
                  value={createOrgForm.tax_status}
                  onChange={(e) =>
                    setCreateOrgForm((prev) => ({
                      ...prev,
                      tax_status: e.target.value,
                    }))
                  }
                  placeholder="501(c)(3)"
                />
              </label>

              <button
                type="submit"
                disabled={loading}
                className="rounded-lg bg-black text-white px-4 py-2 text-sm disabled:opacity-50"
              >
                {loading ? "Saving..." : "Create Organization"}
              </button>
            </form>
          </div>
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
                    const stageValue = STAGE_OPTIONS.includes(
                      opp.pipeline_stage as PipelineStage
                    )
                      ? opp.pipeline_stage
                      : "";

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
                        <td className="px-4 py-3">
                          <select
                            className="border rounded-md px-2 py-1 bg-white"
                            value={stageValue}
                            onChange={(e) =>
                              handleStageChange(
                                opp.id,
                                e.target.value as PipelineStage
                              )
                            }
                            disabled={
                              !organizationProfileId ||
                              updatingStageId === opp.id
                            }
                          >
                            {stageValue === "" ? (
                              <option value="" disabled>
                                {opp.pipeline_stage}
                              </option>
                            ) : null}
                            {STAGE_OPTIONS.map((stage) => (
                              <option key={stage} value={stage}>
                                {stage}
                              </option>
                            ))}
                          </select>
                        </td>
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
