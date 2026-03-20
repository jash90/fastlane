import fs from "fs-extra";
import path from "path";
import type { AndroidConfig } from "../types.js";

export async function generateAndroidFiles(projectRoot: string, config: AndroidConfig) {
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
