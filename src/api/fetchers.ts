import { ascFetch } from "./auth.js";

export interface BundleIdInfo {
  id: string;
  identifier: string;
  name: string;
  platform: string;
  seedId: string;
}

export interface AppInfo {
  name: string;
  bundleId: string;
  sku: string;
  primaryLocale: string;
}

export async function fetchBundleIds(token: string): Promise<BundleIdInfo[]> {
  const data = await ascFetch<any>(
    token,
    "bundleIds?limit=200&fields[bundleIds]=identifier,name,platform,seedId"
  );

  return (data.data ?? []).map((b: any) => ({
    id: b.id,
    identifier: b.attributes.identifier,
    name: b.attributes.name,
    platform: b.attributes.platform,
    seedId: b.attributes.seedId,
  }));
}

export async function fetchApps(token: string): Promise<AppInfo[]> {
  const data = await ascFetch<any>(
    token,
    "apps?limit=200&fields[apps]=name,bundleId,sku,primaryLocale"
  );

  return (data.data ?? []).map((a: any) => ({
    name: a.attributes.name,
    bundleId: a.attributes.bundleId,
    sku: a.attributes.sku,
    primaryLocale: a.attributes.primaryLocale,
  }));
}

// Team ID (seedId) is fetched from the first bundleId
export async function fetchTeamId(token: string): Promise<string | null> {
  const bundles = await fetchBundleIds(token);
  return bundles[0]?.seedId ?? null;
}

// ITC Team ID is fetched from the first app (only if you have an app in ASC)
export async function fetchItcTeamId(token: string): Promise<string | null> {
  const data = await ascFetch<any>(
    token,
    "users/me?include=visibleApps&fields[users]=username"
  ).catch(() => null);

  // Fallback: fetched from the first app's header
  const apps = await fetchApps(token);
  if (apps.length === 0) return null;

  // ITC Team ID is usually the same as Team ID (seedId)
  const bundles = await fetchBundleIds(token);
  return bundles[0]?.seedId ?? null;
}
