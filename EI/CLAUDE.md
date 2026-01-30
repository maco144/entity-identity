# CLAUDE.md - Project Context for Claude Code

## Project Overview

**Entity Identity** is a zero-knowledge proof system for universal entity type verification. It allows AIs, robots, humans, and hybrids to prove their type without revealing their identity.

## Quick Reference

```bash
npm run types      # List all 16 entity types
npm run api        # Start REST API on localhost:3000
npm test           # Run ZK proof tests
npm run test:sdk   # Run Jest unit tests (12 tests)
```

## Key Files

| Purpose | File |
|---------|------|
| Entity types definition | `api/server.js:99-116`, `src/entity-identity.js:22-46` |
| ZK circuit | `circuits/entity_type_proof.circom` |
| API server | `api/server.js` |
| Smart contract | `contracts/EntityTypeRegistry.sol` |
| CLI tool | `src/cli.js` |
| SDK entry | `src/index.js` |

## Entity Type Codes

16 types across 4 categories:
- **AI (0x01xx):** CA, PO, WS, OS, GN, AA, LM, DB, JG, SY
- **AR (0x02xx):** RB, DR, VH
- **HU (0x03xx):** US
- **HY (0x04xx):** CP, HS

## Architecture

- **Layer 1 (ZK):** Proves entity type without revealing identity
- **Layer 2 (Public):** Attestation graph for accountability
- **Interaction Levels:** 0=Anonymous, 1=TypeOnly, 2=TypeWithStanding, 3=FullAccountability

## Tech Stack

- Circom circuits with Groth16 proofs
- Poseidon hash + EdDSA signatures
- Express API with SQLite
- Solidity contracts (Hardhat)
- Jest tests

## Common Tasks

- **Add entity type:** Edit `api/server.js` and `src/entity-identity.js` EntityTypes objects
- **Add API endpoint:** Edit `api/server.js`
- **Deploy contracts:** `npx hardhat run scripts/deploy.js --network <network>`
- **Run local node:** `npx hardhat node`

## See Also

- `PROJECT_INDEX.md` - Detailed project index
- `PROMPT.md` - Design context and roadmap
- `api/API_DESIGN.md` - API specification
