import inquirer from "inquirer";
import chalk from "chalk";
import ora from "ora";
import path from "path";
import fs from "fs";
import { generateJWT, type AppleCredentials } from "../api/auth.js";
import { findBundleIdByIdentifier } from "../api/bundle-ids.js";
import { listCertificates } from "../api/certificates.js";
import { createProfile, listProfiles, downloadProfile, installProfile, listDevices } from "../api/profiles.js";
import type { ProfileType, ProfileInfo } from "../types.js";
import { loadCredentials } from "../config/credentials-store.js";
import { findP8Files } from "../config/p8.js";

export interface ProvisionCommandOptions {
  token?: string;
  type?: string;
  bundleId?: string;
  certificateId?: string;
  output?: string;
  install?: boolean;
  interactive?: boolean;
}

export async function runProvisionCommand(
  options: ProvisionCommandOptions = {}
): Promise<void> {
  const projectRoot = process.cwd();
  const home = process.env.HOME ?? "";

  let token = options.token;
  if (!token) {
    token = await resolveToken(projectRoot, home);
  }

  // Profile type
  let profileType: ProfileType;
  if (options.type === "development") {
    profileType = "IOS_APP_DEVELOPMENT";
  } else if (options.type === "appstore") {
    profileType = "IOS_APP_STORE";
  } else if (options.type === "adhoc") {
    profileType = "IOS_APP_ADHOC";
  } else {
    const { selectedType } = await inquirer.prompt([
      {
        type: "list",
        name: "selectedType",
        message: "Provisioning profile type:",
        choices: [
          { name: "App Store", value: "IOS_APP_STORE" },
          { name: "Development", value: "IOS_APP_DEVELOPMENT" },
          { name: "Ad Hoc", value: "IOS_APP_ADHOC" },
        ],
      },
    ]);
    profileType = selectedType;
  }

  // List existing profiles
  const spinner = ora("Fetching provisioning profiles...").start();
  const existingProfiles = await listProfiles(token, profileType);
  spinner.stop();

  const activeProfiles = existingProfiles.filter((p) => p.profileState === "ACTIVE");

  if (activeProfiles.length > 0 && options.interactive !== false) {
    console.log(chalk.bold(`\nExisting ${profileType} profiles:`));
    activeProfiles.forEach((p) => {
      const expDate = new Date(p.expirationDate).toLocaleDateString();
      console.log(chalk.gray(`  ${p.name} - expires ${expDate}`));
    });

    const { action } = await inquirer.prompt([
      {
        type: "list",
        name: "action",
        message: "What would you like to do?",
        choices: [
          ...activeProfiles.map((p) => ({
            name: `Download: ${p.name}`,
            value: `download:${p.id}`,
          })),
          { name: "Create a new profile", value: "create" },
        ],
      },
    ]);

    if (action !== "create") {
      const profileId = action.replace("download:", "");
      const profile = activeProfiles.find((p) => p.id === profileId)!;
      await handleProfileDownload(profile, options, projectRoot);
      return;
    }
  }

  // Bundle ID
  let bundleId = options.bundleId;
  if (!bundleId) {
    const answer = await inquirer.prompt([
      {
        type: "input",
        name: "bundleId",
        message: "Bundle Identifier:",
        validate: (v) => v.includes(".") || "Enter a valid bundle identifier",
      },
    ]);
    bundleId = answer.bundleId;
  }

  const bundleSpinner = ora(`Looking up ${bundleId}...`).start();
  const bundleIdResource = await findBundleIdByIdentifier(token, bundleId!);
  if (!bundleIdResource) {
    bundleSpinner.fail(`Bundle ID not found: ${bundleId}. Register it first with 'fastlane bundle-id'.`);
    return;
  }
  bundleSpinner.succeed(`Bundle ID found: ${bundleIdResource.identifier}`);

  // Certificate
  let certificateId = options.certificateId;
  if (!certificateId) {
    const certs = await listCertificates(token);
    const validCerts = certs.filter((c) => new Date(c.expirationDate) > new Date());

    if (validCerts.length === 0) {
      console.log(chalk.red("No valid certificates found. Create one first with 'fastlane certs'."));
      return;
    }

    if (validCerts.length === 1) {
      certificateId = validCerts[0].id;
      console.log(chalk.green(`Auto-selected certificate: ${validCerts[0].name}`));
    } else {
      const { selectedCert } = await inquirer.prompt([
        {
          type: "list",
          name: "selectedCert",
          message: "Select certificate:",
          choices: validCerts.map((c) => ({
            name: `${c.name} (${c.certificateType}, expires ${new Date(c.expirationDate).toLocaleDateString()})`,
            value: c.id,
          })),
        },
      ]);
      certificateId = selectedCert;
    }
  }

  // Devices (for development/ad-hoc)
  let deviceIds: string[] | undefined;
  if (profileType !== "IOS_APP_STORE") {
    const devSpinner = ora("Fetching registered devices...").start();
    const devices = await listDevices(token);
    devSpinner.stop();

    if (devices.length === 0) {
      console.log(chalk.yellow("No devices registered. Profile will be created without devices."));
    } else {
      console.log(chalk.gray(`Found ${devices.length} registered device(s)`));
      deviceIds = devices.map((d) => d.id);
    }
  }

  // Create profile
  const profileName = `Fastlane ${profileType.replace("IOS_APP_", "")} ${bundleId}`;
  const createSpinner = ora("Creating provisioning profile...").start();

  const profile = await createProfile(token, {
    name: profileName,
    profileType,
    bundleIdResourceId: bundleIdResource.id,
    certificateIds: [certificateId!],
    deviceIds,
  });

  createSpinner.succeed(`Profile created: ${profile.name} (${profile.uuid})`);

  await handleProfileDownload(profile, options, projectRoot);
}

async function handleProfileDownload(
  profile: ProfileInfo,
  options: ProvisionCommandOptions,
  projectRoot: string
): Promise<void> {
  const outputDir = options.output ?? path.join(projectRoot, "profiles");
  const profilePath = downloadProfile(profile, outputDir);
  console.log(chalk.green(`  Profile saved: ${profilePath}`));

  const shouldInstall = options.install ?? (options.interactive !== false);

  if (shouldInstall) {
    let doInstall = true;
    if (options.install === undefined && options.interactive !== false) {
      const { confirm } = await inquirer.prompt([
        {
          type: "confirm",
          name: "confirm",
          message: "Install profile to ~/Library/MobileDevice/Provisioning Profiles?",
          default: true,
        },
      ]);
      doInstall = confirm;
    }

    if (doInstall) {
      const destPath = installProfile(profilePath);
      console.log(chalk.green(`  Installed: ${destPath}`));
    }
  }

  console.log(chalk.green(`\nProvisioning profile ready: ${profile.uuid}`));
}

async function resolveToken(projectRoot: string, home: string): Promise<string> {
  const saved = loadCredentials();

  if (saved?.keyId && saved?.issuerId) {
    const p8Files = findP8Files(projectRoot, home);
    if (p8Files.length > 0) {
      const p8Content = fs.readFileSync(p8Files[0], "utf8");
      const p8Base64 = Buffer.from(p8Content).toString("base64");
      return generateJWT({ keyId: saved.keyId, issuerId: saved.issuerId, p8Base64 });
    }
  }

  const creds = await inquirer.prompt<AppleCredentials>([
    { type: "input", name: "keyId", message: "Key ID:", default: saved?.keyId, validate: (v) => !!v.trim() || "Required" },
    { type: "input", name: "issuerId", message: "Issuer ID:", default: saved?.issuerId, validate: (v) => !!v.trim() || "Required" },
    { type: "input", name: "p8Base64", message: "Base64-encoded .p8 key:", validate: (v) => !!v.trim() || "Required" },
  ]);

  return generateJWT(creds);
}
