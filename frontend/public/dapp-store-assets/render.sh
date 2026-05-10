#!/usr/bin/env bash
#
# Convert the Solana dApp Store SVG assets to PNG at the exact pixel
# dimensions the publisher portal expects.
#
# Tries `rsvg-convert` (cleanest output, install via `brew install librsvg`)
# first, and falls back to headless Chrome on macOS — which is preinstalled
# at `/Applications/Google Chrome.app` if you have Chrome.
#
# Run from anywhere — the script cd's to its own directory.

set -e
cd "$(dirname "$0")"

render_with_rsvg() {
  rsvg-convert -w 1200 -h 600  banner.svg         -o banner.png
  rsvg-convert -w 1200 -h 1200 editor-choice.svg  -o editor-choice.png
}

render_with_chrome() {
  local chrome
  if [[ -x "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" ]]; then
    chrome="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
  elif [[ -x "/Applications/Chromium.app/Contents/MacOS/Chromium" ]]; then
    chrome="/Applications/Chromium.app/Contents/MacOS/Chromium"
  else
    echo "Neither Chrome nor Chromium found — install one or run \`brew install librsvg\`."
    exit 1
  fi

  "$chrome" --headless --disable-gpu --no-sandbox \
    --window-size=1200,600 \
    --screenshot="$PWD/banner.png" \
    "file://$PWD/banner.svg"

  "$chrome" --headless --disable-gpu --no-sandbox \
    --window-size=1200,1200 \
    --screenshot="$PWD/editor-choice.png" \
    "file://$PWD/editor-choice.svg"
}

if command -v rsvg-convert &> /dev/null; then
  render_with_rsvg
else
  echo "rsvg-convert not found — falling back to headless Chrome."
  echo "(For better output run: brew install librsvg)"
  render_with_chrome
fi

echo ""
echo "✓ banner.png         (1200x600)"
echo "✓ editor-choice.png  (1200x1200)"
