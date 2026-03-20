import fs from "fs-extra";
import path from "path";
import type { IosConfig } from "../types.js";

export async function generateIosFiles(projectRoot: string, config: IosConfig) {
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
