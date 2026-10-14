#!/usr/bin/env bash
set -euo pipefail
PROJECT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
echo "[]" > "$PROJECT_DIR/data/notified_slots.json"
echo "reset: $PROJECT_DIR/data/notified_slots.json"
