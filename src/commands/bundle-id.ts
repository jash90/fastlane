import inquirer from "inquirer";
import chalk from "chalk";
import ora from "ora";
import { generateJWT, type AppleCredentials } from "../api/auth.js";
import { findBundleIdByIdentifier, registerBundleId, enableCapability, listCapabilities } from "../api/bundle-ids.js";
import { detectCapabilities } from "../config/detect.js";
import type { CapabilityType } from "../types.js";
import { loadCredentials } from "../config/credentials-store.js";
import { findP8Files } from "../config/p8.js";
import fs from "fs";
import path from "path";

export interface BundleIdCommandOptions {
  token?: string;
  bundleId?: string;
  name?: string;
  capabilities?: string;
  interactive?: boolean;
}

export async function runBundleIdCommand(options: BundleIdCommandOptions = {}): Promise<void> {
  const projectRoot = process.cwd();
  const home = process.env.HOME ?? "";

  let token = options.token;

  if (!token) {
    token = await resolveToken(projectRoot, home);
  }

  let bundleId = options.bundleId;
  let appName = options.name;

  if (!bundleId) {
    const answer = await inquirer.prompt([
      {
        type: "input",
        name: "bundleId",
        message: "Bundle Identifier (e.g. com.example.app):",
        validate: (v) => v.includes(".") || "Enter a valid bundle identifier",
      },
    ]);
    bundleId = answer.bundleId;
  }

  if (!appName) {
    appName = bundleId!.split(".").pop() ?? "App";
  }

  // Check if already registered
  const spinner = ora(`Checking if ${bundleId} is registered...`).start();
  let existing = await findBundleIdByIdentifier(token!, bundleId!);

  if (existing) {
    spinner.succeed(`Bundle ID already registered: ${existing.identifier} (${existing.id})`);
  } else {
    spinner.text = `Registering ${bundleId}...`;
    existing = await registerBundleId(token!, bundleId!, appName);
    spinner.succeed(`Bundle ID registered: ${existing.identifier}`);
  }

  // Capabilities
  const detectedCaps = detectCapabilities(projectRoot);
  let capsToEnable: CapabilityType[] = [];

  if (options.capabilities) {
    const capMap: Record<string, CapabilityType> = {
      push: "PUSH_NOTIFICATIONS",
      domains: "ASSOCIATED_DOMAINS",
      appleid: "APPLE_ID_AUTH",
      iap: "IN_APP_PURCHASE",
      gamecenter: "GAME_CENTER",
    };
    capsToEnable = options.capabilities
      .split(",")
      .map((c) => capMap[c.trim()])
      .filter(Boolean);
  } else if (options.interactive !== false) {
    const allCaps: CapabilityType[] = [
      "PUSH_NOTIFICATIONS",
      "ASSOCIATED_DOMAINS",
      "APPLE_ID_AUTH",
      "IN_APP_PURCHASE",
      "GAME_CENTER",
    ];

    const { selectedCaps } = await inquirer.prompt([
      {
        type: "checkbox",
        name: "selectedCaps",
        message: "Enable capabilities:",
        choices: allCaps.map((c) => ({
          name: c.replace(/_/g, " ").toLowerCase(),
          value: c,
          checked: detectedCaps.includes(c),
        })),
      },
    ]);
    capsToEnable = selectedCaps;
  }

  if (capsToEnable.length > 0) {
    const currentCaps = await listCapabilities(token!, existing.id);
    const currentTypes = currentCaps.map((c) => c.capabilityType);

    for (const cap of capsToEnable) {
      if (currentTypes.includes(cap)) {
        console.log(chalk.gray(`  Already enabled: ${cap}`));
        continue;
      }
      const capSpinner = ora(`Enabling ${cap}...`).start();
      try {
        await enableCapability(token!, existing.id, cap);
        capSpinner.succeed(`Enabled: ${cap}`);
      } catch (err: any) {
        capSpinner.fail(`Failed to enable ${cap}: ${err.message}`);
      }
    }
  }

  console.log(chalk.green(`\nBundle ID ready: ${existing.identifier}`));
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
