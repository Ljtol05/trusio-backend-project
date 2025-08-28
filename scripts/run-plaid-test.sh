
#!/bin/bash

# Plaid Sandbox Test Runner
echo "🚀 Starting Plaid Sandbox Test..."
echo "📋 Loading environment variables..."

# Check if .env file exists
if [ ! -f .env ]; then
    echo "❌ .env file not found. Please create one with PLAID_CLIENT_ID and PLAID_SECRET"
    exit 1
fi

# Load environment variables
source .env

# Verify required variables
if [ -z "$PLAID_CLIENT_ID" ] || [ -z "$PLAID_SECRET" ]; then
    echo "❌ Missing required environment variables:"
    echo "   PLAID_CLIENT_ID: ${PLAID_CLIENT_ID:-'NOT SET'}"
    echo "   PLAID_SECRET: ${PLAID_SECRET:-'NOT SET'}"
    echo ""
    echo "Please add these to your .env file:"
    echo "PLAID_CLIENT_ID=\"your-plaid-client-id\""
    echo "PLAID_SECRET=\"your-plaid-secret\""
    exit 1
fi

echo "✅ Environment variables loaded"
echo "🏃 Running Plaid test script..."
echo ""

# Run the TypeScript script
npx tsx scripts/plaid-sandbox-test.ts

echo ""
echo "📊 Test completed. Check the generated JSON file for transaction data."
