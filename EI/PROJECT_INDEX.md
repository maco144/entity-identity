# Project Index: Entity Identity

> Zero-knowledge proof system for universal entity type verification (AIs, robots, humans, hybrids)

**Generated:** 2026-01-31
**Version:** 0.1.0
**Lines of Code:** ~4,156

---

## 📁 Project Structure

```
entity-identity/
├── api/                    # REST API server
│   └── server.js           # Express server (670 lines)
├── circuits/               # ZK circuits (Circom)
│   ├── entity_type_proof.circom
│   └── dual_identity_proof.circom
├── contracts/              # Solidity smart contracts
│   ├── EntityTypeRegistry.sol
│   └── EntityTypeVerifier.sol
├── src/                    # Core SDK
│   ├── index.js            # SDK entry point
│   ├── cli.js              # CLI tool
│   ├── entity-identity.js  # ZK layer library
│   └── dual-system.js      # Dual-proof system
├── scripts/
│   └── deploy.js           # Hardhat deployment
├── test/
│   ├── test-proof.js       # ZK proof tests
│   ├── test-api.js         # API integration tests
│   └── sdk.test.js         # Jest unit tests
├── setup/                  # Trusted setup files
│   └── verification_key.json
└── deployments/            # Contract addresses by network
```

---

## 🚀 Entry Points

| Entry | Path | Command |
|-------|------|---------|
| CLI | `src/cli.js` | `npx eid <command>` |
| API Server | `api/server.js` | `npm run api` |
| SDK | `src/index.js` | `import { ... } from 'entity-identity'` |
| Deploy | `scripts/deploy.js` | `npx hardhat run scripts/deploy.js` |

---

## 📦 Core Modules

### `src/entity-identity.js`
ZK layer primitives for entity type proofs.
- **Exports:** `EntityTypes`, `PhoneticNames`, `initCrypto`, `MerkleTree`, `Attester`, `Entity`, `generateProof`, `verifyProof`
- **Key Classes:** `MerkleTree` (depth-20), `Attester` (EdDSA signing), `Entity` (commitment generation)

### `src/dual-system.js`
Dual-proof architecture combining ZK privacy with public accountability.
- **Exports:** `InteractionLevel`, `RecommendedLevels`, `TrustHash`, `PublicAttestation`, `PublicTrustRegistry`, `DualProofCoordinator`, `VerificationPolicy`
- **Levels:** ANONYMOUS (0), TYPE_ONLY (1), TYPE_WITH_STANDING (2), FULL_ACCOUNTABILITY (3)

### `src/cli.js`
Command-line interface for proof generation and verification.
- **Commands:** `prove`, `verify`, `types`

### `api/server.js`
REST API with SQLite-backed attester registry.
- **Endpoints:** `/api/v1/registry`, `/api/v1/attest`, `/api/v1/verify`, `/api/v1/admin/attesters`
- **Auth:** Bearer token for attesters, Admin API key for management

---

## 🔗 Entity Types (16 total)

| Code | Hex | Phonetic | Description |
|------|-----|----------|-------------|
| AI.CA | 0x0101 | Kah | Conversational Agent |
| AI.PO | 0x0102 | Poe | Program Orchestrator |
| AI.WS | 0x0103 | Wiz | Web Site |
| AI.OS | 0x0104 | Aus | Operating System |
| AI.GN | 0x0105 | Jen | Generative Model |
| AI.AA | 0x0106 | Ahh | Autonomous Agent |
| AI.LM | 0x0107 | Elm | Language Model |
| AI.DB | 0x0108 | Deb | Data Broker |
| AI.JG | 0x0109 | Jig | Judge/Evaluator |
| AI.SY | 0x010A | Sigh | Synthetic Media |
| AR.RB | 0x0201 | Rob | Robot Bot |
| AR.DR | 0x0202 | Dar | Drone |
| AR.VH | 0x0203 | Vee | Vehicle |
| HU.US | 0x0301 | Who | Human User |
| HY.CP | 0x0401 | Kip | Copilot |
| HY.HS | 0x0402 | His | Hive Swarm |

---

## ⚡ Smart Contracts

### `EntityTypeRegistry.sol`
On-chain registry for ZK proof verification.
- **Functions:** `verifyAndRegister()`, `getVerification()`, `isVerificationFresh()`, `updateAttestersRoot()`
- **Events:** `EntityVerified`, `AttestersRootUpdated`

### `EntityTypeVerifier.sol`
Auto-generated Groth16 verifier from snarkjs.

**API Server (live):**
- URL: `http://149.28.33.118:3000`
- Endpoints: `/api/v1/types`, `/api/v1/prove`, `/api/v1/verify`

**Deployed (Sepolia - on-chain):**
- Verifier: [`0x7444ba1b14a8dfC3342e3190b2Be991bA4A3801E`](https://sepolia.etherscan.io/address/0x7444ba1b14a8dfC3342e3190b2Be991bA4A3801E#code)
- Registry: [`0xFb637C39439f969e5Cc0b1910308146f1DD529Fe`](https://sepolia.etherscan.io/address/0xFb637C39439f969e5Cc0b1910308146f1DD529Fe#code)

**Deployed (localhost - for local dev):**
- Verifier: `0x5FbDB2315678afecb367f032d93F642f64180aa3`
- Registry: `0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512`

---

## 🔧 Configuration Files

| File | Purpose |
|------|---------|
| `package.json` | Dependencies, scripts |
| `hardhat.config.cjs` | Hardhat/Solidity config |
| `jest.config.json` | Jest test config |
| `.env.example` | Environment template |
| `Makefile` | Build automation |

---

## 🧪 Tests

| File | Type | Coverage |
|------|------|----------|
| `test/test-proof.js` | Integration | ZK proof generation & verification |
| `test/test-api.js` | Integration | API endpoints |
| `test/sdk.test.js` | Unit (Jest) | 12 tests - EntityTypes, InteractionLevels, MerkleTree, TrustHash |

**Run tests:**
```bash
npm test          # Proof test
npm run test:sdk  # Jest tests
```

---

## 📚 Key Dependencies

| Package | Purpose |
|---------|---------|
| `circomlibjs` | Poseidon hash, EdDSA signatures |
| `snarkjs` | Groth16 proof generation/verification |
| `express` | REST API server |
| `better-sqlite3` | Attester registry storage |
| `ethers` | Ethereum interaction |
| `hardhat` | Smart contract development |
| `commander` | CLI framework |
| `chalk` | Terminal styling |

---

## 🚀 Quick Start

```bash
# Install dependencies
npm install

# List entity types
npm run types

# Run tests
npm test && npm run test:sdk

# Start API server
npm run api

# Deploy contracts (local)
npx hardhat node &
npx hardhat run scripts/deploy.js --network localhost

# Deploy to Sepolia (requires .env with PRIVATE_KEY)
npx hardhat run scripts/deploy.js --network sepolia
```

---

## 📖 API Endpoints

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/api/v1/registry` | - | Get attesters merkle root |
| GET | `/api/v1/registry/attesters` | - | List approved attesters |
| POST | `/api/v1/attest` | Attester | Create attestation |
| POST | `/api/v1/verify` | - | Verify ZK proof |
| POST | `/api/v1/admin/attesters` | Admin | Register new attester |

---

## 🔐 Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    Entity Identity                       │
├─────────────────────────────────────────────────────────┤
│  Layer 1: ZK (Private)     │  Layer 2: Public Trust     │
│  - Proves type only        │  - Attestation history     │
│  - Hides: entity, attester │  - Builds reputation       │
│  - Uses: Groth16 proofs    │  - Sybil resistance        │
├─────────────────────────────────────────────────────────┤
│  Interaction Levels:                                     │
│  0=Anonymous, 1=TypeOnly, 2=TypeWithStanding, 3=Full    │
└─────────────────────────────────────────────────────────┘
```

---

## 📝 Files Quick Reference

| Need to... | Look at |
|------------|---------|
| Add entity type | `api/server.js:99`, `src/entity-identity.js:22` |
| Modify ZK circuit | `circuits/entity_type_proof.circom` |
| Add API endpoint | `api/server.js` |
| Update smart contract | `contracts/EntityTypeRegistry.sol` |
| Add CLI command | `src/cli.js` |
| Add SDK export | `src/index.js` |
