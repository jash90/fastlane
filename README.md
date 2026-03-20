# fastlane-rn-init

> Interactive CLI for automatic Fastlane configuration in React Native

## Usage

```bash
npx fastlane-rn-init
```

Or install globally:

```bash
npm install -g fastlane-rn-init
fastlane-rn-init
```

## What it does

1. **Auto-detects** Bundle ID from `ios/*.xcodeproj` and package name from `android/app/build.gradle`
2. **Signs in to Apple** via App Store Connect API (JWT, no password)
3. **Fetches from Apple**: Team ID, ITC Team ID, Bundle IDs list, and apps
4. **Generates** all Fastlane files: `Appfile`, `Fastfile`, `Matchfile`, `.env.fastlane`

## Required credentials (just 3!)

| What | Where to find |
|------|---------------|
| Key ID | ASC → Users & Access → Keys |
| Issuer ID | ASC → Users & Access → Keys |
| `.p8` file | Download from ASC (one-time) |

Everything else is fetched automatically from the Apple API.

## Requirements

- Node.js >= 18
- Fastlane installed (`brew install fastlane`)
- Apple Developer account

## Generated files

```
ios/fastlane/
├── Appfile       ← app_identifier, team_id (auto)
├── Fastfile      ← lanes: certs, beta, release
└── Matchfile     ← certificate configuration

android/fastlane/
├── Appfile       ← package_name (auto)
└── Fastfile      ← lanes: beta, release

.env.fastlane     ← secrets (in .gitignore)
```

## Available lanes after setup

### iOS
```bash
cd ios
fastlane certs    # Fetch certificates (Match)
fastlane beta     # Build → TestFlight
fastlane release  # Build → App Store
```

### Android
```bash
cd android
fastlane beta     # Build AAB → Play Store (internal)
fastlane release  # Promote internal → production
```
