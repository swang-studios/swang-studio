#!/bin/bash
set -e
cd "$(dirname "$0")"
echo "▶ Clearing stale git locks…"
rm -f .git/index.lock .git/HEAD.lock
echo "▶ Staging changes…"
git add -A
echo "▶ Committing…"
git commit -m "Gallery reorder: houses + putting greens lead, cars/other middle, all graphics + thumbs grouped at bottom" || echo "(nothing new to commit)"
echo "▶ Pushing to origin…"
git push
echo ""
echo "✅ Done. Press any key to close."
read -n 1 -s
