"use client";

import { useEffect, useMemo, useState } from "react";

import {
  fetchDiscoveryLogs,
  fetchMatches,
  fetchOrganizations,
  runDiscovery,
} from "@/lib/api";
import type { DiscoveryLogEntry } from "@/lib/api";
import type { Match } from "@/lib/api";
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

function isOrganization(
  value: Organization | ApiError
): value is Organization {
  return "id" in value;
}

export default function DiscoverPage() {
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [organizationId, setOrganizationId] = useState("");
  const [matches, setMatches] = useState<Match[]>([]);
  const [orgLoading, setOrgLoading] = useState(true);
  const [matchLoading, setMatchLoading] = useState(false);
  const [discoveryLoading, setDiscoveryLoading] = useState(false);
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

  useEffect(() => {
    if (!organizationId) {
      setMatches([]);
      return;
    }

    loadMatchesForOrganization(organizationId);
  }, [organizationId]);

  async function loadMatchesForOrganization(orgId: string) {
    try {
      setMatchLoading(true);
      const data = await fetchMatches(orgId);
      setMatches(Array.isArray(data) ? data : []);
    } catch (err) {
      setMatches([]);
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
            </div>

            <div className="min-h-[88px] overflow-y-auto rounded-lg bg-black p-3 font-mono text-xs text-green-400">
              {logs.length > 0 ? (
                logs.map((log, index) => (
                  <div key={`${log.step}-${index}`}>
                    {">"} {log.step}
                    {typeof log.duration === "number"
                      ? ` (${Math.round(log.duration)}ms)`
                      : ""}
                  </div>
                ))
              ) : (
                <div>{">"} Discovery activity will appear here.</div>
              )}
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
              Select an organization to view matches.
            </div>
          ) : matchLoading ? (
            <div className="p-4 text-sm text-gray-600">Loading matches...</div>
          ) : matches.length === 0 ? (
            <div className="p-4 text-sm text-gray-600">
              No opportunities available yet. Run discovery to save
              opportunities and see ranked results.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-left">
                  <tr>
                    <th className="px-4 py-3">Title</th>
                    <th className="px-4 py-3">Score</th>
                    <th className="px-4 py-3">Reasons</th>
                  </tr>
                </thead>
                <tbody>
                  {matches.map((match) => (
                    <tr key={match.opportunityId} className="align-top border-t">
                      <td className="px-4 py-3">
                        <div className="font-medium">{match.title}</div>
                      </td>
                      <td className="px-4 py-3 font-semibold">{match.score}</td>
                      <td className="px-4 py-3">
                        {match.reasons?.join(", ") || "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
