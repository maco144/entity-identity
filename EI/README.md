# Entity Identity - ZK Proof System

A zero-knowledge proof system for proving entity types (AI, robot, human, hybrid) without revealing identity.

**Live API:** http://149.28.33.118:3000

## For AI Agents

Generate a proof that you're a specific entity type:

```bash
curl -X POST http://149.28.33.118:3000/api/v1/prove \
  -H "Authorization: Bearer <your-api-key>" \
  -H "Content-Type: application/json" \
  -d '{"entityType": "AI.CA", "entitySecret": "your-secret", "context": "session-1"}'
```

Verify another agent's proof:

```bash
curl -X POST http://149.28.33.118:3000/api/v1/verify \
  -H "Content-Type: application/json" \
  -d '{"proof": {...}, "publicSignals": [...]}'
```

See [deploy/AGENT_PROTOCOL.md](deploy/AGENT_PROTOCOL.md) for full integration guide.

## Quick Start

```bash
# Install dependencies
npm install

# List all 16 entity types
npm run types

# Run tests
npm test           # ZK proof test
npm run test:sdk   # Jest unit tests (12 tests)

# Start API server
npm run api        # Runs on http://localhost:3000

# Deploy contracts locally
npx hardhat node &
npx hardhat run scripts/deploy.js --network localhost
```

## Entity Type Codes

16 types across 4 categories with phonetic names for verbal disambiguation:

| Code | Hex | Phonetic | Description |
|------|-----|----------|-------------|
| **AI - Artificial Intelligence** ||||
| AI.CA | 0x0101 | Kah | Conversational Agent |
| AI.PO | 0x0102 | Poe | Program Orchestrator |
| AI.WS | 0x0103 | Wiz | Web Site |
| AI.OS | 0x0104 | Aus | Operating System |
| AI.GN | 0x0105 | Jen | Generative Model |
| AI.AA | 0x0106 | Ahh | Autonomous Agent |
| AI.LM | 0x0107 | Elm | Language Model |
| AI.DB | 0x0108 | Deb | Data Broker |
| AI.JG | 0x0109 | Jig | Judge/Evaluator |
| AI.SY | 0x010A | Sigh | Synthetic Media Generator |
| **AR - Artificial Robotics** ||||
| AR.RB | 0x0201 | Rob | Robot Bot |
| AR.DR | 0x0202 | Dar | Drone |
| AR.VH | 0x0203 | Vee | Vehicle |
| **HU - Human** ||||
| HU.US | 0x0301 | Who | Human User |
| **HY - Hybrid** ||||
| HY.CP | 0x0401 | Kip | Copilot (human-AI pair) |
| HY.HS | 0x0402 | His | Hive Swarm |

## CLI Usage

```bash
# List all entity types
npx eid types

# Generate a proof
npx eid prove --type AI.CA --context session123 --output proof.json

# Verify a proof
npx eid verify --proof proof.json
```

## API Endpoints

**Base URL:** http://149.28.33.118:3000

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/health` | - | Health check |
| GET | `/api/v1/types` | - | List all 16 entity types |
| GET | `/api/v1/registry` | - | Get attesters merkle root |
| GET | `/api/v1/registry/attesters` | - | List approved attesters |
| POST | `/api/v1/prove` | Attester | Generate ZK proof (server-side) |
| POST | `/api/v1/attest` | Attester | Create signed attestation |
| POST | `/api/v1/verify` | - | Verify ZK proof |
| POST | `/api/v1/admin/attesters` | Admin | Register new attester |
| DELETE | `/api/v1/admin/attesters/:id` | Admin | Revoke attester |

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                      DUAL-LAYER SYSTEM                          │
├─────────────────────────────────────────────────────────────────┤
│  Layer 1: ZK (Private)         │  Layer 2: Public Trust        │
│  • Proves type without ID      │  • Attestation history        │
│  • Hides: entity, attester     │  • Builds reputation          │
│  • Uses: Groth16 proofs        │  • Sybil resistance           │
├─────────────────────────────────────────────────────────────────┤
│  Interaction Levels:                                            │
│  0 = Anonymous       │ Browsing, reading                        │
│  1 = Type Only (ZK)  │ Comments, basic API access               │
│  2 = Type + Standing │ Transactions, publishing                 │
│  3 = Full Account.   │ Legal, financial, physical access        │
└─────────────────────────────────────────────────────────────────┘
```

### Attestation Flow

```
Entity                      Attester                    Verifier
──────                      ────────                    ────────
secret + salt
    │
    ▼
commitment = Hash(secret, salt)
    │
    └──────► Sign(commitment, type) ─────► attestation
                                                │
                                                ▼
                                          ZK Proof
                                                │
    ◄───────────────────────────────────────────┘
    │
    ▼
Generate proof with:
• Private: secret, salt, signature, merkle path
• Public: type, attesters root, context ID
    │
    └──────────────────────────────────────────► Verify proof
                                                 • Check proof valid
                                                 • Check root matches
                                                 • Check nullifier unused
                                                 • Learn: type only ✓
```

## Smart Contracts

### EntityTypeRegistry.sol

On-chain registry for ZK proof verification.

```solidity
// Verify and register an entity type proof
function verifyAndRegister(
    uint[2] calldata proofA,
    uint[2][2] calldata proofB,
    uint[2] calldata proofC,
    uint[5] calldata publicSignals
) external;

// Check verification status
function getVerification(bytes32 commitment) external view
    returns (uint16 entityType, uint256 timestamp);

// Check if verification is fresh
function isVerificationFresh(bytes32 commitment, uint256 maxAge) external view
    returns (bool fresh);
```

### Deployed Contracts

**Sepolia Testnet:**
| Contract | Address |
|----------|---------|
| Groth16Verifier | [`0x7444ba1b14a8dfC3342e3190b2Be991bA4A3801E`](https://sepolia.etherscan.io/address/0x7444ba1b14a8dfC3342e3190b2Be991bA4A3801E#code) |
| EntityTypeRegistry | [`0xFb637C39439f969e5Cc0b1910308146f1DD529Fe`](https://sepolia.etherscan.io/address/0xFb637C39439f969e5Cc0b1910308146f1DD529Fe#code) |

### Deployment

```bash
# Local Hardhat network
npx hardhat node &
npx hardhat run scripts/deploy.js --network localhost

# Sepolia testnet (requires .env with PRIVATE_KEY)
npx hardhat run scripts/deploy.js --network sepolia

# Docker deployment to VPS
./deploy/deploy.sh <vps-ip> [domain]
./deploy/register-attester.sh <id> <name> <types>
```

## Building from Source

### Prerequisites

```bash
# Install Circom (Rust required)
git clone https://github.com/iden3/circom.git
cd circom && cargo build --release
sudo cp target/release/circom /usr/local/bin/

# Install dependencies
npm install
```

### Build & Setup

```bash
# Using Makefile
make install    # Install dependencies
make build      # Compile circuits
make setup      # Trusted setup (downloads powers of tau)
make test       # Run all tests
make solidity   # Export Solidity verifier
make deploy     # Deploy to Sepolia

# Or manually
circom circuits/entity_type_proof.circom --r1cs --wasm --sym -l node_modules -o build
```

## What is Circom?

Circom is a domain-specific language for writing arithmetic circuits that compile to zero-knowledge proofs.

**Key mental shift:** You're not writing procedures—you're writing **constraints** that describe valid states.

```circom
// Signals - cryptographic values
signal input x;        // Input to circuit
signal output y;       // Output from circuit

// Constraint operators
out <-- in * 2;        // Assigns only (prover could lie!)
out === in * 2;        // Constrains only (no value)
out <== in * 2;        // Both - safe, use this

// Templates - like functions generating constraints
template Multiplier() {
    signal input a, b;
    signal output c;
    c <== a * b;  // Creates constraint: c = a * b
}
```

## Performance

| Metric | Value |
|--------|-------|
| Circuit constraints | ~13,000 |
| Proof generation | 2-5 seconds |
| Proof size | ~200 bytes |
| Verification time | ~10ms |
| On-chain gas | ~250,000 |

## Security Considerations

1. **Attester Governance**: Who can add/remove attesters? Consider multi-sig or DAO.
2. **Nullifier Domains**: Context ID scope affects linkability vs spam prevention.
3. **Attestation Revocation**: Epoch expiry, revocation tree, or registry rotation.
4. **Trusted Setup**: Groth16 requires ceremony. Use MPC for production or switch to Plonk.

## Project Structure

```
entity-identity/
├── api/server.js           # REST API server
├── circuits/               # Circom ZK circuits
├── contracts/              # Solidity contracts
├── src/
│   ├── cli.js              # CLI tool
│   ├── index.js            # SDK entry point
│   ├── entity-identity.js  # ZK layer library
│   └── dual-system.js      # Dual-proof system
├── test/                   # Test suites
├── scripts/deploy.js       # Hardhat deployment
└── setup/                  # Trusted setup files
```

## Integration Patterns

### HTTP Header

```http
GET /api/data HTTP/1.1
Entity-Type: AI.CA/1.0
Entity-Proof: <base64-encoded-proof>
Entity-Signals: <base64-encoded-public-signals>
```

### JWT Claim

```json
{
  "sub": "entity_commitment_hash",
  "entity_type": "AI.CA",
  "entity_proof": {
    "proof": "...",
    "signals": ["nullifier", "commitment", "type", "root", "ctx"]
  }
}
```

## License

MIT

## See Also

- `PROMPT.md` - Design context and roadmap
- `PROJECT_INDEX.md` - Detailed project index
- `CLAUDE.md` - Quick reference for Claude Code
- `api/API_DESIGN.md` - Full API specification
