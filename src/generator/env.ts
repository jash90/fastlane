import fs from "fs-extra";
import path from "path";
import type { IosConfig, AndroidConfig } from "../types.js";

export async function generateEnvFile(projectRoot: string, iosConfig?: IosConfig, androidConfig?: AndroidConfig) {
  const envPath = path.join(projectRoot, "fastlane", ".env");
  await fs.ensureDir(path.dirname(envPath));

  // Read existing .env to preserve values from the other platform
  const existing = fs.existsSync(envPath) ? await fs.readFile(envPath, "utf8") : "";

  let iosSection = "";
  let androidSection = "";

  if (iosConfig?.keyId) {
    iosSection = `# iOS
APP_IDENTIFIER="${iosConfig.bundleId}"
APPLE_ID="${iosConfig.appleId}"
TEAM_ID="${iosConfig.teamId}"
ITC_TEAM_ID="${iosConfig.itcTeamId}"

# App Store Connect API
ASC_KEY_ID="${iosConfig.keyId}"
ASC_ISSUER_ID="${iosConfig.issuerId}"
ASC_KEY_CONTENT_BASE64="${iosConfig.p8Base64}"

# Match
MATCH_PASSWORD="${iosConfig.matchPassword}"
MATCH_GIT_URL="${iosConfig.matchGitUrl}"
`;
  } else {
    // Preserve existing iOS section
    const iosMatch = existing.match(/# iOS[\s\S]*?(?=# Android|# Google Play|$)/);
    if (iosMatch) iosSection = iosMatch[0].trimEnd() + "\n";
  }

  if (androidConfig?.jsonKeyPath) {
    androidSection = `# Android
PACKAGE_NAME="${androidConfig.packageName}"
SUPPLY_JSON_KEY="${androidConfig.jsonKeyPath}"
`;
  } else {
    // Preserve existing Android section
    const androidMatch = existing.match(/# Android[\s\S]*$/);
    if (androidMatch) androidSection = androidMatch[0].trimEnd() + "\n";
  }

  const content = [iosSection, androidSection].filter(Boolean).join("\n");
  if (content) {
    await fs.writeFile(envPath, content);
  }

  // Add to .gitignore
  const gitignorePath = path.join(projectRoot, ".gitignore");
  if (fs.existsSync(gitignorePath)) {
    const gitignoreContent = await fs.readFile(gitignorePath, "utf8");
    const entries = [
      { check: "fastlane/.env", block: "\n# Fastlane secrets\nfastlane/.env\n" },
      { check: "*.ipa", block: "\n# Fastlane build artifacts\n*.ipa\n*.dSYM.zip\n*.aab\n*.apk\n" },
    ];
    for (const { check, block } of entries) {
      if (!gitignoreContent.includes(check)) {
        await fs.appendFile(gitignorePath, block);
      }
    }
  }
}
