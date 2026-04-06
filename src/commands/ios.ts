import inquirer from "inquirer";
import chalk from "chalk";
import ora from "ora";
import { execFileSync } from "child_process";
import fs from "fs";
import path from "path";
import type { IosConfig } from "../types.js";
import type { AppleCredentials } from "../api/auth.js";
import { generateJWT } from "../api/auth.js";
import { fetchBundleIds, fetchApps, fetchTeamId } from "../api/fetchers.js";
import { registerBundleId } from "../api/bundle-ids.js";
import { generateIosFiles } from "../generator/ios.js";
import { generateEnvFile } from "../generator/env.js";
import { findP8Files } from "../config/p8.js";
import { detectAppName, setXcodeTeam, setAppJsonTeam } from "../config/detect.js";
import { loadCredentials, saveCredentials } from "../config/credentials-store.js";
import { runBundleIdCommand } from "./bundle-id.js";
import { runCertsCommand } from "./certs.js";
import { runProvisionCommand } from "./provision.js";

async function ensureAppRecord(
  bundleId: string,
  apps: { bundleId: string }[],
  projectRoot: string,
  appleId: string,
): Promise<void> {
  const existingApp = apps.find((a) => a.bundleId === bundleId);
  if (existingApp) return;

  console.log(chalk.yellow(`\n⚠️  No app record found for ${bundleId} on App Store Connect.`));
  console.log(chalk.gray("  An app record is required for TestFlight and App Store uploads.\n"));

  const { shouldCreate } = await inquirer.prompt([
    {
      type: "confirm",
      name: "shouldCreate",
      message: "Create app record now via fastlane produce?",
      default: true,
    },
  ]);

  if (!shouldCreate) {
    console.log(chalk.gray("  You can create it later at https://appstoreconnect.apple.com → My Apps → \"+\"\n"));
    return;
  }

  const defaultName = detectAppName(projectRoot) ?? bundleId.split(".").pop() ?? "App";

  const { appName } = await inquirer.prompt([
    {
      type: "input",
      name: "appName",
      message: "App name:",
      default: defaultName,
      validate: (v: string) => v.trim().length > 0 || "Required",
    },
  ]);

  console.log(chalk.gray("\n  fastlane produce requires Apple ID login (password prompt may appear):\n"));

  try {
    execFileSync(
      "fastlane",
      ["produce", "create", "-a", bundleId, "--app_name", appName, "-u", appleId],
      { stdio: "inherit", cwd: projectRoot }
    );
    console.log(chalk.green(`\n✅ App record created: ${appName} (${bundleId})`));
  } catch {
    console.log(chalk.red(`\n✖ Failed to create app record via fastlane produce.`));
    console.log(chalk.bold("\n  To create it manually:"));
    console.log(chalk.gray("  1. Go to https://appstoreconnect.apple.com → My Apps → \"+\""));
    console.log(chalk.gray("  2. Platform: iOS"));
    console.log(chalk.gray(`  3. Bundle ID: select ${bundleId}`));
    console.log(chalk.gray("  4. Fill in app name, primary language, and SKU"));
    console.log(chalk.gray("  5. Click Create\n"));
  }
}

export interface IosFlowContext {
  projectRoot: string;
  home: string;
  detectedBundleId: string | null;
  xcodeproj: string | null;
  existingIosEnv: Record<string, string>;
  iosAppfile: Record<string, string>;
}

export async function runIosFlow(ctx: IosFlowContext): Promise<void> {
  const { projectRoot, home, detectedBundleId, xcodeproj, existingIosEnv, iosAppfile } = ctx;

  const iosConfigured = !!(existingIosEnv.ASC_KEY_ID && existingIosEnv.ASC_KEY_CONTENT_BASE64);
  let reuseIos = false;
  if (iosConfigured && existingIosEnv.ASC_ISSUER_ID && existingIosEnv.MATCH_GIT_URL && existingIosEnv.MATCH_PASSWORD) {
    const { reuse } = await inquirer.prompt([
      {
        type: "confirm",
        name: "reuse",
        message: "Existing iOS credentials found. Reuse them?",
        default: true,
      },
    ]);
    reuseIos = reuse;
  }

  if (reuseIos) {
    // ── Reuse existing config ─────────────────────────────────────────────
    const spinner = ora("Connecting to App Store Connect with existing credentials...").start();

    try {
      const token = generateJWT({
        keyId: existingIosEnv.ASC_KEY_ID,
        issuerId: existingIosEnv.ASC_ISSUER_ID,
        p8Base64: existingIosEnv.ASC_KEY_CONTENT_BASE64,
      });

      const teamId = await fetchTeamId(token);
      const bundleIds = await fetchBundleIds(token);
      const apps = await fetchApps(token);

      spinner.succeed(chalk.green(`Connected! Team ID: ${teamId}`));

      if (apps.length > 0) {
        console.log(chalk.gray(`\nApps in App Store Connect (${apps.length}):`));
        apps.forEach((a) => console.log(chalk.gray(`  • ${a.name} (${a.bundleId})`)));
      }

      // Bundle ID selection
      const bundleChoices = bundleIds.map((b) => ({
        name: `${b.identifier}  ${chalk.gray(`[${b.platform}]`)}`,
        value: b.identifier,
      }));

      const existingBundleId = iosAppfile.app_identifier ?? detectedBundleId;
      let bundleIdFromApple: string;

      if (existingBundleId) {
        if (bundleChoices.find((c) => c.value === existingBundleId)) {
          bundleIdFromApple = existingBundleId;
          console.log(chalk.green(`\n✅ Bundle ID auto-selected: ${bundleIdFromApple}`));
        } else {
          const regSpinner = ora(`Registering ${existingBundleId} in Apple Developer...`).start();
          const appName = detectAppName(projectRoot) ?? existingBundleId.split(".").pop() ?? "App";
          await registerBundleId(token, existingBundleId, appName);
          regSpinner.succeed(`Bundle ID registered: ${existingBundleId}`);
          bundleIdFromApple = existingBundleId;
        }
      } else {
        const { selectedBundleId } = await inquirer.prompt([
          {
            type: "list",
            name: "selectedBundleId",
            message: "Select Bundle ID:",
            choices: bundleChoices,
          },
        ]);
        bundleIdFromApple = selectedBundleId;
      }

      const appleId = iosAppfile.apple_id ?? "";
      await ensureAppRecord(bundleIdFromApple, apps, projectRoot, appleId);
      const iosSpinner = ora("Generating iOS Fastlane files...").start();

      const iosConfig: IosConfig = {
        bundleId: bundleIdFromApple,
        appleId,
        teamId: teamId!,
        itcTeamId: teamId!,
        keyId: existingIosEnv.ASC_KEY_ID,
        issuerId: existingIosEnv.ASC_ISSUER_ID,
        p8Base64: existingIosEnv.ASC_KEY_CONTENT_BASE64,
        matchGitUrl: existingIosEnv.MATCH_GIT_URL,
        matchPassword: existingIosEnv.MATCH_PASSWORD,
        xcodeproj: xcodeproj ?? "",
      };

      await generateIosFiles(projectRoot, iosConfig);
      await generateEnvFile(projectRoot, iosConfig);

      iosSpinner.succeed("iOS files generated!");

      const appJsonResult = setAppJsonTeam(projectRoot, teamId!);
      if (appJsonResult === "set") {
        console.log(chalk.green(`✅ appleTeamId set to ${teamId} in app.json`));
      } else if (appJsonResult === "exists") {
        console.log(chalk.gray(`ℹ️  appleTeamId already configured in app.json`));
      }

      const teamResult = setXcodeTeam(projectRoot, teamId!);
      if (teamResult === "set") {
        console.log(chalk.green(`✅ DEVELOPMENT_TEAM set to ${teamId} in Xcode project`));
      } else if (teamResult === "exists") {
        console.log(chalk.gray(`ℹ️  DEVELOPMENT_TEAM already configured in Xcode project`));
      } else if (teamResult === "conflict") {
        console.log(chalk.yellow(`⚠️  Different team ID found in app.json — skipping Xcode project update`));
      }
    } catch (err: any) {
      spinner.fail(chalk.red(`Connection error: ${err.message}`));
      console.log(chalk.yellow("⚠️  Existing credentials may be invalid. Re-run to enter new ones.\n"));
    }
  } else {
    // ── Fresh iOS config ──────────────────────────────────────────────────
    console.log(chalk.bold("\n🔑 App Store Connect API Credentials\n"));
    console.log(chalk.gray("  To generate a new API key:"));
    console.log(chalk.gray("  1. Go to https://appstoreconnect.apple.com"));
    console.log(chalk.gray("  2. Users & Access → Integrations → App Store Connect API"));
    console.log(chalk.gray("  3. Click \"+\" to generate a new key (role: Admin or App Manager)"));
    console.log(chalk.gray("  4. Download the .p8 file — you can only download it once!\n"));
    console.log(chalk.gray("  Where to find your Issuer ID:"));
    console.log(chalk.gray("  → Shown at the top of the same Keys page (UUID format)\n"));
    console.log(chalk.gray("  Place the .p8 file in one of these directories:"));
    console.log(chalk.gray("  • ./private_keys  • ~/.private_keys  • ~/.appstoreconnect/private_keys\n"));

    const saved = loadCredentials();

    // Auto-detect .p8 files and convert to base64
    const p8Files = findP8Files(projectRoot, home);
    let detectedP8Base64: string | undefined;
    let detectedKeyId: string | undefined;

    if (p8Files.length === 1) {
      const p8Content = fs.readFileSync(p8Files[0], "utf8");
      detectedP8Base64 = Buffer.from(p8Content).toString("base64");
      detectedKeyId = path.basename(p8Files[0]).match(/^AuthKey_(.+)\.p8$/)?.[1];
      console.log(chalk.green(`🔑 .p8 file found: ${p8Files[0]}`));
    } else if (p8Files.length > 1) {
      const { selectedP8 } = await inquirer.prompt([
        {
          type: "list",
          name: "selectedP8",
          message: "Multiple .p8 files found. Select one:",
          choices: [
            ...p8Files.map((f) => ({ name: f, value: f })),
            { name: "Enter base64 manually", value: "__manual__" },
          ],
        },
      ]);
      if (selectedP8 !== "__manual__") {
        const p8Content = fs.readFileSync(selectedP8, "utf8");
        detectedP8Base64 = Buffer.from(p8Content).toString("base64");
        detectedKeyId = path.basename(selectedP8).match(/^AuthKey_(.+)\.p8$/)?.[1];
      }
    }

    const p8Prompts: any[] = detectedP8Base64
      ? []
      : [
          {
            type: "input",
            name: "p8Base64",
            message: "Base64-encoded .p8 key content (leave empty to skip iOS):",
            filter: (v: string) => v.trim(),
            validate: (v: string) => {
              if (!v.trim()) return true;
              try {
                const decoded = Buffer.from(v.trim(), "base64").toString("utf8");
                return decoded.includes("BEGIN PRIVATE KEY") || "Invalid base64 — decoded content does not look like a .p8 key";
              } catch {
                return "Invalid base64 encoding";
              }
            },
          },
        ];

    if (detectedKeyId) {
      console.log(chalk.green(`🔑 Key ID (from filename): ${detectedKeyId}`));
    }

    const appleCreds = await inquirer.prompt<AppleCredentials & { appleId: string }>([
      {
        type: "input",
        name: "keyId",
        message: "Key ID:",
        default: detectedKeyId ?? saved?.keyId ?? existingIosEnv.ASC_KEY_ID,
        validate: (v) => v.trim().length > 0 || "Required",
      },
      {
        type: "input",
        name: "issuerId",
        message: "Issuer ID (UUID from App Store Connect):",
        default: saved?.issuerId ?? existingIosEnv.ASC_ISSUER_ID,
        validate: (v) => v.trim().length > 0 || "Required",
      },
      ...p8Prompts,
      {
        type: "input",
        name: "appleId",
        message: "Apple ID (email):",
        default: iosAppfile.apple_id ?? saved?.appleId,
        validate: (v) => v.includes("@") || "Enter a valid email",
      },
    ]);

    if (detectedP8Base64) {
      appleCreds.p8Base64 = detectedP8Base64;
    }

    if (!appleCreds.p8Base64) {
      console.log(chalk.yellow("\n⚠️  Skipping iOS — no .p8 key provided. You can re-run later.\n"));
    } else {

    // ── 4. Fetch data from Apple ────────────────────────────────────────────
    const spinner = ora("Connecting to App Store Connect...").start();

    try {
      const token = generateJWT({
        keyId: appleCreds.keyId,
        issuerId: appleCreds.issuerId,
        p8Base64: appleCreds.p8Base64,
      });

      const teamId = await fetchTeamId(token);
      const bundleIds = await fetchBundleIds(token);
      const apps = await fetchApps(token);

      spinner.succeed(chalk.green(`Connected! Team ID: ${teamId}`));

      saveCredentials({
        issuerId: appleCreds.issuerId,
        keyId: appleCreds.keyId,
        appleId: appleCreds.appleId,
        p8Path: p8Files.find(() => true),
        savedAt: new Date().toISOString(),
      });

      if (apps.length > 0) {
        console.log(chalk.gray(`\nApps in App Store Connect (${apps.length}):`));
        apps.forEach((a) => console.log(chalk.gray(`  • ${a.name} (${a.bundleId})`)));
      }

      // ── 5. Bundle ID selection ────────────────────────────────────────────
      const bundleChoices = bundleIds.map((b) => ({
        name: `${b.identifier}  ${chalk.gray(`[${b.platform}]`)}`,
        value: b.identifier,
      }));

      let bundleIdFromApple: string;
      if (detectedBundleId) {
        if (bundleChoices.find((c) => c.value === detectedBundleId)) {
          bundleIdFromApple = detectedBundleId;
          console.log(chalk.green(`\n✅ Bundle ID auto-selected: ${bundleIdFromApple}`));
        } else {
          const regSpinner = ora(`Registering ${detectedBundleId} in Apple Developer...`).start();
          const appName = detectAppName(projectRoot) ?? detectedBundleId.split(".").pop() ?? "App";
          await registerBundleId(token, detectedBundleId, appName);
          regSpinner.succeed(`Bundle ID registered: ${detectedBundleId}`);
          bundleIdFromApple = detectedBundleId;
        }
      } else {
        const { selectedBundleId } = await inquirer.prompt([
          {
            type: "list",
            name: "selectedBundleId",
            message: "Select Bundle ID:",
            choices: bundleChoices,
          },
        ]);
        bundleIdFromApple = selectedBundleId;
      }

      await ensureAppRecord(bundleIdFromApple, apps, projectRoot, appleCreds.appleId);

      // ── Provisioning setup (optional) ─────────────────────────────────
      const { setupProvisioning } = await inquirer.prompt([{
        type: "confirm",
        name: "setupProvisioning",
        message: "Set up certificates and provisioning profiles now?",
        default: false,
      }]);

      if (setupProvisioning) {
        await runBundleIdCommand({ token, bundleId: bundleIdFromApple, interactive: true });
        const certResult = await runCertsCommand({ token, interactive: true });
        await runProvisionCommand({ token, bundleId: bundleIdFromApple, certificateId: certResult.certificateId, interactive: true });
      }

      // ── 6. Match config ──────────────────────────────────────────────────
      console.log(chalk.bold("\n🔒 Match Configuration (certificates)"));
      const { matchGitUrl, matchPassword } = await inquirer.prompt([
        {
          type: "input",
          name: "matchGitUrl",
          message: "Private Git repo URL for certificates (Match):",
          default: existingIosEnv.MATCH_GIT_URL,
          validate: (v) => v.startsWith("git@") || v.startsWith("https://") || "Enter a repo URL",
        },
        {
          type: "password",
          name: "matchPassword",
          message: "Match encryption password (choose and remember):",
          mask: "*",
          default: existingIosEnv.MATCH_PASSWORD,
          validate: (v) => v.length >= 8 || "Min. 8 characters",
        },
      ]);

      // ── 7. Generate iOS files ─────────────────────────────────────────────
      const iosSpinner = ora("Generating iOS Fastlane files...").start();

      const iosConfig: IosConfig = {
        bundleId: bundleIdFromApple,
        appleId: appleCreds.appleId,
        teamId: teamId!,
        itcTeamId: teamId!,
        keyId: appleCreds.keyId,
        issuerId: appleCreds.issuerId,
        p8Base64: appleCreds.p8Base64,
        matchGitUrl,
        matchPassword,
        xcodeproj: xcodeproj ?? "",
      };

      await generateIosFiles(projectRoot, iosConfig);
      await generateEnvFile(projectRoot, iosConfig);

      iosSpinner.succeed("iOS files generated!");

      const appJsonResult = setAppJsonTeam(projectRoot, teamId!);
      if (appJsonResult === "set") {
        console.log(chalk.green(`✅ appleTeamId set to ${teamId} in app.json`));
      } else if (appJsonResult === "exists") {
        console.log(chalk.gray(`ℹ️  appleTeamId already configured in app.json`));
      }

      const teamResult = setXcodeTeam(projectRoot, teamId!);
      if (teamResult === "set") {
        console.log(chalk.green(`✅ DEVELOPMENT_TEAM set to ${teamId} in Xcode project`));
      } else if (teamResult === "exists") {
        console.log(chalk.gray(`ℹ️  DEVELOPMENT_TEAM already configured in Xcode project`));
      } else if (teamResult === "conflict") {
        console.log(chalk.yellow(`⚠️  Different team ID found in app.json — skipping Xcode project update`));
      }
    } catch (err: any) {
      spinner.fail(chalk.red(`Connection error: ${err.message}`));
      console.log(chalk.yellow("⚠️  Skipping iOS configuration. Fix credentials and re-run.\n"));
    }
    } // end else (p8 provided)
  }
}
