#!/bin/bash
cd "$(dirname "$0")" || exit 1
echo "================================================"
echo "  swang.studio — Ship revisions"
echo "================================================"
echo ""
echo "Repo: $(pwd)"

# Clear any stale lock files the sandbox (or a crashed git) left behind.
LOCKS=$(find .git -name "*.lock" -type f 2>/dev/null)
if [ -n "$LOCKS" ]; then
  echo "Clearing stale git lock files:"
  echo "$LOCKS" | sed 's/^/  /'
  find .git -name "*.lock" -type f -exec rm -f {} \; 2>/dev/null
fi

# Stage + commit anything on disk that isn't committed yet, so one
# double-click always ships whatever's in the folder.
if [ -n "$(git status --porcelain)" ]; then
  echo ""
  echo "Uncommitted changes detected — staging & committing:"
  git status --short
  git add -A
  git -c user.email="hello@swang.studio" -c user.name="Mason Swang" \
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
  echo "DONE — pushed. Vercel will auto-deploy in ~60 seconds."
  echo "Live: https://www.swang.studio"
else
  echo "Push failed (exit $RC). If it asked for credentials, paste"
  echo "your GitHub username and a Personal Access Token, then re-run."
fi
echo ""
echo "Press any key to close this window."
read -n 1 -s
