#!/usr/bin/env bash

set -euo pipefail

echo "[usage-check] testing Kiro and monitoring v8 contracts"
bun test tests/forkFeaturesV8.test.ts

echo "[usage-check] validating monitoring and Usage Service TypeScript contracts"
bun run type-check
