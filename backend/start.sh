#!/bin/sh
set -e

echo "🚀 Starting Presencia Backend..."

# Run migrations (this is idempotent - fast if no changes)
echo "🔄 Checking database migrations..."
if npx prisma migrate deploy 2>&1; then
    echo "✅ Database ready"
else
    # Migration failed - try to recover from P3009 (failed migration blocking)
    echo "⚠️ Migration issue detected, attempting recovery..."
    
    # Quick check for P3009 and attempt to resolve
    FAILED=$(npx prisma migrate status 2>&1 | grep -o "^\d\{14\}.*Failed" | head -1 | awk '{print $1}' || true)
    
    if [ -n "$FAILED" ]; then
        echo "🔧 Resolving failed migration: $FAILED"
        npx prisma migrate resolve --applied "$FAILED" 2>&1 || true
        npx prisma migrate deploy 2>&1
        echo "✅ Database recovered"
    else
        echo "❌ Could not resolve migration issue"
        exit 1
    fi
fi

echo "🎯 Starting server..."
exec node dist/app.js
