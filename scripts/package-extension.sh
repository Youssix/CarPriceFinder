#!/bin/bash
# Package Carlytics Chrome extension for beta testers
# Usage: ./scripts/package-extension.sh

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
OUTPUT_DIR="$PROJECT_DIR/dist"
ZIP_NAME="carlytics-extension-beta.zip"

echo "📦 Packaging Carlytics extension..."

# Create dist directory
mkdir -p "$OUTPUT_DIR"

# Remove old package if exists
rm -f "$OUTPUT_DIR/$ZIP_NAME"

# Create ZIP with only extension files
cd "$PROJECT_DIR"
zip -r "$OUTPUT_DIR/$ZIP_NAME" \
  manifest.json \
  inject.js \
  intercept.js \
  content-bridge.js \
  popup.html \
  popup.js \
  -x "*.DS_Store"

echo ""
echo "✅ Extension packaged: $OUTPUT_DIR/$ZIP_NAME"
echo "📏 Size: $(du -h "$OUTPUT_DIR/$ZIP_NAME" | cut -f1)"
echo ""
echo "Fichiers inclus:"
unzip -l "$OUTPUT_DIR/$ZIP_NAME" | grep -E "^\s+[0-9]" | awk '{print "  - " $4}'
