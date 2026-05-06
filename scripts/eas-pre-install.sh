#!/usr/bin/env bash
set -euo pipefail

if [ "${EAS_BUILD_PLATFORM:-}" = "android" ]; then
  if [ -n "${GOOGLE_SERVICES_JSON:-}" ] && [ -f "$GOOGLE_SERVICES_JSON" ]; then
    mkdir -p android/app
    cp "$GOOGLE_SERVICES_JSON" android/app/google-services.json
    echo "[eas-pre-install] copied GOOGLE_SERVICES_JSON -> android/app/google-services.json"
  else
    echo "[eas-pre-install] WARN: GOOGLE_SERVICES_JSON env not set or file missing" >&2
  fi
fi

if [ "${EAS_BUILD_PLATFORM:-}" = "ios" ]; then
  bash scripts/ensure-cocoapods.sh
  if [ -n "${GOOGLE_SERVICE_INFO_PLIST:-}" ] && [ -f "$GOOGLE_SERVICE_INFO_PLIST" ]; then
    mkdir -p ios/Hedwig
    cp "$GOOGLE_SERVICE_INFO_PLIST" ios/Hedwig/GoogleService-Info.plist
    echo "[eas-pre-install] copied GOOGLE_SERVICE_INFO_PLIST -> ios/Hedwig/GoogleService-Info.plist"
  fi
fi
