#!/bin/bash
cd "$(dirname "$0")" || exit 1
echo "================================================"
echo "  swang.studio — Watch This Push"
echo "================================================"
echo ""
echo "Repo: $(pwd)"
echo ""

# Nuke any stale lock files left behind by a crashed git or a sandbox that
# couldn't clean up after itself. This is the reason the previous push
# script was getting stuck.
LOCKS=$(find .git -name "*.lock" -type f 2>/dev/null)
if [ -n "$LOCKS" ]; then
  echo "Clearing stale git lock files:"
  echo "$LOCKS" | sed 's/^/  /'
  find .git -name "*.lock" -type f -exec rm -f {} \; 2>/dev/null
  echo ""
fi

# Always tag commits as Mason Swang <hello@swang.studio> no matter what the
# machine's default git identity is.
GIT_AUTHOR="Mason Swang"
GIT_EMAIL="hello@swang.studio"

# Stage + commit everything on disk that isn't committed yet, so one
# double-click ships whatever state the folder is in.
if [ -n "$(git status --porcelain)" ]; then
  echo "Uncommitted changes detected — staging & committing:"
  git status --short
  echo ""
  git add -A
  git -c user.email="$GIT_EMAIL" -c user.name="$GIT_AUTHOR" \
      commit -m "feat: site revisions"
  echo ""
fi

echo "Local commits ahead of origin/main:"
git log --oneline origin/main..HEAD 2>/dev/null
echo ""

echo "Pushing to origin/main..."
git push origin main
RC=$?
echo ""

if [ $RC -eq 0 ]; then
  echo "================================================"
  echo "  DONE — pushed."
  echo "  Vercel will auto-deploy in ~60 seconds."
  echo "  Live: https://www.swang.studio"
  echo "================================================"
else
  echo "================================================"
  echo "  Push failed (exit $RC)."
  echo "  If it asked for credentials, paste your GitHub"
  echo "  username + a Personal Access Token, then re-run."
  echo "================================================"
fi

echo ""
echo "Press any key to close this window."
read -n 1 -s
