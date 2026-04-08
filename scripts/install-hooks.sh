#!/usr/bin/env bash
set -euo pipefail

ROOT="$(git rev-parse --show-toplevel)"
HOOK="$ROOT/.git/hooks/pre-commit"

cat > "$HOOK" << 'EOF'
#!/usr/bin/env bash
set -euo pipefail

ROOT="$(git rev-parse --show-toplevel)"
exec "$ROOT/scripts/check-ci.sh"
EOF

chmod +x "$HOOK"
echo "pre-commit hook installed: $HOOK"
