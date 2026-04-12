import fs from "fs-extra";
import path from "path";
import type { IosConfig } from "../types.js";

export async function generateIosFiles(projectRoot: string, config: IosConfig) {
  const fastlaneDir = path.join(projectRoot, "fastlane");
  await fs.ensureDir(fastlaneDir);

  // Appfile — reads values from ENV
  const appfilePath = path.join(fastlaneDir, "Appfile");
  const existingAppfile = fs.existsSync(appfilePath) ? await fs.readFile(appfilePath, "utf8") : "";

  const iosAppfileBlock = `app_identifier(ENV["APP_IDENTIFIER"])
apple_id(ENV["APPLE_ID"])
team_id(ENV["TEAM_ID"])
itc_team_id(ENV["ITC_TEAM_ID"])
`;

  // Keep android lines if they exist
  const androidLines = existingAppfile.split("\n").filter(
    (l) => l.startsWith("json_key_file(") || l.startsWith("package_name(")
  );
  const appfileContent = androidLines.length > 0
    ? iosAppfileBlock + "\n" + androidLines.join("\n") + "\n"
    : iosAppfileBlock;

  await fs.writeFile(appfilePath, appfileContent);

  // Matchfile — reads values from ENV
  await fs.writeFile(
    path.join(fastlaneDir, "Matchfile"),
    `git_url(ENV["MATCH_GIT_URL"])
storage_mode("git")
type("appstore")
app_identifier([ENV["APP_IDENTIFIER"]])
`
  );

  const scheme = config.xcodeproj ? config.xcodeproj.replace(".xcodeproj", "") : config.bundleId.split(".").pop();
  const xcodeprojPath = config.xcodeproj ? `ios/${config.xcodeproj}` : "";

  // ── Version bump snippet (Expo vs bare RN) ──────────────────────────
  const versionBumpSnippet = config.isExpo
    ? `    # Bump patch version in app.json
    require "json"
    app_json_path = File.expand_path("../app.json", __dir__)
    app_json = JSON.parse(File.read(app_json_path))
    root = app_json.key?("expo") ? app_json["expo"] : app_json
    parts = root["version"].split(".")
    parts[-1] = (parts[-1].to_i + 1).to_s
    root["version"] = parts.join(".")
    File.write(app_json_path, JSON.pretty_generate(app_json) + "\\n")
    UI.message("Version bumped to #{root['version']}")
    sh("cd .. && npx expo prebuild --clean")`
    : `    increment_version_number(bump_type: "patch", xcodeproj: "${xcodeprojPath}")
    increment_build_number(xcodeproj: "${xcodeprojPath}")`;

  // Fastfile — merge with existing android platform block
  const fastfilePath = path.join(fastlaneDir, "Fastfile");
  const existingFastfile = fs.existsSync(fastfilePath) ? await fs.readFile(fastfilePath, "utf8") : "";

  const podInstallLine = config.isExpo ? "" : `\n    sh("cd ../ios && pod install")`;

  const iosBlock = `platform :ios do
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
    match(type: "appstore", readonly: is_ci)${podInstallLine}
${versionBumpSnippet}
    build_app(
      workspace: "ios/${scheme}.xcworkspace",
      scheme: "${scheme}",
      export_method: "app-store"
    )
    upload_to_testflight(
      api_key: @api_key,
      skip_waiting_for_build_processing: true
    )
    clean_build_artifacts
    sh("rm -rf ../ios/build")
  end

  desc "Build and release to App Store"
  lane :release do
    match(type: "appstore", readonly: is_ci)${podInstallLine}
${versionBumpSnippet}
    build_app(
      workspace: "ios/${scheme}.xcworkspace",
      scheme: "${scheme}",
      export_method: "app-store"
    )
    upload_to_app_store(
      api_key: @api_key,
      submit_for_review: true,
      automatic_release: false,
      force: true
    )
    clean_build_artifacts
    sh("rm -rf ../ios/build")
  end
end`;

  // Extract existing android block if present
  const androidBlockMatch = existingFastfile.match(/platform :android do[\s\S]*?^end/m);
  const androidBlock = androidBlockMatch ? androidBlockMatch[0] : "";

  const fastfileContent = androidBlock
    ? iosBlock + "\n\n" + androidBlock + "\n"
    : iosBlock + "\n";

  await fs.writeFile(fastfilePath, fastfileContent);
}
