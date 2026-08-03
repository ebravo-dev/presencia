#!/bin/sh
set -eu

if [ "${PRESENCIA_BACKUP_VERIFY_ALLOW:-}" != "ci" ]; then
  echo "Refusing Redis restore verification without PRESENCIA_BACKUP_VERIFY_ALLOW=ci." >&2
  exit 2
fi

project_name=${1:-presencia-ci}
source_container="${project_name}-redis-1"
restore_container="${project_name}-redis-restore-check"
container_backup=/tmp/presencia-redis-restore-check.rdb
host_backup="/tmp/${project_name}-redis-restore-check.rdb"

cleanup() {
  docker rm --force "$restore_container" >/dev/null 2>&1 || true
  rm -f "$host_backup"
  docker exec "$source_container" rm -f "$container_backup" >/dev/null 2>&1 || true
}
trap cleanup EXIT INT TERM

docker inspect "$source_container" >/dev/null
source_size=$(docker exec "$source_container" /bin/sh -c 'REDISCLI_AUTH="$REDIS_PASSWORD" redis-cli dbsize')
docker exec "$source_container" /bin/sh -c \
  'REDISCLI_AUTH="$REDIS_PASSWORD" redis-cli --rdb /tmp/presencia-redis-restore-check.rdb >/dev/null'
docker exec "$source_container" redis-check-rdb "$container_backup" >/dev/null
docker cp "$source_container:$container_backup" "$host_backup" >/dev/null

docker rm --force "$restore_container" >/dev/null 2>&1 || true
docker create \
  --name "$restore_container" \
  --network none \
  --user redis \
  --cap-drop ALL \
  --security-opt no-new-privileges \
  redis:7.4-alpine \
  redis-server --appendonly no >/dev/null
docker cp "$host_backup" "$restore_container:/data/dump.rdb" >/dev/null
docker start "$restore_container" >/dev/null

ready=false
for _attempt in 1 2 3 4 5 6 7 8 9 10; do
  if docker exec "$restore_container" redis-cli ping 2>/dev/null | grep -q '^PONG$'; then
    ready=true
    break
  fi
  sleep 1
done
if [ "$ready" != "true" ]; then
  echo "Restored Redis container did not become ready." >&2
  exit 1
fi

restored_size=$(docker exec "$restore_container" redis-cli dbsize)
if [ "$source_size" != "$restored_size" ]; then
  echo "Redis restored key count differs: source=$source_size restored=$restored_size" >&2
  exit 1
fi

echo "PASS Redis RDB restored in an isolated container with $restored_size keys"
