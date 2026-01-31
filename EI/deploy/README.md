# Entity Identity - VPS Deployment

Deploy to your VPS with Docker + Caddy.

## Quick Deploy

```bash
# On VPS: Clone and deploy
git clone https://github.com/maco144/entity-identity.git
cd entity-identity

# Create network if doesn't exist
docker network create web 2>/dev/null || true

# Set admin key
export ADMIN_API_KEY=$(openssl rand -hex 32)
echo "ADMIN_API_KEY=$ADMIN_API_KEY" > .env
echo "Save this key: $ADMIN_API_KEY"

# Build and start
docker compose up -d --build

# Check logs
docker logs -f entity-identity
```

## Caddy Configuration

Add to your Caddyfile:

```
ei.yourdomain.com {
    reverse_proxy localhost:3000
}
```

Or if using IP only (for testing):

```
:8080 {
    reverse_proxy localhost:3000
}
```

Then reload Caddy:
```bash
sudo systemctl reload caddy
```

## Verify Deployment

```bash
# Health check
curl http://localhost:3000/health

# List entity types
curl http://localhost:3000/api/v1/types

# Get registry info
curl http://localhost:3000/api/v1/registry
```

## Register an Attester (Admin)

```bash
curl -X POST http://localhost:3000/api/v1/admin/attesters \
  -H "Content-Type: application/json" \
  -H "X-Admin-Key: $ADMIN_API_KEY" \
  -d '{
    "name": "Eudaimonia OS",
    "publicKey": "auto",
    "allowedTypes": ["AI.OS", "AI.CA", "AI.AA"]
  }'
```

## Agent Registration Flow

See `AGENT_PROTOCOL.md` for how agents use the API.
