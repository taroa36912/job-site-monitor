#!/usr/bin/env bash
set -euo pipefail
LABEL="com.local.baycurrent-e2r-checker"
PLIST_DST="$HOME/Library/LaunchAgents/$LABEL.plist"
launchctl unload "$PLIST_DST" 2>/dev/null || true
rm -f "$PLIST_DST"
echo "uninstalled: $LABEL"
echo "pmset の予約を消す場合は、必要に応じて sudo pmset schedule cancelall を実行してください。"
