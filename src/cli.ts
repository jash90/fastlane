#!/usr/bin/env node
import inquirer from "inquirer";
import chalk from "chalk";
import path from "path";
import { detectAndroidConfig, detectIosBundleId, detectAppName, detectXcodeProject } from "./config/detect.js";
import { parseEnvFile, parseAppfile } from "./config/parser.js";
import { runIosFlow } from "./commands/ios.js";
import { runAndroidFlow } from "./commands/android.js";

const projectRoot = process.cwd();
const home = process.env.HOME ?? "";

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

  const doIos = platforms.includes("ios");
  const doAndroid = platforms.includes("android");

  // ── 3. Load existing .env configurations ────────────────────────────────
  const existingIosEnv = parseEnvFile(path.join(projectRoot, "ios", "fastlane", ".env"));
  const existingAndroidEnv = parseEnvFile(path.join(projectRoot, "android", "fastlane", ".env"));
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

  // ── 4. Run platform flows ────────────────────────────────────────────────
  if (doIos) {
    await runIosFlow({ projectRoot, home, detectedBundleId, xcodeproj, existingIosEnv, iosAppfile });
  }

  if (doAndroid) {
    await runAndroidFlow({ projectRoot, detectedAndroidConfig: androidConfig, existingAndroidEnv, androidAppfile });
  }

  // ── 5. Summary ──────────────────────────────────────────────────────────────
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
