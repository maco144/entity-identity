// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title EntityTypeRegistry
 * @notice On-chain registry for entity type attestations
 * @dev Integrates with Groth16 verifier for ZK proof verification
 */

interface IVerifier {
    function verifyProof(
        uint[2] calldata _pA,
        uint[2][2] calldata _pB,
        uint[2] calldata _pC,
        uint[5] calldata _pubSignals
    ) external view returns (bool);
}

contract EntityTypeRegistry {
    // ============ Constants ============

    // Entity type prefixes
    uint16 public constant PREFIX_AI = 0x0100;
    uint16 public constant PREFIX_AR = 0x0200;
    uint16 public constant PREFIX_HU = 0x0300;
    uint16 public constant PREFIX_HY = 0x0400;

    // ============ State ============

    IVerifier public immutable verifier;

    // Mapping from entity commitment to verified type
    mapping(bytes32 => uint16) public verifiedTypes;

    // Mapping from entity commitment to verification timestamp
    mapping(bytes32 => uint256) public verificationTimestamps;

    // Mapping from nullifier to used status (prevents replay)
    mapping(bytes32 => bool) public usedNullifiers;

    // Approved attesters merkle root
    bytes32 public attestersRoot;

    // Public trust merkle root
    bytes32 public publicTrustRoot;

    // Admin
    address public admin;

    // ============ Events ============

    event EntityVerified(
        bytes32 indexed commitment,
        uint16 indexed entityType,
        bytes32 nullifier,
        uint256 timestamp
    );

    event AttestersRootUpdated(bytes32 oldRoot, bytes32 newRoot);
    event PublicTrustRootUpdated(bytes32 oldRoot, bytes32 newRoot);

    // ============ Errors ============

    error InvalidProof();
    error NullifierAlreadyUsed();
    error InvalidEntityType();
    error Unauthorized();

    // ============ Constructor ============

    constructor(address _verifier) {
        verifier = IVerifier(_verifier);
        admin = msg.sender;
    }

    // ============ External Functions ============

    /**
     * @notice Verify and register an entity type proof
     * @param proof The Groth16 proof components
     * @param publicSignals Public signals [nullifier, commitment, type, attestersRoot, contextId]
     */
    function verifyAndRegister(
        uint[2] calldata proofA,
        uint[2][2] calldata proofB,
        uint[2] calldata proofC,
        uint[5] calldata publicSignals
    ) external {
        // Extract public signals
        bytes32 nullifier = bytes32(publicSignals[0]);
        bytes32 commitment = bytes32(publicSignals[1]);
        uint16 entityType = uint16(publicSignals[2]);
        bytes32 proofAttestersRoot = bytes32(publicSignals[3]);
        // publicSignals[4] is contextId - not stored

        // Check nullifier hasn't been used
        if (usedNullifiers[nullifier]) {
            revert NullifierAlreadyUsed();
        }

        // Check attesters root matches
        if (proofAttestersRoot != attestersRoot) {
            revert InvalidProof();
        }

        // Verify the ZK proof
        bool valid = verifier.verifyProof(proofA, proofB, proofC, publicSignals);
        if (!valid) {
            revert InvalidProof();
        }

        // Validate entity type
        if (!_isValidType(entityType)) {
            revert InvalidEntityType();
        }

        // Mark nullifier as used
        usedNullifiers[nullifier] = true;

        // Store verification
        verifiedTypes[commitment] = entityType;
        verificationTimestamps[commitment] = block.timestamp;

        emit EntityVerified(commitment, entityType, nullifier, block.timestamp);
    }

    /**
     * @notice Check if a commitment has a verified type
     * @param commitment The entity commitment
     * @return entityType The verified type (0 if not verified)
     * @return timestamp When the verification occurred
     */
    function getVerification(bytes32 commitment)
        external
        view
        returns (uint16 entityType, uint256 timestamp)
    {
        return (verifiedTypes[commitment], verificationTimestamps[commitment]);
    }

    /**
     * @notice Check if a verification is still fresh
     * @param commitment The entity commitment
     * @param maxAge Maximum age in seconds
     * @return fresh Whether the verification is within maxAge
     */
    function isVerificationFresh(bytes32 commitment, uint256 maxAge)
        external
        view
        returns (bool fresh)
    {
        uint256 timestamp = verificationTimestamps[commitment];
        if (timestamp == 0) return false;
        return (block.timestamp - timestamp) <= maxAge;
    }

    /**
     * @notice Decode an entity type code
     * @param typeCode The 16-bit type code
     * @return prefix The type prefix (AI, AR, HU, HY)
     * @return category The category within the prefix
     */
    function decodeType(uint16 typeCode)
        external
        pure
        returns (uint8 prefix, uint8 category)
    {
        prefix = uint8(typeCode >> 8);
        category = uint8(typeCode & 0xFF);
    }

    // ============ Admin Functions ============

    /**
     * @notice Update the approved attesters merkle root
     * @param newRoot The new merkle root
     */
    function updateAttestersRoot(bytes32 newRoot) external {
        if (msg.sender != admin) revert Unauthorized();
        bytes32 oldRoot = attestersRoot;
        attestersRoot = newRoot;
        emit AttestersRootUpdated(oldRoot, newRoot);
    }

    /**
     * @notice Update the public trust merkle root
     * @param newRoot The new merkle root
     */
    function updatePublicTrustRoot(bytes32 newRoot) external {
        if (msg.sender != admin) revert Unauthorized();
        bytes32 oldRoot = publicTrustRoot;
        publicTrustRoot = newRoot;
        emit PublicTrustRootUpdated(oldRoot, newRoot);
    }

    /**
     * @notice Transfer admin role
     * @param newAdmin The new admin address
     */
    function transferAdmin(address newAdmin) external {
        if (msg.sender != admin) revert Unauthorized();
        admin = newAdmin;
    }

    // ============ Internal Functions ============

    function _isValidType(uint16 typeCode) internal pure returns (bool) {
        uint8 prefix = uint8(typeCode >> 8);
        // Valid prefixes are 1-4
        return prefix >= 1 && prefix <= 4;
    }
}
