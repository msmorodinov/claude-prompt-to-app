#!/usr/bin/env bash
# One-time script to download OFL/Apache-licensed fonts into backend/assets/fonts/.
# Run once from project root: bash scripts/fetch-fonts.sh
# Licenses: Unbounded (OFL), Montserrat (OFL), JetBrains Mono (OFL), Noto Color Emoji (OFL)
set -euo pipefail

DEST="$(dirname "$0")/../backend/assets/fonts"
mkdir -p "$DEST"

UA="Mozilla/5.0 (compatible; font-fetcher/1.0)"

download() {
  local url="$1" file="$2"
  if [ -f "$DEST/$file" ]; then
    echo "  [skip] $file already exists"
    return
  fi
  echo "  Downloading $file..."
  curl -fsSL -A "$UA" -o "$DEST/$file" "$url"
}

echo "=== Downloading fonts ==="

# Unbounded (OFL) — weights: 400, 700, 900
download "https://fonts.gstatic.com/s/unbounded/v6/d3b_oalnaIAkFBDSyfSjTjNJ.woff2" "Unbounded-Regular.woff2"
download "https://fonts.gstatic.com/s/unbounded/v6/d3b5oalnaIAkFBDSyfSjTjNJ.woff2" "Unbounded-Bold.woff2"
download "https://fonts.gstatic.com/s/unbounded/v6/d3b4oalnaIAkFBDSyfSjTjNJ.woff2" "Unbounded-Black.woff2"

# Montserrat (OFL) — weights: 400, 500, 700
download "https://fonts.gstatic.com/s/montserrat/v26/JTUSjIg1_i6t8kCHKm459Wlhyw.woff2" "Montserrat-Regular.woff2"
download "https://fonts.gstatic.com/s/montserrat/v26/JTUSjIg1_i6t8kCHKm459W1hyw.woff2" "Montserrat-Medium.woff2"
download "https://fonts.gstatic.com/s/montserrat/v26/JTUSjIg1_i6t8kCHKm459WlhyvA.woff2" "Montserrat-Bold.woff2"

# JetBrains Mono (OFL) — weights: 400, 700
download "https://fonts.gstatic.com/s/jetbrainsmono/v18/tDbY2o-flEEny0FZhsfKu5WU4zr3E_BX0PnT8RD8yKxTOlOV.woff2" "JetBrainsMono-Regular.woff2"
download "https://fonts.gstatic.com/s/jetbrainsmono/v18/tDbY2o-flEEny0FZhsfKu5WU4zr3E_BX0PnT8RD8MKhTOlOV.woff2" "JetBrainsMono-Bold.woff2"

# Noto Color Emoji (OFL) — .ttf (woff2 not widely available from gstatic)
download "https://fonts.gstatic.com/s/notocoloremoji/v25/Yq6P-KqIXTD0t4D9z1ESnKM3-HpFabsE4tq3luCC7p-aXxcn.woff2" "NotoColorEmoji.woff2"

echo ""
echo "=== Font files in $DEST ==="
ls -lh "$DEST"
