#!/usr/bin/env bash
cd "$(dirname "$0")"

export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && source "$NVM_DIR/nvm.sh" && nvm use default --silent 2>/dev/null

exec ./node_modules/electron/dist/electron . --no-sandbox
