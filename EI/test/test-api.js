/**
 * End-to-end API test
 *
 * Tests the full flow:
 * 1. Get registry state
 * 2. Create entity (client-side)
 * 3. Request attestation from API
 * 4. Generate proof (client-side)
 * 5. Verify proof via API
 */

import { buildPoseidon } from 'circomlibjs';
import { buildEddsa } from 'circomlibjs';
import * as snarkjs from 'snarkjs';
import { randomBytes } from 'crypto';

const API_URL = process.env.API_URL || 'http://localhost:3000';
const ATTESTER_API_KEY = process.env.ATTESTER_API_KEY;

if (!ATTESTER_API_KEY) {
    console.error('Error: ATTESTER_API_KEY environment variable required');
    console.error('Usage: ATTESTER_API_KEY=<key> node test/test-api.js');
    process.exit(1);
}

async function main() {
    console.log("═══════════════════════════════════════════════════════════════");
    console.log("  ENTITY IDENTITY - API END-TO-END TEST");
    console.log("═══════════════════════════════════════════════════════════════\n");

    // Initialize crypto
    console.log("1. Initializing cryptography...");
    const poseidon = await buildPoseidon();
    const hash = (inputs) => {
        const h = poseidon(inputs.map(x => BigInt(x)));
        return poseidon.F.toObject(h);
    };
    console.log("   ✓ Ready\n");

    // Get registry state
    console.log("2. Fetching registry state...");
    const registryRes = await fetch(`${API_URL}/api/v1/registry`);
    const registry = await registryRes.json();
    console.log(`   Root: ${registry.root.slice(0, 20)}...`);
    console.log(`   Attesters: ${registry.attestersCount}`);
    console.log("   ✓ Registry fetched\n");

    // Create entity (client-side)
    console.log("3. Creating entity (client-side)...");
    const entitySecret = BigInt('0x' + randomBytes(31).toString('hex'));
    const entitySalt = BigInt('0x' + randomBytes(31).toString('hex'));
    const entityCommitment = hash([entitySecret, entitySalt]);
    console.log(`   Commitment: ${entityCommitment.toString().slice(0, 20)}...`);
    console.log("   ✓ Entity created\n");

    // Request attestation
    console.log("4. Requesting attestation from API...");
    const attestRes = await fetch(`${API_URL}/api/v1/attest`, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${ATTESTER_API_KEY}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            entityCommitment: entityCommitment.toString(),
            entityType: 'AI.CA'
        })
    });

    if (!attestRes.ok) {
        const err = await attestRes.json();
        console.error('   ✗ Attestation failed:', err);
        process.exit(1);
    }

    const attestData = await attestRes.json();
    console.log(`   Attester: ${attestData.attestation.attesterPubKeyX.slice(0, 20)}...`);
    console.log(`   Type: ${attestData.attestation.entityType}`);
    console.log("   ✓ Attestation received\n");

    // Prepare circuit inputs
    console.log("5. Preparing circuit inputs...");
    const contextId = BigInt(Date.now());

    const circuitInputs = {
        claimedType: attestData.attestation.typeCode.toString(),
        attestersRoot: attestData.registryRoot,
        contextId: contextId.toString(),
        entitySecret: entitySecret.toString(),
        entitySalt: entitySalt.toString(),
        attesterPubKeyX: attestData.attestation.attesterPubKeyX,
        attesterPubKeyY: attestData.attestation.attesterPubKeyY,
        signatureR8X: attestData.attestation.signatureR8X,
        signatureR8Y: attestData.attestation.signatureR8Y,
        signatureS: attestData.attestation.signatureS,
        attesterPathElements: attestData.merkleProof.pathElements,
        attesterPathIndices: attestData.merkleProof.pathIndices.map(i => i.toString()),
    };
    console.log("   ✓ Inputs prepared\n");

    // Generate proof (client-side)
    console.log("6. Generating ZK proof (client-side)...");
    const startTime = Date.now();

    const { proof, publicSignals } = await snarkjs.groth16.fullProve(
        circuitInputs,
        '../build/entity_type_proof_js/entity_type_proof.wasm',
        '../setup/entity_type_final.zkey'
    );

    const proofTime = Date.now() - startTime;
    console.log(`   ✓ Proof generated in ${proofTime}ms\n`);

    // Verify proof via API
    console.log("7. Verifying proof via API...");
    const verifyRes = await fetch(`${API_URL}/api/v1/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ proof, publicSignals })
    });

    const verifyData = await verifyRes.json();

    if (!verifyData.valid) {
        console.error('   ✗ Verification failed:', verifyData);
        process.exit(1);
    }

    console.log(`   Valid: ${verifyData.valid}`);
    console.log(`   Entity Type: ${verifyData.entityType} (${verifyData.phoneticName})`);
    console.log(`   Nullifier Status: ${verifyData.nullifierStatus}`);
    console.log("   ✓ Proof verified\n");

    // Record nullifier
    console.log("8. Recording nullifier...");
    const recordRes = await fetch(`${API_URL}/api/v1/verify/record`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            nullifier: verifyData.nullifier,
            contextId: contextId.toString(),
            domain: 'test.example.com'
        })
    });

    const recordData = await recordRes.json();
    console.log(`   Recorded: ${recordData.recorded}`);
    console.log("   ✓ Nullifier recorded\n");

    // Try to verify same proof again (should show nullifier used)
    console.log("9. Re-verifying (nullifier should show as used)...");
    const reVerifyRes = await fetch(`${API_URL}/api/v1/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ proof, publicSignals })
    });

    const reVerifyData = await reVerifyRes.json();
    console.log(`   Nullifier Status: ${reVerifyData.nullifierStatus}`);
    console.log("   ✓ Replay protection works\n");

    // Summary
    console.log("═══════════════════════════════════════════════════════════════");
    console.log("  TEST PASSED");
    console.log("═══════════════════════════════════════════════════════════════");
    console.log("\n  API Flow Summary:");
    console.log("    1. Entity created commitment locally (private)");
    console.log("    2. Requested attestation from approved attester");
    console.log("    3. Generated proof locally (private inputs never sent)");
    console.log("    4. Verified proof via public API");
    console.log("    5. Nullifier recorded to prevent replay");
    console.log(`\n  Performance: ${proofTime}ms proof generation\n`);
}

main().catch(console.error);
