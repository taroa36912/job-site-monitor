#!/usr/bin/env bash
set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
NODE_PATH="$(command -v node)"
LABEL="com.local.metlife-axol-checker"
TEMPLATE="$PROJECT_DIR/plist/$LABEL.plist.template"
PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"

mkdir -p "$HOME/Library/LaunchAgents" "$PROJECT_DIR/logs"

sed \
  -e "s#__PROJECT_DIR__#$PROJECT_DIR#g" \
  -e "s#__NODE_PATH__#$NODE_PATH#g" \
  "$TEMPLATE" > "$PLIST"

launchctl unload "$PLIST" 2>/dev/null || true
launchctl load "$PLIST"
launchctl start "$LABEL"

echo "installed: $PLIST"
echo "node: $NODE_PATH"
echo "logs: $PROJECT_DIR/logs"
echo "check logs with: tail -f '$PROJECT_DIR/logs/metlife-axol-checker.out.log'"
