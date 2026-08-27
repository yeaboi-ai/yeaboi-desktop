#!/usr/bin/env bash
# Alembic migrations must stay SQLite-safe: the desktop's local mode runs
# this backend on SQLite, whose ALTER support needs op.batch_alter_table for
# constraint/column changes. Only the upgrade() path matters — fresh local
# installs create_all + stamp head, and downgrades never run there — and only
# migrations touched after local mode shipped are checked (pre-commit passes
# changed files only, which grandfathers history).

set -euo pipefail

status=0
for file in "$@"; do
  [[ "$file" == *alembic/versions/*.py ]] || continue
  # The upgrade() body: everything from `def upgrade` to `def downgrade`.
  upgrade=$(awk '/^def upgrade/{on=1} /^def downgrade/{on=0} on' "$file")
  if grep -qE '^\s*op\.(alter_column|drop_constraint|create_unique_constraint|drop_column)\(' <<<"$upgrade"; then
    echo "SQLite-unsafe migration: $file"
    echo "  use \`with op.batch_alter_table(...) as batch:\` for ALTER operations in upgrade() —"
    echo "  the desktop's local mode runs migrations on SQLite."
    status=1
  fi
done
exit $status
