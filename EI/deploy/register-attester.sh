#!/bin/bash
# Register an attester with the Entity Identity API
# Usage: ./deploy/register-attester.sh <id> <name> <types>
# Example: ./deploy/register-attester.sh eudaimonia "Eudaimonia OS" AI.OS,AI.CA,AI.AA

set -e

# Load config
CONFIG_FILE="$HOME/.config/entity-identity/deploy.env"
if [ -f "$CONFIG_FILE" ]; then
    source "$CONFIG_FILE"
fi

# Arguments
ATTESTER_ID="${1:-}"
ATTESTER_NAME="${2:-}"
ALLOWED_TYPES="${3:-AI.CA}"

if [ -z "$ATTESTER_ID" ] || [ -z "$ATTESTER_NAME" ]; then
    echo "Usage: $0 <id> <name> [types]"
    echo ""
    echo "Arguments:"
    echo "  id     - Unique attester ID (e.g., 'eudaimonia')"
    echo "  name   - Display name (e.g., 'Eudaimonia OS')"
    echo "  types  - Comma-separated types (default: AI.CA)"
    echo ""
    echo "Available types:"
    echo "  AI.CA  - Conversational Agent"
    echo "  AI.OS  - Operating System"
    echo "  AI.AA  - Autonomous Agent"
    echo "  AI.LM  - Language Model"
    echo "  AI.PO  - Program Orchestrator"
    echo "  HU.US  - Human User"
    echo "  HY.CP  - Copilot (Human-AI pair)"
    echo ""
    echo "Example:"
    echo "  $0 eudaimonia \"Eudaimonia OS\" AI.OS,AI.CA,AI.AA"
    exit 1
fi

# Check for API URL and admin key
API_URL="${API_URL:-http://localhost:3000}"
if [ -z "$ADMIN_API_KEY" ]; then
    echo "Error: ADMIN_API_KEY not set"
    echo "Run deploy.sh first or set ADMIN_API_KEY environment variable"
    exit 1
fi

# Convert comma-separated types to JSON array
TYPES_JSON=$(echo "$ALLOWED_TYPES" | sed 's/,/","/g' | sed 's/^/["/' | sed 's/$/"]/')

echo "Registering attester..."
echo "  ID: $ATTESTER_ID"
echo "  Name: $ATTESTER_NAME"
echo "  Types: $ALLOWED_TYPES"
echo "  API: $API_URL"
echo ""

RESPONSE=$(curl -s -X POST "$API_URL/api/v1/admin/attesters" \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer $ADMIN_API_KEY" \
    -d "{
        \"id\": \"$ATTESTER_ID\",
        \"name\": \"$ATTESTER_NAME\",
        \"allowedTypes\": $TYPES_JSON
    }")

# Check for error
if echo "$RESPONSE" | grep -q '"error"'; then
    echo "Error: $(echo "$RESPONSE" | grep -o '"message":"[^"]*"' | cut -d'"' -f4)"
    exit 1
fi

# Extract API key
API_KEY=$(echo "$RESPONSE" | grep -o '"apiKey":"[^"]*"' | cut -d'"' -f4)

if [ -z "$API_KEY" ]; then
    echo "Unexpected response:"
    echo "$RESPONSE"
    exit 1
fi

# Save attester credentials
ATTESTER_FILE="$HOME/.config/entity-identity/attesters/$ATTESTER_ID.env"
mkdir -p "$(dirname "$ATTESTER_FILE")"
echo "ATTESTER_ID=$ATTESTER_ID" > "$ATTESTER_FILE"
echo "ATTESTER_NAME=$ATTESTER_NAME" >> "$ATTESTER_FILE"
echo "ATTESTER_API_KEY=$API_KEY" >> "$ATTESTER_FILE"
echo "API_URL=$API_URL" >> "$ATTESTER_FILE"
chmod 600 "$ATTESTER_FILE"

echo "═══════════════════════════════════════════════════════════════"
echo "  Attester Registered Successfully!"
echo "═══════════════════════════════════════════════════════════════"
echo ""
echo "  API Key (SAVE THIS - shown only once):"
echo ""
echo "  $API_KEY"
echo ""
echo "  Saved to: $ATTESTER_FILE"
echo ""
echo "  To generate a proof:"
echo ""
echo "    curl -X POST $API_URL/api/v1/prove \\"
echo "      -H 'Content-Type: application/json' \\"
echo "      -H 'Authorization: Bearer $API_KEY' \\"
echo "      -d '{\"entityType\": \"AI.OS\", \"entitySecret\": \"my-secret\", \"context\": \"session-1\"}'"
echo ""
