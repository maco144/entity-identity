/**
 * Entity Identity Type - ZK Proof System
 * 
 * This file demonstrates the off-circuit logic:
 * - How attesters create attestations
 * - How entities generate proofs
 * - How verifiers check proofs
 */

import { buildPoseidon } from 'circomlibjs';
import { buildEddsa } from 'circomlibjs';
import * as snarkjs from 'snarkjs';

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

/**
 * Entity Type encoding scheme
 * Matches the Circom constants
 */
const EntityTypes = {
    // AI - Artificial Intelligence (prefix 0x01)
    'AI.CA': 0x0101,  // Conversational Agent
    'AI.PO': 0x0102,  // Program Orchestrator
    'AI.WS': 0x0103,  // Web Site
    'AI.OS': 0x0104,  // Operating System
    'AI.GN': 0x0105,  // Generative Model
    'AI.AA': 0x0106,  // Autonomous Agent
    'AI.LM': 0x0107,  // Language Model
    'AI.DB': 0x0108,  // Data Broker
    'AI.JG': 0x0109,  // Judge/Evaluator
    'AI.SY': 0x010A,  // Synthetic Media Generator

    // AR - Artificial Robotics (prefix 0x02)
    'AR.RB': 0x0201,  // Robot Bot
    'AR.DR': 0x0202,  // Drone
    'AR.VH': 0x0203,  // Vehicle
    
    // HU - Human (prefix 0x03)
    'HU.US': 0x0301,  // Human User
    
    // HY - Hybrid (prefix 0x04)
    'HY.CP': 0x0401,  // Copilot
    'HY.HS': 0x0402,  // Hive Swarm
};

// Phonetic names for verbal communication
const PhoneticNames = {
    'AI.CA': 'Kah',
    'AI.PO': 'Poe',
    'AI.WS': 'Wiz',
    'AI.OS': 'Aus',
    'AI.GN': 'Jen',
    'AI.AA': 'Ahh',
    'AI.LM': 'Elm',
    'AI.DB': 'Deb',
    'AI.JG': 'Jig',
    'AI.SY': 'Sigh',
    'AR.RB': 'Rob',
    'AR.DR': 'Dar',
    'AR.VH': 'Vee',
    'HU.US': 'Who',
    'HY.CP': 'Kip',
    'HY.HS': 'His',
};

// ============================================================================
// CRYPTOGRAPHIC PRIMITIVES
// ============================================================================

/**
 * Initialize cryptographic libraries
 * These are async because they load WASM modules
 */
async function initCrypto() {
    const poseidon = await buildPoseidon();
    const eddsa = await buildEddsa();
    
    return {
        /**
         * Poseidon hash - ZK-friendly hash function
         * Takes array of field elements, returns single field element
         */
        hash: (inputs) => {
            const h = poseidon(inputs);
            return poseidon.F.toObject(h);
        },
        
        /**
         * Generate EdDSA keypair
         * Private key is 32 random bytes
         */
        generateKeypair: () => {
            const privateKey = crypto.getRandomValues(new Uint8Array(32));
            const publicKey = eddsa.prv2pub(privateKey);
            return {
                privateKey,
                publicKey: {
                    x: eddsa.F.toObject(publicKey[0]),
                    y: eddsa.F.toObject(publicKey[1]),
                }
            };
        },
        
        /**
         * Sign a message with EdDSA
         * Returns signature components for circuit
         */
        sign: (privateKey, message) => {
            const msgBigInt = BigInt(message);
            const sig = eddsa.signPoseidon(privateKey, msgBigInt);
            return {
                R8x: eddsa.F.toObject(sig.R8[0]),
                R8y: eddsa.F.toObject(sig.R8[1]),
                S: sig.S,
            };
        },
        
        eddsa,
        poseidon,
    };
}

// ============================================================================
// MERKLE TREE UTILITIES
// ============================================================================

/**
 * Simple Merkle tree implementation
 * Used for the approved attesters registry
 */
class MerkleTree {
    constructor(depth, poseidonHash) {
        this.depth = depth;
        this.hash = poseidonHash;
        this.leaves = [];
        this.layers = [];
        
        // Precompute zero values for empty subtrees
        this.zeros = [BigInt(0)];
        for (let i = 1; i <= depth; i++) {
            this.zeros[i] = this.hash([this.zeros[i-1], this.zeros[i-1]]);
        }
    }
    
    /**
     * Add a leaf to the tree
     */
    addLeaf(leaf) {
        const index = this.leaves.length;
        this.leaves.push(BigInt(leaf));
        this._rebuild();
        return index;
    }
    
    /**
     * Get the current root
     */
    getRoot() {
        if (this.layers.length === 0) return this.zeros[this.depth];
        return this.layers[this.layers.length - 1][0];
    }
    
    /**
     * Generate merkle proof for a leaf at given index
     */
    getProof(index) {
        const pathElements = [];
        const pathIndices = [];
        
        let currentIndex = index;
        
        for (let level = 0; level < this.depth; level++) {
            const isRight = currentIndex % 2 === 1;
            const siblingIndex = isRight ? currentIndex - 1 : currentIndex + 1;
            
            pathIndices.push(isRight ? 1 : 0);
            
            if (level < this.layers.length && siblingIndex < this.layers[level].length) {
                pathElements.push(this.layers[level][siblingIndex]);
            } else {
                pathElements.push(this.zeros[level]);
            }
            
            currentIndex = Math.floor(currentIndex / 2);
        }
        
        return { pathElements, pathIndices };
    }
    
    /**
     * Rebuild tree layers from leaves
     */
    _rebuild() {
        this.layers = [this.leaves.slice()];
        
        let currentLayer = this.layers[0];
        
        for (let level = 0; level < this.depth; level++) {
            const nextLayer = [];
            
            for (let i = 0; i < currentLayer.length; i += 2) {
                const left = currentLayer[i];
                const right = i + 1 < currentLayer.length 
                    ? currentLayer[i + 1] 
                    : this.zeros[level];
                nextLayer.push(this.hash([left, right]));
            }
            
            if (nextLayer.length === 0) {
                nextLayer.push(this.zeros[level + 1]);
            }
            
            this.layers.push(nextLayer);
            currentLayer = nextLayer;
        }
    }
}

// ============================================================================
// ATTESTER (REGISTRY AUTHORITY)
// ============================================================================

/**
 * Attester - An authority that vouches for entity types
 * 
 * Examples of attesters:
 * - Anthropic attesting that Claude is AI.CA
 * - DMV attesting that a car is AR.VH
 * - Government attesting that a user is HU.US
 */
class Attester {
    constructor(crypto) {
        this.crypto = crypto;
        const keypair = crypto.generateKeypair();
        this.privateKey = keypair.privateKey;
        this.publicKey = keypair.publicKey;
    }
    
    /**
     * Get the leaf value for merkle tree inclusion
     * leaf = Poseidon(pubKeyX, pubKeyY)
     */
    getLeaf() {
        return this.crypto.hash([this.publicKey.x, this.publicKey.y]);
    }
    
    /**
     * Create an attestation for an entity
     * 
     * @param entityCommitment - The entity's public commitment
     * @param entityType - The type code (e.g., EntityTypes['AI.CA'])
     * @returns Signature components for the circuit
     */
    attest(entityCommitment, entityType) {
        // Message = Poseidon(commitment, type)
        const message = this.crypto.hash([entityCommitment, BigInt(entityType)]);
        
        // Sign the message
        const signature = this.crypto.sign(this.privateKey, message);
        
        return {
            attesterPubKeyX: this.publicKey.x.toString(),
            attesterPubKeyY: this.publicKey.y.toString(),
            signatureR8X: signature.R8x.toString(),
            signatureR8Y: signature.R8y.toString(),
            signatureS: signature.S.toString(),
        };
    }
}

// ============================================================================
// ENTITY (THE PROVER)
// ============================================================================

/**
 * Entity - An AI, robot, human, or hybrid that proves its type
 */
class Entity {
    constructor(crypto, secret = null) {
        this.crypto = crypto;
        // Entity's secret - this should be stored securely
        this.secret = secret ?? BigInt('0x' + [...crypto.getRandomValues(new Uint8Array(32))]
            .map(b => b.toString(16).padStart(2, '0')).join(''));
        this.salt = BigInt('0x' + [...crypto.getRandomValues(new Uint8Array(32))]
            .map(b => b.toString(16).padStart(2, '0')).join(''));
    }
    
    /**
     * Get entity's public commitment
     * This is a stable pseudonymous identifier
     */
    getCommitment() {
        return this.crypto.hash([this.secret, this.salt]);
    }
    
    /**
     * Generate circuit inputs for proving type
     * 
     * @param claimedType - The type code to prove
     * @param attestation - Attestation from an attester
     * @param attesterMerkleProof - Proof that attester is approved
     * @param attestersRoot - Current merkle root of approved attesters
     * @param contextId - Context for nullifier (e.g., session ID)
     */
    generateProofInputs(claimedType, attestation, attesterMerkleProof, attestersRoot, contextId) {
        return {
            // Public inputs
            claimedType: claimedType.toString(),
            attestersRoot: attestersRoot.toString(),
            contextId: contextId.toString(),
            
            // Private inputs - entity secrets
            entitySecret: this.secret.toString(),
            entitySalt: this.salt.toString(),
            
            // Private inputs - attestation
            ...attestation,
            
            // Private inputs - merkle proof
            attesterPathElements: attesterMerkleProof.pathElements.map(e => e.toString()),
            attesterPathIndices: attesterMerkleProof.pathIndices.map(i => i.toString()),
        };
    }
}

// ============================================================================
// PROOF GENERATION & VERIFICATION
// ============================================================================

/**
 * Generate a ZK proof
 * 
 * @param inputs - Circuit inputs from Entity.generateProofInputs()
 * @param wasmPath - Path to circuit .wasm file
 * @param zkeyPath - Path to proving key
 */
async function generateProof(inputs, wasmPath, zkeyPath) {
    const { proof, publicSignals } = await snarkjs.groth16.fullProve(
        inputs,
        wasmPath,
        zkeyPath
    );
    
    return {
        proof,
        publicSignals,
        // Parse public signals for readability
        parsed: {
            nullifier: publicSignals[0],
            entityCommitment: publicSignals[1],
            claimedType: publicSignals[2],
            attestersRoot: publicSignals[3],
            contextId: publicSignals[4],
        }
    };
}

/**
 * Verify a ZK proof
 * 
 * @param proof - The proof object
 * @param publicSignals - Public signals array
 * @param vkeyPath - Path to verification key
 */
async function verifyProof(proof, publicSignals, vkeyPath) {
    const vkey = JSON.parse(await fs.readFile(vkeyPath, 'utf-8'));
    return await snarkjs.groth16.verify(vkey, publicSignals, proof);
}

/**
 * Generate Solidity verifier contract
 * For on-chain verification
 */
async function exportSolidityVerifier(zkeyPath, outputPath) {
    const templates = await snarkjs.zKey.exportSolidityVerifier(
        zkeyPath,
        { groth16: snarkjs.templates.groth16 }
    );
    await fs.writeFile(outputPath, templates);
}

// ============================================================================
// FULL EXAMPLE FLOW
// ============================================================================

async function exampleFlow() {
    console.log("=== Entity Identity Type ZK Proof System ===\n");
    
    // 1. Initialize cryptography
    console.log("1. Initializing cryptographic primitives...");
    const crypto = await initCrypto();
    
    // 2. Set up the attester registry
    console.log("2. Setting up attester registry...");
    const attesterTree = new MerkleTree(20, crypto.hash);
    
    // Create some attesters (e.g., Anthropic, OpenAI, government agency)
    const anthropic = new Attester(crypto);
    const openai = new Attester(crypto);
    const dmv = new Attester(crypto);
    
    // Add them to the approved attesters tree
    const anthropicIndex = attesterTree.addLeaf(anthropic.getLeaf());
    const openaiIndex = attesterTree.addLeaf(openai.getLeaf());
    const dmvIndex = attesterTree.addLeaf(dmv.getLeaf());
    
    const attestersRoot = attesterTree.getRoot();
    console.log(`   Attesters root: ${attestersRoot.toString(16).slice(0, 16)}...`);
    
    // 3. Create an entity (e.g., Claude)
    console.log("\n3. Creating entity (Claude as AI.CA)...");
    const claude = new Entity(crypto);
    const claudeCommitment = claude.getCommitment();
    console.log(`   Entity commitment: ${claudeCommitment.toString(16).slice(0, 16)}...`);
    
    // 4. Anthropic attests that Claude is type AI.CA
    console.log("\n4. Anthropic attesting Claude's type...");
    const attestation = anthropic.attest(claudeCommitment, EntityTypes['AI.CA']);
    console.log("   Attestation created");
    
    // 5. Get merkle proof for Anthropic being an approved attester
    const attesterProof = attesterTree.getProof(anthropicIndex);
    
    // 6. Generate the circuit inputs
    console.log("\n5. Generating circuit inputs...");
    const contextId = BigInt(Date.now()); // Use timestamp as context
    const inputs = claude.generateProofInputs(
        EntityTypes['AI.CA'],
        attestation,
        attesterProof,
        attestersRoot,
        contextId
    );
    
    console.log("   Circuit inputs prepared:");
    console.log(`   - Claimed type: AI.CA (${EntityTypes['AI.CA']})`);
    console.log(`   - Context ID: ${contextId}`);
    
    // 7. In production, you would now:
    console.log("\n6. Next steps (not executed here):");
    console.log("   - Compile circuit: circom entity_type_proof.circom --r1cs --wasm");
    console.log("   - Run trusted setup: snarkjs groth16 setup ...");
    console.log("   - Generate proof: snarkjs.groth16.fullProve(inputs, wasm, zkey)");
    console.log("   - Verify proof: snarkjs.groth16.verify(vkey, publicSignals, proof)");
    
    // 8. What the verifier sees
    console.log("\n7. What a verifier would see:");
    console.log("   PUBLIC (visible to all):");
    console.log(`     - Claimed type: AI.CA (Kah)`);
    console.log(`     - Attesters root: ${attestersRoot.toString(16).slice(0, 16)}...`);
    console.log(`     - Context ID: ${contextId}`);
    console.log(`     - Nullifier: [computed by circuit]`);
    console.log(`     - Entity commitment: ${claudeCommitment.toString(16).slice(0, 16)}...`);
    console.log("   HIDDEN (zero-knowledge):");
    console.log("     - Entity's secret identity");
    console.log("     - Which attester signed");
    console.log("     - The attestation signature");
    
    return { crypto, claude, anthropic, attestersRoot, inputs };
}

// ============================================================================
// VERIFICATION SCENARIOS
// ============================================================================

/**
 * Scenario: Website wants to verify it's talking to an AI.CA
 */
async function scenarioWebsiteVerification(proof, publicSignals, vkey) {
    // 1. Extract the claimed type
    const claimedType = parseInt(publicSignals[2]);
    const typeCode = Object.entries(EntityTypes).find(([k, v]) => v === claimedType)?.[0];
    
    // 2. Verify the proof cryptographically
    const valid = await snarkjs.groth16.verify(vkey, publicSignals, proof);
    
    if (!valid) {
        return { accepted: false, reason: "Invalid proof" };
    }
    
    // 3. Check the attesters root against known good roots
    const attestersRoot = publicSignals[3];
    const knownRoots = getKnownAttesterRoots(); // From your registry
    
    if (!knownRoots.includes(attestersRoot)) {
        return { accepted: false, reason: "Unknown attester registry" };
    }
    
    // 4. Check nullifier hasn't been used (prevents replay)
    const nullifier = publicSignals[0];
    if (await isNullifierUsed(nullifier)) {
        return { accepted: false, reason: "Proof already used" };
    }
    
    // 5. Accept and record
    await recordNullifier(nullifier);
    
    return {
        accepted: true,
        entityType: typeCode,
        phoneticName: PhoneticNames[typeCode],
        entityCommitment: publicSignals[1],
    };
}

// Placeholder functions for production implementation
function getKnownAttesterRoots() { return []; }
async function isNullifierUsed(n) { return false; }
async function recordNullifier(n) { }

// ============================================================================
// EXPORTS
// ============================================================================

export {
    EntityTypes,
    PhoneticNames,
    initCrypto,
    MerkleTree,
    Attester,
    Entity,
    generateProof,
    verifyProof,
    exportSolidityVerifier,
    exampleFlow,
};
