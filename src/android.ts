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

export interface AndroidConfig {
  packageName: string | null;
  versionCode: string | null;
  versionName: string | null;
}

export function detectAndroidConfig(projectRoot: string): AndroidConfig {
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
