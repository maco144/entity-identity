# Entity Identity Type - ZK Proof System

## Project Context

A universal identification system for AIs, robots, humans, and hybrids on the internet. The goal is standardized identity type labels so interactors know what they're dealing with.

## Core Concept

**Entity Type Codes** with phonetic names for verbal disambiguation:

| Code | Phonetic | Description |
|------|----------|-------------|
| AI.CA | Kah | Conversational Agent |
| AI.PO | Poe | Program Orchestrator |
| AI.WS | Wiz | Web Site |
| AI.OS | Aus | Operating System |
| AI.GN | Jen | Generative Model |
| AI.AA | Ahh | Autonomous Agent |
| AI.LM | Elm | Language Model (raw LM endpoint) |
| AI.DB | Deb | Data Broker (aggregates/transforms/routes) |
| AI.JG | Jig | Judge/Evaluator (scoring, moderation, filters) |
| AI.SY | Sigh | Synthetic Media Generator (deepfakes, voice clones) |
| AR.RB | Rob | Robot Bot |
| AR.DR | Dar | Drone |
| AR.VH | Vee | Vehicle |
| HU.US | Who | Human User |
| HY.CP | Kip | Copilot (human-AI pair) |
| HY.HS | His | Hive Swarm |

## Architecture: Dual Cryptographic System

### Layer 1 - Private (ZK)
Proves entity type without revealing identity.
- Hidden: which entity, which attester, signature
- Revealed: type code, commitment (pseudonymous ID), nullifier

### Layer 2 - Public (Collaborative Trust)
Visible attestation graph for accountability.
- Auditable history of attestations
- Social proof / sybil resistance
- Builds reputation over time

### Dual Proof
Both layers required for high-stakes interactions.
- Attacker must compromise both layers
- Trust hash (32 bytes) commits to entire state

## Interaction Levels

| Level | Name | Use Case |
|-------|------|----------|
| 0 | Anonymous | Browsing |
| 1 | Type Only (ZK) | Comments, basic API |
| 2 | Type + Standing | Transactions, publishing |
| 3 | Full Accountability | Legal, financial, physical |

## Design Decisions

1. **Separation of concerns**: Identity ≠ reputation ≠ capability. Each is a composable layer.
2. **Multi-modal attestation**: Self-declared, DNS, X.509, DID, hardware - different trust levels.
3. **No capability tiers for now**: May develop later.
4. **Mutations (AI spawning robots, etc.)**: Out of scope - let reputation layer handle lineage.

## Technical Stack

- **Circuits**: Circom 2.1.6
- **Hash function**: Poseidon (ZK-friendly, ~300 constraints vs ~25000 for SHA256)
- **Signatures**: EdDSA over BabyJubJub curve
- **Proof system**: Groth16 (small proofs, ~200 bytes) or Plonk (no trusted setup)
- **Merkle trees**: For attester registry and public trust registry

## Files

```
entity-identity/
├── circuits/
│   ├── entity_type_proof.circom      # Single-layer ZK proof
│   └── dual_identity_proof.circom    # Combined dual-proof system
├── contracts/
│   ├── EntityTypeRegistry.sol        # On-chain registry
│   └── EntityTypeVerifier.sol        # Groth16 verifier (generated)
├── src/
│   ├── entity-identity.js            # JS library for ZK layer
│   ├── dual-system.js                # JS library for dual system
│   ├── index.js                      # SDK entry point
│   └── cli.js                        # CLI tool
├── api/
│   └── server.js                     # REST API server
├── scripts/
│   └── deploy.js                     # Hardhat deployment
├── test/
│   ├── test-proof.js                 # ZK proof tests
│   ├── test-api.js                   # API integration tests
│   └── sdk.test.js                   # Jest SDK tests
└── deployments/                      # Contract addresses by network
```

## CLI Usage

```bash
# List all entity types
npx eid types

# Generate a proof
npx eid prove --type AI.CA --context session123

# Verify a proof
npx eid verify --proof proof.json
```

## Relation to Password Palace

This system complements spatial authentication:
- Same Poseidon hash primitives
- Same merkle tree structures
- Entity type proof can be combined with spatial auth
- Trust hash could be an additional verification factor

The `entityCommitment` bridges both systems - a stable pseudonymous identifier that links ZK privacy to public accountability without revealing the underlying secret.

## Progress

- [x] Compile circuits with circom
- [x] Run trusted setup (powers of tau)
- [x] Build integration tests
- [x] Implement on-chain contracts (EntityTypeRegistry.sol)
- [x] REST API server with attester registry
- [x] CLI and SDK
- [x] Local Hardhat deployment
- [ ] Deploy to Sepolia testnet
- [ ] Design attester registry governance
- [ ] Browser extension for surfacing entity types
- [ ] Protocol integration (HTTP headers, OAuth scopes)

## Key Insight

The internet needs both privacy AND accountability. Neither alone suffices:
- Pure privacy → bad actors hide
- Pure transparency → surveillance

The dual-proof architecture lets interactions require either or both, graduated by stakes.
