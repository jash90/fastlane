# fastlane

> Interactive CLI that auto-configures Fastlane for React Native — iOS (App Store Connect API + Match) and Android (Google Play).

[![npm version](https://img.shields.io/npm/v/fastlane)](https://www.npmjs.com/package/fastlane)
[![license](https://img.shields.io/npm/l/fastlane)](./LICENSE)
[![node](https://img.shields.io/node/v/fastlane)](./package.json)

## Highlights

- **Auto-detects** bundle ID, package name, and app name from your project files
- **JWT authentication** — connects to App Store Connect API without passwords
- **Smart defaults** — detects existing `.env` and `Appfile` configs and offers to reuse them
- **Zero manual editing** — generates all Fastlane files ready to use
- **Finds `.p8` keys automatically** — scans common locations and extracts Key ID from the filename

## Quick Start

```bash
npx fastlane
```

Or install globally:

```bash
npm install -g fastlane
fastlane
```

The CLI walks you through everything interactively — pick platforms, enter credentials, and all config files are generated.

## Prerequisites

- **Node.js** >= 18
- **Fastlane** installed (`brew install fastlane`)
- **Apple Developer** account (for iOS)
- **Google Play** service account JSON key (for Android, optional)

## What You Need

For iOS setup you need three things from App Store Connect → Users & Access → Integrations → Keys:

| Credential | Where to find |
|---|---|
| **Key ID** | Listed next to your key name |
| **Issuer ID** | Shown at the top of the Keys page |
| **`.p8` file** | Downloaded when the key was created (one-time download) |

Everything else — Team ID, ITC Team ID, bundle IDs, app list — is fetched automatically from the Apple API.

For Android you only need a **Google Play service account JSON key** file.

## How It Works

1. **Detect** — reads `app.json`, `*.xcodeproj`, and `build.gradle` to extract identifiers
2. **Check existing config** — parses any existing `.env` and `Appfile` files, offers to reuse credentials
3. **Authenticate** — generates a JWT token and connects to the App Store Connect API
4. **Fetch** — pulls Team ID, ITC Team ID, bundle IDs, and apps from Apple
5. **Configure Match** — asks for a private Git repo URL and encryption password for certificate storage
6. **Generate** — writes all Fastlane files for the selected platforms

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

## Tech Stack

- **TypeScript** — full type safety
- **Inquirer** — interactive prompts
- **jsonwebtoken** — JWT signing for ASC API
- **ora** — spinners for async operations
- **chalk** — colored terminal output

## License

MIT
