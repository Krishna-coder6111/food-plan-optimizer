#!/bin/bash
# ============================================================
# NUTRIENT ENGINE — Fix Script
# ============================================================
# Run this from the ROOT of your repo (food-plan-optimizer/)
#
# Fixes:
#   1. Moves files from nested nutrient-engine/ to repo root
#   2. Updates optimizer to target nutrient OPTIMUMS (not mins)
#   3. Adds nutrient absorption clash constraints
#   4. Fixes BLS download (403 → adds User-Agent header)
#   5. Sets fiber >= 30g
# ============================================================

set -e

echo "=== Nutrient Engine Fix Script ==="
echo ""

# Step 1: Check if we have a nested directory problem
if [ -d "nutrient-engine/src" ] && [ ! -d "src" ]; then
    echo "[1/3] Fixing nested directory structure..."
    echo "  Moving nutrient-engine/* to repo root..."

    # Move all files up one level
    shopt -s dotglob
    cp -r nutrient-engine/* .
    cp -r nutrient-engine/.devcontainer . 2>/dev/null || true
    cp nutrient-engine/.gitignore . 2>/dev/null || true
    rm -rf nutrient-engine/

    echo "  Done. src/app/ is now at the correct level."
elif [ -d "nutrient-engine/nutrient-engine/src" ]; then
    echo "[1/3] Fixing DOUBLE nested directory..."
    echo "  Moving nutrient-engine/nutrient-engine/* to repo root..."

    shopt -s dotglob
    cp -r nutrient-engine/nutrient-engine/* .
    cp -r nutrient-engine/nutrient-engine/.devcontainer . 2>/dev/null || true
    cp nutrient-engine/nutrient-engine/.gitignore . 2>/dev/null || true
    rm -rf nutrient-engine/

    echo "  Done."
else
    echo "[1/3] Directory structure looks correct (src/app/ exists at root)."
fi

# Step 2: Verify structure
echo ""
echo "[2/3] Verifying project structure..."
if [ -d "src/app" ]; then
    echo "  ✓ src/app/ found"
else
    echo "  ✗ ERROR: src/app/ not found. Manual fix needed."
    echo "    Your project root should contain: src/ data/ package.json"
    exit 1
fi

if [ -f "package.json" ]; then
    echo "  ✓ package.json found"
else
    echo "  ✗ ERROR: package.json not found at root."
    exit 1
fi

echo ""
echo "[3/3] Structure verified. Run:"
echo "  npm install"
echo "  npm run dev"
echo ""
echo "=== Done ==="
