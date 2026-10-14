#!/usr/bin/env bash
set -euo pipefail

LABEL="com.local.metlife-axol-checker"
PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"

launchctl unload "$PLIST" 2>/dev/null || true
rm -f "$PLIST"

echo "uninstalled: $LABEL"
echo "Wake schedule remains if already registered. Check with: pmset -g sched"
echo "Cancel all pmset schedules only if safe: sudo pmset schedule cancelall"
