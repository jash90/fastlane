import fs from "fs";
import path from "path";
import { execSync } from "child_process";

function readAppJson(projectRoot: string): any | null {
  try {
    const appJsonPath = path.join(projectRoot, "app.json");
    if (fs.existsSync(appJsonPath)) {
      const raw = JSON.parse(fs.readFileSync(appJsonPath, "utf8"));
      return raw.expo ?? raw;
    }
  } catch {}
  return null;
}

export interface DetectedAndroidInfo {
  packageName: string | null;
  versionCode: string | null;
  versionName: string | null;
}

export function detectAndroidConfig(projectRoot: string): DetectedAndroidInfo {
  // 1. Try app.json first (source of truth for RN/Expo)
  const appJson = readAppJson(projectRoot);
  const appJsonPackage = appJson?.android?.package ?? null;
  if (appJsonPackage) return { packageName: appJsonPackage, versionCode: null, versionName: null };

  // 2. Fallback to build.gradle
  const buildGradlePath = path.join(projectRoot, "android", "app", "build.gradle");
  if (fs.existsSync(buildGradlePath)) {
    const content = fs.readFileSync(buildGradlePath, "utf8");
    const packageName =
      content.match(/applicationId\s+["']([^"']+)["']/)?.[1] ??
      content.match(/namespace\s+["']([^"']+)["']/)?.[1] ??
      null;
    const versionCode = content.match(/versionCode\s+(\d+)/)?.[1] ?? null;
    const versionName = content.match(/versionName\s+["']([^"']+)["']/)?.[1] ?? null;
    if (packageName) return { packageName, versionCode, versionName };
  }

  return { packageName: null, versionCode: null, versionName: null };
}

export function detectIosBundleId(projectRoot: string): string | null {
  // 1. Try app.json first (source of truth for RN/Expo)
  const appJson = readAppJson(projectRoot);
  const fromAppJson = appJson?.ios?.bundleIdentifier ?? null;
  if (fromAppJson) return fromAppJson;

  // 2. Fallback to pbxproj
  try {
    const result = execSync(
      `grep -r "PRODUCT_BUNDLE_IDENTIFIER" "${projectRoot}/ios" --include="*.pbxproj" | head -1`,
      { encoding: "utf8", stdio: ["pipe", "pipe", "ignore"] }
    );
    const match = result.match(/PRODUCT_BUNDLE_IDENTIFIER\s*=\s*([^;]+)/)?.[1]?.trim();
    if (match) return match;
  } catch {}

  return null;
}

export function detectXcodeProject(projectRoot: string): string | null {
  const iosDir = path.join(projectRoot, "ios");
  if (!fs.existsSync(iosDir)) return null;
  try {
    const entries = fs.readdirSync(iosDir).filter((f) => f.endsWith(".xcodeproj"));
    return entries.length === 1 ? entries[0] : null;
  } catch {
    return null;
  }
}

export function detectCapabilities(projectRoot: string): import("../types.js").CapabilityType[] {
  const caps = new Set<import("../types.js").CapabilityType>();

  // 1. Read iOS entitlements files and Info.plist
  const iosContent = readIosProjectFiles(projectRoot);

  const entitlementKeyToCapability: Record<string, import("../types.js").CapabilityType> = {
    "aps-environment": "PUSH_NOTIFICATIONS",
    "com.apple.developer.associated-domains": "ASSOCIATED_DOMAINS",
    "com.apple.developer.applesignin": "APPLE_ID_AUTH",
    "com.apple.developer.in-app-payments": "IN_APP_PURCHASE",
    "com.apple.developer.game-center": "GAME_CENTER",
    "com.apple.developer.icloud-container-identifiers": "ICLOUD",
    "com.apple.developer.ubiquity-container-identifiers": "ICLOUD",
    "com.apple.security.application-groups": "APP_GROUPS",
    "com.apple.developer.maps": "MAPS",
    "com.apple.developer.siri": "SIRIKIT",
    "com.apple.developer.pass-type-identifiers": "WALLET",
    "com.apple.developer.healthkit": "HEALTHKIT",
    "com.apple.developer.homekit": "HOMEKIT",
    "com.apple.developer.nfc.readersession.formats": "NFC_TAG_READING",
    "com.apple.developer.networking.vpn.api": "PERSONAL_VPN",
    "com.apple.developer.networking.networkextension": "NETWORK_EXTENSIONS",
    "com.apple.developer.networking.wifi-info": "ACCESS_WIFI_INFORMATION",
    "com.apple.developer.ClassKit-environment": "CLASSKIT",
    "com.apple.developer.authentication-services.autofill-credential-provider": "AUTOFILL_CREDENTIAL_PROVIDER",
    "com.apple.developer.networking.multipath": "MULTIPATH",
    "com.apple.developer.networking.HotspotConfiguration": "HOT_SPOT",
    "com.apple.developer.default-data-protection": "DATA_PROTECTION",
    "inter-app-audio": "INTER_APP_AUDIO",
    "com.apple.developer.font-installation": "FONT_INSTALLATION",
    "com.apple.external-accessory.wireless-configuration": "WIRELESS_ACCESSORY_CONFIGURATION",
  };

  for (const [key, cap] of Object.entries(entitlementKeyToCapability)) {
    if (iosContent.entitlements.includes(key)) {
      caps.add(cap);
    }
  }

  if (iosContent.infoPlist.includes("remote-notification")) {
    caps.add("PUSH_NOTIFICATIONS");
  }

  // 2. Fallback: check app.json (Expo plugins & entitlements)
  const appJson = readAppJson(projectRoot);
  if (appJson) {
    const plugins: string[] = (appJson.plugins ?? []).map((p: any) =>
      typeof p === "string" ? p : Array.isArray(p) ? p[0] : ""
    );
    const entitlements = appJson.ios?.entitlements ?? {};

    if (
      plugins.includes("expo-notifications") ||
      plugins.includes("@react-native-firebase/messaging")
    ) {
      caps.add("PUSH_NOTIFICATIONS");
    }
    if (plugins.includes("expo-apple-authentication")) {
      caps.add("APPLE_ID_AUTH");
    }
    if (
      plugins.includes("expo-linking") ||
      plugins.includes("react-native-branch") ||
      entitlements["com.apple.developer.associated-domains"]
    ) {
      caps.add("ASSOCIATED_DOMAINS");
    }
    if (entitlements["com.apple.developer.in-app-payments"]) {
      caps.add("IN_APP_PURCHASE");
    }
  }

  return [...caps];
}

function readIosProjectFiles(projectRoot: string): { entitlements: string; infoPlist: string } {
  const iosDir = path.join(projectRoot, "ios");
  let entitlements = "";
  let infoPlist = "";

  if (!fs.existsSync(iosDir)) return { entitlements, infoPlist };

  try {
    const allFiles = readdirRecursive(iosDir);

    for (const file of allFiles) {
      if (file.endsWith(".entitlements")) {
        entitlements += fs.readFileSync(file, "utf8") + "\n";
      }
      if (file.endsWith("Info.plist")) {
        infoPlist += fs.readFileSync(file, "utf8") + "\n";
      }
    }
  } catch {}

  return { entitlements, infoPlist };
}

function readdirRecursive(dir: string): string[] {
  const results: string[] = [];
  try {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory() && entry.name !== "Pods" && entry.name !== "build") {
        results.push(...readdirRecursive(full));
      } else if (entry.isFile()) {
        results.push(full);
      }
    }
  } catch {}
  return results;
}

export function detectAppName(projectRoot: string): string | null {
  try {
    const pkgPath = path.join(projectRoot, "package.json");
    if (fs.existsSync(pkgPath)) {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
      return pkg.name ?? null;
    }
  } catch {}
  return null;
}
