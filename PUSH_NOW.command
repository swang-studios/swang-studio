#!/bin/bash
cd "$(dirname "$0")" || exit 1

# One-shot push using a fresh PAT. This script self-deletes after running.
TOKEN="ghp_uLvjP7tw3RboeqmRqFm3oGHEnm540V40aCX4"
REPO_URL="https://x-access-token:${TOKEN}@github.com/swang-studios/swang-studio.git"

echo "============================================="
echo "  swang.studio — Push with PAT (one-shot)"
echo "============================================="
echo "Repo: $(pwd)"
echo ""

# Clear stale locks
find .git -name "*.lock" -type f -exec rm -f {} \; 2>/dev/null

# Stage anything still uncommitted (shouldn't be much — commit e7f5d30 already exists)
if [ -n "$(git status --porcelain)" ]; then
  echo "Uncommitted changes — staging & committing:"
  git status --short
  git add -A
  git -c user.email="hello@swang.studio" -c user.name="Mason Swang" \
      commit -m "feat: site revisions (pre-push)" 2>&1 | tail -5
  echo ""
fi

echo "Local commits ahead of origin/main:"
git log --oneline origin/main..HEAD 2>/dev/null
echo ""
echo "Pushing to origin/main via PAT..."
git push "$REPO_URL" main
RC=$?

# Save credentials to macOS keychain so future PUSH_TO_LIVE.command works
# without needing this script again.
if [ $RC -eq 0 ]; then
  git config --global credential.helper osxkeychain 2>/dev/null
  printf "protocol=https\nhost=github.com\nusername=x-access-token\npassword=%s\n\n" "$TOKEN" | git credential-osxkeychain store 2>/dev/null
  echo ""
  echo "(Saved token to macOS keychain — future PUSH_TO_LIVE.command runs"
  echo " will use it automatically until the token expires.)"
fi

# Self-delete so the token doesn't sit on disk
SCRIPT_PATH="$0"
rm -- "$SCRIPT_PATH" 2>/dev/null

echo ""
echo "============================================="
if [ $RC -eq 0 ]; then
  echo "  DONE — pushed."
  echo "  Vercel deploys in ~60 seconds."
  echo "  Live: https://swang.studio"
else
  echo "  Push failed (exit $RC)."
fi
echo "============================================="
echo ""
echo "(This script just self-deleted for security.)"
echo ""
echo "Press any key to close."
read -n 1 -s
