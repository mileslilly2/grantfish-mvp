"use client";

import { useEffect, useMemo, useState } from "react";

import {
  MATCH_STAGE_OPTIONS,
  fetchDiscoveryLogs,
  fetchMatches,
  fetchOrganizations,
  runDiscovery,
  updateMatchStage,
} from "@/lib/api";
import type { DiscoveryLogEntry } from "@/lib/api";
import type { Match } from "@/lib/api";
import type { MatchStage } from "@/lib/api";
import type { Organization } from "@/types/organization";

type CreateOrganizationForm = {
  name: string;
  entityType: string;
  mission: string;
  geographies: string;
  focusAreas: string;
  taxStatus: string;
};

type ApiError = {
  error?: string;
};

const CSV_COLUMNS = [
  "organization_name",
  "title",
  "funder_name",
  "deadline_at",
  "amount_min",
  "amount_max",
  "currency",
  "source_name",
  "application_url",
  "fit_score",
  "fit_reasons",
  "pipeline_stage",
  "notes",
] as const;

function formatCsvValue(value: string | number | null | undefined) {
  const normalized = value == null ? "" : String(value);
  return `"${normalized.replace(/"/g, '""')}"`;
}

function formatCurrencyRange(match: Match) {
  if (typeof match.amountMin === "number" && typeof match.amountMax === "number") {
    return `${match.currency || "USD"} ${match.amountMin}\u2013${match.amountMax}`;
  }

  if (typeof match.amountMax === "number") {
    return `${match.currency || "USD"} ${match.amountMax}`;
  }

  if (typeof match.amountMin === "number") {
    return `${match.currency || "USD"} ${match.amountMin}+`;
  }

  return "\u2014";
}

function formatStageValue(value: string | null | undefined): MatchStage | "" {
  return MATCH_STAGE_OPTIONS.includes(value as MatchStage)
    ? (value as MatchStage)
    : "";
}

function isOrganization(
  value: Organization | ApiError
): value is Organization {
  return "id" in value;
}

export default function DiscoverPage() {
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [organizationId, setOrganizationId] = useState("");
  const [matches, setMatches] = useState<Match[]>([]);
  const [hasLoadedMatches, setHasLoadedMatches] = useState(false);
  const [orgLoading, setOrgLoading] = useState(true);
  const [matchLoading, setMatchLoading] = useState(false);
  const [discoveryLoading, setDiscoveryLoading] = useState(false);
  const [updatingStageId, setUpdatingStageId] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [logs, setLogs] = useState<DiscoveryLogEntry[]>([]);
  const [lastDiscoveryCompletedAt, setLastDiscoveryCompletedAt] = useState<string | null>(
    null
  );
  const [createOrgForm, setCreateOrgForm] = useState<CreateOrganizationForm>({
    name: "",
    entityType: "nonprofit",
    mission: "",
    geographies: "",
    focusAreas: "",
    taxStatus: "",
  });

  const selectedOrganization = useMemo(() => {
    return organizations.find((org) => org.id === organizationId) ?? null;
  }, [organizationId, organizations]);

  useEffect(() => {
    async function loadOrganizations() {
      try {
        setOrgLoading(true);
        const data = await fetchOrganizations();
        setOrganizations(data);

        if (data.length > 0) {
          setOrganizationId((current) => current || data[0].id);
        }
      } catch (err) {
        setMessage(
          err instanceof Error ? err.message : "Failed to load organizations"
        );
      } finally {
        setOrgLoading(false);
      }
    }

    loadOrganizations();
  }, []);

  useEffect(() => {
    if (!discoveryLoading) {
      return;
    }

    let cancelled = false;

    async function loadLogs() {
      try {
        const data = await fetchDiscoveryLogs();
        if (!cancelled) {
          setLogs(Array.isArray(data) ? data : []);
        }
      } catch {
        // Ignore polling failures while discovery is running.
      }
    }

    loadLogs();
    const interval = window.setInterval(loadLogs, 800);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [discoveryLoading]);

  async function loadMatchesForOrganization(orgId: string) {
    try {
      setMatchLoading(true);
      const data = await fetchMatches(orgId);
      setMatches(Array.isArray(data) ? data : []);
      setHasLoadedMatches(true);
    } catch (err) {
      setMatches([]);
      setHasLoadedMatches(false);
      setMessage(err instanceof Error ? err.message : "Failed to load matches");
    } finally {
      setMatchLoading(false);
    }
  }

  async function reloadOrganizations(newOrgId?: string) {
    const data = await fetchOrganizations();
    setOrganizations(data);

    if (newOrgId) {
      setOrganizationId(newOrgId);
      return;
    }

    if (!organizationId && data.length > 0) {
      setOrganizationId(data[0].id);
    }
  }

  async function handleCreateOrganization(e: React.FormEvent) {
    e.preventDefault();

    try {
      setMessage("");

      const res = await fetch("/api/organizations", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: createOrgForm.name.trim(),
          entityType: createOrgForm.entityType.trim() || "nonprofit",
          mission: createOrgForm.mission.trim(),
          geographies: createOrgForm.geographies.trim(),
          focusAreas: createOrgForm.focusAreas.trim(),
          taxStatus: createOrgForm.taxStatus.trim(),
        }),
      });

      const data = (await res.json()) as Organization | ApiError;

      if (!res.ok) {
        throw new Error(
          !isOrganization(data) && typeof data.error === "string"
            ? data.error
            : "Failed to create organization"
        );
      }

      if (!isOrganization(data)) {
        throw new Error("Failed to create organization");
      }

      await reloadOrganizations(data.id);
      setCreateOrgForm({
        name: "",
        entityType: "nonprofit",
        mission: "",
        geographies: "",
        focusAreas: "",
        taxStatus: "",
      });
      setMessage(`Created organization: ${data.name}`);
    } catch (err) {
      setMessage(
        err instanceof Error ? err.message : "Failed to create organization"
      );
    }
  }

  async function handleRunDiscovery() {
    if (!organizationId) {
      setMessage("Select an organization before running discovery.");
      return;
    }

    try {
      setDiscoveryLoading(true);
      setMessage("");
      setLogs([]);

      const result = await runDiscovery(organizationId);
      await loadMatchesForOrganization(organizationId);
      const latestLogs = await fetchDiscoveryLogs().catch(() => []);
      setLogs(Array.isArray(latestLogs) ? latestLogs : []);
      setLastDiscoveryCompletedAt(new Date().toISOString());

      const modeLabel =
        result.mode === "live"
          ? "live TinyFish discovery"
          : "mock fallback discovery";

      setMessage(
        `Completed ${modeLabel}. Discovered ${result.discoveredCount} opportunities and saved ${result.savedCount}.`
      );
    } catch (err) {
      setMessage(
        err instanceof Error ? err.message : "Failed to run discovery"
      );
    } finally {
      setDiscoveryLoading(false);
    }
  }

  async function handleLoadSavedOpportunities() {
    if (!organizationId) {
      setMessage("Select an organization before loading saved opportunities.");
      return;
    }

    try {
      setMessage("");
      await loadMatchesForOrganization(organizationId);
      setMessage("Loaded saved opportunities for the selected organization.");
    } catch {
      // `loadMatchesForOrganization` already sets the error state.
    }
  }

  async function handleStageChange(
    opportunityId: string,
    pipelineStage: MatchStage
  ) {
    if (!organizationId) {
      setMessage("Select an organization before updating opportunity stage.");
      return;
    }

    const previousMatches = matches;

    try {
      setUpdatingStageId(opportunityId);
      setMessage("");
      setMatches((current) =>
        current.map((match) =>
          match.opportunityId === opportunityId
            ? { ...match, pipelineStage }
            : match
        )
      );

      const updated = await updateMatchStage({
        orgId: organizationId,
        opportunityId,
        pipelineStage,
      });

      setMatches((current) =>
        current.map((match) =>
          match.opportunityId === updated.opportunityId
            ? { ...match, pipelineStage: updated.pipelineStage }
            : match
        )
      );
      setMessage(`Updated opportunity stage to ${updated.pipelineStage}.`);
    } catch (err) {
      setMatches(previousMatches);
      setMessage(err instanceof Error ? err.message : "Failed to update stage");
    } finally {
      setUpdatingStageId(null);
    }
  }

  function handleExportCsv() {
    if (matches.length === 0) {
      return;
    }

    const rows = matches.map((match) => ({
      organization_name: selectedOrganization?.name ?? "",
      title: match.title ?? "",
      funder_name: match.funderName ?? "",
      deadline_at: match.deadlineAt ?? "",
      amount_min: match.amountMin ?? "",
      amount_max: match.amountMax ?? "",
      currency: match.currency ?? "",
      source_name: match.sourceName ?? "",
      application_url: match.applicationUrl ?? "",
      fit_score: match.score ?? "",
      fit_reasons: Array.isArray(match.reasons) ? match.reasons.join("; ") : "",
      pipeline_stage: match.pipelineStage ?? "",
      notes: match.notes ?? "",
    }));

    const csvContent = [
      CSV_COLUMNS.join(","),
      ...rows.map((row) =>
        CSV_COLUMNS.map((column) => formatCsvValue(row[column])).join(",")
      ),
    ].join("\n");

    const blob = new Blob([csvContent], {
      type: "text/csv;charset=utf-8;",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    const date = new Date().toISOString().slice(0, 10);

    link.href = url;
    link.download = `granthunter-matches-${date}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  return (
    <main className="min-h-screen bg-white p-8 text-black">
      <div className="mx-auto max-w-6xl space-y-8">
        <div className="space-y-3">
          <h1 className="text-3xl font-bold">GrantHunter Discover</h1>
          <p className="text-sm text-gray-600">
            Select an organization, run discovery, and review ranked grant
            matches.
          </p>
          <p className="text-sm text-gray-500">
            Discovery uses live TinyFish when configured. Otherwise the backend
            falls back to clearly labeled mock discovery results.
          </p>
        </div>

        <div className="grid gap-6 lg:grid-cols-[1.2fr_1fr]">
          <section className="space-y-4 rounded-xl border p-4">
            <label className="block space-y-2">
              <span className="text-sm font-medium">Select Organization</span>
              <select
                className="w-full rounded-lg border bg-white px-3 py-2 text-sm"
                value={organizationId}
                onChange={(e) => {
                  setOrganizationId(e.target.value);
                  setMatches([]);
                  setHasLoadedMatches(false);
                  setMessage("");
                }}
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
              <div className="space-y-3 rounded-xl border p-4">
                <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                  Organization Summary
                </div>
                <div className="text-2xl font-bold">{selectedOrganization.name}</div>
                <div>
                  <span className="font-medium">Entity Type:</span>{" "}
                  {selectedOrganization.entityType || "—"}
                </div>
                <div>
                  <span className="font-medium">Mission:</span>{" "}
                  {selectedOrganization.mission || "—"}
                </div>
                <div>
                  <span className="font-medium">Focus Areas:</span>{" "}
                  {(selectedOrganization.focusAreas?.length ?? 0) > 0
                    ? selectedOrganization.focusAreas.join(", ")
                    : "—"}
                </div>
                <div>
                  <span className="font-medium">Geographies:</span>{" "}
                  {(selectedOrganization.geographies?.length ?? 0) > 0
                    ? selectedOrganization.geographies.join(", ")
                    : "—"}
                </div>
                <div>
                  <span className="font-medium">Tax Status:</span>{" "}
                  {selectedOrganization.taxStatus || "—"}
                </div>
              </div>
            ) : null}

            <div className="flex gap-3">
              <button
                type="button"
                onClick={handleRunDiscovery}
                disabled={discoveryLoading || !organizationId}
                className="rounded-lg bg-black px-4 py-2 text-sm text-white disabled:opacity-50"
              >
                {discoveryLoading ? "Running Discovery..." : "Run Discovery"}
              </button>
              <button
                type="button"
                onClick={handleLoadSavedOpportunities}
                disabled={matchLoading || discoveryLoading || !organizationId}
                className="rounded-lg border px-4 py-2 text-sm disabled:opacity-50"
              >
                {matchLoading ? "Loading Saved..." : "Load Saved Opportunities"}
              </button>
              <button
                type="button"
                onClick={handleExportCsv}
                disabled={!hasLoadedMatches || matches.length === 0}
                className="rounded-lg border px-4 py-2 text-sm disabled:opacity-50"
              >
                Export CSV
              </button>
            </div>

            <div className="space-y-2 rounded-xl border border-black bg-black p-3 text-xs text-green-400">
              <div className="flex items-center justify-between font-mono uppercase tracking-wide text-green-300">
                <span>Discovery Trace</span>
                <span>{logs.length} step{logs.length === 1 ? "" : "s"}</span>
              </div>
              <div className="min-h-[88px] max-h-56 overflow-y-auto font-mono">
                {logs.length > 0 ? (
                  logs.map((log, index) => (
                    <div
                      key={`${log.step}-${index}`}
                      className="flex items-start justify-between gap-3 border-b border-white/10 py-1 last:border-b-0"
                    >
                      <div className="min-w-0">
                        <div>{">"} {log.step}</div>
                      </div>
                      <div className="shrink-0 text-[11px] text-green-200">
                        {log.status}
                        {typeof log.duration === "number"
                          ? ` | ${Math.round(log.duration)}ms`
                          : ""}
                      </div>
                    </div>
                  ))
                ) : (
                  <div>{">"} Discovery activity will appear here.</div>
                )}
              </div>
            </div>

            {message ? (
              <div className="rounded-lg bg-gray-100 px-3 py-2 text-sm">
                {message}
              </div>
            ) : null}

            {lastDiscoveryCompletedAt ? (
              <div className="text-sm text-gray-600">
                Last discovery completed at{" "}
                {new Date(lastDiscoveryCompletedAt).toLocaleString()}.
              </div>
            ) : null}
          </section>

          <section className="rounded-xl border p-4">
            <div className="mb-4 text-xl font-semibold">Create Organization</div>
            <form onSubmit={handleCreateOrganization} className="space-y-4">
              <label className="block space-y-2">
                <span className="text-sm font-medium">Name</span>
                <input
                  className="w-full rounded-lg border px-3 py-2 text-sm"
                  value={createOrgForm.name}
                  onChange={(e) =>
                    setCreateOrgForm((prev) => ({
                      ...prev,
                      name: e.target.value,
                    }))
                  }
                  required
                />
              </label>

              <label className="block space-y-2">
                <span className="text-sm font-medium">Entity Type</span>
                <input
                  className="w-full rounded-lg border px-3 py-2 text-sm"
                  value={createOrgForm.entityType}
                  onChange={(e) =>
                    setCreateOrgForm((prev) => ({
                      ...prev,
                      entityType: e.target.value,
                    }))
                  }
                />
              </label>

              <label className="block space-y-2">
                <span className="text-sm font-medium">Mission</span>
                <textarea
                  className="min-h-[120px] w-full rounded-lg border px-3 py-2 text-sm"
                  value={createOrgForm.mission}
                  onChange={(e) =>
                    setCreateOrgForm((prev) => ({
                      ...prev,
                      mission: e.target.value,
                    }))
                  }
                />
              </label>

              <label className="block space-y-2">
                <span className="text-sm font-medium">Geographies</span>
                <input
                  className="w-full rounded-lg border px-3 py-2 text-sm"
                  value={createOrgForm.geographies}
                  onChange={(e) =>
                    setCreateOrgForm((prev) => ({
                      ...prev,
                      geographies: e.target.value,
                    }))
                  }
                />
              </label>

              <label className="block space-y-2">
                <span className="text-sm font-medium">Focus Areas</span>
                <input
                  className="w-full rounded-lg border px-3 py-2 text-sm"
                  value={createOrgForm.focusAreas}
                  onChange={(e) =>
                    setCreateOrgForm((prev) => ({
                      ...prev,
                      focusAreas: e.target.value,
                    }))
                  }
                />
              </label>

              <label className="block space-y-2">
                <span className="text-sm font-medium">Tax Status</span>
                <input
                  className="w-full rounded-lg border px-3 py-2 text-sm"
                  value={createOrgForm.taxStatus}
                  onChange={(e) =>
                    setCreateOrgForm((prev) => ({
                      ...prev,
                      taxStatus: e.target.value,
                    }))
                  }
                />
              </label>

              <button
                type="submit"
                className="rounded-lg border px-4 py-2 text-sm"
              >
                Create Organization
              </button>
            </form>
          </section>
        </div>

        <section className="overflow-hidden rounded-xl border">
          <div className="border-b px-4 py-3 font-semibold">
            Ranked Opportunities
          </div>

          {!organizationId ? (
            <div className="p-4 text-sm text-gray-600">
              Select an organization to review its summary, then run discovery
              or load saved opportunities.
            </div>
          ) : matchLoading ? (
            <div className="p-4 text-sm text-gray-600">Loading matches...</div>
          ) : !hasLoadedMatches ? (
            <div className="p-4 text-sm text-gray-600">
              No discovery results loaded yet. Run discovery or load saved
              opportunities to see ranked results.
            </div>
          ) : matches.length === 0 ? (
            <div className="p-4 text-sm text-gray-600">
              No saved opportunities are available for this organization yet.
              Run discovery to see ranked opportunities.
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
                    <th className="px-4 py-3">Score</th>
                    <th className="px-4 py-3">Stage</th>
                    <th className="px-4 py-3">Reasons</th>
                    <th className="px-4 py-3">Source</th>
                  </tr>
                </thead>
                <tbody>
                  {matches.map((match) => {
                    const stageValue = formatStageValue(match.pipelineStage);
                    const deadline = match.deadlineAt
                      ? new Date(match.deadlineAt).toLocaleDateString()
                      : "—";

                    return (
                      <tr key={match.opportunityId} className="align-top border-t">
                        <td className="px-4 py-3">
                          <div className="font-medium">{match.title}</div>
                          {match.applicationUrl ? (
                            <a
                              href={match.applicationUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="mt-1 inline-block text-xs text-blue-600 underline"
                            >
                              Apply link
                            </a>
                          ) : null}
                        </td>
                        <td className="px-4 py-3">{match.funderName || "—"}</td>
                        <td className="px-4 py-3">{deadline}</td>
                        <td className="px-4 py-3">{formatCurrencyRange(match)}</td>
                        <td className="px-4 py-3 font-semibold">{match.score}</td>
                        <td className="px-4 py-3">
                          <select
                            className="rounded-md border bg-white px-2 py-1"
                            value={stageValue}
                            onChange={(e) =>
                              handleStageChange(
                                match.opportunityId,
                                e.target.value as MatchStage
                              )
                            }
                            disabled={!organizationId || updatingStageId === match.opportunityId}
                          >
                            {stageValue === "" ? (
                              <option value="" disabled>
                                {match.pipelineStage || "unknown"}
                              </option>
                            ) : null}
                            {MATCH_STAGE_OPTIONS.map((stage) => (
                              <option key={stage} value={stage}>
                                {stage}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td className="px-4 py-3">
                          {match.reasons?.join(", ") || "—"}
                        </td>
                        <td className="px-4 py-3">{match.sourceName || "—"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
