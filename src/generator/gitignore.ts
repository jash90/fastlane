import fs from "fs-extra";
import path from "path";

const FASTLANE_GITIGNORE_ENTRIES = [
  "# Fastlane auto-generated reports",
  "report.xml",
  "Preview.html",
  "screenshots/**/*.png",
  "test_output",
  "",
  "# Build artifacts",
  "README.md",
  "",
  "# Credentials (double-safe — also in root .gitignore)",
  ".env",
];

/**
 * Create a .gitignore inside the target project's fastlane/ directory
 * with common Fastlane artifacts (report.xml, Preview.html, etc.).
 * Merges with any existing entries to avoid duplicates.
 */
export async function generateFastlaneGitignore(projectRoot: string): Promise<void> {
  const fastlaneDir = path.join(projectRoot, "fastlane");
  await fs.ensureDir(fastlaneDir);

  const gitignorePath = path.join(fastlaneDir, ".gitignore");
  const existing = fs.existsSync(gitignorePath) ? await fs.readFile(gitignorePath, "utf8") : "";

  const existingLines = new Set(existing.split("\n").map((l) => l.trimEnd()));

  const newEntries = FASTLANE_GITIGNORE_ENTRIES.filter(
    (entry) => entry === "" || !existingLines.has(entry)
  );

  // If only empty separator lines remain, nothing new to add
  if (newEntries.every((e) => e === "")) return;

  // If file already has content, start with a newline separator
  const separator = existing && !existing.endsWith("\n") ? "\n" : "";
  const content = existing
    ? existing + separator + newEntries.join("\n") + "\n"
    : newEntries.join("\n") + "\n";

  await fs.writeFile(gitignorePath, content);
}
