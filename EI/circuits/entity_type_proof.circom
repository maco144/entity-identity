pragma circom 2.1.6;

/*
================================================================================
ENTITY IDENTITY TYPE PROOF CIRCUIT
================================================================================

PURPOSE:
Prove "I am entity type X" without revealing:
  - Which specific entity you are
  - Who attested your type
  - Any other metadata

CIRCOM FUNDAMENTALS:
--------------------

1. SIGNALS vs VARIABLES
   - `signal` = cryptographic witness (the actual values in the proof)
   - `var` = compile-time computation helper (not part of the proof)
   
   Signals are immutable once assigned. You cannot do:
     signal x;
     x <-- 5;
     x <-- 10;  // ERROR: already assigned

2. OPERATORS
   - `<--`  : Assign value (no constraint generated)
   - `===`  : Create constraint (no assignment)
   - `<==`  : Assign AND constrain (most common, combines both)
   
   Example:
     out <-- in1 * in2;    // Just assigns, prover could lie
     out === in1 * in2;    // Just constrains, but out has no value
     out <== in1 * in2;    // Assigns AND constrains (safe)

3. CONSTRAINT RULES
   - Only quadratic: (linear) * (linear) = (linear)
   - Valid:   a * b === c
   - Valid:   (a + b) * c === d
   - INVALID: a * b * c === d  (cubic - must split into two constraints)

4. TEMPLATES
   - Like functions, but they generate constraint systems
   - Instantiated with `component name = TemplateName(params)`
   - Connected via signal assignment

================================================================================
*/

// External dependencies - these are standard libraries
include "circomlib/circuits/poseidon.circom";      // Hash function (ZK-friendly)
include "circomlib/circuits/eddsaposeidon.circom"; // Signature verification
include "circomlib/circuits/comparators.circom";   // Equality, less-than, etc.
include "circomlib/circuits/mux1.circom";          // Multiplexer (conditional select)

/*
--------------------------------------------------------------------------------
COMPONENT 1: Entity Type Encoder
--------------------------------------------------------------------------------
Maps human-readable type codes to field elements.

Why needed: ZK circuits operate on finite field elements (big integers mod p).
We need a canonical encoding for entity types.

Type encoding scheme:
  Prefix (8 bits) | Category (8 bits) = 16-bit identifier
  
  Prefix:
    0x01 = AI (Artificial Intelligence)
    0x02 = AR (Artificial Robotics)  
    0x03 = HU (Human)
    0x04 = HY (Hybrid)
    
  Categories vary by prefix.
*/

// This is a FUNCTION, not a template - it runs at compile time
// Functions return values, templates generate constraints
function encodeEntityType(prefix, category) {
    return prefix * 256 + category;
}

// Precomputed constants for known types
// Using `var` because these are compile-time constants
function AI_CA() { return encodeEntityType(0x01, 0x01); }  // Conversational Agent
function AI_PO() { return encodeEntityType(0x01, 0x02); }  // Program Orchestrator
function AI_WS() { return encodeEntityType(0x01, 0x03); }  // Web Site
function AI_OS() { return encodeEntityType(0x01, 0x04); }  // Operating System
function AI_GN() { return encodeEntityType(0x01, 0x05); }  // Generative Model
function AI_AA() { return encodeEntityType(0x01, 0x06); }  // Autonomous Agent

function AR_RB() { return encodeEntityType(0x02, 0x01); }  // Robot Bot
function AR_DR() { return encodeEntityType(0x02, 0x02); }  // Drone
function AR_VH() { return encodeEntityType(0x02, 0x03); }  // Vehicle

function HU_US() { return encodeEntityType(0x03, 0x01); }  // Human User

function HY_CP() { return encodeEntityType(0x04, 0x01); }  // Copilot
function HY_HS() { return encodeEntityType(0x04, 0x02); }  // Hive Swarm


/*
--------------------------------------------------------------------------------
COMPONENT 2: Merkle Tree Verifier
--------------------------------------------------------------------------------
Proves membership in a set without revealing which member.

How Merkle proofs work:
  - Tree has N leaves (the set members)
  - To prove leaf L is in tree with root R:
    - Provide the "sibling" hashes along the path from L to R
    - Verifier recomputes root and checks equality
    
  Path encoding:
    - pathIndices[i] = 0 means sibling is on RIGHT
    - pathIndices[i] = 1 means sibling is on LEFT
*/

template MerkleTreeVerifier(depth) {
    // depth = number of levels in tree (tree has 2^depth leaves)
    
    signal input leaf;                    // The value we're proving membership of
    signal input pathElements[depth];     // Sibling hashes along the path  
    signal input pathIndices[depth];      // Left/right path (0 or 1 each)
    signal output root;                   // Computed merkle root
    
    // Intermediate hash values as we climb the tree
    signal hashes[depth + 1];
    hashes[0] <== leaf;
    
    // Components for each level
    component hashers[depth];
    component muxLeft[depth];
    component muxRight[depth];
    
    for (var i = 0; i < depth; i++) {
        /*
        At each level, we need to hash(left, right).
        If pathIndices[i] == 0: current is LEFT,  sibling is RIGHT
        If pathIndices[i] == 1: current is RIGHT, sibling is LEFT
        
        Mux1 selects between two values based on a selector bit.
        mux.out = selector ? c[1] : c[0]
        */
        
        // Constrain pathIndices to be binary (0 or 1)
        // This is CRITICAL for security - without it, prover could use other values
        pathIndices[i] * (1 - pathIndices[i]) === 0;
        
        // Select left input: if pathIndices=0, use hash; if pathIndices=1, use sibling
        muxLeft[i] = Mux1();
        muxLeft[i].c[0] <== hashes[i];
        muxLeft[i].c[1] <== pathElements[i];
        muxLeft[i].s <== pathIndices[i];
        
        // Select right input: opposite of left
        muxRight[i] = Mux1();
        muxRight[i].c[0] <== pathElements[i];
        muxRight[i].c[1] <== hashes[i];
        muxRight[i].s <== pathIndices[i];
        
        // Hash the pair using Poseidon (ZK-friendly hash)
        // Poseidon is preferred over SHA256 in ZK because it requires
        // far fewer constraints (~300 vs ~25000)
        hashers[i] = Poseidon(2);
        hashers[i].inputs[0] <== muxLeft[i].out;
        hashers[i].inputs[1] <== muxRight[i].out;
        
        hashes[i + 1] <== hashers[i].out;
    }
    
    root <== hashes[depth];
}


/*
--------------------------------------------------------------------------------
COMPONENT 3: Attestation Verifier
--------------------------------------------------------------------------------
Verifies that a trusted attester signed a statement about entity type.

Attestation structure:
  - Entity commits to a secret: commitment = Poseidon(entity_secret, salt)
  - Attester signs: signature = Sign(commitment || entity_type)
  - This binds an entity identity to a type without revealing the entity
*/

template AttestationVerifier() {
    // Public inputs (known to verifier)
    signal input claimedType;             // The type being claimed (e.g., AI.CA)
    
    // Private inputs (hidden from verifier)
    signal input entitySecret;            // Entity's secret key/identity
    signal input salt;                    // Randomness for commitment
    signal input attesterPubKeyX;         // Attester's public key (X coordinate)
    signal input attesterPubKeyY;         // Attester's public key (Y coordinate)
    signal input signatureR8X;            // Signature R point X
    signal input signatureR8Y;            // Signature R point Y
    signal input signatureS;              // Signature S scalar
    
    // Output
    signal output entityCommitment;       // Public commitment to entity identity
    
    /*
    Step 1: Compute entity commitment
    
    commitment = Poseidon(secret, salt)
    
    This creates a deterministic but hidden identifier.
    Same secret + salt always gives same commitment.
    Cannot reverse commitment to get secret (hash preimage resistance).
    */
    component commitHasher = Poseidon(2);
    commitHasher.inputs[0] <== entitySecret;
    commitHasher.inputs[1] <== salt;
    entityCommitment <== commitHasher.out;
    
    /*
    Step 2: Compute message that was signed
    
    message = Poseidon(commitment, claimedType)
    
    The attester signed: "Entity with commitment X is type Y"
    */
    component msgHasher = Poseidon(2);
    msgHasher.inputs[0] <== entityCommitment;
    msgHasher.inputs[1] <== claimedType;
    
    /*
    Step 3: Verify EdDSA signature
    
    EdDSA verification checks that the signature was created by
    the private key corresponding to the given public key.
    
    EdDSAPoseidonVerifier is a standard circomlib component that
    implements the full EdDSA verification algorithm in constraints.
    */
    component sigVerifier = EdDSAPoseidonVerifier();
    sigVerifier.enabled <== 1;            // Always verify (could be conditional)
    sigVerifier.Ax <== attesterPubKeyX;
    sigVerifier.Ay <== attesterPubKeyY;
    sigVerifier.R8x <== signatureR8X;
    sigVerifier.R8y <== signatureR8Y;
    sigVerifier.S <== signatureS;
    sigVerifier.M <== msgHasher.out;
    
    // If signature is invalid, the circuit will not satisfy
    // (EdDSAPoseidonVerifier adds constraints that fail on bad sig)
}


/*
--------------------------------------------------------------------------------
COMPONENT 4: Nullifier Generator
--------------------------------------------------------------------------------
Creates a unique identifier that:
  - Is deterministic for the same entity + context
  - Cannot be linked back to the entity
  - Prevents double-use in the same context

Use cases:
  - Prevent same entity claiming multiple types in one session
  - Rate limiting without identity tracking
  - Sybil resistance
*/

template NullifierGenerator() {
    signal input entitySecret;
    signal input contextId;       // e.g., session ID, timestamp bucket, domain
    signal output nullifier;
    
    // nullifier = Poseidon(secret, context)
    // Same entity + same context = same nullifier (detectable reuse)
    // Different context = different nullifier (unlinkable across contexts)
    component hasher = Poseidon(2);
    hasher.inputs[0] <== entitySecret;
    hasher.inputs[1] <== contextId;
    nullifier <== hasher.out;
}


/*
--------------------------------------------------------------------------------
MAIN CIRCUIT: EntityTypeProof
--------------------------------------------------------------------------------
Combines all components into the complete proof system.

What this proves:
  "I have a valid attestation from an approved attester that I am type X,
   and here is my nullifier for this context."

What remains hidden:
  - Which entity I am
  - Which attester vouched for me
  - My secret key
*/

template EntityTypeProof(merkleDepth) {
    /*
    ============================================
    PUBLIC INPUTS
    ============================================
    These are visible to the verifier (everyone).
    They define WHAT is being proven.
    */
    
    signal input claimedType;           // The entity type being claimed
    signal input attestersRoot;         // Merkle root of approved attesters
    signal input contextId;             // Context for nullifier (e.g., session)
    
    /*
    ============================================
    PRIVATE INPUTS  
    ============================================
    These are hidden from the verifier.
    Only the prover knows these values.
    */
    
    // Entity's secret identity
    signal input entitySecret;
    signal input entitySalt;
    
    // Attestation from a trusted attester
    signal input attesterPubKeyX;
    signal input attesterPubKeyY;
    signal input signatureR8X;
    signal input signatureR8Y;
    signal input signatureS;
    
    // Merkle proof that attester is in approved set
    signal input attesterPathElements[merkleDepth];
    signal input attesterPathIndices[merkleDepth];
    
    /*
    ============================================
    PUBLIC OUTPUTS
    ============================================
    These are computed by the circuit and revealed.
    */
    
    signal output nullifier;            // For double-spend prevention
    signal output entityCommitment;     // Stable pseudonymous identifier
    
    /*
    ============================================
    CIRCUIT LOGIC
    ============================================
    */
    
    // Step 1: Verify the attestation signature
    component attestation = AttestationVerifier();
    attestation.claimedType <== claimedType;
    attestation.entitySecret <== entitySecret;
    attestation.salt <== entitySalt;
    attestation.attesterPubKeyX <== attesterPubKeyX;
    attestation.attesterPubKeyY <== attesterPubKeyY;
    attestation.signatureR8X <== signatureR8X;
    attestation.signatureR8Y <== signatureR8Y;
    attestation.signatureS <== signatureS;
    
    entityCommitment <== attestation.entityCommitment;
    
    // Step 2: Compute attester's leaf value for merkle tree
    // leaf = Poseidon(pubKeyX, pubKeyY)
    component attesterLeaf = Poseidon(2);
    attesterLeaf.inputs[0] <== attesterPubKeyX;
    attesterLeaf.inputs[1] <== attesterPubKeyY;
    
    // Step 3: Verify attester is in the approved set
    component attesterMerkle = MerkleTreeVerifier(merkleDepth);
    attesterMerkle.leaf <== attesterLeaf.out;
    for (var i = 0; i < merkleDepth; i++) {
        attesterMerkle.pathElements[i] <== attesterPathElements[i];
        attesterMerkle.pathIndices[i] <== attesterPathIndices[i];
    }
    
    // Constrain computed root to equal public input root
    // This is where the "approved attesters" check happens
    attestersRoot === attesterMerkle.root;
    
    // Step 4: Generate nullifier for this context
    component nullGen = NullifierGenerator();
    nullGen.entitySecret <== entitySecret;
    nullGen.contextId <== contextId;
    nullifier <== nullGen.nullifier;
}

// Instantiate the main circuit with a merkle tree depth of 20
// This supports up to 2^20 = ~1 million approved attesters
component main {public [claimedType, attestersRoot, contextId]} = EntityTypeProof(20);

/*
================================================================================
COMPILATION & USAGE
================================================================================

1. COMPILE THE CIRCUIT:
   circom entity_type_proof.circom --r1cs --wasm --sym

   Outputs:
   - .r1cs     : The constraint system (for trusted setup)
   - .wasm     : WASM code to compute witness
   - .sym      : Symbol file for debugging

2. TRUSTED SETUP (for Groth16):
   snarkjs groth16 setup entity_type_proof.r1cs pot_final.ptau circuit.zkey
   
   This generates proving and verification keys.
   The .ptau file is a "powers of tau" ceremony output.

3. GENERATE PROOF:
   - Prepare input.json with all public and private inputs
   - Run: snarkjs groth16 prove circuit.zkey witness.wtns proof.json public.json

4. VERIFY PROOF:
   snarkjs groth16 verify verification_key.json public.json proof.json

================================================================================
CONSTRAINT COUNT ESTIMATION
================================================================================

Approximate constraints per component:
- Poseidon(2):        ~300 constraints
- EdDSA verification: ~6000 constraints  
- Merkle verifier:    ~300 * depth constraints
- Mux1:               ~3 constraints

Total for this circuit (depth=20):
  ~300 (commit) + ~300 (msg) + ~6000 (sig) + ~6000 (merkle) + ~300 (nullifier)
  ≈ 13,000 constraints

Proof generation time: ~2-5 seconds on modern hardware
Proof size: ~200 bytes (Groth16)
Verification time: ~10ms
Verification gas (on-chain): ~250,000 gas

================================================================================
*/
