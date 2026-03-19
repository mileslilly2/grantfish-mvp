import type { Organization } from "@/types/organization";

export async function fetchOrganizations(): Promise<Organization[]> {
  const res = await fetch("/api/organizations");

  if (!res.ok) {
    throw new Error("Failed to fetch organizations");
  }

  const data: Organization[] = await res.json();
  return data;
}
