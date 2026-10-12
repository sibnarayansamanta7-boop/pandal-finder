#!/usr/bin/env bash
set -e
cd "$(dirname "$0")"
if ! command -v npm >/dev/null 2>&1; then
  echo "Install Node.js 20 or newer from https://nodejs.org/ first."
  exit 1
fi
if [ ! -d node_modules ]; then
  echo "First run: installing dependencies (internet required)."
  npm install
fi
npm run dev
