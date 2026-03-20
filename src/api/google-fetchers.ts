import fs from "fs";
import { playFetch } from "./google-auth.js";
import type { PlayEdit, PlayBundle, PlayTrack, TrackName } from "../types.js";

export async function createEdit(
  token: string,
  packageName: string
): Promise<PlayEdit> {
  return playFetch<PlayEdit>(token, `${packageName}/edits`, {
    method: "POST",
    body: JSON.stringify({}),
  });
}

export async function commitEdit(
  token: string,
  packageName: string,
  editId: string
): Promise<void> {
  await playFetch(token, `${packageName}/edits/${editId}:commit`, {
    method: "POST",
  });
}

export async function uploadBundle(
  token: string,
  packageName: string,
  editId: string,
  aabPath: string
): Promise<PlayBundle> {
  const aabData = fs.readFileSync(aabPath);

  const res = await fetch(
    `https://androidpublisher.googleapis.com/upload/androidpublisher/v3/applications/${packageName}/edits/${editId}/bundles?uploadType=media`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/octet-stream",
        "Content-Length": aabData.length.toString(),
      },
      body: aabData,
    }
  );

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(`Bundle upload failed ${res.status}: ${JSON.stringify(err)}`);
  }

  return res.json() as Promise<PlayBundle>;
}

export async function assignTrack(
  token: string,
  packageName: string,
  editId: string,
  track: TrackName,
  versionCode: number,
  userFraction?: number
): Promise<PlayTrack> {
  const release: any = {
    versionCodes: [versionCode.toString()],
    status: userFraction != null && userFraction < 1 ? "inProgress" : "completed",
  };

  if (userFraction != null && userFraction < 1) {
    release.userFraction = userFraction;
  }

  return playFetch<PlayTrack>(
    token,
    `${packageName}/edits/${editId}/tracks/${track}`,
    {
      method: "PUT",
      body: JSON.stringify({
        track,
        releases: [release],
      }),
    }
  );
}

export async function listTracks(
  token: string,
  packageName: string,
  editId: string
): Promise<PlayTrack[]> {
  const data = await playFetch<{ tracks: PlayTrack[] }>(
    token,
    `${packageName}/edits/${editId}/tracks`
  );
  return data.tracks ?? [];
}

export async function checkAppExists(
  token: string,
  packageName: string
): Promise<boolean> {
  try {
    await playFetch(token, packageName);
    return true;
  } catch {
    return false;
  }
}
