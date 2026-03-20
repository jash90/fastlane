#!/usr/bin/env node
import inquirer from "inquirer";
import chalk from "chalk";
import ora from "ora";
import path from "path";
import fs from "fs";
import { generateJWT, type AppleCredentials } from "./apple-auth.js";
import { fetchBundleIds, fetchApps, fetchTeamId } from "./fetchers.js";
import { detectAndroidConfig, detectIosBundleId, detectAppName, detectXcodeProject } from "./android.js";
import { generateIosFiles, generateAndroidFiles, generateEnvFile } from "./generator.js";

const projectRoot = process.cwd();
const home = process.env.HOME ?? "";

function parseEnvFile(filePath: string): Record<string, string> {
  if (!fs.existsSync(filePath)) return {};
  const content = fs.readFileSync(filePath, "utf8");
  const result: Record<string, string> = {};
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const match = trimmed.match(/^([A-Z_]+)="?([^"]*)"?$/);
    if (match) result[match[1]] = match[2];
  }
  return result;
}

function parseAppfile(filePath: string): Record<string, string> {
  if (!fs.existsSync(filePath)) return {};
  const content = fs.readFileSync(filePath, "utf8");
  const result: Record<string, string> = {};
  for (const line of content.split("\n")) {
    const match = line.match(/^(\w+)\("([^"]+)"\)/);
    if (match) result[match[1]] = match[2];
  }
  return result;
}

function findP8Files(): string[] {
  const searchDirs = [
    projectRoot,
    path.join(home, "Downloads"),
    path.join(home, ".appstoreconnect", "private_keys"),
    path.join(home, ".private_keys"),
  ];

  const found: string[] = [];
  for (const dir of searchDirs) {
    if (!fs.existsSync(dir)) continue;
    try {
      const files = fs.readdirSync(dir).filter((f) => f.endsWith(".p8"));
      for (const f of files) found.push(path.join(dir, f));
    } catch {}
  }
  return [...new Set(found)];
}


console.log(chalk.bold.cyan("\n🚀 Fastlane React Native Configurator\n"));

async function main() {
  // ── 1. Auto-detect from project ──────────────────────────────────────────
  const detectedBundleId = detectIosBundleId(projectRoot);
  const androidConfig = detectAndroidConfig(projectRoot);
  const appName = detectAppName(projectRoot);
  const xcodeproj = detectXcodeProject(projectRoot);

  if (appName) {
    console.log(chalk.gray(`📦 Project: ${appName}`));
  }
  if (detectedBundleId) {
    console.log(chalk.gray(`🍎 Bundle ID (detected): ${detectedBundleId}`));
  }
  if (androidConfig.packageName) {
    console.log(chalk.gray(`🤖 Package Name (detected): ${androidConfig.packageName}`));
  }
  console.log("");

  // ── 2. Platform selection ─────────────────────────────────────────────────
  const { platforms } = await inquirer.prompt([
    {
      type: "checkbox",
      name: "platforms",
      message: "Which platforms do you want to configure Fastlane for?",
      choices: [
        { name: "iOS (App Store)", value: "ios", checked: true },
        { name: "Android (Google Play)", value: "android", checked: true },
      ],
    },
  ]);

  let doIos = platforms.includes("ios");
  let doAndroid = platforms.includes("android");

  // ── 2b. Load existing .env configurations ────────────────────────────────
  const iosEnvPath = path.join(projectRoot, "ios", "fastlane", ".env");
  const androidEnvPath = path.join(projectRoot, "android", "fastlane", ".env");
  const existingIosEnv = parseEnvFile(iosEnvPath);
  const existingAndroidEnv = parseEnvFile(androidEnvPath);

  const iosAppfile = parseAppfile(path.join(projectRoot, "ios", "fastlane", "Appfile"));
  const androidAppfile = parseAppfile(path.join(projectRoot, "android", "fastlane", "Appfile"));

  const iosConfigured = !!(existingIosEnv.ASC_KEY_ID && existingIosEnv.ASC_KEY_CONTENT_BASE64);
  const androidConfigured = !!existingAndroidEnv.SUPPLY_JSON_KEY;

  if (iosConfigured) {
    console.log(chalk.green(`✅ Existing iOS config found:`));
    console.log(chalk.gray(`   Key ID: ${existingIosEnv.ASC_KEY_ID}`));
    if (existingIosEnv.ASC_ISSUER_ID) console.log(chalk.gray(`   Issuer ID: ${existingIosEnv.ASC_ISSUER_ID}`));
    if (existingIosEnv.MATCH_GIT_URL) console.log(chalk.gray(`   Match Git URL: ${existingIosEnv.MATCH_GIT_URL}`));
    if (iosAppfile.apple_id) console.log(chalk.gray(`   Apple ID: ${iosAppfile.apple_id}`));
    if (iosAppfile.app_identifier) console.log(chalk.gray(`   Bundle ID: ${iosAppfile.app_identifier}`));
  }
  if (androidConfigured) {
    console.log(chalk.green(`✅ Existing Android config found:`));
    console.log(chalk.gray(`   JSON Key: ${existingAndroidEnv.SUPPLY_JSON_KEY}`));
    if (androidAppfile.package_name) console.log(chalk.gray(`   Package: ${androidAppfile.package_name}`));
  }

  // ── 3. Apple credentials ──────────────────────────────────────────────────
  let token: string | null = null;
  let teamId: string | null = null;
  let bundleIdFromApple: string | null = null;

  if (doIos) {
    // Check if we can reuse existing complete iOS config
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
        token = generateJWT({
          keyId: existingIosEnv.ASC_KEY_ID,
          issuerId: existingIosEnv.ASC_ISSUER_ID,
          p8Base64: existingIosEnv.ASC_KEY_CONTENT_BASE64,
        });

        teamId = await fetchTeamId(token);
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

        if (existingBundleId && bundleChoices.find((c) => c.value === existingBundleId)) {
          bundleIdFromApple = existingBundleId;
          console.log(chalk.green(`\n✅ Bundle ID auto-selected: ${bundleIdFromApple}`));
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
        const iosSpinner = ora("Generating iOS Fastlane files...").start();

        const iosConfig = {
          bundleId: bundleIdFromApple!,
          appleId,
          teamId: teamId!,
          itcTeamId: teamId!,
          keyId: existingIosEnv.ASC_KEY_ID,
          issuerId: existingIosEnv.ASC_ISSUER_ID,
          p8Base64: existingIosEnv.ASC_KEY_CONTENT_BASE64,
          matchGitUrl: existingIosEnv.MATCH_GIT_URL,
          matchPassword: existingIosEnv.MATCH_PASSWORD,
          xcodeproj: xcodeproj ?? "",
          packageName: androidConfig.packageName ?? "",
          jsonKeyPath: "",
        };

        await generateIosFiles(projectRoot, iosConfig);
        await generateEnvFile(projectRoot, iosConfig);

        iosSpinner.succeed("iOS files generated!");
      } catch (err: any) {
        spinner.fail(chalk.red(`Connection error: ${err.message}`));
        console.log(chalk.yellow("⚠️  Existing credentials may be invalid. Re-run to enter new ones.\n"));
      }
    } else {
    // ── Fresh iOS config ──────────────────────────────────────────────────
    console.log(chalk.bold("\n🔑 App Store Connect API Credentials"));
    console.log(
      chalk.gray(
        "You can find them at: https://appstoreconnect.apple.com → Users & Access → Keys\n"
      )
    );

    // Auto-detect .p8 files and convert to base64
    const p8Files = findP8Files();
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
        default: detectedKeyId ?? existingIosEnv.ASC_KEY_ID,
        validate: (v) => v.trim().length > 0 || "Required",
      },
      {
        type: "input",
        name: "issuerId",
        message: "Issuer ID (UUID from App Store Connect):",
        default: existingIosEnv.ASC_ISSUER_ID,
        validate: (v) => v.trim().length > 0 || "Required",
      },
      ...p8Prompts,
      {
        type: "input",
        name: "appleId",
        message: "Apple ID (email):",
        default: iosAppfile.apple_id,
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
      token = generateJWT({
        keyId: appleCreds.keyId,
        issuerId: appleCreds.issuerId,
        p8Base64: appleCreds.p8Base64,
      });

      teamId = await fetchTeamId(token);
      const bundleIds = await fetchBundleIds(token);
      const apps = await fetchApps(token);

      spinner.succeed(chalk.green(`Connected! Team ID: ${teamId}`));

      if (apps.length > 0) {
        console.log(chalk.gray(`\nApps in App Store Connect (${apps.length}):`));
        apps.forEach((a) => console.log(chalk.gray(`  • ${a.name} (${a.bundleId})`)));
      }

      // ── 5. Bundle ID selection ────────────────────────────────────────────
      const bundleChoices = bundleIds.map((b) => ({
        name: `${b.identifier}  ${chalk.gray(`[${b.platform}]`)}`,
        value: b.identifier,
      }));

      if (detectedBundleId && bundleChoices.find((c) => c.value === detectedBundleId)) {
        bundleIdFromApple = detectedBundleId;
        console.log(chalk.green(`\n✅ Bundle ID auto-selected: ${bundleIdFromApple}`));
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

      await generateIosFiles(projectRoot, {
        bundleId: bundleIdFromApple!,
        appleId: appleCreds.appleId,
        teamId: teamId!,
        itcTeamId: teamId!,
        keyId: appleCreds.keyId,
        issuerId: appleCreds.issuerId,
        p8Base64: appleCreds.p8Base64,
        matchGitUrl,
        matchPassword,
        xcodeproj: xcodeproj ?? "",
        packageName: androidConfig.packageName ?? "",
        jsonKeyPath: "",
      });

      await generateEnvFile(projectRoot, {
        bundleId: bundleIdFromApple!,
        appleId: appleCreds.appleId,
        teamId: teamId!,
        itcTeamId: teamId!,
        keyId: appleCreds.keyId,
        issuerId: appleCreds.issuerId,
        p8Base64: appleCreds.p8Base64,
        matchGitUrl,
        matchPassword,
        xcodeproj: xcodeproj ?? "",
        packageName: androidConfig.packageName ?? "",
        jsonKeyPath: "",
      });

      iosSpinner.succeed("iOS files generated!");
    } catch (err: any) {
      spinner.fail(chalk.red(`Connection error: ${err.message}`));
      console.log(chalk.yellow("⚠️  Skipping iOS configuration. Fix credentials and re-run.\n"));
    }
    } // end else (p8 provided)
    } // end else (fresh config)
  }

  // ── 8. Android ──────────────────────────────────────────────────────────────
  if (doAndroid) {
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
        default: androidConfig.packageName ?? androidAppfile.package_name ?? undefined,
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
      await generateAndroidFiles(projectRoot, {
        bundleId: bundleIdFromApple ?? "",
        appleId: "",
        teamId: "",
        itcTeamId: "",
        keyId: "",
        issuerId: "",
        p8Base64: "",
        matchGitUrl: "",
        matchPassword: "",
        xcodeproj: "",
        packageName,
        jsonKeyPath,
      });
      androidSpinner.succeed("Android files generated!");
    }
  }

  // ── 9. Summary ──────────────────────────────────────────────────────────────
  console.log(chalk.bold.green("\n✅ Configuration complete!\n"));
  console.log(chalk.bold("Generated files:"));

  if (doIos) {
    console.log(chalk.cyan("  ios/fastlane/Appfile"));
    console.log(chalk.cyan("  ios/fastlane/Fastfile"));
    console.log(chalk.cyan("  ios/fastlane/Matchfile"));
    console.log(chalk.cyan("  ios/fastlane/.env") + chalk.gray("  ← secrets, added to .gitignore"));
  }
  if (doAndroid) {
    console.log(chalk.cyan("  android/fastlane/Appfile"));
    console.log(chalk.cyan("  android/fastlane/Fastfile"));
    console.log(chalk.cyan("  android/fastlane/.env") + chalk.gray("  ← secrets, added to .gitignore"));
  }

  console.log(chalk.bold("\n📋 Next steps:"));
  if (doIos || iosConfigured) {
    console.log("  1. " + chalk.white("cd ios && fastlane certs") + chalk.gray("  ← fetch certificates"));
    console.log("  2. " + chalk.white("cd ios && fastlane beta") + chalk.gray("  ← upload to TestFlight"));
  }
  if (doAndroid || androidConfigured) {
    console.log("  3. " + chalk.white("cd android && fastlane beta") + chalk.gray("  ← upload to Play Store\n"));
  }
}

main().catch((err) => {
  console.error(chalk.red("\nError:"), err.message);
  process.exit(1);
});
