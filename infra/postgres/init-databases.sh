#!/bin/sh
set -eu

: "${ATTENDANCE_DB_NAME:?ATTENDANCE_DB_NAME is required}"
: "${ATTENDANCE_DB_USER:?ATTENDANCE_DB_USER is required}"
: "${ATTENDANCE_DB_PASSWORD:?ATTENDANCE_DB_PASSWORD is required}"
: "${UAT_DB_NAME:?UAT_DB_NAME is required}"
: "${UAT_DB_USER:?UAT_DB_USER is required}"
: "${UAT_DB_PASSWORD:?UAT_DB_PASSWORD is required}"

psql --set ON_ERROR_STOP=1 \
  --username "$POSTGRES_USER" \
  --dbname "$POSTGRES_DB" \
  --set attendance_db="$ATTENDANCE_DB_NAME" \
  --set attendance_user="$ATTENDANCE_DB_USER" \
  --set attendance_password="$ATTENDANCE_DB_PASSWORD" \
  --set uat_db="$UAT_DB_NAME" \
  --set uat_user="$UAT_DB_USER" \
  --set uat_password="$UAT_DB_PASSWORD" <<'SQL'
SELECT format('CREATE ROLE %I LOGIN PASSWORD %L', :'attendance_user', :'attendance_password')
WHERE NOT EXISTS (SELECT FROM pg_roles WHERE rolname = :'attendance_user') \gexec

SELECT format('CREATE ROLE %I LOGIN PASSWORD %L', :'uat_user', :'uat_password')
WHERE NOT EXISTS (SELECT FROM pg_roles WHERE rolname = :'uat_user') \gexec

SELECT format('CREATE DATABASE %I OWNER %I', :'attendance_db', :'attendance_user')
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = :'attendance_db') \gexec

SELECT format('CREATE DATABASE %I OWNER %I', :'uat_db', :'uat_user')
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = :'uat_db') \gexec
SQL
