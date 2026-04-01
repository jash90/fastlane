import fs from "fs-extra";
import path from "path";
import type { AndroidConfig } from "../types.js";

export async function generateAndroidFiles(projectRoot: string, config: AndroidConfig) {
  const fastlaneDir = path.join(projectRoot, "fastlane");
  await fs.ensureDir(fastlaneDir);

  // Appfile — reads values from ENV
  const appfilePath = path.join(fastlaneDir, "Appfile");
  const existingAppfile = fs.existsSync(appfilePath) ? await fs.readFile(appfilePath, "utf8") : "";

  const androidAppfileBlock = `json_key_file(ENV["SUPPLY_JSON_KEY"])
package_name(ENV["PACKAGE_NAME"])
`;

  // Keep iOS lines if they exist
  const iosLines = existingAppfile.split("\n").filter(
    (l) => l.startsWith("app_identifier(") || l.startsWith("apple_id(") || l.startsWith("team_id(") || l.startsWith("itc_team_id(")
  );
  const appfileContent = iosLines.length > 0
    ? iosLines.join("\n") + "\n\n" + androidAppfileBlock
    : androidAppfileBlock;

  await fs.writeFile(appfilePath, appfileContent);

  // Fastfile — merge with existing ios platform block
  const fastfilePath = path.join(fastlaneDir, "Fastfile");
  const existingFastfile = fs.existsSync(fastfilePath) ? await fs.readFile(fastfilePath, "utf8") : "";

  const androidBlock = `platform :android do
  desc "Build and upload to Google Play (internal track)"
  lane :beta do
    gradle(
      task: "bundle",
      build_type: "Release"
    )
    upload_to_play_store(
      track: "internal",
      aab: "app/build/outputs/bundle/release/app-release.aab"
    )
    sh("rm -f ../android/app/build/outputs/bundle/release/app-release.aab")
  end

  desc "Promote internal to production"
  lane :release do
    upload_to_play_store(
      track_promote_to: "production",
      aab: "app/build/outputs/bundle/release/app-release.aab"
    )
  end
end`;

  // Extract existing iOS block if present
  const iosBlockMatch = existingFastfile.match(/platform :ios do[\s\S]*?^end/m);
  const iosBlock = iosBlockMatch ? iosBlockMatch[0] : "";

  const fastfileContent = iosBlock
    ? iosBlock + "\n\n" + androidBlock + "\n"
    : androidBlock + "\n";

  await fs.writeFile(fastfilePath, fastfileContent);
}
