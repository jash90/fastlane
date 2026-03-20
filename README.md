# fastlane

> Interactive CLI that auto-configures Fastlane for React Native — iOS (App Store Connect API + Match + Provisioning) and Android (Google Play API).

[![npm version](https://img.shields.io/npm/v/fastlane)](https://www.npmjs.com/package/fastlane)
[![license](https://img.shields.io/npm/l/fastlane)](./LICENSE)
[![node](https://img.shields.io/node/v/fastlane)](./package.json)

## Highlights

- **Auto-detects** bundle ID, package name, and app name from your project files
- **JWT authentication** — connects to App Store Connect API without passwords
- **iOS Provisioning** — register Bundle IDs, create certificates (CSR → .cer → .p12), manage provisioning profiles
- **Capability detection** — auto-detects Push Notifications, Associated Domains, Apple Sign-In from Expo plugins
- **Google Play API** — validates service account access, uploads AAB bundles, manages track releases with staged rollout
- **Smart defaults** — detects existing `.env` and `Appfile` configs and offers to reuse them
- **Zero manual editing** — generates all Fastlane files ready to use
- **Finds `.p8` keys automatically** — scans common locations and extracts Key ID from the filename
- **CI-friendly subcommands** — `bundle-id`, `certs`, `provision`, `upload`, `release` for scripted pipelines

## Quick Start

### Interactive mode

```bash
npx fastlane
```

Or install globally:

```bash
npm install -g fastlane
fastlane
```

The CLI walks you through everything interactively — pick platforms, enter credentials, and all config files are generated.

### Subcommands (CI / scripting)

```bash
# iOS provisioning
fastlane bundle-id --bundle-id com.example.app --name "My App"
fastlane certs --type distribution
fastlane provision --type appstore --bundle-id com.example.app

# Android upload & release
fastlane upload --platform android --aab ./app.aab --track internal
fastlane release --platform android --track production --rollout 0.1
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

1. **Detect** — reads `app.json`, `*.xcodeproj`, and `build.gradle` to extract identifiers
2. **Check existing config** — parses any existing `.env` and `Appfile` files, offers to reuse credentials
3. **Authenticate** — generates a JWT token and connects to the App Store Connect API
4. **Fetch** — pulls Team ID, ITC Team ID, bundle IDs, and apps from Apple
5. **Provision** (optional) — registers Bundle ID, enables capabilities, creates certificates and provisioning profiles
6. **Configure Match** — asks for a private Git repo URL and encryption password for certificate storage
7. **Validate Android** — authenticates with Google Play API and verifies app access
8. **Generate** — writes all Fastlane files for the selected platforms

## Generated Files

```
ios/fastlane/
├── Appfile       ← app_identifier, team_id, itc_team_id
├── Fastfile      ← lanes: certs, beta, release
├── Matchfile     ← git_url, storage_mode, app_identifier
└── .env          ← ASC credentials, Match password

android/fastlane/
├── Appfile       ← package_name, json_key_file
├── Fastfile      ← lanes: beta, release
└── .env          ← SUPPLY_JSON_KEY path
```

## CLI Subcommands

### `bundle-id` — Register & configure Bundle IDs

```bash
fastlane bundle-id --bundle-id com.example.app --name "My App"
fastlane bundle-id --bundle-id com.example.app --capabilities push,domains,appleid
```

Auto-detects capabilities from Expo plugins (`expo-notifications`, `expo-apple-authentication`, `expo-linking`).

### `certs` — Create & manage certificates

```bash
fastlane certs --type distribution          # or: development
fastlane certs --type distribution --force  # create new even if valid ones exist
fastlane certs --output ./my-certs          # custom output directory
```

Generates CSR via openssl, creates certificate through ASC API, exports `.cer` and `.p12`.

### `provision` — Create & install provisioning profiles

```bash
fastlane provision --type appstore --bundle-id com.example.app
fastlane provision --type development --bundle-id com.example.app --install
fastlane provision --type adhoc --bundle-id com.example.app
```

For development and ad-hoc profiles, automatically includes all registered devices.

### `upload` — Upload AAB to Google Play

```bash
fastlane upload --platform android --aab ./app.aab --track internal
fastlane upload --platform android --track beta --json-key ./key.json --package-name com.example.app
```

Creates an edit, uploads the bundle, assigns it to a track, and commits.

### `release` — Release to a Google Play track

```bash
fastlane release --platform android --track production
fastlane release --platform android --track production --rollout 0.1  # 10% staged rollout
```

## Available Lanes

### iOS

```bash
cd ios
fastlane certs      # Fetch certificates and profiles via Match
fastlane beta       # Build and upload to TestFlight
fastlane release    # Build and submit to App Store
```

### Android

```bash
cd android
fastlane beta       # Build AAB and upload to Play Store (internal track)
fastlane release    # Promote from internal track to production
```

## Configuration Reuse

When run in a project that already has Fastlane configured, the CLI:

- Detects existing ASC credentials, Match settings, and Android config
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
