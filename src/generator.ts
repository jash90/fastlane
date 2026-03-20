import fs from "fs-extra";
import path from "path";

export interface FastlaneConfig {
  // iOS
  bundleId: string;
  appleId: string;
  teamId: string;
  itcTeamId: string;
  keyId: string;
  issuerId: string;
  p8Base64: string;
  matchGitUrl: string;
  matchPassword: string;
  xcodeproj: string;
  // Android
  packageName: string;
  jsonKeyPath: string;
}

export async function generateIosFiles(projectRoot: string, config: FastlaneConfig) {
  const fastlaneDir = path.join(projectRoot, "ios", "fastlane");
  await fs.ensureDir(fastlaneDir);

  // Appfile
  await fs.writeFile(
    path.join(fastlaneDir, "Appfile"),
    `app_identifier("${config.bundleId}")
apple_id("${config.appleId}")
team_id("${config.teamId}")
itc_team_id("${config.itcTeamId}")
`
  );

  // Matchfile
  await fs.writeFile(
    path.join(fastlaneDir, "Matchfile"),
    `git_url("${config.matchGitUrl}")
storage_mode("git")
type("appstore")
app_identifier(["${config.bundleId}"])
`
  );

  const scheme = config.xcodeproj ? config.xcodeproj.replace(".xcodeproj", "") : config.bundleId.split(".").pop();

  // Fastfile
  await fs.writeFile(
    path.join(fastlaneDir, "Fastfile"),
    `default_platform(:ios)

platform :ios do
  before_all do
    @api_key = app_store_connect_api_key(
      key_id: ENV["ASC_KEY_ID"],
      issuer_id: ENV["ASC_ISSUER_ID"],
      key_content: ENV["ASC_KEY_CONTENT_BASE64"],
      is_key_content_base64: true
    )
  end

  desc "Fetch certificates and provisioning profiles"
  lane :certs do
    match(type: "appstore", readonly: is_ci)
  end

  desc "Build and upload to TestFlight"
  lane :beta do
    match(type: "appstore", readonly: is_ci)
    increment_build_number(xcodeproj: "${config.xcodeproj}")
    build_app(
      scheme: "${scheme}",
      export_method: "app-store"
    )
    upload_to_testflight(
      api_key: @api_key,
      skip_waiting_for_build_processing: true
    )
  end

  desc "Build and release to App Store"
  lane :release do
    match(type: "appstore", readonly: is_ci)
    build_app(export_method: "app-store")
    upload_to_app_store(
      api_key: @api_key,
      submit_for_review: true,
      automatic_release: false,
      force: true
    )
  end
end
`
  );
}

export async function generateAndroidFiles(projectRoot: string, config: FastlaneConfig) {
  const fastlaneDir = path.join(projectRoot, "android", "fastlane");
  await fs.ensureDir(fastlaneDir);

  await fs.writeFile(
    path.join(fastlaneDir, "Appfile"),
    `json_key_file("${config.jsonKeyPath}")
package_name("${config.packageName}")
`
  );

  await fs.writeFile(
    path.join(fastlaneDir, "Fastfile"),
    `default_platform(:android)

platform :android do
  desc "Build and upload to Firebase App Distribution"
  lane :beta do
    gradle(
      task: "bundle",
      build_type: "Release"
    )
    upload_to_play_store(
      track: "internal",
      aab: "app/build/outputs/bundle/release/app-release.aab"
    )
  end

  desc "Promote internal to production"
  lane :release do
    upload_to_play_store(
      track_promote_to: "production",
      aab: "app/build/outputs/bundle/release/app-release.aab"
    )
  end
end
`
  );
}

export async function generateEnvFile(projectRoot: string, config: FastlaneConfig) {
  // iOS .env — Fastlane auto-loads .env from the fastlane/ directory
  if (config.keyId) {
    const iosEnvPath = path.join(projectRoot, "ios", "fastlane", ".env");
    await fs.ensureDir(path.dirname(iosEnvPath));
    await fs.writeFile(
      iosEnvPath,
      `# App Store Connect API
ASC_KEY_ID="${config.keyId}"
ASC_ISSUER_ID="${config.issuerId}"
ASC_KEY_CONTENT_BASE64="${config.p8Base64}"

# Match
MATCH_PASSWORD="${config.matchPassword}"
MATCH_GIT_URL="${config.matchGitUrl}"
`
    );
  }

  // Android .env
  if (config.jsonKeyPath) {
    const androidEnvPath = path.join(projectRoot, "android", "fastlane", ".env");
    await fs.ensureDir(path.dirname(androidEnvPath));
    await fs.writeFile(
      androidEnvPath,
      `# Google Play
SUPPLY_JSON_KEY=${config.jsonKeyPath}
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
