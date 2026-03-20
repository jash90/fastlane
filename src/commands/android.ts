import inquirer from "inquirer";
import chalk from "chalk";
import ora from "ora";
import fs from "fs";
import type { AndroidConfig } from "../types.js";
import type { DetectedAndroidInfo } from "../config/detect.js";
import { generateAndroidFiles } from "../generator/android.js";
import { generateEnvFile } from "../generator/env.js";

export interface AndroidFlowContext {
  projectRoot: string;
  detectedAndroidConfig: DetectedAndroidInfo;
  existingAndroidEnv: Record<string, string>;
  androidAppfile: Record<string, string>;
}

export async function runAndroidFlow(ctx: AndroidFlowContext): Promise<void> {
  const { projectRoot, detectedAndroidConfig, existingAndroidEnv, androidAppfile } = ctx;

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
    const androidSpinner = ora("Generating Android Fastlane files...").start();
    const androidConfig: AndroidConfig = { packageName, jsonKeyPath };
    await generateAndroidFiles(projectRoot, androidConfig);
    await generateEnvFile(projectRoot, undefined, androidConfig);
    androidSpinner.succeed("Android files generated!");
  }
}
