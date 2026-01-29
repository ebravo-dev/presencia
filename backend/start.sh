#!/bin/sh
set -e

echo "🔄 Running database migrations..."

# Try to deploy migrations
MIGRATE_OUTPUT=$(npx prisma migrate deploy 2>&1) && {
    echo "$MIGRATE_OUTPUT"
    echo "✅ Migrations complete, starting server..."
    exec node dist/app.js
}

# If we get here, migration failed
echo "$MIGRATE_OUTPUT"
echo ""
echo "⚠️ Migration deploy failed, checking for failed migrations to resolve..."

# Check if it's a P3009 error (failed migrations blocking)
if echo "$MIGRATE_OUTPUT" | grep -q "P3009"; then
    echo "🔧 Found failed migrations (P3009), attempting to resolve..."
    
    # Extract the failed migration name using sed (more portable than grep -P)
    # The error message contains: "The `migration_name` migration started at..."
    FAILED_MIGRATION=$(echo "$MIGRATE_OUTPUT" | sed -n "s/.*The \`\([^\`]*\)\` migration.*/\1/p" | head -1)
    
    if [ -n "$FAILED_MIGRATION" ]; then
        echo "🔧 Resolving failed migration: $FAILED_MIGRATION"
        
        # First try to mark it as applied (since the changes might already be in the DB)
        if npx prisma migrate resolve --applied "$FAILED_MIGRATION" 2>&1; then
            echo "✅ Marked migration as applied"
        else
            echo "⚠️ Could not mark as applied, trying rolled-back..."
            npx prisma migrate resolve --rolled-back "$FAILED_MIGRATION" 2>&1 || true
        fi
        
        echo "🔄 Retrying migration deploy..."
        npx prisma migrate deploy
        
        echo "✅ Migrations complete, starting server..."
        exec node dist/app.js
    else
        echo "❌ Could not extract failed migration name from error message"
        exit 1
    fi
else
    echo "❌ Migration failed for unknown reason (not P3009)"
    exit 1
fi
