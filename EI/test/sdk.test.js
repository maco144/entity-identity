/**
 * Entity Identity ZK - Test Suite
 */

// Mock crypto for Node.js environment
const mockCrypto = {
    getRandomValues: (arr) => {
        for (let i = 0; i < arr.length; i++) {
            arr[i] = Math.floor(Math.random() * 256);
        }
        return arr;
    }
};

global.crypto = mockCrypto;

describe('Entity Types', () => {
    test('type codes are unique', async () => {
        const { EntityTypes } = await import('../src/entity-identity.js');
        const codes = Object.values(EntityTypes);
        const uniqueCodes = new Set(codes);
        expect(uniqueCodes.size).toBe(codes.length);
    });

    test('all types have phonetic names', async () => {
        const { EntityTypes, PhoneticNames } = await import('../src/entity-identity.js');
        for (const type of Object.keys(EntityTypes)) {
            expect(PhoneticNames[type]).toBeDefined();
            expect(PhoneticNames[type].length).toBeGreaterThan(0);
        }
    });

    test('type encoding is consistent', async () => {
        const { EntityTypes } = await import('../src/entity-identity.js');

        // AI types should be 0x01xx
        expect(EntityTypes['AI.CA'] & 0xFF00).toBe(0x0100);
        expect(EntityTypes['AI.PO'] & 0xFF00).toBe(0x0100);

        // AR types should be 0x02xx
        expect(EntityTypes['AR.RB'] & 0xFF00).toBe(0x0200);

        // HU types should be 0x03xx
        expect(EntityTypes['HU.US'] & 0xFF00).toBe(0x0300);

        // HY types should be 0x04xx
        expect(EntityTypes['HY.CP'] & 0xFF00).toBe(0x0400);
    });
});

describe('Interaction Levels', () => {
    test('levels are ordered correctly', async () => {
        const { InteractionLevel } = await import('../src/dual-system.js');

        expect(InteractionLevel.ANONYMOUS).toBe(0);
        expect(InteractionLevel.TYPE_ONLY).toBe(1);
        expect(InteractionLevel.TYPE_WITH_STANDING).toBe(2);
        expect(InteractionLevel.FULL_ACCOUNTABILITY).toBe(3);
    });

    test('recommended levels are valid', async () => {
        const { InteractionLevel, RecommendedLevels } = await import('../src/dual-system.js');

        const validLevels = Object.values(InteractionLevel);
        for (const level of Object.values(RecommendedLevels)) {
            expect(validLevels).toContain(level);
        }
    });
});

describe('Verification Policy', () => {
    test('policy validates level requirements', async () => {
        const { VerificationPolicy, InteractionLevel } = await import('../src/dual-system.js');

        const policy = new VerificationPolicy({
            minLevel: InteractionLevel.TYPE_WITH_STANDING,
            minPublicAttestations: 3,
        });

        // Should fail - insufficient level
        const result1 = policy.verify({
            level: InteractionLevel.TYPE_ONLY,
            revealed: { type: 'AI.CA' },
        });
        expect(result1.valid).toBe(false);
        expect(result1.errors.length).toBeGreaterThan(0);

        // Should pass - meets requirements
        const result2 = policy.verify({
            level: InteractionLevel.TYPE_WITH_STANDING,
            revealed: { type: 'AI.CA' },
            publicStanding: { attestationCount: 5 },
        });
        expect(result2.valid).toBe(true);
    });

    test('policy validates allowed types', async () => {
        const { VerificationPolicy, InteractionLevel } = await import('../src/dual-system.js');

        const policy = new VerificationPolicy({
            minLevel: InteractionLevel.TYPE_ONLY,
            allowedTypes: ['AI.CA', 'AI.PO'],
        });

        // Should fail - wrong type
        const result1 = policy.verify({
            level: InteractionLevel.TYPE_ONLY,
            revealed: { type: 'AR.RB' },
        });
        expect(result1.valid).toBe(false);

        // Should pass - allowed type
        const result2 = policy.verify({
            level: InteractionLevel.TYPE_ONLY,
            revealed: { type: 'AI.CA' },
        });
        expect(result2.valid).toBe(true);
    });
});

describe('MerkleTree', () => {
    test('tree computes consistent root', async () => {
        const { MerkleTree } = await import('../src/entity-identity.js');
        const { buildPoseidon } = await import('circomlibjs');

        const poseidon = await buildPoseidon();
        const hash = (inputs) => poseidon.F.toObject(poseidon(inputs));

        const tree = new MerkleTree(4, hash);

        // Empty tree has consistent zero root
        const emptyRoot = tree.getRoot();
        expect(emptyRoot).toBeDefined();

        // Adding same leaf twice gives same result
        tree.addLeaf(BigInt(123));
        const root1 = tree.getRoot();

        const tree2 = new MerkleTree(4, hash);
        tree2.addLeaf(BigInt(123));
        const root2 = tree2.getRoot();

        expect(root1).toBe(root2);
    });

    test('merkle proof verifies correctly', async () => {
        const { MerkleTree } = await import('../src/entity-identity.js');
        const { buildPoseidon } = await import('circomlibjs');

        const poseidon = await buildPoseidon();
        const hash = (inputs) => poseidon.F.toObject(poseidon(inputs));

        const tree = new MerkleTree(4, hash);

        const leaf = BigInt(456);
        const index = tree.addLeaf(leaf);
        const root = tree.getRoot();

        const proof = tree.getProof(index);

        expect(proof.pathElements.length).toBe(4);
        expect(proof.pathIndices.length).toBe(4);

        // Verify path indices are binary
        for (const idx of proof.pathIndices) {
            expect(idx === 0 || idx === 1).toBe(true);
        }
    });
});

describe('TrustHash', () => {
    test('same state produces same hash', async () => {
        const { TrustHash } = await import('../src/dual-system.js');
        const { buildPoseidon } = await import('circomlibjs');

        const poseidon = await buildPoseidon();
        const hash = (inputs) => poseidon.F.toObject(poseidon(inputs.map(BigInt)));

        const th1 = new TrustHash(hash);
        const th2 = new TrustHash(hash);

        const state = {
            entityCommitment: '123456',
            zkAttestersRoot: '789012',
            publicTrustRoot: '345678',
            attestationCount: 5,
            lastAttestationId: 100,
            nonce: 999,
        };

        const hash1 = th1.compute(state);
        const hash2 = th2.compute(state);

        expect(hash1).toBe(hash2);
    });

    test('different nonce produces different hash', async () => {
        const { TrustHash } = await import('../src/dual-system.js');
        const { buildPoseidon } = await import('circomlibjs');

        const poseidon = await buildPoseidon();
        const hash = (inputs) => poseidon.F.toObject(poseidon(inputs.map(BigInt)));

        const th = new TrustHash(hash);

        const state1 = {
            entityCommitment: '123456',
            zkAttestersRoot: '789012',
            publicTrustRoot: '345678',
            attestationCount: 5,
            lastAttestationId: 100,
            nonce: 999,
        };

        const hash1 = th.compute(state1);

        const state2 = { ...state1, nonce: 1000 };
        const hash2 = th.compute(state2);

        expect(hash1).not.toBe(hash2);
    });
});

describe('PublicTrustRegistry', () => {
    test('attestation count increases', async () => {
        const { PublicTrustRegistry, PublicAttestation } = await import('../src/dual-system.js');
        const { buildPoseidon } = await import('circomlibjs');

        const poseidon = await buildPoseidon();
        const hash = (inputs) => poseidon.F.toObject(poseidon(inputs.map(BigInt)));

        const registry = new PublicTrustRegistry(hash);

        const commitment = '12345';

        expect(registry.getAttestationCount(commitment)).toBe(0);

        const attestation = new PublicAttestation({
            entityCommitment: commitment,
            entityType: 0x0101,
            attesterPubKeyHash: '67890',
            timestamp: Date.now(),
        });

        registry.addAttestation(attestation);

        expect(registry.getAttestationCount(commitment)).toBe(1);
    });
});
