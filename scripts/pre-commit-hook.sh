#!/usr/bin/env bash
# Claude Code PreToolUse hook: runs CI checks before git commit
# Input: JSON on stdin with .tool_input.command
# Exit 0 = allow, Exit 2 = block

COMMAND=$(jq -r '.tool_input.command // ""' < /dev/stdin 2>/dev/null)

if echo "$COMMAND" | grep -qP 'git\s+commit'; then
  bash "$(git rev-parse --show-toplevel)/scripts/check-ci.sh" 2>&1
  if [ $? -ne 0 ]; then
    echo "Pre-commit checks failed. Fix errors above before committing." >&2
    exit 2
  fi
fi

exit 0
