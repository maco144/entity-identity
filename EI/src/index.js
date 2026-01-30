/**
 * Entity Identity ZK - SDK
 *
 * Universal identification system for AIs, robots, humans, and hybrids.
 *
 * @example
 * import { EntityTypes, Entity, Attester, generateProof } from 'entity-identity-zk';
 *
 * const entity = new Entity(crypto);
 * const proof = await generateProof(entity, EntityTypes['AI.CA'], context);
 */

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
} from './entity-identity.js';

export {
    InteractionLevel,
    RecommendedLevels,
    TrustHash,
    PublicAttestation,
    PublicTrustRegistry,
    DualProofCoordinator,
    VerificationPolicy,
    ExamplePolicies,
} from './dual-system.js';

// Version
export const VERSION = '0.1.0';

// Quick reference for type codes
export const TypeCodes = {
    // AI - Artificial Intelligence (0x01xx)
    AI_CA: 0x0101,  // Conversational Agent (Kah)
    AI_PO: 0x0102,  // Program Orchestrator (Poe)
    AI_WS: 0x0103,  // Web Site (Wiz)
    AI_OS: 0x0104,  // Operating System (Aus)
    AI_GN: 0x0105,  // Generative Model (Jen)
    AI_AA: 0x0106,  // Autonomous Agent (Ahh)
    AI_LM: 0x0107,  // Language Model (Elm)
    AI_DB: 0x0108,  // Data Broker (Deb)
    AI_JG: 0x0109,  // Judge/Evaluator (Jig)
    AI_SY: 0x010A,  // Synthetic Media (Sigh)

    // AR - Artificial Robotics (0x02xx)
    AR_RB: 0x0201,  // Robot Bot (Rob)
    AR_DR: 0x0202,  // Drone (Dar)
    AR_VH: 0x0203,  // Vehicle (Vee)

    // HU - Human (0x03xx)
    HU_US: 0x0301,  // Human User (Who)

    // HY - Hybrid (0x04xx)
    HY_CP: 0x0401,  // Copilot (Kip)
    HY_HS: 0x0402,  // Hive Swarm (His)
};
