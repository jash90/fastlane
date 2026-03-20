import chalk from "chalk";
import ora from "ora";
import { getAccessToken, validateServiceAccountKey } from "../api/google-auth.js";
import { createEdit, assignTrack, commitEdit, listTracks } from "../api/google-fetchers.js";
import { loadGoogleCredentials } from "../config/credentials-store.js";
import type { TrackName } from "../types.js";

export interface ReleaseCommandOptions {
  platform?: string;
  track?: string;
  rollout?: string;
  jsonKey?: string;
  packageName?: string;
}

export async function runReleaseCommand(options: ReleaseCommandOptions): Promise<void> {
  if (options.platform && options.platform !== "android") {
    console.log(chalk.yellow("Release command currently supports Android only."));
    return;
  }

  let jsonKeyPath = options.jsonKey;
  let packageName = options.packageName;

  if (!jsonKeyPath) {
    const saved = loadGoogleCredentials();
    if (saved?.jsonKeyPath) jsonKeyPath = saved.jsonKeyPath;
  }

  if (!jsonKeyPath) {
    console.log(chalk.red("No JSON key path provided. Use --json-key <path>."));
    process.exit(1);
  }

  const { clientEmail } = validateServiceAccountKey(jsonKeyPath);
  console.log(chalk.gray(`Service account: ${clientEmail}`));

  if (!packageName) {
    const saved = loadGoogleCredentials();
    packageName = saved?.packageName;
  }

  if (!packageName) {
    console.log(chalk.red("No package name provided. Use --package-name <name>."));
    process.exit(1);
  }

  const track = (options.track ?? "production") as TrackName;
  const userFraction = options.rollout ? parseFloat(options.rollout) : undefined;

  if (userFraction !== undefined && (userFraction <= 0 || userFraction > 1)) {
    console.log(chalk.red("Rollout must be between 0 and 1 (e.g. 0.1 for 10%)."));
    process.exit(1);
  }

  const authSpinner = ora("Authenticating with Google Play...").start();
  const token = await getAccessToken({ jsonKeyPath });
  authSpinner.succeed("Authenticated");

  // Find latest version code from existing tracks
  const editSpinner = ora("Creating edit...").start();
  const edit = await createEdit(token, packageName);
  editSpinner.succeed(`Edit created: ${edit.id}`);

  const tracksSpinner = ora("Fetching current tracks...").start();
  const tracks = await listTracks(token, packageName, edit.id);
  tracksSpinner.stop();

  // Find the latest version code across all tracks
  let latestVersionCode: number | null = null;
  for (const t of tracks) {
    for (const release of t.releases ?? []) {
      for (const vc of release.versionCodes ?? []) {
        const code = parseInt(vc, 10);
        if (!latestVersionCode || code > latestVersionCode) {
          latestVersionCode = code;
        }
      }
    }
  }

  if (!latestVersionCode) {
    console.log(chalk.red("No version codes found. Upload a bundle first with 'fastlane upload'."));
    process.exit(1);
  }

  console.log(chalk.gray(`Latest version code: ${latestVersionCode}`));

  const trackSpinner = ora(
    `Releasing to ${track}${userFraction ? ` (${(userFraction * 100).toFixed(0)}% rollout)` : ""}...`
  ).start();
  await assignTrack(token, packageName, edit.id, track, latestVersionCode, userFraction);
  trackSpinner.succeed(`Released to ${track}`);

  const commitSpinner = ora("Committing edit...").start();
  await commitEdit(token, packageName, edit.id);
  commitSpinner.succeed("Edit committed");

  console.log(
    chalk.green(
      `\nRelease complete! Version ${latestVersionCode} on ${track}` +
        (userFraction ? ` at ${(userFraction * 100).toFixed(0)}% rollout` : "") +
        "."
    )
  );
}
