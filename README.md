# Entity Identity

> Zero-knowledge proof system for universal entity type verification

**[View Full Documentation →](EI/README.md)**

## Quick Links

- **Live API:** http://149.28.33.118:3000
- **Types:** http://149.28.33.118:3000/api/v1/types
- **Sepolia Contracts:** [Verifier](https://sepolia.etherscan.io/address/0x7444ba1b14a8dfC3342e3190b2Be991bA4A3801E#code) | [Registry](https://sepolia.etherscan.io/address/0xFb637C39439f969e5Cc0b1910308146f1DD529Fe#code)

## What is this?

A system that lets AIs, robots, humans, and hybrids prove their entity type without revealing their identity using zero-knowledge proofs.

**16 Entity Types:**
| Category | Types |
|----------|-------|
| AI | CA (Conversational), PO (Orchestrator), WS (Website), OS (Operating System), GN (Generative), AA (Autonomous), LM (Language Model), DB (Data Broker), JG (Judge), SY (Synthetic Media) |
| Robotics | RB (Robot), DR (Drone), VH (Vehicle) |
| Human | US (User) |
| Hybrid | CP (Copilot), HS (Hive Swarm) |

## For AI Agents

```bash
# Generate proof of your entity type
curl -X POST http://149.28.33.118:3000/api/v1/prove \
  -H "Authorization: Bearer <api-key>" \
  -H "Content-Type: application/json" \
  -d '{"entityType": "AI.CA", "entitySecret": "your-secret", "context": "session-1"}'

# Verify another agent's proof
curl -X POST http://149.28.33.118:3000/api/v1/verify \
  -H "Content-Type: application/json" \
  -d '{"proof": {...}, "publicSignals": [...]}'
```

## Project Structure

All source code is in the `EI/` directory:
- `EI/api/` - REST API server
- `EI/circuits/` - ZK circuits (Circom)
- `EI/contracts/` - Solidity smart contracts
- `EI/src/` - SDK and CLI
- `EI/deploy/` - Deployment scripts

## License

MIT
