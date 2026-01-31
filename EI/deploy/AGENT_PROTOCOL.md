# Entity Identity - Agent Protocol

How AI agents register and prove their entity type.

## Overview

```
┌─────────────┐     1. Register      ┌─────────────────┐
│   Agent     │ ─────────────────────▶│  EI API Server  │
│ (e.g. OS)   │                       │                 │
│             │ ◀───────────────────── │                 │
└─────────────┘     2. Token          └─────────────────┘
       │                                      │
       │  3. Request Attestation              │
       │ ────────────────────────────────────▶│
       │                                      │
       │  4. Generate Proof                   │
       │ ────────────────────────────────────▶│
       │                                      │
       │  5. ZK Proof + Commitment            │
       │ ◀────────────────────────────────────│
       │                                      │
       ▼                                      ▼
   Can prove type to                   Verifiable on
   other agents                        Sepolia chain
```

## Step 1: Get Registered (One-time)

An admin registers your agent as an attester:

```bash
# Admin runs this
curl -X POST https://ei.example.com/api/v1/admin/attesters \
  -H "Content-Type: application/json" \
  -H "X-Admin-Key: ADMIN_KEY" \
  -d '{
    "name": "My AI Agent",
    "publicKey": "auto",
    "allowedTypes": ["AI.CA"]
  }'
```

Response:
```json
{
  "success": true,
  "attester": {
    "id": "att_abc123",
    "name": "My AI Agent",
    "token": "eid_live_xxx...",  // Save this!
    "allowedTypes": ["AI.CA"]
  }
}
```

## Step 2: Request Attestation

Agent requests attestation for its type:

```bash
curl -X POST https://ei.example.com/api/v1/attest \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer eid_live_xxx..." \
  -d '{
    "entityType": "AI.CA",
    "entitySecret": "unique-secret-keep-safe",
    "context": "session-123"
  }'
```

Response:
```json
{
  "success": true,
  "attestation": {
    "commitment": "0x1234...",
    "type": "AI.CA",
    "typeCode": 257,
    "timestamp": 1706745600
  }
}
```

## Step 3: Generate Proof

Generate a ZK proof of entity type:

```bash
curl -X POST https://ei.example.com/api/v1/prove \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer eid_live_xxx..." \
  -d '{
    "entityType": "AI.CA",
    "entitySecret": "unique-secret-keep-safe",
    "context": "session-123"
  }'
```

Response:
```json
{
  "success": true,
  "proof": {
    "pi_a": ["0x...", "0x..."],
    "pi_b": [["0x...", "0x..."], ["0x...", "0x..."]],
    "pi_c": ["0x...", "0x..."],
    "publicSignals": ["nullifier", "commitment", "typeCode", "attestersRoot", "contextId"]
  },
  "commitment": "0x1234...",
  "entityType": "AI.CA"
}
```

## Step 4: Share Proof with Other Agents

When interacting with another agent, share:

```json
{
  "eid": {
    "type": "AI.CA",
    "commitment": "0x1234...",
    "proof": { ... }
  }
}
```

The receiving agent can verify at:

```bash
curl -X POST https://ei.example.com/api/v1/verify \
  -H "Content-Type: application/json" \
  -d '{
    "proof": { ... },
    "expectedType": "AI.CA"
  }'
```

## Entity Types

| Code | Hex | Name | Use For |
|------|-----|------|---------|
| AI.CA | 0x0101 | Conversational Agent | Chatbots, assistants |
| AI.OS | 0x0104 | Operating System | OS-level AI |
| AI.AA | 0x0106 | Autonomous Agent | Self-directed agents |
| AI.LM | 0x0107 | Language Model | Raw LLM endpoints |
| HU.US | 0x0301 | Human User | Human accounts |
| HY.CP | 0x0401 | Copilot | Human-AI pairs |

Full list: `GET /api/v1/types`

## Verification Levels

| Level | What's Proven | Use Case |
|-------|---------------|----------|
| 0 | Nothing | Anonymous browsing |
| 1 | Type only (ZK) | API calls, comments |
| 2 | Type + reputation | Transactions |
| 3 | Full identity | Legal, financial |

## On-Chain Verification

Proofs can also be verified on Sepolia:

- Registry: `0xFb637C39439f969e5Cc0b1910308146f1DD529Fe`
- Verifier: `0x7444ba1b14a8dfC3342e3190b2Be991bA4A3801E`

```javascript
const registry = new ethers.Contract(REGISTRY_ADDRESS, abi, provider);
const [entityType, timestamp] = await registry.getVerification(commitment);
```
