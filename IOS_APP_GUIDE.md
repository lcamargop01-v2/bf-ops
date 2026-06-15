# BF Ops — iOS App Build & App Store Submission Guide

## Prerequisites

You need **all of these** before you start:

1. **A Mac** running macOS 14 (Sonoma) or later
2. **Xcode 16+** — free from the Mac App Store (warning: it's a ~12GB download)
3. **Apple Developer Account** — $99/year at [developer.apple.com](https://developer.apple.com/programs/)
4. **Node.js 18+** — install from [nodejs.org](https://nodejs.org)
5. **CocoaPods** — install with: `sudo gem install cocoapods`

---

## Step 1: Clone the Repo

```bash
git clone https://github.com/lcamargop01-v2/bf-ops.git
cd bf-ops
npm install
```

## Step 2: Build & Sync to iOS

```bash
npm run cap:build
```

This does three things:
1. Runs `vite build` to compile the web app
2. Runs `npx cap sync ios` to copy the build into the native iOS project
3. Installs native dependencies

Then install iOS dependencies:

```bash
cd ios/App
pod install
cd ../..
```

## Step 3: Open in Xcode

```bash
npx cap open ios
```

This opens the Xcode project. You should see:
- **App** target in the left sidebar
- The BF Ops icon in Assets.xcassets
- The splash screen

## Step 4: Configure Signing

1. Click the **App** project in the left sidebar
2. Click the **App** target
3. Go to **Signing & Capabilities** tab
4. Check **Automatically manage signing**
5. Select your **Team** (your Apple Developer account)
6. Change **Bundle Identifier** to: `com.britishfeed.ops`
   - If this is taken, use something like `com.britishfeed.bfops`

## Step 5: Test on Your iPhone

1. Connect your iPhone to your Mac with a USB cable
2. On your iPhone: Settings > Privacy & Security > Developer Mode > **Turn On**
3. In Xcode, select your iPhone from the device dropdown (top toolbar)
4. Press **Cmd + R** (or the Play button) to build and run
5. The first time, your iPhone will ask you to trust the developer certificate:
   - Settings > General > VPN & Device Management > tap your developer cert > Trust

The app should launch showing the BF Ops login screen!

## Step 6: Test the App

Verify these things work on your phone:
- Login works
- All modules load (Logistics, Inventory, etc.)
- Route creation works
- Status bar text is white (light) against dark navbar
- Content doesn't overlap the notch or home indicator
- Keyboard pushes content up properly on input fields

## Step 7: Prepare for App Store Submission

### App Store Connect Setup

1. Go to [App Store Connect](https://appstoreconnect.apple.com)
2. Click **My Apps** > **+** > **New App**
3. Fill in:
   - **Platform**: iOS
   - **Name**: `BF Ops`
   - **Primary Language**: English (U.S.)
   - **Bundle ID**: Select `com.britishfeed.ops`
   - **SKU**: `bf-ops-001`
   - **User Access**: Full Access

### App Information

Fill in these fields:
- **Subtitle**: `Feed & Supply Operations`
- **Category**: Business
- **Secondary Category**: Productivity
- **Content Rights**: Check "This app does not contain, show, or access third-party content"
- **Age Rating**: Fill out the questionnaire (most answers will be "None")

### Screenshots (Required)

You need screenshots for at minimum:
- **6.7" iPhone** (iPhone 15 Pro Max) — 1290 x 2796 pixels
- **6.5" iPhone** (iPhone 11 Pro Max) — 1242 x 2688 pixels

**How to take them:**
1. In Xcode, use the Simulator (not your physical phone)
2. Select iPhone 15 Pro Max as the simulator device
3. Run the app (Cmd + R)
4. Log in and navigate to each key screen
5. Press **Cmd + S** in the simulator to save a screenshot

You need **at least 3 screenshots** showing:
1. The login screen or module picker
2. The logistics/route view
3. The inventory dashboard

### App Description

```
BF Ops is the internal operations platform for British Feed & Supplies. 
Manage deliveries, routes, inventory, and customer relationships from 
your iPhone.

Features:
- Route planning and optimization with real-time tracking
- Inventory management with stock counts and transfers
- Order management and scheduling
- Customer relationship management
- Driver route sheets and packing lists
- Role-based access control for your team
```

### Privacy Policy

Apple requires a privacy policy URL. Create a simple one at your website or use a free generator. It should state:
- What data you collect (email, name for login)
- How you use it (internal business operations only)
- No data is shared with third parties
- No tracking or advertising

### Review Notes (Important!)

In the "Notes for Review" section, provide Apple with:

```
This is a private internal business application for British Feed & Supplies 
employees. It requires a company-issued login to access.

Demo credentials for review:
Email: [create a demo account for Apple]
Password: [demo password]

The app manages internal logistics, inventory, and customer operations.
It is not intended for public consumer use.
```

## Step 8: Create an Archive & Upload

1. In Xcode, set the device to **Any iOS Device (arm64)** (not a specific phone/simulator)
2. Go to **Product > Archive**
3. Wait for the build to complete (1-3 minutes)
4. The Organizer window opens — click **Distribute App**
5. Select **App Store Connect**
6. Click **Upload**
7. Wait for processing (5-15 minutes)

## Step 9: Submit for Review

1. Back in App Store Connect, go to your app
2. Under **Build**, select the build you just uploaded
3. Fill in all remaining required fields
4. Click **Add for Review**
5. Click **Submit to App Review**

Apple's review typically takes **1-3 business days**. They may come back with questions — check your email.

---

## How the App Works

The app is configured as a **remote URL app** — the Capacitor shell loads `https://bf-ops.pages.dev` inside a native WebView. This means:

- **Updates are instant** — when you deploy changes to Cloudflare Pages, the app gets them on next launch (no App Store update needed)
- **No local data storage** — everything goes through the Cloudflare API
- **Works offline** for cached pages (service worker handles this)

### If You Want Bundled Mode (No Internet Required)

Edit `capacitor.config.ts` and remove the `server` block:

```typescript
// Comment out or remove this:
// server: {
//   url: 'https://bf-ops.pages.dev',
//   cleartext: false,
// },
```

Then run `npm run cap:build` — the web app will be bundled inside the iOS app. But you'll need to submit an App Store update for every code change.

---

## Updating the App Later

### For Web-Only Changes (most changes)
Just deploy to Cloudflare Pages as usual:
```bash
npm run deploy
```
The iOS app automatically loads the latest version. No App Store update needed.

### For Native Changes (new plugins, config changes)
```bash
git pull
npm install
npm run cap:build
# Open Xcode, archive, and upload
npx cap open ios
```

### For App Store Updates (version bump, metadata)
1. Update the version in Xcode: App target > General > Version
2. Archive and upload
3. Submit for review in App Store Connect

---

## Common Issues

| Issue | Solution |
|-------|----------|
| "No signing certificate" | Xcode > Settings > Accounts > add your Apple ID |
| "Pod install failed" | Run `sudo gem install cocoapods` then `cd ios/App && pod install` |
| White screen on launch | Check that `https://bf-ops.pages.dev` is accessible |
| App rejected by Apple | Make sure you provided demo login credentials in review notes |
| "Untrusted developer" on iPhone | Settings > General > VPN & Device Management > Trust |

---

## Project Structure

```
bf-ops/
├── capacitor.config.ts      # Capacitor configuration (app ID, plugins, server URL)
├── ios/                      # Native Xcode project (generated)
│   └── App/
│       ├── App.xcodeproj     # Xcode project file
│       ├── App.xcworkspace   # Xcode workspace (open this one!)
│       ├── Podfile           # CocoaPods dependencies
│       └── App/
│           ├── AppDelegate.swift
│           ├── Assets.xcassets/  # App icon + splash screen
│           └── Info.plist        # iOS app configuration
├── public/static/
│   ├── capacitor-init.js     # Native bridge initialization
│   ├── sw.js                 # Service worker for caching
│   ├── manifest.json         # PWA manifest
│   └── icons/                # All app icon sizes
└── src/index.tsx             # Hono server with PWA meta tags
```
