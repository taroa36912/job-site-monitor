#!/usr/bin/env bash
set -euo pipefail

PROJECT_DIR="$HOME/aflac-axol-checker"
LABEL="com.local.aflac-axol-checker"
PLIST_SRC="$PROJECT_DIR/plist/${LABEL}.plist.template"
PLIST_DST="$HOME/Library/LaunchAgents/${LABEL}.plist"
NODE_PATH="$(command -v node)"

if [[ -z "$NODE_PATH" ]]; then
  echo "node が見つかりません。Homebrew等でNode.jsをインストールしてください。" >&2
  exit 1
fi

mkdir -p "$HOME/Library/LaunchAgents" "$PROJECT_DIR/logs"

sed \
  -e "s#__PROJECT_DIR__#${PROJECT_DIR}#g" \
  -e "s#__NODE_PATH__#${NODE_PATH}#g" \
  "$PLIST_SRC" > "$PLIST_DST"

launchctl unload "$PLIST_DST" 2>/dev/null || true
launchctl load "$PLIST_DST"
launchctl start "$LABEL"

echo "installed: $PLIST_DST"
echo "log: tail -f $PROJECT_DIR/logs/aflac-axol-checker.out.log"
