#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
LABEL="com.local.cyberagent-snar-checker"
PLIST_SRC="$ROOT_DIR/plist/$LABEL.plist"
PLIST_DST="$HOME/Library/LaunchAgents/$LABEL.plist"
NODE_PATH="$(command -v node || true)"

if [[ -z "$NODE_PATH" ]]; then
  echo "node が見つかりません。先に Node.js をインストールしてください。"
  exit 1
fi

mkdir -p "$HOME/Library/LaunchAgents" "$ROOT_DIR/logs"

cat > "$PLIST_SRC" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN"
  "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
  <dict>
    <key>Label</key>
    <string>$LABEL</string>

    <key>WorkingDirectory</key>
    <string>$ROOT_DIR</string>

    <key>ProgramArguments</key>
    <array>
      <string>$NODE_PATH</string>
      <string>$ROOT_DIR/src/check.js</string>
    </array>

    <key>StartInterval</key>
    <integer>900</integer>

    <key>RunAtLoad</key>
    <true/>

    <key>StandardOutPath</key>
    <string>$ROOT_DIR/logs/cyberagent-snar-checker.out.log</string>

    <key>StandardErrorPath</key>
    <string>$ROOT_DIR/logs/cyberagent-snar-checker.err.log</string>
  </dict>
</plist>
PLIST

cp "$PLIST_SRC" "$PLIST_DST"
launchctl unload "$PLIST_DST" 2>/dev/null || true
launchctl load "$PLIST_DST"
launchctl start "$LABEL" || true

echo "installed: $PLIST_DST"
echo "stdout: $ROOT_DIR/logs/cyberagent-snar-checker.out.log"
echo "stderr: $ROOT_DIR/logs/cyberagent-snar-checker.err.log"
