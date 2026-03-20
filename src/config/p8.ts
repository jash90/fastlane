import fs from "fs";
import path from "path";
import chalk from "chalk";

export function findP8Files(projectRoot: string, home: string): string[] {
  const searchDirs = [
    path.join(projectRoot, "private_keys"),
    path.join(home, "private_keys"),
    path.join(home, ".private_keys"),
    path.join(home, ".appstoreconnect", "private_keys"),
  ];

  const found: string[] = [];
  for (const dir of searchDirs) {
    if (!fs.existsSync(dir)) continue;
    try {
      const files = fs.readdirSync(dir).filter((f) => f.endsWith(".p8"));
      for (const f of files) {
        const fullPath = path.join(dir, f);
        found.push(fullPath);

        // Warn if file permissions are too open (not 600)
        try {
          const stat = fs.statSync(fullPath);
          const mode = stat.mode & 0o777;
          if (mode !== 0o600) {
            console.log(
              chalk.yellow(
                `⚠️  ${fullPath} has permissions ${mode.toString(8)} — recommended: chmod 600`
              )
            );
          }
        } catch {}
      }
    } catch {}
  }

  if (found.length === 0) {
    console.log(
      chalk.yellow(
        `⚠️  No .p8 files found. Searched:\n${searchDirs.map((d) => `   • ${d}`).join("\n")}\n` +
          chalk.gray(`   Recommended: place your AuthKey_XXXX.p8 in ./private_keys or ~/.private_keys`)
      )
    );
  }

  return [...new Set(found)];
}
