/**
 * Dual Cryptographic Identity System
 * 
 * Combines ZK privacy with public accountability.
 */

import { buildPoseidon } from 'circomlibjs';

// ============================================================================
// INTERACTION LEVELS
// ============================================================================

/**
 * The system defines graduated levels of identity disclosure.
 * Higher stakes = more proof required.
 */
const InteractionLevel = {
    // No proof - anonymous browsing
    ANONYMOUS: 0,
    
    // ZK proof only - "I am type X"
    TYPE_ONLY: 1,
    
    // ZK + public attestation count - "I am type X with standing"
    TYPE_WITH_STANDING: 2,
    
    // Full dual proof with specific attestations revealed
    FULL_ACCOUNTABILITY: 3,
};

/**
 * Recommended levels for different interactions
 */
const RecommendedLevels = {
    // Level 0 - Anonymous
    'read_public_content': InteractionLevel.ANONYMOUS,
    'browse_website': InteractionLevel.ANONYMOUS,
    
    // Level 1 - Type Only
    'post_comment': InteractionLevel.TYPE_ONLY,
    'join_chat': InteractionLevel.TYPE_ONLY,
    'api_read_access': InteractionLevel.TYPE_ONLY,
    'basic_service': InteractionLevel.TYPE_ONLY,
    
    // Level 2 - Type with Standing
    'api_write_access': InteractionLevel.TYPE_WITH_STANDING,
    'moderate_transaction': InteractionLevel.TYPE_WITH_STANDING,
    'join_organization': InteractionLevel.TYPE_WITH_STANDING,
    'publish_content': InteractionLevel.TYPE_WITH_STANDING,
    
    // Level 3 - Full Accountability
    'financial_transaction': InteractionLevel.FULL_ACCOUNTABILITY,
    'legal_signature': InteractionLevel.FULL_ACCOUNTABILITY,
    'physical_access': InteractionLevel.FULL_ACCOUNTABILITY,
    'government_service': InteractionLevel.FULL_ACCOUNTABILITY,
    'healthcare_access': InteractionLevel.FULL_ACCOUNTABILITY,
};

// ============================================================================
// TRUST HASH - Local State Commitment
// ============================================================================

/**
 * TrustHash - A compact commitment to an entity's complete trust state.
 * 
 * Instead of storing/transmitting full proofs, entities maintain a rolling
 * hash of their trust configuration. This enables:
 * 
 * 1. Quick staleness checks ("has anything changed?")
 * 2. Efficient on-chain anchoring (store 32 bytes, not full proofs)
 * 3. Challenge-response verification (if disputed, reveal preimage)
 */
class TrustHash {
    constructor(poseidonHash) {
        this.hash = poseidonHash;
        this.state = null;
        this.currentHash = null;
    }
    
    /**
     * Compute trust hash from current state
     */
    compute(state) {
        this.state = state;
        
        // trust_hash = Poseidon(
        //     entity_commitment,
        //     zk_attesters_root,
        //     public_trust_root,
        //     attestation_count,
        //     last_attestation_id,
        //     nonce
        // )
        
        // For 6 inputs, we chain two Poseidon calls
        const intermediate = this.hash([
            BigInt(state.entityCommitment),
            BigInt(state.zkAttestersRoot),
            BigInt(state.publicTrustRoot),
        ]);
        
        this.currentHash = this.hash([
            intermediate,
            BigInt(state.attestationCount),
            BigInt(state.lastAttestationId),
            BigInt(state.nonce),
        ]);
        
        return this.currentHash;
    }
    
    /**
     * Verify a trust hash matches expected state
     */
    verify(claimedHash, state) {
        const computed = this.compute(state);
        return computed === BigInt(claimedHash);
    }
    
    /**
     * Generate new nonce (for rotation)
     */
    rotate(newNonce) {
        if (!this.state) throw new Error('No state to rotate');
        this.state.nonce = newNonce;
        return this.compute(this.state);
    }
}

// ============================================================================
// PUBLIC TRUST REGISTRY - On-Chain Structure
// ============================================================================

/**
 * PublicAttestation - A visible attestation in the public registry
 * 
 * Unlike ZK attestations (hidden), these are meant to be seen.
 * They build reputation and enable accountability.
 */
class PublicAttestation {
    constructor(data) {
        this.entityCommitment = data.entityCommitment;
        this.entityType = data.entityType;
        this.attesterPubKeyHash = data.attesterPubKeyHash;
        this.attesterName = data.attesterName;  // Human-readable, optional
        this.timestamp = data.timestamp;
        this.attestationId = data.attestationId;
        this.metadata = data.metadata || {};  // Additional context
    }
    
    /**
     * Compute leaf for merkle tree
     */
    computeLeaf(poseidonHash) {
        return poseidonHash([
            BigInt(this.entityCommitment),
            BigInt(this.entityType),
            BigInt(this.attesterPubKeyHash),
            BigInt(this.timestamp),
            BigInt(this.attestationId),
        ]);
    }
    
    /**
     * Serialize for on-chain storage
     */
    toOnChainFormat() {
        return {
            commitment: this.entityCommitment,
            typeCode: this.entityType,
            attester: this.attesterPubKeyHash,
            timestamp: this.timestamp,
            id: this.attestationId,
        };
    }
}

/**
 * PublicTrustRegistry - The transparent attestation database
 * 
 * This could be:
 * - A smart contract on Ethereum/Cosmos/Solana
 * - A transparency log (like Certificate Transparency)
 * - A federated database with merkle proofs
 */
class PublicTrustRegistry {
    constructor(poseidonHash) {
        this.hash = poseidonHash;
        this.attestations = new Map();  // attestationId -> PublicAttestation
        this.byCommitment = new Map();  // commitment -> Set<attestationId>
        this.merkleTree = null;  // Would be a real merkle tree in production
        this.nextId = 1;
    }
    
    /**
     * Add a public attestation
     * In production: this would be a blockchain transaction
     */
    addAttestation(attestation) {
        const id = this.nextId++;
        attestation.attestationId = id;
        attestation.timestamp = attestation.timestamp || Date.now();
        
        this.attestations.set(id, attestation);
        
        if (!this.byCommitment.has(attestation.entityCommitment)) {
            this.byCommitment.set(attestation.entityCommitment, new Set());
        }
        this.byCommitment.get(attestation.entityCommitment).add(id);
        
        // Rebuild merkle tree (simplified)
        this._rebuildTree();
        
        return {
            attestationId: id,
            leaf: attestation.computeLeaf(this.hash),
            root: this.getRoot(),
        };
    }
    
    /**
     * Get all attestations for a commitment
     */
    getAttestationsFor(commitment) {
        const ids = this.byCommitment.get(commitment) || new Set();
        return [...ids].map(id => this.attestations.get(id));
    }
    
    /**
     * Get attestation count for a commitment
     */
    getAttestationCount(commitment) {
        return (this.byCommitment.get(commitment) || new Set()).size;
    }
    
    /**
     * Get merkle root
     */
    getRoot() {
        // Simplified - real implementation uses proper merkle tree
        if (this.attestations.size === 0) return BigInt(0);
        
        const leaves = [...this.attestations.values()].map(a => a.computeLeaf(this.hash));
        return this._computeRoot(leaves);
    }
    
    /**
     * Generate merkle proof for an attestation
     */
    getMerkleProof(attestationId) {
        // Simplified - real implementation provides actual proof
        const attestation = this.attestations.get(attestationId);
        if (!attestation) return null;
        
        return {
            leaf: attestation.computeLeaf(this.hash),
            pathElements: [],  // Would be actual sibling hashes
            pathIndices: [],   // Would be actual path
            root: this.getRoot(),
        };
    }
    
    _rebuildTree() {
        // Placeholder - real implementation maintains incremental merkle tree
    }
    
    _computeRoot(leaves) {
        if (leaves.length === 0) return BigInt(0);
        if (leaves.length === 1) return leaves[0];
        
        const nextLevel = [];
        for (let i = 0; i < leaves.length; i += 2) {
            const left = leaves[i];
            const right = i + 1 < leaves.length ? leaves[i + 1] : left;
            nextLevel.push(this.hash([left, right]));
        }
        return this._computeRoot(nextLevel);
    }
}

// ============================================================================
// DUAL PROOF COORDINATOR
// ============================================================================

/**
 * DualProofCoordinator - Manages both proof layers
 * 
 * This is what an entity uses to generate proofs at different levels.
 */
class DualProofCoordinator {
    constructor(entity, zkAttesterRegistry, publicTrustRegistry, crypto) {
        this.entity = entity;
        this.zkRegistry = zkAttesterRegistry;
        this.publicRegistry = publicTrustRegistry;
        this.crypto = crypto;
        this.trustHash = new TrustHash(crypto.hash);
    }
    
    /**
     * Generate proof for requested interaction level
     */
    async generateProof(level, params) {
        switch (level) {
            case InteractionLevel.ANONYMOUS:
                return this._generateAnonymousProof(params);
                
            case InteractionLevel.TYPE_ONLY:
                return this._generateTypeOnlyProof(params);
                
            case InteractionLevel.TYPE_WITH_STANDING:
                return this._generateTypeWithStandingProof(params);
                
            case InteractionLevel.FULL_ACCOUNTABILITY:
                return this._generateFullAccountabilityProof(params);
                
            default:
                throw new Error(`Unknown interaction level: ${level}`);
        }
    }
    
    /**
     * Level 0: No proof needed
     */
    _generateAnonymousProof(params) {
        return {
            level: InteractionLevel.ANONYMOUS,
            proof: null,
            publicSignals: null,
            message: "No identity proof required",
        };
    }
    
    /**
     * Level 1: ZK proof only
     */
    async _generateTypeOnlyProof(params) {
        const { claimedType, contextId, zkAttestation, zkAttesterProof } = params;
        
        const inputs = this.entity.generateProofInputs(
            claimedType,
            zkAttestation,
            zkAttesterProof,
            this.zkRegistry.getRoot(),
            contextId
        );
        
        // In production: actually generate the ZK proof
        // const { proof, publicSignals } = await snarkjs.groth16.fullProve(inputs, wasm, zkey);
        
        return {
            level: InteractionLevel.TYPE_ONLY,
            inputs,  // Would be proof + publicSignals in production
            revealed: {
                type: claimedType,
                commitment: this.entity.getCommitment(),
            },
            hidden: [
                'entity_secret',
                'which_attester',
                'attestation_signature',
            ],
        };
    }
    
    /**
     * Level 2: ZK + public attestation count
     */
    async _generateTypeWithStandingProof(params) {
        const { claimedType, contextId, zkAttestation, zkAttesterProof, minAttestations } = params;
        
        const commitment = this.entity.getCommitment();
        const publicAttestations = this.publicRegistry.getAttestationsFor(commitment.toString());
        
        if (publicAttestations.length < minAttestations) {
            throw new Error(`Insufficient public attestations: have ${publicAttestations.length}, need ${minAttestations}`);
        }
        
        // Get merkle proofs for public attestations
        const publicProofs = publicAttestations.slice(0, minAttestations).map(a => 
            this.publicRegistry.getMerkleProof(a.attestationId)
        );
        
        return {
            level: InteractionLevel.TYPE_WITH_STANDING,
            zkProof: await this._generateTypeOnlyProof(params),
            publicStanding: {
                attestationCount: publicAttestations.length,
                publicTrustRoot: this.publicRegistry.getRoot(),
                minRequired: minAttestations,
            },
            revealed: {
                type: claimedType,
                commitment: commitment,
                attestationCount: publicAttestations.length,
            },
            hidden: [
                'entity_secret',
                'which_zk_attester',
                'which_public_attesters',  // Count visible, identities hidden in this level
            ],
        };
    }
    
    /**
     * Level 3: Full accountability - reveal specific attesters
     */
    async _generateFullAccountabilityProof(params) {
        const { claimedType, contextId, zkAttestation, zkAttesterProof } = params;
        
        const commitment = this.entity.getCommitment();
        const publicAttestations = this.publicRegistry.getAttestationsFor(commitment.toString());
        
        // At this level, we reveal the full attestation history
        const attestationDetails = publicAttestations.map(a => ({
            attester: a.attesterName || a.attesterPubKeyHash,
            type: a.entityType,
            timestamp: new Date(a.timestamp).toISOString(),
            id: a.attestationId,
        }));
        
        return {
            level: InteractionLevel.FULL_ACCOUNTABILITY,
            zkProof: await this._generateTypeOnlyProof(params),
            publicAttestations: attestationDetails,
            revealed: {
                type: claimedType,
                commitment: commitment,
                fullAttestationHistory: attestationDetails,
            },
            hidden: [
                'entity_secret',  // Still hidden - but accountable via public record
            ],
        };
    }
    
    /**
     * Compute current trust hash
     */
    computeTrustHash() {
        const commitment = this.entity.getCommitment();
        const attestations = this.publicRegistry.getAttestationsFor(commitment.toString());
        const lastAttestation = attestations[attestations.length - 1];
        
        return this.trustHash.compute({
            entityCommitment: commitment.toString(),
            zkAttestersRoot: this.zkRegistry.getRoot().toString(),
            publicTrustRoot: this.publicRegistry.getRoot().toString(),
            attestationCount: attestations.length,
            lastAttestationId: lastAttestation?.attestationId || 0,
            nonce: Date.now(),
        });
    }
}

// ============================================================================
// VERIFICATION POLICIES
// ============================================================================

/**
 * VerificationPolicy - Defines what proof a verifier requires
 */
class VerificationPolicy {
    constructor(config) {
        this.minLevel = config.minLevel || InteractionLevel.ANONYMOUS;
        this.allowedTypes = config.allowedTypes || null;  // null = all types
        this.minPublicAttestations = config.minPublicAttestations || 0;
        this.maxAttestationAge = config.maxAttestationAge || Infinity;  // milliseconds
        this.requiredAttesters = config.requiredAttesters || null;  // null = any
        this.trustedZkRoots = config.trustedZkRoots || [];
        this.trustedPublicRoots = config.trustedPublicRoots || [];
    }
    
    /**
     * Check if a proof satisfies this policy
     */
    verify(proofPackage) {
        const errors = [];
        
        // Check level
        if (proofPackage.level < this.minLevel) {
            errors.push(`Insufficient proof level: ${proofPackage.level} < ${this.minLevel}`);
        }
        
        // Check type
        if (this.allowedTypes && !this.allowedTypes.includes(proofPackage.revealed?.type)) {
            errors.push(`Type not allowed: ${proofPackage.revealed?.type}`);
        }
        
        // Check attestation count (for level 2+)
        if (proofPackage.level >= InteractionLevel.TYPE_WITH_STANDING) {
            if ((proofPackage.publicStanding?.attestationCount || 0) < this.minPublicAttestations) {
                errors.push(`Insufficient attestations: ${proofPackage.publicStanding?.attestationCount} < ${this.minPublicAttestations}`);
            }
        }
        
        // In production: verify actual cryptographic proofs, check roots, etc.
        
        return {
            valid: errors.length === 0,
            errors,
        };
    }
}

// ============================================================================
// EXAMPLE POLICIES
// ============================================================================

const ExamplePolicies = {
    // Public forum - just need to know if AI or human
    publicForum: new VerificationPolicy({
        minLevel: InteractionLevel.TYPE_ONLY,
        allowedTypes: null,  // All types welcome
    }),
    
    // Financial API - only established AIs with history
    financialApi: new VerificationPolicy({
        minLevel: InteractionLevel.TYPE_WITH_STANDING,
        allowedTypes: ['AI.CA', 'AI.PO', 'AI.AA'],
        minPublicAttestations: 3,
        maxAttestationAge: 365 * 24 * 60 * 60 * 1000,  // 1 year
    }),
    
    // Physical building access - full accountability
    physicalAccess: new VerificationPolicy({
        minLevel: InteractionLevel.FULL_ACCOUNTABILITY,
        allowedTypes: ['AR.RB', 'AR.VH', 'HU.US'],
        minPublicAttestations: 5,
    }),
    
    // AI-only space - no humans allowed (interesting inversion)
    aiOnlySpace: new VerificationPolicy({
        minLevel: InteractionLevel.TYPE_ONLY,
        allowedTypes: ['AI.CA', 'AI.PO', 'AI.WS', 'AI.OS', 'AI.GN', 'AI.AA'],
    }),
};

// ============================================================================
// EXPORTS
// ============================================================================

export {
    InteractionLevel,
    RecommendedLevels,
    TrustHash,
    PublicAttestation,
    PublicTrustRegistry,
    DualProofCoordinator,
    VerificationPolicy,
    ExamplePolicies,
};
