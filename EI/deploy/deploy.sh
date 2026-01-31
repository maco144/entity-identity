#!/bin/bash
# Entity Identity - Deploy to VPS
# Usage: ./deploy/deploy.sh [VPS_HOST] [DOMAIN]

set -e

# Configuration
VPS_HOST="${1:-149.28.33.118}"
DOMAIN="${2:-}"  # Optional: ei.yourdomain.com
REPO_URL="https://github.com/maco144/entity-identity.git"
APP_DIR="/opt/entity-identity"
CONTAINER_NAME="entity-identity"

echo "═══════════════════════════════════════════════════════════════"
echo "  Entity Identity - VPS Deployment"
echo "═══════════════════════════════════════════════════════════════"
echo ""
echo "  Target: $VPS_HOST"
echo "  Domain: ${DOMAIN:-'(none - using port 3000)'}"
echo ""

# Check SSH access
echo "1. Checking SSH access..."
if ! ssh -o ConnectTimeout=5 -o BatchMode=yes root@$VPS_HOST "echo ok" &>/dev/null; then
    echo "   ERROR: Cannot SSH to root@$VPS_HOST"
    echo "   Make sure you have SSH key access configured."
    exit 1
fi
echo "   ✓ SSH access confirmed"

# Deploy to VPS
echo ""
echo "2. Deploying to VPS..."

ssh root@$VPS_HOST bash -s "$REPO_URL" "$APP_DIR" "$CONTAINER_NAME" "$DOMAIN" << 'REMOTE_SCRIPT'
set -e
REPO_URL="$1"
APP_DIR="$2"
CONTAINER_NAME="$3"
DOMAIN="$4"

echo "   - Ensuring Docker is installed..."
if ! command -v docker &>/dev/null; then
    curl -fsSL https://get.docker.com | sh
fi

echo "   - Creating docker network..."
docker network create web 2>/dev/null || true

echo "   - Cloning/updating repository..."
if [ -d "$APP_DIR" ]; then
    cd "$APP_DIR"
    git fetch origin
    git reset --hard origin/main
else
    git clone "$REPO_URL" "$APP_DIR"
    cd "$APP_DIR"
fi

# Project files are in EI/ subdirectory
cd EI

echo "   - Setting up environment..."
if [ ! -f .env ]; then
    ADMIN_KEY=$(openssl rand -hex 32)
    echo "ADMIN_API_KEY=$ADMIN_KEY" > .env
    echo ""
    echo "   ╔══════════════════════════════════════════════════════════╗"
    echo "   ║  NEW ADMIN KEY GENERATED - SAVE THIS!                    ║"
    echo "   ╠══════════════════════════════════════════════════════════╣"
    printf "   ║  %-56s  ║\n" "$ADMIN_KEY"
    echo "   ╚══════════════════════════════════════════════════════════╝"
    echo ""
else
    echo "   - Using existing .env file"
fi

echo "   - Building and starting container..."
docker compose down 2>/dev/null || true
docker compose up -d --build

echo "   - Waiting for container to be healthy..."
sleep 3

# Health check
if curl -sf http://localhost:3000/health > /dev/null; then
    echo "   ✓ API is running"
else
    echo "   WARNING: Health check failed, checking logs..."
    docker logs $CONTAINER_NAME --tail 20
fi

# Configure Caddy if domain provided
if [ -n "$DOMAIN" ]; then
    echo "   - Configuring Caddy for $DOMAIN..."
    CADDY_CONFIG="/etc/caddy/Caddyfile"

    if [ -f "$CADDY_CONFIG" ]; then
        # Check if already configured
        if ! grep -q "$DOMAIN" "$CADDY_CONFIG"; then
            cat >> "$CADDY_CONFIG" << EOF

# Entity Identity API
$DOMAIN {
    reverse_proxy localhost:3000
}
EOF
            systemctl reload caddy 2>/dev/null || echo "   Note: Reload Caddy manually"
            echo "   ✓ Caddy configured for $DOMAIN"
        else
            echo "   - Caddy already configured for $DOMAIN"
        fi
    else
        echo "   - Caddy config not found at $CADDY_CONFIG"
    fi
fi

# Show status
echo ""
echo "   Container status:"
docker ps --filter name=$CONTAINER_NAME --format "   {{.Names}}: {{.Status}}"
REMOTE_SCRIPT

# Get the admin key for local storage
echo ""
echo "3. Retrieving configuration..."
ADMIN_KEY=$(ssh root@$VPS_HOST "cat $APP_DIR/EI/.env 2>/dev/null | grep ADMIN_API_KEY | cut -d= -f2")

# Save locally
mkdir -p ~/.config/entity-identity
echo "VPS_HOST=$VPS_HOST" > ~/.config/entity-identity/deploy.env
echo "ADMIN_API_KEY=$ADMIN_KEY" >> ~/.config/entity-identity/deploy.env
if [ -n "$DOMAIN" ]; then
    echo "API_URL=https://$DOMAIN" >> ~/.config/entity-identity/deploy.env
else
    echo "API_URL=http://$VPS_HOST:3000" >> ~/.config/entity-identity/deploy.env
fi
echo "   ✓ Config saved to ~/.config/entity-identity/deploy.env"

# Test the deployment
echo ""
echo "4. Testing deployment..."
if [ -n "$DOMAIN" ]; then
    API_URL="https://$DOMAIN"
else
    API_URL="http://$VPS_HOST:3000"
fi

if curl -sf "$API_URL/health" > /dev/null 2>&1; then
    echo "   ✓ API accessible at $API_URL"
else
    echo "   ⚠ API not accessible externally yet"
    echo "   - If using IP, ensure port 3000 is open in firewall"
    echo "   - If using domain, ensure DNS is configured"
fi

echo ""
echo "═══════════════════════════════════════════════════════════════"
echo "  Deployment Complete!"
echo "═══════════════════════════════════════════════════════════════"
echo ""
echo "  API URL: $API_URL"
echo "  Admin Key: $ADMIN_KEY"
echo ""
echo "  Next: Register an attester:"
echo ""
echo "    ./deploy/register-attester.sh eudaimonia \"Eudaimonia OS\" AI.OS,AI.CA,AI.AA"
echo ""
