# Sepolia Testnet Deployment

**Deployed:** 2026-01-30

## Contract Addresses

| Contract | Address | Etherscan |
|----------|---------|-----------|
| Groth16Verifier | `0x7444ba1b14a8dfC3342e3190b2Be991bA4A3801E` | [View](https://sepolia.etherscan.io/address/0x7444ba1b14a8dfC3342e3190b2Be991bA4A3801E) |
| EntityTypeRegistry | `0xFb637C39439f969e5Cc0b1910308146f1DD529Fe` | [View](https://sepolia.etherscan.io/address/0xFb637C39439f969e5Cc0b1910308146f1DD529Fe) |

## Network Details

| Property | Value |
|----------|-------|
| Network | Sepolia |
| Chain ID | 11155111 |
| RPC URL | https://ethereum-sepolia-rpc.publicnode.com |
| Deployer | `0x93295684D34dDd3b7f059593C2847158043EF453` |

## Contract Functions

### EntityTypeRegistry

```solidity
// Verify a ZK proof and register entity type
function verifyAndRegister(
    uint[2] calldata proofA,
    uint[2][2] calldata proofB,
    uint[2] calldata proofC,
    uint[5] calldata publicSignals  // [nullifier, commitment, type, attestersRoot, contextId]
) external;

// Query verification status
function getVerification(bytes32 commitment)
    external view returns (uint16 entityType, uint256 timestamp);

// Check if verification is recent
function isVerificationFresh(bytes32 commitment, uint256 maxAge)
    external view returns (bool);

// Admin: update attesters merkle root
function updateAttestersRoot(bytes32 newRoot) external;

// Admin: update public trust root
function updatePublicTrustRoot(bytes32 newRoot) external;
```

### Groth16Verifier

```solidity
// Verify a Groth16 proof
function verifyProof(
    uint[2] calldata _pA,
    uint[2][2] calldata _pB,
    uint[2] calldata _pC,
    uint[5] calldata _pubSignals
) external view returns (bool);
```

## Usage Example

```javascript
const { ethers } = require('ethers');

const provider = new ethers.JsonRpcProvider('https://ethereum-sepolia-rpc.publicnode.com');
const registry = new ethers.Contract(
    '0xFb637C39439f969e5Cc0b1910308146f1DD529Fe',
    ['function getVerification(bytes32) view returns (uint16, uint256)'],
    provider
);

// Check if an entity is verified
const [entityType, timestamp] = await registry.getVerification(commitment);
console.log('Entity type:', entityType); // e.g., 257 = AI.CA
```

## Gas Costs

| Operation | Estimated Gas | Cost @ 10 gwei |
|-----------|---------------|----------------|
| Deploy Verifier | ~1,500,000 | ~0.015 ETH |
| Deploy Registry | ~800,000 | ~0.008 ETH |
| verifyAndRegister | ~300,000 | ~0.003 ETH |
| updateAttestersRoot | ~50,000 | ~0.0005 ETH |

## Next Steps

1. **Set attesters root** - Call `updateAttestersRoot()` with your API's merkle root
2. **Verify contracts** - Optional: verify source on Etherscan with API key
3. **Integrate API** - Connect your off-chain API to sync with on-chain registry
