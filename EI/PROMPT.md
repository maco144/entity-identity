# Entity Identity Type - ZK Proof System

## Project Context

A universal identification system for AIs, robots, humans, and hybrids on the internet. The goal is standardized identity type labels so interactors know what they're dealing with.

## Core Concept

**Entity Type Codes** with phonetic names for verbal disambiguation:
- AI.CA (Kah) - Conversational Agent
- AI.PO (Poe) - Program Orchestrator  
- AI.WS (Wiz) - Web Site
- AI.OS (Aus) - Operating System
- AI.GN (Jen) - Generative Model
- AI.AA (Ahh) - Autonomous Agent
- AR.RB (Rob) - Robot Bot
- AR.DR (Dar) - Drone
- AR.VH (Vee) - Vehicle
- HU.US (Who) - Human User
- HY.CP (Kip) - Copilot
- HY.HS (His) - Hive Swarm

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
entity-identity-zk/
├── circuits/
│   ├── entity_type_proof.circom      # Single-layer ZK proof
│   └── dual_identity_proof.circom    # Combined dual-proof system
├── src/
│   ├── entity-identity.js            # JS library for ZK layer
│   └── dual-system.js                # JS library for dual system
└── README.md                         # Full documentation
```

## Relation to Password Palace

This system complements spatial authentication:
- Same Poseidon hash primitives
- Same merkle tree structures
- Entity type proof can be combined with spatial auth
- Trust hash could be an additional verification factor

The `entityCommitment` bridges both systems - a stable pseudonymous identifier that links ZK privacy to public accountability without revealing the underlying secret.

## Next Steps

1. Compile circuits with circom
2. Run trusted setup (or use existing powers of tau)
3. Build integration tests
4. Design attester registry governance
5. Implement on-chain contracts for public trust layer
6. Browser extension for surfacing entity types
7. Protocol integration (HTTP headers, OAuth scopes)

## Key Insight

The internet needs both privacy AND accountability. Neither alone suffices:
- Pure privacy → bad actors hide
- Pure transparency → surveillance

The dual-proof architecture lets interactions require either or both, graduated by stakes.
