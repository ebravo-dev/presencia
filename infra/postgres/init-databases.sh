#!/bin/sh
set -eu

: "${ATTENDANCE_DB_NAME:?ATTENDANCE_DB_NAME is required}"
: "${ATTENDANCE_DB_USER:?ATTENDANCE_DB_USER is required}"
: "${ATTENDANCE_DB_PASSWORD:?ATTENDANCE_DB_PASSWORD is required}"
: "${UAT_DB_NAME:?UAT_DB_NAME is required}"
: "${UAT_DB_USER:?UAT_DB_USER is required}"
: "${UAT_DB_PASSWORD:?UAT_DB_PASSWORD is required}"
: "${IDENTITY_DB_NAME:?IDENTITY_DB_NAME is required}"
: "${IDENTITY_DB_USER:?IDENTITY_DB_USER is required}"
: "${IDENTITY_DB_PASSWORD:?IDENTITY_DB_PASSWORD is required}"
: "${ACADEMIC_DB_NAME:?ACADEMIC_DB_NAME is required}"
: "${ACADEMIC_DB_USER:?ACADEMIC_DB_USER is required}"
: "${ACADEMIC_DB_PASSWORD:?ACADEMIC_DB_PASSWORD is required}"
: "${ATTENDANCE_SERVICE_DB_NAME:?ATTENDANCE_SERVICE_DB_NAME is required}"
: "${ATTENDANCE_SERVICE_DB_USER:?ATTENDANCE_SERVICE_DB_USER is required}"
: "${ATTENDANCE_SERVICE_DB_PASSWORD:?ATTENDANCE_SERVICE_DB_PASSWORD is required}"

psql --set ON_ERROR_STOP=1 \
  --username "$POSTGRES_USER" \
  --dbname "$POSTGRES_DB" \
  --set attendance_db="$ATTENDANCE_DB_NAME" \
  --set attendance_user="$ATTENDANCE_DB_USER" \
  --set attendance_password="$ATTENDANCE_DB_PASSWORD" \
  --set uat_db="$UAT_DB_NAME" \
  --set uat_user="$UAT_DB_USER" \
  --set uat_password="$UAT_DB_PASSWORD" \
  --set identity_db="$IDENTITY_DB_NAME" \
  --set identity_user="$IDENTITY_DB_USER" \
  --set identity_password="$IDENTITY_DB_PASSWORD" \
  --set academic_db="$ACADEMIC_DB_NAME" \
  --set academic_user="$ACADEMIC_DB_USER" \
  --set academic_password="$ACADEMIC_DB_PASSWORD" \
  --set attendance_service_db="$ATTENDANCE_SERVICE_DB_NAME" \
  --set attendance_service_user="$ATTENDANCE_SERVICE_DB_USER" \
  --set attendance_service_password="$ATTENDANCE_SERVICE_DB_PASSWORD" <<'SQL'
SELECT format('CREATE ROLE %I LOGIN PASSWORD %L', :'attendance_user', :'attendance_password')
WHERE NOT EXISTS (SELECT FROM pg_roles WHERE rolname = :'attendance_user') \gexec

SELECT format('CREATE ROLE %I LOGIN PASSWORD %L', :'uat_user', :'uat_password')
WHERE NOT EXISTS (SELECT FROM pg_roles WHERE rolname = :'uat_user') \gexec

SELECT format('CREATE ROLE %I LOGIN PASSWORD %L', :'identity_user', :'identity_password')
WHERE NOT EXISTS (SELECT FROM pg_roles WHERE rolname = :'identity_user') \gexec

SELECT format('CREATE ROLE %I LOGIN PASSWORD %L', :'academic_user', :'academic_password')
WHERE NOT EXISTS (SELECT FROM pg_roles WHERE rolname = :'academic_user') \gexec

SELECT format('CREATE ROLE %I LOGIN PASSWORD %L', :'attendance_service_user', :'attendance_service_password')
WHERE NOT EXISTS (SELECT FROM pg_roles WHERE rolname = :'attendance_service_user') \gexec

SELECT format('CREATE DATABASE %I OWNER %I', :'attendance_db', :'attendance_user')
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = :'attendance_db') \gexec

SELECT format('CREATE DATABASE %I OWNER %I', :'uat_db', :'uat_user')
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = :'uat_db') \gexec

SELECT format('CREATE DATABASE %I OWNER %I', :'identity_db', :'identity_user')
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = :'identity_db') \gexec

SELECT format('CREATE DATABASE %I OWNER %I', :'academic_db', :'academic_user')
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = :'academic_db') \gexec

SELECT format('CREATE DATABASE %I OWNER %I', :'attendance_service_db', :'attendance_service_user')
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = :'attendance_service_db') \gexec
SQL
