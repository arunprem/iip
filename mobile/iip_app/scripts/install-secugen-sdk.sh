#!/usr/bin/env bash
# Copy SecuGen FDx SDK v4.22 into the Flutter Android app.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
APP_ANDROID="$SCRIPT_DIR/../android/app"
SDK_ROOT="${SECUGEN_SDK_ROOT:-$SCRIPT_DIR/../../../FDX_SDK_PRO_FD_Android_Studio_4_22}"
DEMO_APP="$SDK_ROOT/SecuGenUSBFDDist/app"

if [[ ! -f "$SDK_ROOT/FDxSDKProFDAndroid.jar" ]]; then
  echo "ERROR: SecuGen SDK not found at: $SDK_ROOT"
  echo "Set SECUGEN_SDK_ROOT to your extracted FDX_SDK_PRO_FD_Android_Studio_* folder."
  exit 1
fi

mkdir -p "$APP_ANDROID/libs"
mkdir -p "$APP_ANDROID/src/main/jniLibs"

echo "==> Copying FDxSDKProFDAndroid.jar"
cp "$SDK_ROOT/FDxSDKProFDAndroid.jar" "$APP_ANDROID/libs/"

echo "==> Copying native libraries (jniLibs)"
rm -rf "$APP_ANDROID/src/main/jniLibs/"*
cp -R "$DEMO_APP/src/main/jniLibs/"* "$APP_ANDROID/src/main/jniLibs/"

echo "==> Copying USB device filter (all SecuGen PIDs)"
cp "$DEMO_APP/src/main/res/xml/device_filter.xml" \
  "$APP_ANDROID/src/main/res/xml/secugen_usb_device_filter.xml"

echo ""
echo "Done. SecuGen SDK installed into mobile/iip_app/android/app"
echo "Next:"
echo "  cd mobile/iip_app"
echo "  flutter run --dart-define=API_BASE_URL=http://YOUR_SERVER:8010"
echo ""
echo "Optional: test SecuGen demo APK on phone first:"
echo "  adb install \"$SDK_ROOT/SecuGenUSBFDAndroidStudio.apk\""
