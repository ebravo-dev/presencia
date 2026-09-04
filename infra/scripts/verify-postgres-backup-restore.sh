#!/bin/sh
set -eu

if [ "${PRESENCIA_BACKUP_VERIFY_ALLOW:-}" != "ci" ]; then
  echo "Refusing PostgreSQL restore verification without PRESENCIA_BACKUP_VERIFY_ALLOW=ci." >&2
  exit 2
fi

: "${POSTGRES_USER:?POSTGRES_USER is required}"
: "${POSTGRES_PASSWORD:?POSTGRES_PASSWORD is required}"
: "${ATTENDANCE_DB_NAME:?ATTENDANCE_DB_NAME is required}"
: "${UAT_DB_NAME:?UAT_DB_NAME is required}"
: "${IDENTITY_DB_NAME:?IDENTITY_DB_NAME is required}"
: "${ACADEMIC_DB_NAME:?ACADEMIC_DB_NAME is required}"
: "${ATTENDANCE_SERVICE_DB_NAME:?ATTENDANCE_SERVICE_DB_NAME is required}"
: "${COORDINATION_QUERY_DB_NAME:?COORDINATION_QUERY_DB_NAME is required}"
: "${APP_LOG_DB_NAME:?APP_LOG_DB_NAME is required}"

export PGPASSWORD="$POSTGRES_PASSWORD"
scratch_database="presencia_restore_check_$$"
dump_file="/tmp/presencia-restore-check-$$.dump"

cleanup() {
  dropdb --if-exists --force --username "$POSTGRES_USER" "$scratch_database" >/dev/null 2>&1 || true
  rm -f "$dump_file"
}
trap cleanup EXIT INT TERM

table_counts() {
  database=$1
  psql --username "$POSTGRES_USER" --dbname "$database" --no-align --tuples-only --field-separator '|' \
    --command "SELECT schemaname, tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename" |
  while IFS='|' read -r schema_name table_name; do
    [ -n "$table_name" ] || continue
    row_count=$(psql --username "$POSTGRES_USER" --dbname "$database" --no-align --tuples-only \
      --command "SELECT count(*) FROM \"$schema_name\".\"$table_name\"")
    printf '%s.%s=%s\n' "$schema_name" "$table_name" "$row_count"
  done
}

for database in \
  "$ATTENDANCE_DB_NAME" \
  "$UAT_DB_NAME" \
  "$IDENTITY_DB_NAME" \
  "$ACADEMIC_DB_NAME" \
  "$ATTENDANCE_SERVICE_DB_NAME" \
  "$COORDINATION_QUERY_DB_NAME" \
  "$APP_LOG_DB_NAME"
do
  source_counts=$(table_counts "$database")
  if [ -z "$source_counts" ]; then
    echo "Database $database has no public schema tables to restore." >&2
    exit 1
  fi

  pg_dump --username "$POSTGRES_USER" --dbname "$database" --format custom --file "$dump_file"
  dropdb --if-exists --force --username "$POSTGRES_USER" "$scratch_database" >/dev/null 2>&1 || true
  createdb --username "$POSTGRES_USER" --owner "$POSTGRES_USER" "$scratch_database"
  pg_restore --username "$POSTGRES_USER" --dbname "$scratch_database" --no-owner --no-privileges "$dump_file"
  restored_counts=$(table_counts "$scratch_database")

  if [ "$source_counts" != "$restored_counts" ]; then
    echo "Restored row counts differ for $database." >&2
    printf 'SOURCE\n%s\nRESTORED\n%s\n' "$source_counts" "$restored_counts" >&2
    exit 1
  fi

  dropdb --force --username "$POSTGRES_USER" "$scratch_database"
  rm -f "$dump_file"
  echo "PASS PostgreSQL backup restored with matching table counts: $database"
done
