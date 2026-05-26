#!/bin/bash
cd "$(dirname "$0")" || exit 1

ORIGINAL_URL=$(git remote get-url origin)
SSH_URL="git@github.com:swang-studios/swang-studio.git"

echo "============================================="
echo "  swang.studio — Push (auto-route, no typing)"
echo "============================================="
echo "Repo: $(pwd)"
echo ""

# Clear stale locks (sandbox can't, but you can).
LOCKS=$(find .git -name "*.lock" -type f 2>/dev/null)
if [ -n "$LOCKS" ]; then
  echo "Clearing stale git lock files..."
  echo "$LOCKS" | sed 's/^/  /'
  find .git -name "*.lock" -type f -exec rm -f {} \; 2>/dev/null
  echo ""
fi

# Stage + commit anything still on disk (shouldn't be much since previous
# PUSH_TO_LIVE already committed e7f5d30, but covers re-runs).
if [ -n "$(git status --porcelain)" ]; then
  echo "Uncommitted changes detected — staging & committing:"
  git status --short
  git add -A
  git -c user.email="hello@swang.studio" -c user.name="Mason Swang" \
      commit -m "feat: site revisions (rerun)" 2>&1 | tail -5
  echo ""
fi

echo "Local commits ahead of origin/main:"
git log --oneline origin/main..HEAD 2>/dev/null
echo ""

# ── Try 1: HTTPS via macOS keychain (no interactive prompts) ────────
echo "[1/2] Trying HTTPS push via macOS keychain..."
if GIT_TERMINAL_PROMPT=0 git -c credential.helper=osxkeychain push origin main; then
  RC=0
  ROUTE="HTTPS (osxkeychain)"
else
  RC=1
  echo ""
  echo "    HTTPS push failed (no valid token in keychain)."
  echo ""

  # ── Try 2: SSH ──────────────────────────────────────────────────
  echo "[2/2] Trying SSH push..."
  git remote set-url origin "$SSH_URL"
  if GIT_SSH_COMMAND="ssh -o BatchMode=yes -o StrictHostKeyChecking=accept-new -o ConnectTimeout=10" \
      git push origin main; then
    RC=0
    ROUTE="SSH"
  else
    echo ""
    echo "    SSH push failed (no working SSH key with GitHub access)."
    # Revert URL so HTTPS-based PUSH_TO_LIVE still works later.
    git remote set-url origin "$ORIGINAL_URL"
    RC=1
  fi
fi

echo ""
echo "============================================="
if [ $RC -eq 0 ]; then
  echo "  DONE — pushed via $ROUTE"
  echo "  Vercel will auto-deploy in ~60 seconds."
  echo "  Live: https://swang.studio"
else
  echo "  BOTH ROUTES FAILED"
  echo ""
  echo "  Diagnosis:"
  echo "    - macOS keychain has no valid GitHub token"
  echo "    - No SSH key registered with your GitHub account"
  echo ""
  echo "  Fix paths:"
  echo "    A. Create a Personal Access Token at"
  echo "       https://github.com/settings/tokens (needs keyboard)"
  echo "    B. Add an SSH key — ssh-keygen + paste public key"
  echo "       at https://github.com/settings/keys (needs keyboard)"
fi
echo "============================================="
echo ""
echo "Press any key to close this window."
read -n 1 -s
