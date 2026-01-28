# Entity Identity API - Phase 1 Design

## Overview

Minimal viable API for entity type verification. You control attesters, client-side proving, server-side verification.

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                      EI API SERVER                           │
│                                                              │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────┐   │
│  │   Attester   │  │  Attestation │  │   Verification   │   │
│  │   Registry   │  │   Service    │  │    Service       │   │
│  │   (SQLite)   │  │              │  │  + Nullifiers    │   │
│  └──────────────┘  └──────────────┘  └──────────────────┘   │
└─────────────────────────────────────────────────────────────┘
         │                   │                    │
         ▼                   ▼                    ▼
    GET /registry       POST /attest         POST /verify
    (merkle root)       (attester signs)     (check proof)
                             │
                             ▼
┌─────────────────────────────────────────────────────────────┐
│                      CLIENT / SDK                            │
│                                                              │
│  1. Entity creates commitment (secret + salt)               │
│  2. Requests attestation from approved attester             │
│  3. Downloads proving assets (WASM + zkey)                  │
│  4. Generates proof locally (privacy preserved)             │
│  5. Submits proof to verifier                               │
└─────────────────────────────────────────────────────────────┘
```

## Endpoints

### Registry (Public)

#### `GET /api/v1/registry`
Get current attester registry state.

**Response:**
```json
{
  "root": "0x1a2b3c...",
  "attestersCount": 3,
  "updatedAt": "2025-01-28T12:00:00Z"
}
```

#### `GET /api/v1/registry/attesters`
List approved attesters.

**Response:**
```json
{
  "attesters": [
    {
      "id": "anthropic",
      "name": "Anthropic",
      "publicKeyX": "0x...",
      "publicKeyY": "0x...",
      "index": 0,
      "types": ["AI.CA", "AI.GN", "AI.AA"],
      "createdAt": "2025-01-28T12:00:00Z"
    }
  ]
}
```

#### `GET /api/v1/registry/attesters/:id/proof`
Get merkle proof for an attester.

**Response:**
```json
{
  "attesterId": "anthropic",
  "index": 0,
  "leaf": "0x...",
  "pathElements": ["0x...", "0x...", ...],
  "pathIndices": [0, 1, 0, ...]
}
```

---

### Attestation (Requires Attester Auth)

#### `POST /api/v1/attest`
Attester signs an attestation for an entity.

**Headers:**
```
Authorization: Bearer <attester-api-key>
```

**Request:**
```json
{
  "entityCommitment": "0x...",
  "entityType": "AI.CA"
}
```

**Response:**
```json
{
  "attestation": {
    "entityCommitment": "0x...",
    "entityType": "AI.CA",
    "typeCode": 257,
    "attesterPubKeyX": "0x...",
    "attesterPubKeyY": "0x...",
    "signatureR8X": "0x...",
    "signatureR8Y": "0x...",
    "signatureS": "0x...",
    "attesterIndex": 0,
    "createdAt": "2025-01-28T12:00:00Z"
  },
  "merkleProof": {
    "pathElements": ["0x...", ...],
    "pathIndices": [0, 1, ...]
  },
  "registryRoot": "0x..."
}
```

---

### Proving Assets (Public)

#### `GET /api/v1/proving/assets`
Get URLs for proving assets.

**Response:**
```json
{
  "circuit": "entity_type_proof",
  "assets": {
    "wasm": "https://cdn.example.com/entity_type_proof.wasm",
    "zkey": "https://cdn.example.com/entity_type_final.zkey",
    "verificationKey": "https://cdn.example.com/verification_key.json"
  },
  "checksums": {
    "wasm": "sha256:abc123...",
    "zkey": "sha256:def456...",
    "verificationKey": "sha256:789ghi..."
  },
  "circuitHash": "ce4b4dda a33748ab ..."
}
```

---

### Verification (Public)

#### `POST /api/v1/verify`
Verify a ZK proof.

**Request:**
```json
{
  "proof": {
    "pi_a": ["0x...", "0x...", "1"],
    "pi_b": [["0x...", "0x..."], ["0x...", "0x..."], ["1", "0"]],
    "pi_c": ["0x...", "0x...", "1"],
    "protocol": "groth16"
  },
  "publicSignals": [
    "nullifier",
    "entityCommitment",
    "claimedType",
    "attestersRoot",
    "contextId"
  ],
  "context": {
    "domain": "example.com",
    "action": "api_access"
  }
}
```

**Response (valid):**
```json
{
  "valid": true,
  "entityType": "AI.CA",
  "entityTypeName": "Conversational Agent",
  "phoneticName": "Kah",
  "entityCommitment": "0x...",
  "nullifier": "0x...",
  "registryRootValid": true,
  "nullifierStatus": "new"
}
```

**Response (invalid):**
```json
{
  "valid": false,
  "error": "proof_invalid",
  "message": "Cryptographic verification failed"
}
```

#### `POST /api/v1/verify/record`
Record a nullifier after accepting a proof (prevents replay).

**Request:**
```json
{
  "nullifier": "0x...",
  "contextId": "0x...",
  "domain": "example.com"
}
```

---

### Admin (Requires Admin Auth)

#### `POST /api/v1/admin/attesters`
Register a new attester.

**Request:**
```json
{
  "id": "anthropic",
  "name": "Anthropic",
  "publicKeyX": "0x...",
  "publicKeyY": "0x...",
  "allowedTypes": ["AI.CA", "AI.GN", "AI.AA"],
  "contact": "security@anthropic.com"
}
```

#### `DELETE /api/v1/admin/attesters/:id`
Remove an attester (updates merkle root).

---

## Data Models

### Attester
```
id: string (unique identifier)
name: string
publicKeyX: string (hex)
publicKeyY: string (hex)
merkleIndex: number
allowedTypes: string[]
apiKeyHash: string
createdAt: timestamp
revokedAt: timestamp (nullable)
```

### Nullifier
```
nullifier: string (hex, primary key)
contextId: string
domain: string
recordedAt: timestamp
```

### AuditLog
```
id: uuid
action: string
attesterId: string (nullable)
details: json
createdAt: timestamp
```

---

## Authentication

### Attester API Keys
- Generated on attester registration
- Hashed with argon2 before storage
- Passed via `Authorization: Bearer <key>`

### Admin API Keys
- Environment variable `ADMIN_API_KEY`
- Required for attester management

---

## Error Responses

```json
{
  "error": "error_code",
  "message": "Human readable message",
  "details": {}
}
```

| Code | HTTP | Description |
|------|------|-------------|
| `invalid_request` | 400 | Malformed request body |
| `invalid_commitment` | 400 | Commitment not valid field element |
| `invalid_type` | 400 | Unknown entity type |
| `unauthorized` | 401 | Missing or invalid auth |
| `forbidden` | 403 | Attester not allowed for this type |
| `attester_not_found` | 404 | Attester ID not in registry |
| `proof_invalid` | 400 | ZK proof verification failed |
| `root_mismatch` | 400 | Proof uses outdated registry root |
| `nullifier_used` | 409 | Nullifier already recorded |
| `internal_error` | 500 | Server error |

---

## Rate Limits

| Endpoint | Limit |
|----------|-------|
| `/verify` | 100/min per IP |
| `/attest` | 10/min per attester |
| `/registry/*` | 60/min per IP |

---

## SDK Usage (Client-Side)

```javascript
import { EntityIdentity } from '@entity-identity/sdk';

// Initialize
const ei = new EntityIdentity({
  apiUrl: 'https://api.entity-identity.io',
});

// Entity creates identity
const entity = ei.createEntity();
console.log('Commitment:', entity.commitment);

// Request attestation (entity shares commitment with attester)
const attestation = await ei.requestAttestation({
  commitment: entity.commitment,
  type: 'AI.CA',
  attester: 'anthropic'
});

// Generate proof (happens locally - private inputs never leave client)
const proof = await entity.prove({
  attestation,
  contextId: Date.now().toString()
});

// Anyone can verify
const result = await ei.verify(proof);
console.log('Valid:', result.valid);
console.log('Type:', result.entityType);
```
