// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title HedwigProofRegistry
 * @notice Minimal, non-custodial proof registry for Hedwig document lifecycle events.
 * @dev This contract never touches user funds or token approvals.
 */
contract HedwigProofRegistry is Ownable {
    struct Proof {
        bytes32 documentIdHash;
        bytes32 actionHash;
        bytes32 payloadHash;
        address writer;
        uint64 recordedAt;
    }

    mapping(bytes32 => Proof) private proofs;
    mapping(address => bool) public trustedWriters;

    uint256 public proofCount;

    event TrustedWriterUpdated(address indexed writer, bool allowed);
    event ProofRecorded(
        bytes32 indexed proofId,
        bytes32 indexed documentIdHash,
        bytes32 indexed actionHash,
        bytes32 payloadHash,
        address writer,
        uint256 recordedAt
    );

    error UnauthorizedWriter();
    error InvalidWriter();
    error EmptyHash();
    error ProofAlreadyExists(bytes32 proofId);

    constructor(address initialOwner, address initialWriter) Ownable(initialOwner) {
        if (initialWriter == address(0)) revert InvalidWriter();
        trustedWriters[initialWriter] = true;
        emit TrustedWriterUpdated(initialWriter, true);
    }

    modifier onlyTrustedWriter() {
        if (msg.sender != owner() && !trustedWriters[msg.sender]) {
            revert UnauthorizedWriter();
        }
        _;
    }

    function setTrustedWriter(address writer, bool allowed) external onlyOwner {
        if (writer == address(0)) revert InvalidWriter();
        trustedWriters[writer] = allowed;
        emit TrustedWriterUpdated(writer, allowed);
    }

    function computeProofId(
        bytes32 documentIdHash,
        bytes32 actionHash,
        bytes32 payloadHash,
        uint256 nonce
    ) public pure returns (bytes32) {
        return keccak256(abi.encode(documentIdHash, actionHash, payloadHash, nonce));
    }

    function recordProof(
        bytes32 documentIdHash,
        bytes32 actionHash,
        bytes32 payloadHash,
        uint256 nonce
    ) external onlyTrustedWriter returns (bytes32 proofId) {
        if (documentIdHash == bytes32(0) || actionHash == bytes32(0) || payloadHash == bytes32(0)) {
            revert EmptyHash();
        }

        proofId = computeProofId(documentIdHash, actionHash, payloadHash, nonce);
        if (proofs[proofId].recordedAt != 0) revert ProofAlreadyExists(proofId);

        proofs[proofId] = Proof({
            documentIdHash: documentIdHash,
            actionHash: actionHash,
            payloadHash: payloadHash,
            writer: msg.sender,
            recordedAt: uint64(block.timestamp)
        });

        unchecked {
            proofCount += 1;
        }

        emit ProofRecorded(
            proofId,
            documentIdHash,
            actionHash,
            payloadHash,
            msg.sender,
            block.timestamp
        );
    }

    function proofExists(bytes32 proofId) external view returns (bool) {
        return proofs[proofId].recordedAt != 0;
    }

    function getProof(bytes32 proofId) external view returns (Proof memory) {
        return proofs[proofId];
    }
}
