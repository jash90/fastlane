import jwt from "jsonwebtoken";

export interface AppleCredentials {
  keyId: string;
  issuerId: string;
  p8Base64: string;
}

export function generateJWT(creds: AppleCredentials): string {
  const privateKey = Buffer.from(creds.p8Base64, "base64").toString("utf8");

  return jwt.sign({}, privateKey, {
    algorithm: "ES256",
    expiresIn: "20m",
    issuer: creds.issuerId,
    audience: "appstoreconnect-v1",
    header: {
      alg: "ES256",
      kid: creds.keyId,
      typ: "JWT",
    },
  });
}

export async function ascFetch<T>(token: string, endpoint: string): Promise<T> {
  const res = await fetch(`https://api.appstoreconnect.apple.com/v1/${endpoint}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(
      `ASC API error ${res.status}: ${JSON.stringify(err)}`
    );
  }

  return res.json() as T;
}
