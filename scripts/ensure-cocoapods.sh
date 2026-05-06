#!/usr/bin/env bash
set -euo pipefail

if [ "${EAS_BUILD_PLATFORM:-}" != "ios" ]; then
  exit 0
fi

echo "[ensure-cocoapods] checking CocoaPods availability"

if command -v pod >/dev/null 2>&1; then
  echo "[ensure-cocoapods] pod found at $(command -v pod)"
  pod --version || true
  exit 0
fi

for candidate in \
  /opt/homebrew/bin/pod \
  /usr/local/bin/pod \
  /usr/bin/pod \
  "$HOME"/.gem/ruby/*/bin/pod \
  /opt/homebrew/lib/ruby/gems/*/bin/pod \
  /usr/local/lib/ruby/gems/*/bin/pod; do
  if [ -x "$candidate" ]; then
    echo "[ensure-cocoapods] linking pod from $candidate"
    ln -sf "$candidate" /usr/local/bin/pod 2>/dev/null || true
    if command -v pod >/dev/null 2>&1; then
      pod --version || true
      exit 0
    fi
  fi
done

echo "[ensure-cocoapods] pod was not on PATH; installing CocoaPods 1.16.2"
gem install cocoapods -v 1.16.2 --no-document

if ! command -v pod >/dev/null 2>&1; then
  ruby_version="$(ruby -e 'print RUBY_VERSION[/^\d+\.\d+/]')"
  export PATH="$HOME/.gem/ruby/${ruby_version}.0/bin:$PATH"
fi

echo "[ensure-cocoapods] pod resolved to $(command -v pod || echo missing)"
pod --version
