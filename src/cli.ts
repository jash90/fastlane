#!/usr/bin/env node
import inquirer from "inquirer";
import chalk from "chalk";
import path from "path";
import { detectAndroidConfig, detectIosBundleId, detectAppName, detectXcodeProject, detectIosVersion } from "./config/detect.js";
import { parseEnvFile, parseAppfile } from "./config/parser.js";
import { runIosFlow } from "./commands/ios.js";
import { runAndroidFlow } from "./commands/android.js";
import { runBundleIdCommand } from "./commands/bundle-id.js";
import { runCertsCommand } from "./commands/certs.js";
import { runProvisionCommand } from "./commands/provision.js";
import { runUploadCommand } from "./commands/upload.js";
import { runReleaseCommand } from "./commands/release.js";
import type { SubcommandFlags } from "./types.js";
import { checkVersion } from "./config/version-check.js";

function parseFlags(argv: string[]): SubcommandFlags {
  const flags: SubcommandFlags = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg.startsWith("--")) {
      const key = arg.slice(2);
      const next = argv[i + 1];
      if (next && !next.startsWith("--")) {
        flags[key] = next;
        i++;
      } else {
        flags[key] = true;
      }
    }
  }
  return flags;
}

async function routeSubcommand(subcommand: string, flags: SubcommandFlags): Promise<void> {
  switch (subcommand) {
    case "bundle-id":
      await runBundleIdCommand({
        bundleId: flags["bundle-id"] as string,
        name: flags["name"] as string,
        capabilities: flags["capabilities"] as string,
      });
      break;

    case "certs":
      await runCertsCommand({
        type: flags["type"] as string,
        output: flags["output"] as string,
        force: flags["force"] === true,
      });
      break;

    case "provision":
      await runProvisionCommand({
        type: flags["type"] as string,
        bundleId: flags["bundle-id"] as string,
        certificateId: flags["certificate-id"] as string,
        output: flags["output"] as string,
        install: flags["install"] === true || flags["install"] === undefined ? undefined : false,
      });
      break;

    case "upload":
      await runUploadCommand({
        platform: flags["platform"] as string,
        aab: flags["aab"] as string,
        track: flags["track"] as string,
        jsonKey: flags["json-key"] as string,
        packageName: flags["package-name"] as string,
      });
      break;

    case "release":
      await runReleaseCommand({
        platform: flags["platform"] as string,
        track: flags["track"] as string,
        rollout: flags["rollout"] as string,
        jsonKey: flags["json-key"] as string,
        packageName: flags["package-name"] as string,
      });
      break;

    default:
      console.log(chalk.red(`Unknown subcommand: ${subcommand}`));
      console.log(chalk.gray("Available: bundle-id, certs, provision, upload, release"));
      process.exit(1);
  }
}

const subcommand = process.argv[2];
if (subcommand && !subcommand.startsWith("-")) {
  const flags = parseFlags(process.argv.slice(3));
  checkVersion().then(() => routeSubcommand(subcommand, flags)).catch((err) => {
    console.error(chalk.red("\nError:"), err.message);
    process.exit(1);
  });
} else {

const projectRoot = process.cwd();
const home = process.env.HOME ?? "";

console.log(chalk.bold.cyan("\n🚀 Fastlane React Native Configurator\n"));

async function main() {
  // ── 0. Check for newer version ──────────────────────────────────────────
  await checkVersion();

  // ── 1. Auto-detect from project ──────────────────────────────────────────
  const detectedBundleId = detectIosBundleId(projectRoot);
  const androidConfig = detectAndroidConfig(projectRoot);
  const appName = detectAppName(projectRoot);
  const xcodeproj = detectXcodeProject(projectRoot);
  const iosVersion = detectIosVersion(projectRoot);

  if (appName) {
    console.log(chalk.gray(`📦 Project: ${appName}`));
  }
  if (detectedBundleId) {
    console.log(chalk.gray(`🍎 Bundle ID: ${detectedBundleId}`));
  }
  if (iosVersion.version) {
    const build = iosVersion.buildNumber ? ` (${iosVersion.buildNumber})` : "";
    console.log(chalk.gray(`🍎 Version: ${iosVersion.version}${build}`));
  }
  if (androidConfig.packageName) {
    console.log(chalk.gray(`🤖 Package: ${androidConfig.packageName}`));
  }
  if (androidConfig.versionName) {
    const code = androidConfig.versionCode ? ` (${androidConfig.versionCode})` : "";
    console.log(chalk.gray(`🤖 Version: ${androidConfig.versionName}${code}`));
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

  const doIos = platforms.includes("ios");
  const doAndroid = platforms.includes("android");

  const { autoCommitAfterBump } = await inquirer.prompt([
    {
      type: "confirm",
      name: "autoCommitAfterBump",
      message: "Auto-commit and push to remote after version bump?",
      default: false,
    },
  ]);

  // ── 3. Load existing .env configurations ────────────────────────────────
  const existingEnv = parseEnvFile(path.join(projectRoot, "fastlane", ".env"));
  const existingIosEnv = existingEnv;
  const existingAndroidEnv = existingEnv;
  const appfile = parseAppfile(path.join(projectRoot, "fastlane", "Appfile"));
  const iosAppfile = appfile;
  const androidAppfile = appfile;

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

  // ── 4. Run platform flows ────────────────────────────────────────────────
  if (doIos) {
    await runIosFlow({ projectRoot, home, detectedBundleId, xcodeproj, existingIosEnv, iosAppfile, autoCommitAfterBump });
  }

  if (doAndroid) {
    await runAndroidFlow({ projectRoot, detectedAndroidConfig: androidConfig, existingAndroidEnv, androidAppfile, autoCommitAfterBump });
  }

  // ── 5. Summary ──────────────────────────────────────────────────────────────
  console.log(chalk.bold.green("\n✅ Configuration complete!\n"));
  console.log(chalk.bold("Generated files:"));

  console.log(chalk.cyan("  fastlane/Appfile"));
  console.log(chalk.cyan("  fastlane/Fastfile"));
  if (doIos) {
    console.log(chalk.cyan("  fastlane/Matchfile"));
  }
  console.log(chalk.cyan("  fastlane/.env") + chalk.gray("  ← secrets, added to .gitignore"));

  console.log(chalk.bold("\n📋 Next steps:"));
  if (doIos || iosConfigured) {
    console.log("  1. " + chalk.white("fastlane ios certs") + chalk.gray("  ← fetch certificates"));
    console.log("  2. " + chalk.white("fastlane ios beta") + chalk.gray("  ← upload to TestFlight"));
  }
  if (doAndroid || androidConfigured) {
    console.log("  3. " + chalk.white("fastlane android beta") + chalk.gray("  ← upload to Play Store\n"));
  }
}

main().catch((err) => {
  console.error(chalk.red("\nError:"), err.message);
  process.exit(1);
});

} // end subcommand routing else
