#!/usr/bin/env bash
set -euo pipefail

# Release script for Thicket desktop app
# Usage: ./scripts/release.sh [patch|minor|major] or ./scripts/release.sh <version>
# Examples:
#   ./scripts/release.sh patch     -> 0.1.2 => 0.1.3
#   ./scripts/release.sh minor     -> 0.1.2 => 0.2.0
#   ./scripts/release.sh major     -> 0.1.2 => 1.0.0
#   ./scripts/release.sh 2.0.0     -> sets exact version 2.0.0

BUMP="${1:-patch}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PKG="$ROOT/frontend/package.json"

# Ensure we're on main
BRANCH="$(git -C "$ROOT" rev-parse --abbrev-ref HEAD)"
if [[ "$BRANCH" != "main" ]]; then
  echo "Error: must be on 'main' branch (currently on '$BRANCH')" >&2
  exit 1
fi

# Ensure working tree is clean
if ! git -C "$ROOT" diff --quiet || ! git -C "$ROOT" diff --cached --quiet; then
  echo "Error: working tree has uncommitted changes. Commit or stash them first." >&2
  echo ""
  git -C "$ROOT" status --short
  exit 1
fi

# Ensure we're up to date with remote
git -C "$ROOT" fetch origin main --quiet
LOCAL="$(git -C "$ROOT" rev-parse HEAD)"
REMOTE="$(git -C "$ROOT" rev-parse origin/main)"
if [[ "$LOCAL" != "$REMOTE" ]]; then
  echo "Error: local main is not up to date with origin/main. Pull first." >&2
  exit 1
fi

# Get current version
CURRENT="$(node -p "require('$PKG').version")"

# Calculate new version
if [[ "$BUMP" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
  NEW_VERSION="$BUMP"
elif [[ "$BUMP" == "patch" || "$BUMP" == "minor" || "$BUMP" == "major" ]]; then
  IFS='.' read -r MAJOR MINOR PATCH <<< "$CURRENT"
  case "$BUMP" in
    patch) PATCH=$((PATCH + 1)) ;;
    minor) MINOR=$((MINOR + 1)); PATCH=0 ;;
    major) MAJOR=$((MAJOR + 1)); MINOR=0; PATCH=0 ;;
  esac
  NEW_VERSION="$MAJOR.$MINOR.$PATCH"
else
  echo "Error: invalid bump type '$BUMP'. Use patch, minor, major, or a semver like 1.2.3" >&2
  exit 1
fi

TAG="v$NEW_VERSION"

# Check tag doesn't already exist
if git -C "$ROOT" rev-parse "$TAG" &>/dev/null; then
  echo "Error: tag '$TAG' already exists" >&2
  exit 1
fi

echo "Releasing: $CURRENT -> $NEW_VERSION ($TAG)"
echo ""

# Update version in package.json and package-lock.json (without npm's auto-commit/tag)
cd "$ROOT/frontend"
npm version "$NEW_VERSION" --no-git-tag-version --allow-same-version
cd "$ROOT"

# Commit, tag, and push
git add frontend/package.json frontend/package-lock.json
git commit -m "release: $TAG"
git tag -a "$TAG" -m "Release $TAG"

echo ""
echo "Pushing commit and tag to origin..."
git push origin main
git push origin "$TAG"

echo ""
echo "Release $TAG pushed! GitHub Actions will now build the desktop apps."
echo "Monitor the build: gh run list --workflow=release.yml"
echo "Once complete, publish the draft release: gh release list"
