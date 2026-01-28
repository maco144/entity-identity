/**
 * Test proof generation and verification
 *
 * This script demonstrates the full flow:
 * 1. Set up attester registry
 * 2. Create entity and get attestation
 * 3. Generate ZK proof
 * 4. Verify proof
 */

import { buildPoseidon } from 'circomlibjs';
import { buildEddsa } from 'circomlibjs';
import * as snarkjs from 'snarkjs';
import { readFileSync } from 'fs';
import { randomBytes } from 'crypto';

// ============================================================================
// ENTITY TYPES
// ============================================================================

const EntityTypes = {
    'AI.CA': 0x0101,  // Conversational Agent
    'AI.PO': 0x0102,  // Program Orchestrator
    'HU.US': 0x0301,  // Human User
};

// ============================================================================
// MERKLE TREE
// ============================================================================

class MerkleTree {
    constructor(depth, hash) {
        this.depth = depth;
        this.hash = hash;
        this.leaves = [];
        this.layers = [];

        // Precompute zero values
        this.zeros = [BigInt(0)];
        for (let i = 1; i <= depth; i++) {
            this.zeros[i] = this.hash([this.zeros[i-1], this.zeros[i-1]]);
        }
    }

    addLeaf(leaf) {
        const index = this.leaves.length;
        this.leaves.push(BigInt(leaf));
        this._rebuild();
        return index;
    }

    getRoot() {
        if (this.layers.length === 0) return this.zeros[this.depth];
        return this.layers[this.layers.length - 1][0];
    }

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
// MAIN TEST
// ============================================================================

async function main() {
    console.log("═══════════════════════════════════════════════════════════════");
    console.log("  ENTITY IDENTITY - ZK PROOF TEST");
    console.log("═══════════════════════════════════════════════════════════════\n");

    // 1. Initialize cryptographic primitives
    console.log("1. Initializing cryptography...");
    const poseidon = await buildPoseidon();
    const eddsa = await buildEddsa();

    const hash = (inputs) => {
        const h = poseidon(inputs.map(x => BigInt(x)));
        return poseidon.F.toObject(h);
    };

    console.log("   ✓ Poseidon hash initialized");
    console.log("   ✓ EdDSA initialized\n");

    // 2. Set up attester registry
    console.log("2. Setting up attester registry...");
    const attesterTree = new MerkleTree(20, hash);

    // Create attester (e.g., Anthropic)
    const attesterPrivKey = randomBytes(32);
    const attesterPubKey = eddsa.prv2pub(attesterPrivKey);
    const attesterPubKeyX = eddsa.F.toObject(attesterPubKey[0]);
    const attesterPubKeyY = eddsa.F.toObject(attesterPubKey[1]);

    // Add attester to registry
    const attesterLeaf = hash([attesterPubKeyX, attesterPubKeyY]);
    const attesterIndex = attesterTree.addLeaf(attesterLeaf);
    const attestersRoot = attesterTree.getRoot();

    console.log(`   Attester public key: ${attesterPubKeyX.toString(16).slice(0, 16)}...`);
    console.log(`   Attesters root: ${attestersRoot.toString(16).slice(0, 16)}...`);
    console.log("   ✓ Attester registered\n");

    // 3. Create entity (e.g., Claude)
    console.log("3. Creating entity...");
    const entitySecret = BigInt('0x' + randomBytes(31).toString('hex'));
    const entitySalt = BigInt('0x' + randomBytes(31).toString('hex'));
    const entityCommitment = hash([entitySecret, entitySalt]);

    console.log(`   Entity commitment: ${entityCommitment.toString(16).slice(0, 16)}...`);
    console.log("   ✓ Entity created\n");

    // 4. Attester creates attestation
    console.log("4. Creating attestation (type: AI.CA)...");
    const claimedType = EntityTypes['AI.CA'];

    // Message = Poseidon(commitment, type)
    const message = hash([entityCommitment, BigInt(claimedType)]);

    // Sign the message - signPoseidon expects a field element
    const msgF = poseidon.F.e(message);
    const signature = eddsa.signPoseidon(attesterPrivKey, msgF);
    const signatureR8X = eddsa.F.toObject(signature.R8[0]);
    const signatureR8Y = eddsa.F.toObject(signature.R8[1]);
    const signatureS = signature.S;

    console.log(`   Message hash: ${message.toString(16).slice(0, 16)}...`);
    console.log("   ✓ Attestation signed\n");

    // 5. Get merkle proof for attester
    const attesterProof = attesterTree.getProof(attesterIndex);

    // 6. Prepare circuit inputs
    console.log("5. Preparing circuit inputs...");
    const contextId = BigInt(Date.now());

    const circuitInputs = {
        // Public inputs
        claimedType: claimedType.toString(),
        attestersRoot: attestersRoot.toString(),
        contextId: contextId.toString(),

        // Private inputs - entity
        entitySecret: entitySecret.toString(),
        entitySalt: entitySalt.toString(),

        // Private inputs - attestation
        attesterPubKeyX: attesterPubKeyX.toString(),
        attesterPubKeyY: attesterPubKeyY.toString(),
        signatureR8X: signatureR8X.toString(),
        signatureR8Y: signatureR8Y.toString(),
        signatureS: signatureS.toString(),

        // Private inputs - merkle proof
        attesterPathElements: attesterProof.pathElements.map(e => e.toString()),
        attesterPathIndices: attesterProof.pathIndices.map(i => i.toString()),
    };

    console.log("   ✓ Circuit inputs prepared\n");

    // 7. Generate proof
    console.log("6. Generating ZK proof...");
    console.log("   (This may take a few seconds...)\n");

    const wasmPath = 'build/entity_type_proof_js/entity_type_proof.wasm';
    const zkeyPath = 'setup/entity_type_final.zkey';

    const startTime = Date.now();
    const { proof, publicSignals } = await snarkjs.groth16.fullProve(
        circuitInputs,
        wasmPath,
        zkeyPath
    );
    const proofTime = Date.now() - startTime;

    console.log(`   ✓ Proof generated in ${proofTime}ms\n`);

    // 8. Display public signals
    console.log("7. Public signals (visible to verifier):");
    console.log(`   [0] nullifier:        ${publicSignals[0].slice(0, 20)}...`);
    console.log(`   [1] entityCommitment: ${publicSignals[1].slice(0, 20)}...`);
    console.log(`   [2] claimedType:      ${publicSignals[2]} (AI.CA = 257)`);
    console.log(`   [3] attestersRoot:    ${publicSignals[3].slice(0, 20)}...`);
    console.log(`   [4] contextId:        ${publicSignals[4]}\n`);

    // 9. Verify proof
    console.log("8. Verifying proof...");
    const vkey = JSON.parse(readFileSync('setup/verification_key.json', 'utf-8'));

    const verifyStart = Date.now();
    const valid = await snarkjs.groth16.verify(vkey, publicSignals, proof);
    const verifyTime = Date.now() - verifyStart;

    if (valid) {
        console.log(`   ✓ PROOF VALID (verified in ${verifyTime}ms)\n`);
    } else {
        console.log("   ✗ PROOF INVALID\n");
        process.exit(1);
    }

    // 10. Summary
    console.log("═══════════════════════════════════════════════════════════════");
    console.log("  TEST PASSED");
    console.log("═══════════════════════════════════════════════════════════════");
    console.log("\n  The verifier learned:");
    console.log("    ✓ Entity is type AI.CA (Conversational Agent)");
    console.log("    ✓ An approved attester vouched for them");
    console.log("    ✓ Nullifier (for replay prevention)");
    console.log("    ✓ Entity commitment (pseudonymous ID)");
    console.log("\n  The verifier did NOT learn:");
    console.log("    ✗ Which entity (only commitment)");
    console.log("    ✗ Which attester signed");
    console.log("    ✗ Entity's secret");
    console.log("    ✗ The actual signature\n");

    // Proof size
    const proofStr = JSON.stringify(proof);
    console.log(`  Proof size: ${proofStr.length} bytes (JSON)`);
    console.log(`  Proof time: ${proofTime}ms`);
    console.log(`  Verify time: ${verifyTime}ms\n`);
}

main().catch(console.error);
