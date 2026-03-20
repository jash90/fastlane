import fs from "fs-extra";
import path from "path";
import type { IosConfig, AndroidConfig } from "../types.js";

export async function generateEnvFile(projectRoot: string, iosConfig?: IosConfig, androidConfig?: AndroidConfig) {
  // iOS .env — Fastlane auto-loads .env from the fastlane/ directory
  if (iosConfig?.keyId) {
    const iosEnvPath = path.join(projectRoot, "ios", "fastlane", ".env");
    await fs.ensureDir(path.dirname(iosEnvPath));
    await fs.writeFile(
      iosEnvPath,
      `# App Store Connect API
ASC_KEY_ID="${iosConfig.keyId}"
ASC_ISSUER_ID="${iosConfig.issuerId}"
ASC_KEY_CONTENT_BASE64="${iosConfig.p8Base64}"

# Match
MATCH_PASSWORD="${iosConfig.matchPassword}"
MATCH_GIT_URL="${iosConfig.matchGitUrl}"
`
    );
  }

  // Android .env
  if (androidConfig?.jsonKeyPath) {
    const androidEnvPath = path.join(projectRoot, "android", "fastlane", ".env");
    await fs.ensureDir(path.dirname(androidEnvPath));
    await fs.writeFile(
      androidEnvPath,
      `# Google Play
SUPPLY_JSON_KEY=${androidConfig.jsonKeyPath}
`
    );
  }

  // Add to .gitignore
  const gitignorePath = path.join(projectRoot, ".gitignore");
  if (fs.existsSync(gitignorePath)) {
    const content = await fs.readFile(gitignorePath, "utf8");
    if (!content.includes("fastlane/.env")) {
      await fs.appendFile(gitignorePath, "\n# Fastlane secrets\n**/fastlane/.env\n");
    }
  }
}
