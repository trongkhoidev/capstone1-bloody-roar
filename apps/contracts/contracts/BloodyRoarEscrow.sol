// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

// =============================================================================
// BloodyRoarEscrow — Smart Contract Escrow for Decentralized Bounty Marketplace
// =============================================================================
// Sprint 1: Implement full escrow logic (deposit, release, cancel, dispute, resolve)
// Sprint 0: Contract skeleton only — compiles, no logic
//
// State machine:
//   [*] → AWAITING_DELIVERY: deposit()
//   AWAITING_DELIVERY → COMPLETED: releaseFunds() | claimTimeout()
//   AWAITING_DELIVERY → CANCELLED: mutualCancel()
//   AWAITING_DELIVERY → DISPUTED: raiseDispute()
//   DISPUTED → RESOLUTION_PROPOSED: proposeResolution()
//   RESOLUTION_PROPOSED → COMPLETED: executeResolution()
//   RESOLUTION_PROPOSED → DISPUTED: challengeResolution()
// =============================================================================

import "@openzeppelin/contracts/utils/Pausable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";

/**
 * @title BloodyRoarEscrow
 * @notice Trustless escrow for developer bounties on Base Sepolia (Ethereum L2)
 * @dev Implements lazy-deposit pattern with EIP-712 off-chain commitments. EVM-compatible for mainnet later.
 */
contract BloodyRoarEscrow is Pausable, ReentrancyGuard, Ownable, EIP712 {
    using SafeERC20 for IERC20;

    // =========================================================================
    // ENUMS
    // =========================================================================

    enum EscrowState {
        AWAITING_DELIVERY,   // Funds locked, developer working
        COMPLETED,           // Funds released to developer
        CANCELLED,           // Mutual cancel, refunded to client
        DISPUTED,            // Dispute raised, funds frozen
        RESOLUTION_PROPOSED  // Arbiter proposed split, in 24h timelock
    }

    // =========================================================================
    // STRUCTS
    // =========================================================================

    struct Escrow {
        address client;
        address developer;
        address token;          // ERC-20 token (USDT)
        uint256 amount;         // Total bounty locked
        uint256 depositedAt;    // Timestamp of deposit
        uint256 proposedAt;     // Timestamp of resolution proposal
        uint256 clientRatio;    // Proposed client refund ratio (0-100)
        EscrowState state;
        bool clientCancelApproved;
        bool developerCancelApproved;
    }

    // =========================================================================
    // CONSTANTS
    // =========================================================================

    uint256 public constant TIMEOUT_PERIOD = 30 days;
    uint256 public constant CHALLENGE_PERIOD = 24 hours;
    uint256 public constant PLATFORM_FEE_BPS = 250; // 2.5% in basis points
    uint256 public constant MAX_BPS = 10_000;

    // EIP-712 type hash for off-chain commitment
    bytes32 public constant COMMITMENT_TYPEHASH = keccak256(
        "Commitment(string issueId,address client,uint256 bountyAmount,address token,uint256 nonce)"
    );

    // =========================================================================
    // STATE
    // =========================================================================

    mapping(string => Escrow) public escrows;    // issueId → Escrow
    mapping(string => bool) public usedNonces;    // issueId → nonce used
    
    address public arbiter;         // Platform admin / dispute resolver
    address public feeRecipient;    // Platform fee recipient
    
    // =========================================================================
    // EVENTS
    // =========================================================================

    event Deposited(
        string indexed issueId,
        address indexed client,
        address indexed developer,
        uint256 amount,
        address token
    );

    event FundsReleased(
        string indexed issueId,
        address indexed developer,
        uint256 amount
    );

    event MutualCancelApproved(string indexed issueId, address approver);
    event Cancelled(string indexed issueId, address indexed client, uint256 refundAmount);
    event DisputeRaised(string indexed issueId, address raisedBy, string reason);
    event ResolutionProposed(string indexed issueId, uint256 clientRatio);
    event ResolutionChallenged(string indexed issueId, address challengedBy);
    event ResolutionExecuted(
        string indexed issueId,
        uint256 clientRefund,
        uint256 developerPayout
    );
    event TimeoutClaimed(string indexed issueId, address indexed developer, uint256 amount);
    event ArbiterUpdated(address indexed oldArbiter, address indexed newArbiter);

    // =========================================================================
    // ERRORS
    // =========================================================================

    error InvalidState(string issueId, EscrowState current, EscrowState required);
    error NotAuthorized(address caller, string reason);
    error InvalidAmount(uint256 amount);
    error TimeoutNotReached(uint256 depositedAt, uint256 timeoutAt, uint256 current);
    error ChallengePeriodActive(uint256 proposedAt, uint256 deadlineAt);
    error ChallengePeriodExpired();
    error InvalidRatio(uint256 ratio);
    error InvalidSignature();
    error NonceAlreadyUsed(string issueId);

    // =========================================================================
    // CONSTRUCTOR
    // =========================================================================

    constructor(
        address _arbiter,
        address _feeRecipient
    ) Ownable(msg.sender) EIP712("BloodyRoarEscrow", "1") {
        arbiter = _arbiter;
        feeRecipient = _feeRecipient;
    }

    // =========================================================================
    // MODIFIERS
    // =========================================================================

    modifier onlyArbiter() {
        if (msg.sender != arbiter) revert NotAuthorized(msg.sender, "Not arbiter");
        _;
    }

    modifier inState(string calldata issueId, EscrowState required) {
        if (escrows[issueId].state != required) {
            revert InvalidState(issueId, escrows[issueId].state, required);
        }
        _;
    }

    modifier onlyParties(string calldata issueId) {
        Escrow storage e = escrows[issueId];
        if (msg.sender != e.client && msg.sender != e.developer) {
            revert NotAuthorized(msg.sender, "Not a party to this escrow");
        }
        _;
    }

    // =========================================================================
    // CORE FUNCTIONS — Sprint 1 implementation
    // =========================================================================

    /**
     * @notice Lock bounty funds on-chain when client selects a developer
     * @dev Client must approve token transfer before calling this
     * @param issueId Platform issue ID (from backend DB)
     * @param developer Developer's wallet address
     * @param token ERC-20 token address (USDT)
     * @param amount Bounty amount to lock
     * @param signature EIP-712 off-chain commitment signature (Sprint 2)
     */
    function deposit(
        string calldata issueId,
        address developer,
        address token,
        uint256 amount,
        bytes calldata signature
    )
        external
        nonReentrant
        whenNotPaused
    {
        // TODO Sprint 1: Implement deposit logic
        // - Verify EIP-712 signature (Sprint 2)
        // - Transfer tokens from client to contract
        // - Store escrow state
        // - Emit Deposited event
        revert("Not implemented — Sprint 1");
    }

    /**
     * @notice Release funds to developer (client approves)
     * @param issueId Platform issue ID
     */
    function releaseFunds(string calldata issueId)
        external
        nonReentrant
        whenNotPaused
        inState(issueId, EscrowState.AWAITING_DELIVERY)
    {
        // TODO Sprint 1: Implement release logic
        // - Require caller is client
        // - Calculate platform fee
        // - Transfer (amount - fee) to developer
        // - Transfer fee to feeRecipient
        // - Set state to COMPLETED
        // - Emit FundsReleased event
        revert("Not implemented — Sprint 1");
    }

    /**
     * @notice Request mutual cancel (each party must call once)
     * @param issueId Platform issue ID
     */
    function mutualCancel(string calldata issueId)
        external
        nonReentrant
        whenNotPaused
        inState(issueId, EscrowState.AWAITING_DELIVERY)
        onlyParties(issueId)
    {
        // TODO Sprint 1: Implement mutual cancel logic
        // - Mark caller's approval
        // - If both approved: refund to client, set CANCELLED
        revert("Not implemented — Sprint 1");
    }

    /**
     * @notice Developer claims funds after 30-day timeout
     * @param issueId Platform issue ID
     */
    function claimTimeout(string calldata issueId)
        external
        nonReentrant
        whenNotPaused
        inState(issueId, EscrowState.AWAITING_DELIVERY)
    {
        // TODO Sprint 1: Implement timeout claim
        // - Require caller is developer
        // - Require 30 days elapsed since deposit
        // - Transfer funds to developer
        revert("Not implemented — Sprint 1");
    }

    /**
     * @notice Raise a dispute — freezes funds
     * @param issueId Platform issue ID
     * @param reason Brief reason for dispute
     */
    function raiseDispute(string calldata issueId, string calldata reason)
        external
        whenNotPaused
        inState(issueId, EscrowState.AWAITING_DELIVERY)
        onlyParties(issueId)
    {
        // TODO Sprint 1: Implement dispute raising
        // - Set state to DISPUTED
        // - Emit DisputeRaised event
        revert("Not implemented — Sprint 1");
    }

    /**
     * @notice Arbiter proposes a resolution split
     * @param issueId Platform issue ID
     * @param clientRatio Client refund percentage (0-100)
     *        0 = 100% to developer, 100 = 100% refund to client
     */
    function proposeResolution(string calldata issueId, uint256 clientRatio)
        external
        whenNotPaused
        inState(issueId, EscrowState.DISPUTED)
        onlyArbiter
    {
        // TODO Sprint 1: Implement resolution proposal
        // - Validate clientRatio 0-100
        // - Set state to RESOLUTION_PROPOSED
        // - Record proposedAt timestamp
        // - Emit ResolutionProposed event
        revert("Not implemented — Sprint 1");
    }

    /**
     * @notice Challenge the arbiter's resolution within 24h window
     * @param issueId Platform issue ID
     */
    function challengeResolution(string calldata issueId)
        external
        whenNotPaused
        inState(issueId, EscrowState.RESOLUTION_PROPOSED)
        onlyParties(issueId)
    {
        // TODO Sprint 1: Implement challenge logic
        // - Require within 24h window
        // - Set state back to DISPUTED
        // - Emit ResolutionChallenged event
        revert("Not implemented — Sprint 1");
    }

    /**
     * @notice Execute resolution after 24h challenge period expires
     * @param issueId Platform issue ID
     */
    function executeResolution(string calldata issueId)
        external
        nonReentrant
        whenNotPaused
        inState(issueId, EscrowState.RESOLUTION_PROPOSED)
    {
        // TODO Sprint 1: Implement execution logic
        // - Require 24h challenge period expired
        // - Split funds per clientRatio
        // - Set state to COMPLETED
        // - Emit ResolutionExecuted event
        revert("Not implemented — Sprint 1");
    }

    /**
     * @notice Verify EIP-712 off-chain commitment signature
     * @dev Used to validate client's commitment before deposit (Sprint 2)
     */
    function verifyCommitment(
        string calldata issueId,
        address client,
        uint256 bountyAmount,
        address token,
        uint256 nonce,
        bytes calldata signature
    ) public view returns (bool) {
        // TODO Sprint 2: Implement EIP-712 verification
        bytes32 structHash = keccak256(
            abi.encode(
                COMMITMENT_TYPEHASH,
                keccak256(bytes(issueId)),
                client,
                bountyAmount,
                token,
                nonce
            )
        );
        bytes32 hash = _hashTypedDataV4(structHash);
        address recovered = ECDSA.recover(hash, signature);
        return recovered == client;
    }

    // =========================================================================
    // ADMIN FUNCTIONS
    // =========================================================================

    /** @notice Emergency pause — owner only */
    function pause() external onlyOwner {
        _pause();
    }

    /** @notice Unpause — owner only */
    function unpause() external onlyOwner {
        _unpause();
    }

    /** @notice Update arbiter address */
    function setArbiter(address newArbiter) external onlyOwner {
        emit ArbiterUpdated(arbiter, newArbiter);
        arbiter = newArbiter;
    }

    // =========================================================================
    // VIEW FUNCTIONS
    // =========================================================================

    /** @notice Get escrow details for an issue */
    function getEscrow(string calldata issueId)
        external
        view
        returns (Escrow memory)
    {
        return escrows[issueId];
    }

    /** @notice Check if 30-day timeout has been reached */
    function isTimeoutReached(string calldata issueId) public view returns (bool) {
        Escrow storage e = escrows[issueId];
        if (e.depositedAt == 0) return false;
        return block.timestamp >= e.depositedAt + TIMEOUT_PERIOD;
    }

    /** @notice Check if 24h challenge period has expired */
    function isChallengeExpired(string calldata issueId) public view returns (bool) {
        Escrow storage e = escrows[issueId];
        if (e.proposedAt == 0) return false;
        return block.timestamp >= e.proposedAt + CHALLENGE_PERIOD;
    }
}
