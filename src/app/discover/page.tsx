"use client";

import { useEffect, useMemo, useState } from "react";

import { fetchOrganizations } from "@/lib/api";
import type { Opportunity } from "@/types/opportunity";
import type { Organization } from "@/types/organization";

type CreateOrganizationForm = {
  name: string;
  entityType: string;
  mission: string;
  geographies: string;
  focusAreas: string;
  taxStatus: string;
};

type MatchResult = {
  opportunity: Opportunity;
  score: number;
};

type ApiError = {
  error?: string;
};

const sampleOpportunities = [
  {
    title: "Appalachia Youth Arts Grant",
    description: "Supports arts education programs for youth across Appalachia.",
    agency: "Appalachia Arts Council",
    geographies: "Appalachia",
    focusAreas: "arts",
    amount: 25000,
    deadline: "2026-06-30T00:00:00.000Z",
  },
  {
    title: "West Virginia Community Education Fund",
    description: "Funds nonprofit education initiatives in West Virginia communities.",
    agency: "WV Education Fund",
    geographies: "West Virginia",
    focusAreas: "education",
    amount: 40000,
    deadline: "2026-08-15T00:00:00.000Z",
  },
  {
    title: "National Youth Development Opportunity",
    description: "Provides support for youth development and mentoring programs.",
    agency: "National Youth Partners",
    geographies: "United States",
    focusAreas: "youth",
    amount: 30000,
    deadline: "2026-09-01T00:00:00.000Z",
  },
] as const;

function isOrganization(
  value: Organization | ApiError
): value is Organization {
  return "id" in value;
}

function formatCurrency(amount?: number) {
  if (typeof amount !== "number") {
    return "—";
  }

  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(amount);
}

export default function DiscoverPage() {
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [organizationId, setOrganizationId] = useState("");
  const [matches, setMatches] = useState<MatchResult[]>([]);
  const [orgLoading, setOrgLoading] = useState(true);
  const [matchLoading, setMatchLoading] = useState(false);
  const [seeding, setSeeding] = useState(false);
  const [message, setMessage] = useState("");
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
    if (!organizationId) {
      setMatches([]);
      return;
    }

    async function loadMatches() {
      try {
        setMatchLoading(true);
        const res = await fetch(
          `/api/match?orgId=${encodeURIComponent(organizationId)}`
        );
        const data = (await res.json()) as MatchResult[] | ApiError;

        if (!res.ok) {
          throw new Error(
            !Array.isArray(data) && typeof data.error === "string"
              ? data.error
              : "Failed to load matches"
          );
        }

        setMatches(Array.isArray(data) ? data : []);
      } catch (err) {
        setMatches([]);
        setMessage(err instanceof Error ? err.message : "Failed to load matches");
      } finally {
        setMatchLoading(false);
      }
    }

    loadMatches();
  }, [organizationId]);

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

  async function handleSeedOpportunities() {
    try {
      setSeeding(true);
      setMessage("");

      for (const opportunity of sampleOpportunities) {
        const res = await fetch("/api/opportunities", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(opportunity),
        });

        if (!res.ok) {
          const data = (await res.json()) as ApiError;
          throw new Error(data.error || "Failed to seed opportunities");
        }
      }

      setMessage("Added 3 sample opportunities.");

      if (organizationId) {
        const res = await fetch(
          `/api/match?orgId=${encodeURIComponent(organizationId)}`
        );
        const data = (await res.json()) as MatchResult[] | ApiError;

        if (res.ok && Array.isArray(data)) {
          setMatches(data);
        }
      }
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Failed to seed data");
    } finally {
      setSeeding(false);
    }
  }

  return (
    <main className="min-h-screen bg-white p-8 text-black">
      <div className="mx-auto max-w-6xl space-y-8">
        <div className="space-y-3">
          <h1 className="text-3xl font-bold">GrantHunter Discover</h1>
          <p className="text-sm text-gray-600">
            Select an organization, seed sample opportunities, and review ranked
            grant matches.
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
                    ? selectedOrganization.focusAreas
                    : "—"}
                </div>
                <div>
                  <span className="font-medium">Geographies:</span>{" "}
                  {(selectedOrganization.geographies?.length ?? 0) > 0
                    ? selectedOrganization.geographies
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
                onClick={handleSeedOpportunities}
                disabled={seeding}
                className="rounded-lg bg-black px-4 py-2 text-sm text-white disabled:opacity-50"
              >
                {seeding ? "Seeding..." : "Seed 3 Opportunities"}
              </button>
            </div>

            {message ? (
              <div className="rounded-lg bg-gray-100 px-3 py-2 text-sm">
                {message}
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
              No opportunities available yet. Seed sample opportunities to see
              ranked results.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-left">
                  <tr>
                    <th className="px-4 py-3">Title</th>
                    <th className="px-4 py-3">Agency</th>
                    <th className="px-4 py-3">Focus</th>
                    <th className="px-4 py-3">Geography</th>
                    <th className="px-4 py-3">Amount</th>
                    <th className="px-4 py-3">Deadline</th>
                    <th className="px-4 py-3">Score</th>
                  </tr>
                </thead>
                <tbody>
                  {matches.map(({ opportunity, score }) => (
                    <tr key={opportunity.id} className="align-top border-t">
                      <td className="px-4 py-3">
                        <div className="font-medium">{opportunity.title}</div>
                        <div className="mt-1 text-xs text-gray-600">
                          {opportunity.description}
                        </div>
                      </td>
                      <td className="px-4 py-3">{opportunity.agency}</td>
                      <td className="px-4 py-3">{opportunity.focusAreas}</td>
                      <td className="px-4 py-3">{opportunity.geographies}</td>
                      <td className="px-4 py-3">
                        {formatCurrency(opportunity.amount)}
                      </td>
                      <td className="px-4 py-3">
                        {opportunity.deadline
                          ? new Date(opportunity.deadline).toLocaleDateString()
                          : "—"}
                      </td>
                      <td className="px-4 py-3 font-semibold">{score}</td>
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
