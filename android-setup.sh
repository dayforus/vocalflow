#!/bin/bash
# VocalFlow — Android APK Setup Script
# Run this once from the project root: bash android-setup.sh

set -e
cd "$(dirname "$0")"

echo "==> 1. Installing dependencies..."
npm install

echo "==> 2. Building web app..."
npm run build

echo "==> 3. Initialising Capacitor (skip if already done)..."
npx cap init VocalFlow com.vocalflow.app --web-dir dist 2>/dev/null || true

echo "==> 4. Adding Android platform (skip if already done)..."
npx cap add android 2>/dev/null || true

echo "==> 5. Syncing web build to Android..."
npx cap sync android

echo ""
echo "======================================================"
echo "  IMPORTANT: Add microphone permission to AndroidManifest"
echo "======================================================"
echo ""
echo "Open this file in a text editor:"
echo "  android/app/src/main/AndroidManifest.xml"
echo ""
echo "Add these 2 lines BEFORE the <application> tag:"
echo ""
echo '  <uses-permission android:name="android.permission.RECORD_AUDIO" />'
echo '  <uses-feature android:name="android.hardware.microphone" android:required="true" />'
echo ""
echo "======================================================"
echo "  Build the APK"
echo "======================================================"
echo ""
echo "Option A — Android Studio (recommended):"
echo "  npx cap open android"
echo "  Then: Build > Build Bundle(s) / APK(s) > Build APK(s)"
echo ""
echo "Option B — Command line (needs Android SDK in PATH):"
echo "  cd android && ./gradlew assembleDebug"
echo "  APK will be at: android/app/build/outputs/apk/debug/app-debug.apk"
echo ""
echo "Done!"
