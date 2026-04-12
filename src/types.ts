export interface IosConfig {
  bundleId: string;
  appleId: string;
  teamId: string;
  itcTeamId: string;
  keyId: string;
  issuerId: string;
  p8Base64: string;
  matchGitUrl: string;
  matchPassword: string;
  xcodeproj: string;
  isExpo?: boolean;
}

export interface AndroidConfig {
  packageName: string;
  jsonKeyPath: string;
  isExpo?: boolean;
}

// ASC Provisioning
export type CertificateType = "IOS_DISTRIBUTION" | "IOS_DEVELOPMENT";
export type ProfileType = "IOS_APP_DEVELOPMENT" | "IOS_APP_STORE" | "IOS_APP_ADHOC";
export type CapabilityType =
  | "PUSH_NOTIFICATIONS"
  | "ASSOCIATED_DOMAINS"
  | "APPLE_ID_AUTH"
  | "IN_APP_PURCHASE"
  | "GAME_CENTER"
  | "ICLOUD"
  | "APP_GROUPS"
  | "MAPS"
  | "SIRIKIT"
  | "WALLET"
  | "HEALTHKIT"
  | "HOMEKIT"
  | "NFC_TAG_READING"
  | "PERSONAL_VPN"
  | "NETWORK_EXTENSIONS"
  | "ACCESS_WIFI_INFORMATION"
  | "CLASSKIT"
  | "AUTOFILL_CREDENTIAL_PROVIDER"
  | "MULTIPATH"
  | "HOT_SPOT"
  | "DATA_PROTECTION"
  | "INTER_APP_AUDIO"
  | "FONT_INSTALLATION"
  | "WIRELESS_ACCESSORY_CONFIGURATION";

export interface CertificateInfo {
  id: string;
  name: string;
  certificateType: CertificateType;
  expirationDate: string;
  serialNumber: string;
  certificateContent: string;
}

export interface ProfileInfo {
  id: string;
  name: string;
  profileType: ProfileType;
  profileState: "ACTIVE" | "INVALID";
  expirationDate: string;
  profileContent: string;
  uuid: string;
}

// Google Play
export type TrackName = "internal" | "alpha" | "beta" | "production";

export interface PlayEdit { id: string; expiryTimeSeconds: string }
export interface PlayBundle { versionCode: number; sha256: string }
export interface PlayRelease { name?: string; versionCodes: string[]; status: string; userFraction?: number }
export interface PlayTrack { track: string; releases: PlayRelease[] }

// Subcommand options
export interface SubcommandFlags {
  [key: string]: string | boolean | undefined;
}
