import chalk from "chalk";
import { createRequire } from "module";
import { fileURLToPath } from "url";
import path from "path";
import fs from "fs";

interface PackageJson {
  name: string;
  version: string;
}

function getLocalVersion(): string {
  // Resolve package.json relative to this file (src/config -> root)
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);
  const pkgPath = path.resolve(__dirname, "..", "..", "package.json");

  try {
    const raw = fs.readFileSync(pkgPath, "utf8");
    const pkg: PackageJson = JSON.parse(raw);
    return pkg.version;
  } catch {
    return "0.0.0";
  }
}

async function fetchLatestVersion(packageName: string): Promise<string | null> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3000);

    const res = await fetch(`https://registry.npmjs.org/${packageName}/latest`, {
      signal: controller.signal,
      headers: { Accept: "application/json" },
    });

    clearTimeout(timeout);

    if (!res.ok) return null;
    const data = (await res.json()) as { version?: string };
    return data.version ?? null;
  } catch {
    // Network error or timeout — don't block the user
    return null;
  }
}

function compareVersions(current: string, latest: string): -1 | 0 | 1 {
  const a = current.split(".").map(Number);
  const b = latest.split(".").map(Number);

  for (let i = 0; i < 3; i++) {
    if ((a[i] ?? 0) < (b[i] ?? 0)) return -1;
    if ((a[i] ?? 0) > (b[i] ?? 0)) return 1;
  }
  return 0;
}

/**
 * Check if a newer version of fastlane-init is available on npm.
 * Prints a warning if outdated; silently continues on network errors.
 * Returns `true` if the version is OK (up-to-date or check skipped).
 */
export async function checkVersion(): Promise<boolean> {
  const packageName = "fastlane-init";
  const currentVersion = getLocalVersion();
  const latestVersion = await fetchLatestVersion(packageName);

  if (!latestVersion) {
    // Could not reach npm — skip silently
    return true;
  }

  const cmp = compareVersions(currentVersion, latestVersion);

  if (cmp < 0) {
    console.log(
      chalk.yellow(
        `\n⚠️  A newer version of ${chalk.bold(packageName)} is available: ${chalk.bold(latestVersion)} (current: ${currentVersion})`
      )
    );
    console.log(
      chalk.yellow(`   Update with: ${chalk.bold(`npm i -g ${packageName}@latest`)}\n`)
    );
  }

  return true;
}
