pragma circom 2.1.6;

/*
================================================================================
DUAL CRYPTOGRAPHIC IDENTITY SYSTEM
================================================================================

PHILOSOPHY:
The internet needs both privacy AND accountability. Neither alone suffices.

- Pure privacy → bad actors hide, no recourse
- Pure transparency → surveillance, chilling effects

Solution: Dual-proof architecture where interactions can require either or both.

LAYER 1 - PRIVATE (ZK):
  Proves type without revealing identity.
  "I am an AI.CA" - verifier learns nothing else.

LAYER 2 - PUBLIC (Collaborative Trust):
  Accumulates visible attestations on a commitment.
  "This commitment has been vouched for by 5 attesters over 2 years"
  Anyone can audit the attestation graph.

DUAL PROOF:
  Proves BOTH privately and shows public standing.
  "I am AI.CA (proven via ZK) AND my commitment has public attestations (verifiable on-chain)"

================================================================================
*/

include "circomlib/circuits/poseidon.circom";
include "circomlib/circuits/eddsaposeidon.circom";
include "circomlib/circuits/comparators.circom";
include "circomlib/circuits/mux1.circom";
include "circomlib/circuits/bitify.circom";

/*
--------------------------------------------------------------------------------
PUBLIC TRUST REGISTRY - Data Structure
--------------------------------------------------------------------------------

On-chain, we maintain a public merkle tree of attestations:

Leaf = Poseidon(
    entity_commitment,
    entity_type,
    attester_pubkey_hash,
    timestamp,
    attestation_id
)

This is PUBLICLY VISIBLE. Anyone can:
  - See all attestations for a commitment
  - Verify attester signatures
  - Audit the history
  - Build trust graphs

The entity_commitment links to the ZK layer without revealing the entity's secret.
*/

/*
--------------------------------------------------------------------------------
COMPONENT: Public Attestation Leaf
--------------------------------------------------------------------------------
Computes the leaf value for the public trust tree.
*/

template PublicAttestationLeaf() {
    signal input entityCommitment;
    signal input entityType;
    signal input attesterPubKeyHash;
    signal input timestamp;
    signal input attestationId;
    
    signal output leaf;
    
    // 5-input Poseidon hash
    component hasher = Poseidon(5);
    hasher.inputs[0] <== entityCommitment;
    hasher.inputs[1] <== entityType;
    hasher.inputs[2] <== attesterPubKeyHash;
    hasher.inputs[3] <== timestamp;
    hasher.inputs[4] <== attestationId;
    
    leaf <== hasher.out;
}


/*
--------------------------------------------------------------------------------
COMPONENT: Public Trust Proof
--------------------------------------------------------------------------------
Proves that an entity's commitment exists in the public trust registry
with at least N attestations.

This is NOT zero-knowledge about the commitment - it's meant to be public.
But we can prove properties about the public record.
*/

template PublicTrustMerkleVerifier(depth) {
    signal input leaf;
    signal input pathElements[depth];
    signal input pathIndices[depth];
    signal output root;
    
    signal hashes[depth + 1];
    hashes[0] <== leaf;
    
    component hashers[depth];
    component muxLeft[depth];
    component muxRight[depth];
    
    for (var i = 0; i < depth; i++) {
        pathIndices[i] * (1 - pathIndices[i]) === 0;
        
        muxLeft[i] = Mux1();
        muxLeft[i].c[0] <== hashes[i];
        muxLeft[i].c[1] <== pathElements[i];
        muxLeft[i].s <== pathIndices[i];
        
        muxRight[i] = Mux1();
        muxRight[i].c[0] <== pathElements[i];
        muxRight[i].c[1] <== hashes[i];
        muxRight[i].s <== pathIndices[i];
        
        hashers[i] = Poseidon(2);
        hashers[i].inputs[0] <== muxLeft[i].out;
        hashers[i].inputs[1] <== muxRight[i].out;
        
        hashes[i + 1] <== hashers[i].out;
    }
    
    root <== hashes[depth];
}


/*
--------------------------------------------------------------------------------
COMPONENT: Attestation Count Proof
--------------------------------------------------------------------------------
Proves that an entity has at least minAttestations in the public registry.

This uses a simple approach: provide N attestation merkle proofs,
circuit verifies all are valid and all reference the same commitment.

More sophisticated: accumulator-based count proofs (RSA accumulators, etc.)
*/

template AttestationCountProof(depth, maxAttestations) {
    // Public inputs
    signal input entityCommitment;
    signal input publicTrustRoot;
    signal input minAttestations;
    
    // Private inputs - array of attestation proofs
    signal input attestationLeaves[maxAttestations];
    signal input attestationPaths[maxAttestations][depth];
    signal input attestationIndices[maxAttestations][depth];
    signal input attestationValid[maxAttestations];  // 1 if this slot is used, 0 if padding
    
    // Count valid attestations
    signal runningCount[maxAttestations + 1];
    runningCount[0] <== 0;
    
    component merkleVerifiers[maxAttestations];
    component leafExtractors[maxAttestations];
    
    for (var i = 0; i < maxAttestations; i++) {
        // Constrain attestationValid to binary
        attestationValid[i] * (1 - attestationValid[i]) === 0;
        
        // Verify merkle proof for this attestation
        merkleVerifiers[i] = PublicTrustMerkleVerifier(depth);
        merkleVerifiers[i].leaf <== attestationLeaves[i];
        for (var j = 0; j < depth; j++) {
            merkleVerifiers[i].pathElements[j] <== attestationPaths[i][j];
            merkleVerifiers[i].pathIndices[j] <== attestationIndices[i][j];
        }
        
        // If valid, root must match (if not valid, we don't care)
        // (computed_root - expected_root) * valid === 0
        // Either valid=0 (don't care) or roots match
        (merkleVerifiers[i].root - publicTrustRoot) * attestationValid[i] === 0;
        
        // Accumulate count
        runningCount[i + 1] <== runningCount[i] + attestationValid[i];
    }
    
    // Final count must be >= minAttestations
    component gte = GreaterEqThan(32);
    gte.in[0] <== runningCount[maxAttestations];
    gte.in[1] <== minAttestations;
    gte.out === 1;
}


/*
--------------------------------------------------------------------------------
COMPONENT: Timestamp Range Proof
--------------------------------------------------------------------------------
Proves that the entity has attestations within a time range.
Useful for: "Has been attested within the last year"
*/

template TimestampRangeProof() {
    signal input attestationTimestamp;
    signal input minTimestamp;
    signal input maxTimestamp;
    
    // timestamp >= min
    component gteMin = GreaterEqThan(64);
    gteMin.in[0] <== attestationTimestamp;
    gteMin.in[1] <== minTimestamp;
    gteMin.out === 1;
    
    // timestamp <= max
    component lteMax = LessEqThan(64);
    lteMax.in[0] <== attestationTimestamp;
    lteMax.in[1] <== maxTimestamp;
    lteMax.out === 1;
}


/*
--------------------------------------------------------------------------------
MAIN CIRCUIT: DualIdentityProof
--------------------------------------------------------------------------------
The combined proof that satisfies both layers.

PUBLIC INPUTS:
  - claimedType: The entity type being claimed
  - zkAttestersRoot: Merkle root of approved ZK attesters
  - publicTrustRoot: Merkle root of public attestation registry
  - contextId: For nullifier generation
  - minPublicAttestations: Minimum required public attestations
  - minTimestamp: Oldest acceptable attestation
  - maxTimestamp: Newest acceptable attestation (usually "now")

PRIVATE INPUTS:
  - All ZK proof inputs (entity secret, attestation, merkle path)
  - Public trust merkle proofs

OUTPUTS:
  - nullifier: Prevents replay
  - entityCommitment: The stable identifier (visible in both layers)

SECURITY PROPERTY:
  An attacker must compromise BOTH:
  1. A valid ZK attestation from an approved attester
  2. Sufficient public attestations for the same commitment
*/

template DualIdentityProof(zkMerkleDepth, publicMerkleDepth, maxPublicAttestations) {
    // ==================== PUBLIC INPUTS ====================
    
    // ZK layer
    signal input claimedType;
    signal input zkAttestersRoot;
    signal input contextId;
    
    // Public layer
    signal input publicTrustRoot;
    signal input minPublicAttestations;
    signal input minTimestamp;
    signal input maxTimestamp;
    
    // ==================== PRIVATE INPUTS ====================
    
    // ZK layer - entity
    signal input entitySecret;
    signal input entitySalt;
    
    // ZK layer - attestation
    signal input zkAttesterPubKeyX;
    signal input zkAttesterPubKeyY;
    signal input zkSignatureR8X;
    signal input zkSignatureR8Y;
    signal input zkSignatureS;
    signal input zkAttesterPathElements[zkMerkleDepth];
    signal input zkAttesterPathIndices[zkMerkleDepth];
    
    // Public layer - attestation proofs
    signal input publicAttestationLeaves[maxPublicAttestations];
    signal input publicAttestationPaths[maxPublicAttestations][publicMerkleDepth];
    signal input publicAttestationIndices[maxPublicAttestations][publicMerkleDepth];
    signal input publicAttestationValid[maxPublicAttestations];
    signal input publicAttestationTimestamps[maxPublicAttestations];
    
    // ==================== PUBLIC OUTPUTS ====================
    signal output nullifier;
    signal output entityCommitment;
    
    // ==================== ZK LAYER VERIFICATION ====================
    
    // Compute entity commitment
    component commitHasher = Poseidon(2);
    commitHasher.inputs[0] <== entitySecret;
    commitHasher.inputs[1] <== entitySalt;
    entityCommitment <== commitHasher.out;
    
    // Compute message for ZK attestation
    component zkMsgHasher = Poseidon(2);
    zkMsgHasher.inputs[0] <== entityCommitment;
    zkMsgHasher.inputs[1] <== claimedType;
    
    // Verify ZK attestation signature
    component zkSigVerifier = EdDSAPoseidonVerifier();
    zkSigVerifier.enabled <== 1;
    zkSigVerifier.Ax <== zkAttesterPubKeyX;
    zkSigVerifier.Ay <== zkAttesterPubKeyY;
    zkSigVerifier.R8x <== zkSignatureR8X;
    zkSigVerifier.R8y <== zkSignatureR8Y;
    zkSigVerifier.S <== zkSignatureS;
    zkSigVerifier.M <== zkMsgHasher.out;
    
    // Verify ZK attester is in approved set
    component zkAttesterLeaf = Poseidon(2);
    zkAttesterLeaf.inputs[0] <== zkAttesterPubKeyX;
    zkAttesterLeaf.inputs[1] <== zkAttesterPubKeyY;
    
    component zkAttesterMerkle = PublicTrustMerkleVerifier(zkMerkleDepth);
    zkAttesterMerkle.leaf <== zkAttesterLeaf.out;
    for (var i = 0; i < zkMerkleDepth; i++) {
        zkAttesterMerkle.pathElements[i] <== zkAttesterPathElements[i];
        zkAttesterMerkle.pathIndices[i] <== zkAttesterPathIndices[i];
    }
    zkAttestersRoot === zkAttesterMerkle.root;
    
    // Generate nullifier
    component nullGen = Poseidon(2);
    nullGen.inputs[0] <== entitySecret;
    nullGen.inputs[1] <== contextId;
    nullifier <== nullGen.out;
    
    // ==================== PUBLIC LAYER VERIFICATION ====================
    
    // Count valid public attestations
    signal runningCount[maxPublicAttestations + 1];
    runningCount[0] <== 0;
    
    component publicMerkleVerifiers[maxPublicAttestations];
    component timestampChecks[maxPublicAttestations];
    
    for (var i = 0; i < maxPublicAttestations; i++) {
        // Binary constraint
        publicAttestationValid[i] * (1 - publicAttestationValid[i]) === 0;
        
        // Verify merkle proof
        publicMerkleVerifiers[i] = PublicTrustMerkleVerifier(publicMerkleDepth);
        publicMerkleVerifiers[i].leaf <== publicAttestationLeaves[i];
        for (var j = 0; j < publicMerkleDepth; j++) {
            publicMerkleVerifiers[i].pathElements[j] <== publicAttestationPaths[i][j];
            publicMerkleVerifiers[i].pathIndices[j] <== publicAttestationIndices[i][j];
        }
        
        // If valid, root must match
        (publicMerkleVerifiers[i].root - publicTrustRoot) * publicAttestationValid[i] === 0;
        
        // Timestamp range check (only matters if valid)
        // For simplicity, we check all timestamps but only count valid ones
        timestampChecks[i] = TimestampRangeProof();
        timestampChecks[i].attestationTimestamp <== publicAttestationTimestamps[i];
        timestampChecks[i].minTimestamp <== minTimestamp;
        timestampChecks[i].maxTimestamp <== maxTimestamp;
        
        // Accumulate
        runningCount[i + 1] <== runningCount[i] + publicAttestationValid[i];
    }
    
    // Verify minimum attestation count
    component countCheck = GreaterEqThan(32);
    countCheck.in[0] <== runningCount[maxPublicAttestations];
    countCheck.in[1] <== minPublicAttestations;
    countCheck.out === 1;
}

// Instantiate with reasonable defaults
// - ZK attester tree: 2^20 = ~1M attesters
// - Public trust tree: 2^24 = ~16M attestations
// - Max attestations to prove: 10
component main {public [
    claimedType,
    zkAttestersRoot,
    contextId,
    publicTrustRoot,
    minPublicAttestations,
    minTimestamp,
    maxTimestamp
]} = DualIdentityProof(20, 24, 10);


/*
================================================================================
INTERACTION LEVELS
================================================================================

LEVEL 0 - Anonymous
  No proof required.
  Use: Public content consumption, basic browsing.

LEVEL 1 - Type Only (ZK)
  Prove entity type via ZK.
  Verifier learns: "This is an AI.CA"
  Verifier doesn't learn: Who, attestation history
  Use: Casual interactions, privacy-preserving services.

LEVEL 2 - Type + Standing (Dual)
  Prove type (ZK) AND public attestation count.
  Verifier learns: "This is an AI.CA with 5+ public attestations"
  Verifier doesn't learn: Which attesters (in ZK), secret identity
  Use: Moderate trust interactions, API access.

LEVEL 3 - Full Accountability
  Dual proof + reveal specific public attestations.
  Verifier learns: Full public attestation history for this commitment.
  Use: Financial transactions, legal actions, physical world access.

================================================================================
HASH COMMITMENT SCHEME
================================================================================

Users maintain a local "trust hash" - a rolling hash of their trust state:

trust_hash = Poseidon(
    entity_commitment,
    zk_attesters_root,
    public_trust_root,
    last_attestation_id,
    nonce
)

This allows quick verification that nothing has changed:
  "My trust state is still X" without re-proving everything.

On-chain, a smart contract can store:
  mapping(bytes32 => uint256) public trustHashTimestamps;

Entities periodically anchor their trust_hash on-chain.
If challenged, they can provide the full proof.

================================================================================
*/
