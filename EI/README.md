# Entity Identity Type - ZK Proof System

A zero-knowledge proof system for proving entity types (AI, robot, human, hybrid) without revealing identity.

## What is Circom?

Circom is a **domain-specific language** for writing arithmetic circuits that compile to zero-knowledge proof systems.

### The Key Mental Shift

Traditional programming: *"Do these steps, return result"*
Circom: *"Define mathematical relationships that must all be true"*

You're not writing procedures—you're writing **constraints** that describe valid states.

### Why This Matters

A ZK proof says: "I know secret values that satisfy all these constraints, but I won't tell you what they are."

The prover:
1. Knows all inputs (public + private)
2. Computes all intermediate values
3. Generates a cryptographic proof

The verifier:
1. Knows only public inputs
2. Checks the proof mathematically
3. Learns nothing about private inputs

### Circom Syntax Essentials

```circom
// SIGNALS - the cryptographic values
signal input x;        // Input to the circuit
signal output y;       // Output from the circuit
signal intermediate;   // Internal computation

// ASSIGNMENT & CONSTRAINT
out <-- in * 2;        // Just assigns (prover could lie!)
out === in * 2;        // Just constrains (no value assigned)
out <== in * 2;        // Both (safe - use this)

// TEMPLATES - like functions that generate constraints
template Multiplier() {
    signal input a;
    signal input b;
    signal output c;
    c <== a * b;       // One constraint: c = a * b
}

// USAGE
component mult = Multiplier();
mult.a <== 3;
mult.b <== 4;
// mult.c is now constrained to equal 12
```

### The R1CS Constraint

Every Circom constraint compiles to this form:
```
(linear) × (linear) = (linear)
```

Where "linear" means: `a₀ + a₁x₁ + a₂x₂ + ...`

This restriction enables the ZK math. You can't do `a * b * c` directly—must split into two constraints.

## System Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        ATTESTER REGISTRY                        │
│                                                                 │
│   Anthropic ──┐                                                │
│   OpenAI ─────┼──► Merkle Tree ──► Root (published on-chain)   │
│   Gov Agency ─┘                                                │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                      ATTESTATION FLOW                           │
│                                                                 │
│   Entity                    Attester                            │
│   ──────                    ────────                            │
│   secret ──┐                                                    │
│   salt ────┼──► commitment = Hash(secret, salt)                │
│            │                    │                               │
│            │                    ▼                               │
│            │    message = Hash(commitment, type)                │
│            │                    │                               │
│            │                    ▼                               │
│            │    signature = Sign(privateKey, message)           │
│            │                    │                               │
│            └────────────────────┼───────────────────────────────│
│                                 ▼                               │
│                          ATTESTATION                            │
│                   (stored by entity privately)                  │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                       PROOF GENERATION                          │
│                                                                 │
│   PUBLIC INPUTS              PRIVATE INPUTS                     │
│   ─────────────              ──────────────                     │
│   • claimed_type             • entity_secret                    │
│   • attesters_root           • entity_salt                      │
│   • context_id               • attester_pubkey                  │
│                              • signature                        │
│                              • merkle_path                      │
│                                     │                           │
│                                     ▼                           │
│                            ┌───────────────┐                    │
│                            │    CIRCUIT    │                    │
│                            │               │                    │
│                            │ 1. Verify sig │                    │
│                            │ 2. Check tree │                    │
│                            │ 3. Gen nullif │                    │
│                            └───────────────┘                    │
│                                     │                           │
│                                     ▼                           │
│   PUBLIC OUTPUTS                                                │
│   ──────────────                                                │
│   • nullifier (prevents reuse)                                  │
│   • entity_commitment (stable pseudonym)                        │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                        VERIFICATION                             │
│                                                                 │
│   Verifier receives:                                            │
│   • proof (cryptographic blob, ~200 bytes)                      │
│   • public_signals [nullifier, commitment, type, root, ctx]     │
│                                                                 │
│   Verifier checks:                                              │
│   1. proof is mathematically valid                              │
│   2. attesters_root matches known registry                      │
│   3. nullifier hasn't been used before                          │
│   4. context_id matches expected session                        │
│                                                                 │
│   Verifier learns:                                              │
│   ✓ Entity is type X                                            │
│   ✓ An approved attester vouched for them                       │
│   ✗ Which entity (only commitment)                              │
│   ✗ Which attester                                              │
│   ✗ Any other metadata                                          │
└─────────────────────────────────────────────────────────────────┘
```

## Entity Type Codes

| Code | Prefix | Category | Phonetic | Description |
|------|--------|----------|----------|-------------|
| AI.CA | 0x01 | 0x01 | Kah | Conversational Agent |
| AI.PO | 0x01 | 0x02 | Poe | Program Orchestrator |
| AI.WS | 0x01 | 0x03 | Wiz | Web Site |
| AI.OS | 0x01 | 0x04 | Aus | Operating System |
| AI.GN | 0x01 | 0x05 | Jen | Generative Model |
| AI.AA | 0x01 | 0x06 | Ahh | Autonomous Agent |
| AR.RB | 0x02 | 0x01 | Rob | Robot Bot |
| AR.DR | 0x02 | 0x02 | Dar | Drone |
| AR.VH | 0x02 | 0x03 | Vee | Vehicle |
| HU.US | 0x03 | 0x01 | Who | Human User |
| HY.CP | 0x04 | 0x01 | Kip | Copilot |
| HY.HS | 0x04 | 0x02 | His | Hive Swarm |

## Building & Running

### Prerequisites

```bash
# Install Circom
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
git clone https://github.com/iden3/circom.git
cd circom && cargo build --release
sudo cp target/release/circom /usr/local/bin/

# Install snarkjs
npm install -g snarkjs

# Install dependencies
npm install circomlibjs
```

### Compile Circuit

```bash
cd circuits

# Compile to R1CS + WASM
circom entity_type_proof.circom --r1cs --wasm --sym -l node_modules

# View circuit info
snarkjs r1cs info entity_type_proof.r1cs
```

### Trusted Setup (Groth16)

```bash
# Download powers of tau (or generate your own)
wget https://hermez.s3-eu-west-1.amazonaws.com/powersOfTau28_hez_final_15.ptau

# Phase 2 setup
snarkjs groth16 setup entity_type_proof.r1cs powersOfTau28_hez_final_15.ptau circuit_0000.zkey

# Contribute randomness (production: multiple parties)
snarkjs zkey contribute circuit_0000.zkey circuit_final.zkey --name="First contribution"

# Export verification key
snarkjs zkey export verificationkey circuit_final.zkey verification_key.json
```

### Generate & Verify Proof

```bash
# Prepare inputs (see src/entity-identity.js for generation)
cat > input.json << 'EOF'
{
    "claimedType": "257",
    "attestersRoot": "12345...",
    "contextId": "1704067200000",
    "entitySecret": "98765...",
    ...
}
EOF

# Compute witness
node entity_type_proof_js/generate_witness.js entity_type_proof_js/entity_type_proof.wasm input.json witness.wtns

# Generate proof
snarkjs groth16 prove circuit_final.zkey witness.wtns proof.json public.json

# Verify proof
snarkjs groth16 verify verification_key.json public.json proof.json
```

### On-Chain Verification

```bash
# Export Solidity verifier
snarkjs zkey export solidityverifier circuit_final.zkey verifier.sol

# Deploy verifier.sol to your chain
# Call verifyProof(proof, publicSignals) from your contract
```

## Integration Patterns

### HTTP Header

```http
GET /api/data HTTP/1.1
Host: example.com
Entity-Type: AI.CA/1.0
Entity-Proof: <base64-encoded-proof>
Entity-Signals: <base64-encoded-public-signals>
```

### JWT Claim

```json
{
  "sub": "entity_commitment_hash",
  "iat": 1704067200,
  "entity_type": "AI.CA",
  "entity_proof": {
    "proof": "...",
    "signals": ["nullifier", "commitment", "type", "root", "ctx"]
  }
}
```

### DID Document

```json
{
  "@context": ["https://www.w3.org/ns/did/v1"],
  "id": "did:eid:ai.ca:abc123",
  "verificationMethod": [{
    "id": "did:eid:ai.ca:abc123#zk-proof",
    "type": "Groth16Proof2024",
    "publicSignals": ["..."]
  }]
}
```

## Security Considerations

1. **Attester Registry Governance**: Who can add/remove attesters? Consider multi-sig or DAO.

2. **Nullifier Domains**: Context ID should be chosen carefully. Too broad = linkability. Too narrow = spam.

3. **Attestation Revocation**: If an entity is compromised, how do you revoke? Options:
   - Epoch-based expiry (attestations expire)
   - Revocation merkle tree (check non-membership)
   - New attesters root (rotate registry)

4. **Trusted Setup**: Groth16 requires trusted setup. For production:
   - Use multi-party computation ceremony
   - Or switch to Plonk (no trusted setup, larger proofs)

## Constraint Count

| Component | Constraints |
|-----------|-------------|
| Poseidon(2) | ~300 |
| EdDSA verify | ~6,000 |
| Merkle(20) | ~6,000 |
| **Total** | **~13,000** |

Performance (modern laptop):
- Proof generation: 2-5 seconds
- Proof size: ~200 bytes
- Verification: ~10ms
- On-chain gas: ~250,000

## Relation to Password Palace

This system could complement your spatial authentication:

1. **Entity declares type** via ZK proof when initiating session
2. **Spatial auth** verifies the entity knows the pattern
3. **Combined claim**: "I am an AI.CA AND I know this spatial pattern"

The Poseidon hashes and merkle structures align with your existing architecture.
