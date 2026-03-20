import { ascFetch } from "./auth.js";
import { fetchBundleIds, type BundleIdInfo } from "./fetchers.js";
import type { CapabilityType } from "../types.js";

export async function findBundleIdByIdentifier(
  token: string,
  identifier: string
): Promise<BundleIdInfo | null> {
  const bundles = await fetchBundleIds(token);
  return bundles.find((b) => b.identifier === identifier) ?? null;
}

export async function registerBundleId(
  token: string,
  identifier: string,
  name: string,
  platform: "IOS" | "UNIVERSAL" = "IOS"
): Promise<BundleIdInfo> {
  const data = await ascFetch<any>(token, "bundleIds", {
    method: "POST",
    body: {
      data: {
        type: "bundleIds",
        attributes: {
          identifier,
          name,
          platform,
        },
      },
    },
  });

  const b = data.data;
  return {
    id: b.id,
    identifier: b.attributes.identifier,
    name: b.attributes.name,
    platform: b.attributes.platform,
    seedId: b.attributes.seedId,
  };
}

export interface CapabilityInfo {
  id: string;
  capabilityType: string;
}

export async function enableCapability(
  token: string,
  bundleIdResourceId: string,
  capabilityType: CapabilityType
): Promise<CapabilityInfo> {
  const data = await ascFetch<any>(token, "bundleIdCapabilities", {
    method: "POST",
    body: {
      data: {
        type: "bundleIdCapabilities",
        attributes: {
          capabilityType,
        },
        relationships: {
          bundleId: {
            data: {
              type: "bundleIds",
              id: bundleIdResourceId,
            },
          },
        },
      },
    },
  });

  return {
    id: data.data.id,
    capabilityType: data.data.attributes.capabilityType,
  };
}

export async function listCapabilities(
  token: string,
  bundleIdResourceId: string
): Promise<CapabilityInfo[]> {
  const data = await ascFetch<any>(
    token,
    `bundleIds/${bundleIdResourceId}/bundleIdCapabilities`
  );

  return (data.data ?? []).map((c: any) => ({
    id: c.id,
    capabilityType: c.attributes.capabilityType,
  }));
}
