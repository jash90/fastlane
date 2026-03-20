import { GoogleAuth } from "google-auth-library";
import fs from "fs";

export interface GooglePlayCredentials {
  jsonKeyPath: string;
}

export async function getAccessToken(creds: GooglePlayCredentials): Promise<string> {
  const auth = new GoogleAuth({
    keyFile: creds.jsonKeyPath,
    scopes: ["https://www.googleapis.com/auth/androidpublisher"],
  });

  const client = await auth.getClient();
  const tokenResponse = await client.getAccessToken();

  if (!tokenResponse.token) {
    throw new Error("Failed to obtain Google Play access token");
  }

  return tokenResponse.token;
}

const PLAY_API_BASE = "https://androidpublisher.googleapis.com/androidpublisher/v3/applications";

export async function playFetch<T>(
  token: string,
  endpoint: string,
  options?: RequestInit
): Promise<T> {
  const res = await fetch(`${PLAY_API_BASE}/${endpoint}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...options?.headers,
    },
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(
      `Google Play API error ${res.status}: ${JSON.stringify(err)}`
    );
  }

  return res.json() as T;
}

export function validateServiceAccountKey(
  jsonKeyPath: string
): { clientEmail: string; projectId: string } {
  const raw = fs.readFileSync(jsonKeyPath, "utf8");
  const key = JSON.parse(raw);

  if (!key.client_email || !key.private_key) {
    throw new Error(
      "Invalid service account key: missing client_email or private_key"
    );
  }

  return {
    clientEmail: key.client_email,
    projectId: key.project_id ?? "unknown",
  };
}
