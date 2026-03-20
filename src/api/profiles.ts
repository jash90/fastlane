import fs from "fs";
import path from "path";
import os from "os";
import { ascFetch } from "./auth.js";
import type { ProfileInfo, ProfileType } from "../types.js";

export interface CreateProfileParams {
  name: string;
  profileType: ProfileType;
  bundleIdResourceId: string;
  certificateIds: string[];
  deviceIds?: string[];
}

export async function createProfile(
  token: string,
  params: CreateProfileParams
): Promise<ProfileInfo> {
  const relationships: any = {
    bundleId: {
      data: { type: "bundleIds", id: params.bundleIdResourceId },
    },
    certificates: {
      data: params.certificateIds.map((id) => ({
        type: "certificates",
        id,
      })),
    },
  };

  if (params.deviceIds && params.deviceIds.length > 0) {
    relationships.devices = {
      data: params.deviceIds.map((id) => ({ type: "devices", id })),
    };
  }

  const data = await ascFetch<any>(token, "profiles", {
    method: "POST",
    body: {
      data: {
        type: "profiles",
        attributes: {
          name: params.name,
          profileType: params.profileType,
        },
        relationships,
      },
    },
  });

  const p = data.data;
  return {
    id: p.id,
    name: p.attributes.name,
    profileType: p.attributes.profileType,
    profileState: p.attributes.profileState,
    expirationDate: p.attributes.expirationDate,
    profileContent: p.attributes.profileContent,
    uuid: p.attributes.uuid,
  };
}

export async function listProfiles(
  token: string,
  filterType?: ProfileType
): Promise<ProfileInfo[]> {
  const endpoint = filterType
    ? `profiles?filter[profileType]=${filterType}`
    : "profiles";

  const data = await ascFetch<any>(token, endpoint);

  return (data.data ?? []).map((p: any) => ({
    id: p.id,
    name: p.attributes.name,
    profileType: p.attributes.profileType,
    profileState: p.attributes.profileState,
    expirationDate: p.attributes.expirationDate,
    profileContent: p.attributes.profileContent,
    uuid: p.attributes.uuid,
  }));
}

export function downloadProfile(
  profileInfo: ProfileInfo,
  outputDir: string
): string {
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const fileName = `${profileInfo.name.replace(/\s+/g, "_")}.mobileprovision`;
  const outputPath = path.join(outputDir, fileName);
  const profileData = Buffer.from(profileInfo.profileContent, "base64");
  fs.writeFileSync(outputPath, profileData);

  return outputPath;
}

export function installProfile(mobileprovisionPath: string): string {
  const profilesDir = path.join(
    os.homedir(),
    "Library",
    "MobileDevice",
    "Provisioning Profiles"
  );

  if (!fs.existsSync(profilesDir)) {
    fs.mkdirSync(profilesDir, { recursive: true });
  }

  const content = fs.readFileSync(mobileprovisionPath);
  // Extract UUID from the mobileprovision plist
  const contentStr = content.toString("utf8");
  const uuidMatch = contentStr.match(
    /<key>UUID<\/key>\s*<string>([^<]+)<\/string>/
  );
  const uuid = uuidMatch?.[1] ?? path.basename(mobileprovisionPath, ".mobileprovision");

  const destPath = path.join(profilesDir, `${uuid}.mobileprovision`);
  fs.copyFileSync(mobileprovisionPath, destPath);

  return destPath;
}

export interface DeviceInfo {
  id: string;
  name: string;
  udid: string;
  platform: string;
  status: string;
}

export async function listDevices(token: string): Promise<DeviceInfo[]> {
  const data = await ascFetch<any>(token, "devices?limit=200");

  return (data.data ?? []).map((d: any) => ({
    id: d.id,
    name: d.attributes.name,
    udid: d.attributes.udid,
    platform: d.attributes.platform,
    status: d.attributes.status,
  }));
}
