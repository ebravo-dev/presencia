#!/bin/sh
set -e

echo "🚀 Starting Presencia Backend..."

# Run migrations. A failed migration must stop the deployment so an operator can
# inspect it; never mark an unknown database change as successfully applied.
echo "🔄 Checking database migrations..."
./node_modules/.bin/prisma migrate deploy
echo "✅ Database ready"

echo "🎯 Starting server..."
exec node dist/app.js
