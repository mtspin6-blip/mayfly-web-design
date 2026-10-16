#!/usr/bin/env bash
# One commit for everything a run touched (post, back-links, queue, backlog, logs, state), then push with retries.
# Because it is a single commit, the published post and the run state can never be separated, and nothing is left
# unstaged to break the rebase. If the push still fails after 3 tries this exits non-zero so the job fails loudly.
# usage: ci-push.sh "commit message"
set -euo pipefail

MSG="${1:-blog-engine: record run}"
git config user.name "mayfly-blog-engine"
git config user.email "blog-engine@users.noreply.github.com"

git add -A
if git diff --cached --quiet; then
  echo "ci-push: nothing changed, nothing to push"
  exit 0
fi
git commit -q -m "$MSG"
git --no-pager show --stat --oneline HEAD | head -30

for attempt in 1 2 3; do
  # --autostash: any stray untracked/unstaged leftover can't make the rebase refuse (the 2026-10-12 failure).
  if git pull --rebase --autostash origin main && git push origin HEAD:main; then
    echo "ci-push: pushed on attempt $attempt ($(git rev-parse --short HEAD))"
    exit 0
  fi
  echo "ci-push: attempt $attempt failed" >&2
  git rebase --abort 2>/dev/null || true
  sleep $((attempt * 8))
done

echo "::error::ci-push: could not push after 3 attempts; the commit exists only on this runner" >&2
exit 1
