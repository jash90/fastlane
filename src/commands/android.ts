import inquirer from "inquirer";
import chalk from "chalk";
import ora from "ora";
import fs from "fs";
import path from "path";
import type { AndroidConfig } from "../types.js";
import type { DetectedAndroidInfo } from "../config/detect.js";
import { generateAndroidFiles } from "../generator/android.js";
import { generateEnvFile } from "../generator/env.js";
import { validateServiceAccountKey, getAccessToken } from "../api/google-auth.js";
import { checkAppExists } from "../api/google-fetchers.js";
import { saveGoogleCredentials } from "../config/credentials-store.js";
import { runUploadCommand } from "./upload.js";

export interface AndroidFlowContext {
  projectRoot: string;
  detectedAndroidConfig: DetectedAndroidInfo;
  existingAndroidEnv: Record<string, string>;
  androidAppfile: Record<string, string>;
  autoCommitAfterBump?: boolean;
  isExpo?: boolean;
}

export async function runAndroidFlow(ctx: AndroidFlowContext): Promise<void> {
  const { projectRoot, detectedAndroidConfig, existingAndroidEnv, androidAppfile, autoCommitAfterBump, isExpo } = ctx;

  console.log(chalk.bold("\n🤖 Android Configuration (Google Play)"));
  console.log(
    chalk.gray(
      "How to create a JSON key:\n" +
        "  1. Go to Google Play Console → Setup → API access\n" +
        "  2. Create or link a Google Cloud project\n" +
        "  3. Under Service accounts, click 'Create new service account'\n" +
        "  4. In Google Cloud Console, create a key (JSON) for that account\n" +
        "  5. Back in Play Console, grant the service account access to your app\n"
    )
  );

  const { packageName, jsonKeyPath } = await inquirer.prompt([
    {
      type: "input",
      name: "packageName",
      message: "Package name:",
      default: detectedAndroidConfig.packageName ?? androidAppfile.package_name ?? undefined,
      validate: (v) => v.trim().length > 0 || "Required",
    },
    {
      type: "input",
      name: "jsonKeyPath",
      message: "Path to Google Play JSON key (leave empty to skip):",
      default: existingAndroidEnv.SUPPLY_JSON_KEY || "",
      filter: (v: string) => v.trim() ? v.replace("~", process.env.HOME ?? "") : "",
      validate: (v: string) => {
        if (!v.trim()) return true;
        const expanded = v.replace("~", process.env.HOME ?? "");
        return fs.existsSync(expanded) || "File does not exist";
      },
    },
  ]);

  if (!jsonKeyPath) {
    console.log(chalk.yellow("\n⚠️  Skipping Android — no JSON key provided. You can re-run later.\n"));
  } else {
    // Validate service account key
    try {
      const { clientEmail, projectId } = validateServiceAccountKey(jsonKeyPath);
      console.log(chalk.gray(`\n  Service account: ${clientEmail}`));
      console.log(chalk.gray(`  Project: ${projectId}`));
    } catch (err: any) {
      console.log(chalk.red(`\n  Invalid JSON key: ${err.message}`));
      return;
    }

    // Validate Google Play access
    const validateSpinner = ora("Validating Google Play access...").start();
    try {
      const token = await getAccessToken({ jsonKeyPath });
      const exists = await checkAppExists(token, packageName);
      if (exists) {
        validateSpinner.succeed("Google Play access validated — app found");
      } else {
        validateSpinner.warn("Google Play access OK, but app not found (may need to create it in Play Console first)");
      }
    } catch (err: any) {
      validateSpinner.fail(`Google Play validation failed: ${err.message}`);
      console.log(chalk.yellow("  Files will be generated, but API access needs to be fixed.\n"));
    }

    const androidSpinner = ora("Generating Android Fastlane files...").start();
    const androidConfig: AndroidConfig = { packageName, jsonKeyPath, autoCommitAfterBump, isExpo };
    await generateAndroidFiles(projectRoot, androidConfig);
    await generateEnvFile(projectRoot, undefined, androidConfig);
    androidSpinner.succeed("Android files generated!");

    // Save Google credentials
    saveGoogleCredentials({
      jsonKeyPath,
      packageName,
      savedAt: new Date().toISOString(),
    });

    // Optional: upload AAB now
    const defaultAab = path.join(
      projectRoot, "android", "app", "build", "outputs", "bundle", "release", "app-release.aab"
    );
    if (fs.existsSync(defaultAab)) {
      const { uploadNow } = await inquirer.prompt([{
        type: "confirm",
        name: "uploadNow",
        message: `AAB found at ${defaultAab}. Upload to Google Play now?`,
        default: false,
      }]);

      if (uploadNow) {
        await runUploadCommand({
          platform: "android",
          aab: defaultAab,
          jsonKey: jsonKeyPath,
          packageName,
        });
      }
    }
  }
}
