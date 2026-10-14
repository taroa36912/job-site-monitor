#!/usr/bin/env bash
set -euo pipefail
PROJECT_DIR="$HOME/aflac-axol-checker"
mkdir -p "$PROJECT_DIR/data"
echo "[]" > "$PROJECT_DIR/data/notified_slots.json"
echo "reset: $PROJECT_DIR/data/notified_slots.json"
