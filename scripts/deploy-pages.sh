#!/usr/bin/env bash
# Builds the app and publishes dist/ to the gh-pages branch, which is what
# GitHub Pages serves from (Pages source: gh-pages, path /, no workflow).
set -euo pipefail

remote="origin"
branch="gh-pages"

repo_root="$(git rev-parse --show-toplevel)"
cd "$repo_root"

pnpm build

main_sha="$(git rev-parse --short HEAD)"
main_subject="$(git log -1 --pretty=%s)"

worktree_dir="$(mktemp -d)"
cleanup() {
  git worktree remove --force "$worktree_dir" >/dev/null 2>&1 || true
  rm -rf "$worktree_dir"
}
trap cleanup EXIT

git fetch "$remote" "$branch" >/dev/null 2>&1 || true

if git show-ref --verify --quiet "refs/heads/$branch"; then
  git worktree add "$worktree_dir" "$branch"
elif git show-ref --verify --quiet "refs/remotes/$remote/$branch"; then
  git worktree add -b "$branch" "$worktree_dir" "$remote/$branch"
else
  git worktree add --orphan -b "$branch" "$worktree_dir"
fi

# Replace the worktree's contents with the fresh build, keeping its .git link.
find "$worktree_dir" -mindepth 1 -maxdepth 1 ! -name '.git' -exec rm -rf {} +
cp -R dist/. "$worktree_dir/"
touch "$worktree_dir/.nojekyll"

git -C "$worktree_dir" add -A

if git -C "$worktree_dir" diff --cached --quiet; then
  echo "Nothing to deploy, $branch already matches the current build."
  exit 0
fi

git -C "$worktree_dir" commit -m "deploy: $main_sha $main_subject"
git -C "$worktree_dir" push "$remote" "$branch"

echo "Published to $branch."
