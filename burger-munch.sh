#!/usr/bin/env bash
# Opens Burger Munch in its own window on macOS or Linux, with no browser
# chrome around it. Needs nothing installed beyond a Chromium-based browser.
set -e
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
URL="file://$DIR/index.html"

for CANDIDATE in \
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
  "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge" \
  "$(command -v google-chrome || true)" \
  "$(command -v chromium || true)" \
  "$(command -v chromium-browser || true)" \
  "$(command -v microsoft-edge || true)"
do
  if [ -n "$CANDIDATE" ] && [ -x "$CANDIDATE" ]; then
    exec "$CANDIDATE" --app="$URL" --window-size=900,1010 >/dev/null 2>&1 &
    exit 0
  fi
done

echo "No Chromium-based browser found - opening however this system can."
( command -v xdg-open >/dev/null && xdg-open "$URL" ) || open "$URL"
