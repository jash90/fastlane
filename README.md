# fastlane

> Interactive CLI that auto-configures Fastlane for React Native — iOS (App Store Connect API + Match + Provisioning) and Android (Google Play API).

[![npm version](https://img.shields.io/npm/v/fastlane-init)](https://www.npmjs.com/package/fastlane-init)
[![license](https://img.shields.io/npm/l/fastlane-init)](./LICENSE)
[![node](https://img.shields.io/node/v/fastlane-init)](./package.json)

## Highlights

- **Auto-detects** bundle ID from `app.json` and auto-registers it in Apple Developer if missing
- **JWT authentication** — connects to App Store Connect API without passwords
- **iOS Provisioning** — register Bundle IDs, create certificates, manage provisioning profiles
- **24 capabilities** auto-detected from `.entitlements` and `Info.plist` files (Push, iCloud, Sign in with Apple, HealthKit, NFC, and more)
- **Google Play API** — validates service account access, uploads AAB bundles, manages track releases with staged rollout
- **Single `fastlane/` directory** — one folder at project root for both iOS and Android config
- **All secrets in `.env`** — Appfile and Matchfile read from ENV variables, nothing hardcoded in committed files
- **Auto-cleanup** — removes build artifacts after upload, cleans up temporary certificate files
- **Auto-gitignore** — adds `fastlane/.env`, `*.ipa`, `*.dSYM.zip`, `*.aab`, `*.apk` to `.gitignore`
- **Smart defaults** — detects existing config and offers to reuse credentials
- **Finds `.p8` keys automatically** — scans common locations and extracts Key ID from the filename
- **CI-friendly subcommands** — `bundle-id`, `certs`, `provision`, `upload`, `release` for scripted pipelines

## Quick Start

### Interactive mode

```bash
npx fastlane-init
```

Or install globally:

```bash
npm install -g fastlane-init
fastlane-init
```

The CLI walks you through everything interactively — pick platforms, enter credentials, and all config files are generated.

### Subcommands (CI / scripting)

```bash
# iOS provisioning
fastlane-init bundle-id --bundle-id com.example.app --name "My App"
fastlane-init certs --type distribution
fastlane-init provision --type appstore --bundle-id com.example.app

# Android upload & release
fastlane-init upload --platform android --aab ./app.aab --track internal
fastlane-init release --platform android --track production --rollout 0.1
```

## Prerequisites

- **Node.js** >= 18
- **Fastlane** installed (`brew install fastlane`)
- **Apple Developer** account (for iOS)
- **Google Play** service account JSON key (for Android)
- **openssl** available in PATH (for certificate generation)

## What You Need

### iOS

Three things from App Store Connect → Users & Access → Integrations → Keys:

| Credential | Where to find |
|---|---|
| **Key ID** | Listed next to your key name |
| **Issuer ID** | Shown at the top of the Keys page |
| **`.p8` file** | Downloaded when the key was created (one-time download) |

Everything else — Team ID, ITC Team ID, bundle IDs, app list — is fetched automatically from the Apple API.

### Android

A **Google Play service account JSON key** file:

1. Go to Google Play Console → Setup → API access
2. Create or link a Google Cloud project
3. Under Service accounts, click "Create new service account"
4. In Google Cloud Console, create a key (JSON) for that account
5. Back in Play Console, grant the service account access to your app

## How It Works

1. **Detect** — reads `app.json`, `.entitlements`, `Info.plist`, and `build.gradle` to extract identifiers and capabilities
2. **Check existing config** — parses any existing `fastlane/.env` and `fastlane/Appfile`, offers to reuse credentials
3. **Authenticate** — generates a JWT token and connects to the App Store Connect API
4. **Fetch** — pulls Team ID, ITC Team ID, bundle IDs, and apps from Apple
5. **Auto-register** — if the detected bundle ID doesn't exist in Apple Developer, creates it automatically
6. **Auto-enable capabilities** — detects capabilities from `.entitlements` / `Info.plist` and enables them without prompting
7. **Provision** (optional) — creates certificates, auto-selects matching App Store provisioning profile
8. **Configure Match** — asks for a private Git repo URL and encryption password for certificate storage
9. **Validate Android** — authenticates with Google Play API and verifies app access
10. **Generate** — writes all Fastlane files into a single `fastlane/` directory
11. **Gitignore** — adds build artifacts (`*.ipa`, `*.dSYM.zip`, `*.aab`, `*.apk`) and secrets to `.gitignore`

## Generated Files

```
fastlane/
├── Appfile       ← reads APP_IDENTIFIER, TEAM_ID, PACKAGE_NAME from ENV
├── Fastfile      ← platform :ios + platform :android lanes
├── Matchfile     ← reads MATCH_GIT_URL, APP_IDENTIFIER from ENV
└── .env          ← all secrets and config values (git-ignored)
```

### `.env` contents

```bash
# iOS
APP_IDENTIFIER="com.example.app"
APPLE_ID="user@example.com"
TEAM_ID="ABC123"
ITC_TEAM_ID="ABC123"

# App Store Connect API
ASC_KEY_ID="..."
ASC_ISSUER_ID="..."
ASC_KEY_CONTENT_BASE64="..."

# Match
MATCH_PASSWORD="..."
MATCH_GIT_URL="git@github.com:..."

# Android
PACKAGE_NAME="com.example.app"
SUPPLY_JSON_KEY="/path/to/key.json"
```

## Detected Capabilities

Capabilities are auto-detected from `ios/**/*.entitlements`, `ios/**/Info.plist`, and `app.json` plugins:

| Entitlements key | Capability |
|---|---|
| `aps-environment` | Push Notifications |
| `com.apple.developer.associated-domains` | Associated Domains |
| `com.apple.developer.applesignin` | Sign in with Apple |
| `com.apple.developer.in-app-payments` | In-App Purchase |
| `com.apple.developer.game-center` | Game Center |
| `com.apple.developer.icloud-container-identifiers` | iCloud |
| `com.apple.security.application-groups` | App Groups |
| `com.apple.developer.siri` | SiriKit |
| `com.apple.developer.pass-type-identifiers` | Wallet |
| `com.apple.developer.healthkit` | HealthKit |
| `com.apple.developer.homekit` | HomeKit |
| `com.apple.developer.nfc.readersession.formats` | NFC Tag Reading |
| `com.apple.developer.networking.vpn.api` | Personal VPN |
| `com.apple.developer.networking.networkextension` | Network Extensions |
| `com.apple.developer.networking.wifi-info` | Access WiFi Information |
| `com.apple.developer.ClassKit-environment` | ClassKit |
| `com.apple.developer.authentication-services.autofill-credential-provider` | Autofill Credential Provider |
| `com.apple.developer.networking.multipath` | Multipath |
| `com.apple.developer.networking.HotspotConfiguration` | Hotspot |
| `com.apple.developer.default-data-protection` | Data Protection |
| `inter-app-audio` | Inter-App Audio |
| `com.apple.developer.font-installation` | Font Installation |
| `com.apple.external-accessory.wireless-configuration` | Wireless Accessory |

Also detected from `Info.plist`: `remote-notification` in UIBackgroundModes → Push Notifications.

## CLI Subcommands

### `bundle-id` — Register & configure Bundle IDs

```bash
fastlane-init bundle-id --bundle-id com.example.app --name "My App"
fastlane-init bundle-id --bundle-id com.example.app --capabilities push,domains,appleid,icloud,nfc
```

### `certs` — Create & manage certificates

```bash
fastlane-init certs --type distribution
fastlane-init certs --type distribution --force
fastlane-init certs --output ./my-certs
```

Generates CSR via openssl, creates certificate through ASC API. Temporary files are cleaned up after use.

### `provision` — Create & install provisioning profiles

```bash
fastlane-init provision --type appstore --bundle-id com.example.app
fastlane-init provision --type development --bundle-id com.example.app --install
fastlane-init provision --type adhoc --bundle-id com.example.app
```

When `--bundle-id` is provided, auto-selects App Store type and the matching profile.

### `upload` — Upload AAB to Google Play

```bash
fastlane-init upload --platform android --aab ./app.aab --track internal
fastlane-init upload --platform android --track beta --json-key ./key.json --package-name com.example.app
```

### `release` — Release to a Google Play track

```bash
fastlane-init release --platform android --track production
fastlane-init release --platform android --track production --rollout 0.1
```

## Available Lanes

### iOS

```bash
fastlane ios certs      # Fetch certificates and profiles via Match
fastlane ios beta       # Build and upload to TestFlight
fastlane ios release    # Build and submit to App Store
```

### Android

```bash
fastlane android beta       # Build AAB and upload to Play Store (internal track)
fastlane android release    # Promote from internal track to production
```

## Configuration Reuse

When run in a project that already has Fastlane configured, the CLI:

- Detects existing credentials and config from `fastlane/.env`
- Shows a summary of what's already set up
- Offers to **reuse** existing credentials or enter new ones
- Pre-fills form fields with existing values for easy updating

Credentials are persisted locally:
- Apple: `~/.appstoreconnect/fastlane-cli.json`
- Google: `~/.googleplay/fastlane-cli.json`

## Tech Stack

- **TypeScript** — full type safety
- **Inquirer** — interactive prompts
- **jsonwebtoken** — JWT signing for ASC API
- **google-auth-library** — Google Play service account authentication
- **ora** — spinners for async operations
- **chalk** — colored terminal output

## License

MIT
