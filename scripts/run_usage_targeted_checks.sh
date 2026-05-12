#!/usr/bin/env bash

set -euo pipefail

echo "[usage-check] validating monitoring and Usage Service TypeScript contracts"
npm run type-check
