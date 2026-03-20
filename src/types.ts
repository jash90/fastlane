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
}

export interface AndroidConfig {
  packageName: string;
  jsonKeyPath: string;
}
