import fs from "fs";
import path from "path";
import os from "os";

export interface SavedCredentials {
  issuerId?: string;
  keyId?: string;
  p8Path?: string;
  savedAt: string;
}

const STORE_DIR = path.join(os.homedir(), ".appstoreconnect");
const STORE_PATH = path.join(STORE_DIR, "fastlane-cli.json");

export function loadCredentials(): SavedCredentials | null {
  try {
    if (!fs.existsSync(STORE_PATH)) return null;
    const raw = fs.readFileSync(STORE_PATH, "utf8");
    return JSON.parse(raw) as SavedCredentials;
  } catch {
    return null;
  }
}

export function saveCredentials(creds: SavedCredentials): void {
  if (!fs.existsSync(STORE_DIR)) {
    fs.mkdirSync(STORE_DIR, { recursive: true });
  }
  fs.writeFileSync(STORE_PATH, JSON.stringify(creds, null, 2), { mode: 0o600 });
}
