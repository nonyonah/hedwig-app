#!/usr/bin/env bash
set -euo pipefail

if [ "${EAS_BUILD_PLATFORM:-}" != "ios" ]; then
  exit 0
fi

echo "[ensure-cocoapods] checking CocoaPods availability"

publish_pod_binary() {
  local pod_path="$1"

  for target_dir in /usr/local/bin /opt/homebrew/bin; do
    if [ ! -d "$target_dir" ]; then
      continue
    fi
    if [ "$target_dir/pod" = "$pod_path" ]; then
      continue
    fi
    if ln -sf "$pod_path" "$target_dir/pod" 2>/dev/null; then
      echo "[ensure-cocoapods] linked pod -> $target_dir/pod"
      continue
    fi
    if sudo ln -sf "$pod_path" "$target_dir/pod" 2>/dev/null; then
      echo "[ensure-cocoapods] linked pod -> $target_dir/pod (sudo)"
    fi
  done
}

resolve_and_publish() {
  local resolved
  resolved="$(command -v pod || true)"
  if [ -z "$resolved" ]; then
    return 1
  fi
  echo "[ensure-cocoapods] pod resolved to $resolved"
  pod --version || true
  publish_pod_binary "$resolved"
}

if resolve_and_publish; then
  exit 0
fi

for candidate in \
  /opt/homebrew/bin/pod \
  /usr/local/bin/pod \
  /usr/bin/pod \
  "$HOME"/.gems/*/bin/pod \
  "$HOME"/.gem/ruby/*/bin/pod \
  /opt/homebrew/lib/ruby/gems/*/bin/pod \
  /usr/local/lib/ruby/gems/*/bin/pod; do
  if [ -x "$candidate" ]; then
    echo "[ensure-cocoapods] candidate pod at $candidate"
    publish_pod_binary "$candidate"
    if resolve_and_publish; then
      exit 0
    fi
  fi
done

echo "[ensure-cocoapods] pod not found; installing CocoaPods 1.16.2"
gem install cocoapods -v 1.16.2 --no-document

if ! command -v pod >/dev/null 2>&1; then
  ruby_version="$(ruby -e 'print RUBY_VERSION[/^\d+\.\d+/]')"
  export PATH="$HOME/.gem/ruby/${ruby_version}.0/bin:$PATH"
fi

if ! resolve_and_publish; then
  echo "[ensure-cocoapods] failed to resolve pod after install" >&2
  exit 1
fi
