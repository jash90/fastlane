import chalk from "chalk";
import ora from "ora";
import fs from "fs";
import path from "path";
import { getAccessToken, validateServiceAccountKey } from "../api/google-auth.js";
import { createEdit, uploadBundle, assignTrack, commitEdit } from "../api/google-fetchers.js";
import { loadGoogleCredentials } from "../config/credentials-store.js";
import type { TrackName } from "../types.js";

export interface UploadCommandOptions {
  platform?: string;
  aab?: string;
  track?: string;
  jsonKey?: string;
  packageName?: string;
}

export async function runUploadCommand(options: UploadCommandOptions): Promise<void> {
  if (options.platform && options.platform !== "android") {
    console.log(chalk.yellow("Upload command currently supports Android only."));
    return;
  }

  // Resolve credentials
  let jsonKeyPath = options.jsonKey;
  let packageName = options.packageName;

  if (!jsonKeyPath) {
    const saved = loadGoogleCredentials();
    if (saved?.jsonKeyPath) {
      jsonKeyPath = saved.jsonKeyPath;
    }
  }

  if (!jsonKeyPath) {
    console.log(chalk.red("No JSON key path provided. Use --json-key <path> or configure Android first."));
    process.exit(1);
  }

  const { clientEmail } = validateServiceAccountKey(jsonKeyPath);
  console.log(chalk.gray(`Service account: ${clientEmail}`));

  // Resolve AAB path
  let aabPath = options.aab;
  if (!aabPath) {
    const defaultPath = path.join(
      process.cwd(),
      "android",
      "app",
      "build",
      "outputs",
      "bundle",
      "release",
      "app-release.aab"
    );
    if (fs.existsSync(defaultPath)) {
      aabPath = defaultPath;
      console.log(chalk.gray(`AAB auto-detected: ${aabPath}`));
    } else {
      console.log(chalk.red("No AAB file found. Use --aab <path> or build first."));
      process.exit(1);
    }
  }

  if (!fs.existsSync(aabPath)) {
    console.log(chalk.red(`AAB file not found: ${aabPath}`));
    process.exit(1);
  }

  if (!packageName) {
    const saved = loadGoogleCredentials();
    packageName = saved?.packageName;
  }

  if (!packageName) {
    console.log(chalk.red("No package name provided. Use --package-name <name>."));
    process.exit(1);
  }

  const track = (options.track ?? "internal") as TrackName;

  // Upload flow
  const authSpinner = ora("Authenticating with Google Play...").start();
  const token = await getAccessToken({ jsonKeyPath });
  authSpinner.succeed("Authenticated");

  const editSpinner = ora("Creating edit...").start();
  const edit = await createEdit(token, packageName);
  editSpinner.succeed(`Edit created: ${edit.id}`);

  const uploadSpinner = ora("Uploading AAB...").start();
  const bundle = await uploadBundle(token, packageName, edit.id, aabPath);
  uploadSpinner.succeed(`Bundle uploaded: version code ${bundle.versionCode}`);

  const trackSpinner = ora(`Assigning to ${track} track...`).start();
  await assignTrack(token, packageName, edit.id, track, bundle.versionCode);
  trackSpinner.succeed(`Assigned to ${track}`);

  const commitSpinner = ora("Committing edit...").start();
  await commitEdit(token, packageName, edit.id);
  commitSpinner.succeed("Edit committed");

  console.log(chalk.green(`\nUpload complete! Version ${bundle.versionCode} is on the ${track} track.`));
}
