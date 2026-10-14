#!/usr/bin/env bash
set -euo pipefail
ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
echo "[]" > "$ROOT_DIR/data/notified_slots.json"
echo "reset: $ROOT_DIR/data/notified_slots.json"
