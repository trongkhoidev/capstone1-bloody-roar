// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IERC20Metadata} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/**
 * @title BloodyRoarEscrow
 * @notice Non-upgradeable escrow accounting for the Bloody Roar marketplace.
 * @dev Resolution creates pull-payment credits. A recipient can never block a
 *      different recipient's allocation or claim.
 */
contract BloodyRoarEscrow is Ownable2Step, Pausable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    uint256 public constant MAX_BPS = 10_000;
    uint256 public constant PLATFORM_FEE_BPS = 250;
    uint256 public constant REVIEW_PERIOD = 7 days;
    uint256 public constant EVIDENCE_RESPONSE_PERIOD = 72 hours;
    uint256 public constant CHALLENGE_PERIOD = 7 days;
    uint256 public constant FINAL_RULING_NOTICE_PERIOD = 24 hours;
    uint256 public constant ARBITER_STALL_PERIOD = 30 days;

    uint256 public constant BASE_SEPOLIA_CHAIN_ID = 84_532;
    address public constant BASE_SEPOLIA_USDC = 0x036CbD53842c5426634e7929541eC2318f3dCF7e;

    IERC20 public immutable token;

    enum Phase {
        NONE,
        FUNDED,
        DISPUTED,
        INITIAL_RULING,
        CHALLENGED,
        FINAL_RULING,
        RESOLVED
    }

    enum ResolutionKind {
        NONE,
        RELEASE,
        MISSED_DELIVERY_REFUND,
        REVIEW_TIMEOUT,
        SETTLEMENT,
        RULING,
        ARBITER_TIMEOUT_SPLIT
    }

    struct Escrow {
        address client;
        address developer;
        address arbiter;
        address feeRecipient;
        uint256 amount;
        uint256 depositedAt;
        uint256 deliveryDeadline;
        bytes32 termsHash;
        bytes32 deliveryHash;
        Phase phase;
        ResolutionKind resolutionKind;
    }

    struct SettlementProposal {
        address proposer;
        uint256 clientBps;
    }

    struct Dispute {
        address raisedBy;
        uint256 raisedAt;
        bytes32 raiserEvidenceHash;
        bytes32 counterpartyEvidenceHash;
        uint256 initialClientBps;
        uint256 initialRulingAt;
        bytes32 initialDecisionHash;
        uint256 challengedAt;
        uint256 finalClientBps;
        uint256 finalRulingAt;
        bytes32 finalDecisionHash;
    }

    mapping(string escrowId => Escrow) private _escrows;
    mapping(string escrowId => SettlementProposal) private _settlements;
    mapping(string escrowId => Dispute) private _disputes;
    mapping(address recipient => uint256 amount) public claimable;

    address public arbiter;
    address public feeRecipient;
    address public pendingArbiter;
    address public pendingFeeRecipient;
    uint256 public totalUnresolvedPrincipal;
    uint256 public totalClaimable;

    event Deposited(
        string indexed escrowId,
        address indexed client,
        address indexed developer,
        address arbiter,
        address feeRecipient,
        uint256 amount,
        uint256 deliveryDeadline,
        bytes32 termsHash
    );
    event WorkSubmitted(string indexed escrowId, address indexed developer, bytes32 deliveryHash);
    event SettlementProposed(string indexed escrowId, address indexed proposer, uint256 clientBps);
    event SettlementRevoked(string indexed escrowId, address indexed proposer);
    event DisputeRaised(string indexed escrowId, address indexed raisedBy, bytes32 evidenceManifestHash);
    event CounterpartyEvidenceSubmitted(
        string indexed escrowId, address indexed submittedBy, bytes32 evidenceManifestHash
    );
    event InitialRulingPosted(
        string indexed escrowId,
        address indexed arbiter,
        uint256 clientBps,
        bytes32 decisionHash,
        uint256 challengeEndsAt
    );
    event RulingChallenged(string indexed escrowId, address indexed challengedBy, uint256 challengedAt);
    event FinalRulingPosted(
        string indexed escrowId, address indexed arbiter, uint256 clientBps, bytes32 decisionHash, uint256 noticeEndsAt
    );
    event EscrowResolved(
        string indexed escrowId,
        ResolutionKind indexed kind,
        uint256 clientAmount,
        uint256 developerAmount,
        uint256 platformFee,
        bytes32 decisionHash
    );
    event Claimed(address indexed recipient, address indexed caller, uint256 amount);
    event ArbiterTransferProposed(address indexed currentArbiter, address indexed pendingArbiter);
    event ArbiterUpdated(address indexed oldArbiter, address indexed newArbiter);
    event FeeRecipientTransferProposed(address indexed currentRecipient, address indexed pendingRecipient);
    event FeeRecipientUpdated(address indexed oldRecipient, address indexed newRecipient);

    error EmptyEscrowId();
    error EscrowAlreadyExists(string escrowId);
    error EscrowNotFound(string escrowId);
    error InvalidAddress();
    error IdenticalParticipants();
    error RoleCollision();
    error InvalidAmount();
    error InvalidDeadline();
    error ZeroHash();
    error UnsupportedChain(uint256 chainId);
    error InvalidProductionToken(address tokenAddress);
    error InvalidTokenDecimals(uint8 decimals);
    error InvalidReceivedAmount(uint256 expected, uint256 received);
    error InvalidPhase(string escrowId, Phase currentPhase);
    error NotAuthorized(address caller);
    error DeadlinePassed(uint256 deadline);
    error DeadlineNotReached(uint256 deadline);
    error NoDelivery();
    error ReviewWindowNotReached(uint256 reviewDeadline);
    error InvalidBasisPoints(uint256 clientBps);
    error NoPendingSettlement();
    error SettlementAlreadyPending();
    error NotSettlementProposer();
    error NotTheCounterparty();
    error EvidenceResponseWindowClosed(uint256 deadline);
    error EvidenceResponsePeriodActive(uint256 deadline);
    error EvidenceAlreadySubmitted();
    error ChallengeWindowClosed(uint256 deadline);
    error ChallengeNotPermitted();
    error RulingNotReady(uint256 deadline);
    error ArbiterStallNotReached(uint256 deadline);
    error ArbiterStallDeadlineReached(uint256 deadline);
    error NoPendingArbiter();
    error NoPendingFeeRecipient();
    error NothingToClaim(address recipient);
    error RecipientBalanceMismatch(uint256 expected, uint256 received);
    error Insolvent(uint256 accounted, uint256 balance);
    error OwnershipRenunciationDisabled();

    modifier escrowExists(string calldata escrowId) {
        if (bytes(escrowId).length == 0) revert EmptyEscrowId();
        if (_escrows[escrowId].client == address(0)) revert EscrowNotFound(escrowId);
        _;
    }

    modifier onlyParty(string calldata escrowId) {
        Escrow storage escrow = _escrows[escrowId];
        if (msg.sender != escrow.client && msg.sender != escrow.developer) {
            revert NotAuthorized(msg.sender);
        }
        _;
    }

    modifier onlyEscrowArbiter(string calldata escrowId) {
        if (msg.sender != _escrows[escrowId].arbiter) revert NotAuthorized(msg.sender);
        _;
    }

    constructor(address tokenAddress, address ownerSafe, address arbiterSafe, address initialFeeRecipient)
        Ownable(ownerSafe)
    {
        if (
            tokenAddress == address(0) || ownerSafe == address(0) || arbiterSafe == address(0)
                || initialFeeRecipient == address(0)
        ) revert InvalidAddress();
        if (ownerSafe == arbiterSafe || ownerSafe == initialFeeRecipient || arbiterSafe == initialFeeRecipient) {
            revert RoleCollision();
        }

        if (block.chainid == BASE_SEPOLIA_CHAIN_ID) {
            if (tokenAddress != BASE_SEPOLIA_USDC) revert InvalidProductionToken(tokenAddress);
        } else if (block.chainid != 31_337 && block.chainid != 1_337) {
            revert UnsupportedChain(block.chainid);
        }

        uint8 decimals = IERC20Metadata(tokenAddress).decimals();
        if (decimals != 6) revert InvalidTokenDecimals(decimals);

        token = IERC20(tokenAddress);
        arbiter = arbiterSafe;
        feeRecipient = initialFeeRecipient;
    }

    function deposit(
        string calldata escrowId,
        address developer,
        uint256 amount,
        uint256 deliveryDeadline,
        bytes32 termsHash
    ) external nonReentrant whenNotPaused {
        if (bytes(escrowId).length == 0) revert EmptyEscrowId();
        if (_escrows[escrowId].client != address(0)) revert EscrowAlreadyExists(escrowId);
        if (developer == address(0)) revert InvalidAddress();
        if (developer == msg.sender) revert IdenticalParticipants();
        if (amount == 0) revert InvalidAmount();
        if (termsHash == bytes32(0)) revert ZeroHash();
        if (deliveryDeadline <= block.timestamp || deliveryDeadline > type(uint256).max - REVIEW_PERIOD) {
            revert InvalidDeadline();
        }

        uint256 balanceBefore = token.balanceOf(address(this));
        token.safeTransferFrom(msg.sender, address(this), amount);
        uint256 balanceAfter = token.balanceOf(address(this));
        uint256 received = balanceAfter >= balanceBefore ? balanceAfter - balanceBefore : 0;
        if (received != amount) revert InvalidReceivedAmount(amount, received);

        _escrows[escrowId] = Escrow({
            client: msg.sender,
            developer: developer,
            arbiter: arbiter,
            feeRecipient: feeRecipient,
            amount: amount,
            depositedAt: block.timestamp,
            deliveryDeadline: deliveryDeadline,
            termsHash: termsHash,
            deliveryHash: bytes32(0),
            phase: Phase.FUNDED,
            resolutionKind: ResolutionKind.NONE
        });
        totalUnresolvedPrincipal += amount;

        emit Deposited(escrowId, msg.sender, developer, arbiter, feeRecipient, amount, deliveryDeadline, termsHash);
        _assertSolvent();
    }

    function submitWork(string calldata escrowId, bytes32 deliveryHash) external escrowExists(escrowId) {
        Escrow storage escrow = _escrows[escrowId];
        if (escrow.phase != Phase.FUNDED) revert InvalidPhase(escrowId, escrow.phase);
        if (msg.sender != escrow.developer) revert NotAuthorized(msg.sender);
        if (deliveryHash == bytes32(0)) revert ZeroHash();
        if (block.timestamp > escrow.deliveryDeadline) revert DeadlinePassed(escrow.deliveryDeadline);

        escrow.deliveryHash = deliveryHash;
        emit WorkSubmitted(escrowId, msg.sender, deliveryHash);
    }

    function releaseFunds(string calldata escrowId) external escrowExists(escrowId) {
        Escrow storage escrow = _escrows[escrowId];
        if (escrow.phase != Phase.FUNDED) revert InvalidPhase(escrowId, escrow.phase);
        if (msg.sender != escrow.client) revert NotAuthorized(msg.sender);
        if (escrow.deliveryHash == bytes32(0)) revert NoDelivery();
        _resolve(escrowId, 0, ResolutionKind.RELEASE, bytes32(0));
    }

    function claimMissedDeliveryRefund(string calldata escrowId) external escrowExists(escrowId) {
        Escrow storage escrow = _escrows[escrowId];
        if (escrow.phase != Phase.FUNDED) revert InvalidPhase(escrowId, escrow.phase);
        if (escrow.deliveryHash != bytes32(0)) revert NoDelivery();
        if (block.timestamp <= escrow.deliveryDeadline) revert DeadlineNotReached(escrow.deliveryDeadline);
        _resolve(escrowId, MAX_BPS, ResolutionKind.MISSED_DELIVERY_REFUND, bytes32(0));
    }

    function claimReviewTimeout(string calldata escrowId) external escrowExists(escrowId) {
        Escrow storage escrow = _escrows[escrowId];
        if (escrow.phase != Phase.FUNDED) revert InvalidPhase(escrowId, escrow.phase);
        if (escrow.deliveryHash == bytes32(0)) revert NoDelivery();
        uint256 deadline = escrow.deliveryDeadline + REVIEW_PERIOD;
        if (block.timestamp < deadline) revert ReviewWindowNotReached(deadline);
        _resolve(escrowId, 0, ResolutionKind.REVIEW_TIMEOUT, bytes32(0));
    }

    function proposeSettlement(string calldata escrowId, uint256 clientBps)
        external
        escrowExists(escrowId)
        onlyParty(escrowId)
    {
        Escrow storage escrow = _escrows[escrowId];
        if (escrow.phase == Phase.RESOLVED) revert InvalidPhase(escrowId, escrow.phase);
        if (clientBps > MAX_BPS) revert InvalidBasisPoints(clientBps);
        if (_settlements[escrowId].proposer != address(0)) revert SettlementAlreadyPending();

        _settlements[escrowId] = SettlementProposal({proposer: msg.sender, clientBps: clientBps});
        emit SettlementProposed(escrowId, msg.sender, clientBps);
    }

    function revokeSettlement(string calldata escrowId) external escrowExists(escrowId) {
        Escrow storage escrow = _escrows[escrowId];
        SettlementProposal memory proposal = _settlements[escrowId];
        if (escrow.phase == Phase.RESOLVED) revert InvalidPhase(escrowId, escrow.phase);
        if (proposal.proposer == address(0)) revert NoPendingSettlement();
        if (msg.sender != proposal.proposer) revert NotSettlementProposer();
        delete _settlements[escrowId];
        emit SettlementRevoked(escrowId, msg.sender);
    }

    function acceptSettlement(string calldata escrowId) external escrowExists(escrowId) {
        Escrow storage escrow = _escrows[escrowId];
        SettlementProposal memory proposal = _settlements[escrowId];
        if (escrow.phase == Phase.RESOLVED) revert InvalidPhase(escrowId, escrow.phase);
        if (proposal.proposer == address(0)) revert NoPendingSettlement();
        if (msg.sender != escrow.client && msg.sender != escrow.developer) revert NotAuthorized(msg.sender);
        if (msg.sender == proposal.proposer) revert NotTheCounterparty();
        _resolve(escrowId, proposal.clientBps, ResolutionKind.SETTLEMENT, bytes32(0));
    }

    function raiseDispute(string calldata escrowId, bytes32 evidenceManifestHash)
        external
        escrowExists(escrowId)
        onlyParty(escrowId)
    {
        Escrow storage escrow = _escrows[escrowId];
        if (escrow.phase != Phase.FUNDED) revert InvalidPhase(escrowId, escrow.phase);
        if (evidenceManifestHash == bytes32(0)) revert ZeroHash();

        escrow.phase = Phase.DISPUTED;
        _disputes[escrowId] = Dispute({
            raisedBy: msg.sender,
            raisedAt: block.timestamp,
            raiserEvidenceHash: evidenceManifestHash,
            counterpartyEvidenceHash: bytes32(0),
            initialClientBps: 0,
            initialRulingAt: 0,
            initialDecisionHash: bytes32(0),
            challengedAt: 0,
            finalClientBps: 0,
            finalRulingAt: 0,
            finalDecisionHash: bytes32(0)
        });
        emit DisputeRaised(escrowId, msg.sender, evidenceManifestHash);
    }

    function submitCounterpartyEvidence(string calldata escrowId, bytes32 evidenceManifestHash)
        external
        escrowExists(escrowId)
    {
        Escrow storage escrow = _escrows[escrowId];
        Dispute storage dispute = _disputes[escrowId];
        if (escrow.phase != Phase.DISPUTED) revert InvalidPhase(escrowId, escrow.phase);
        address counterparty = dispute.raisedBy == escrow.client ? escrow.developer : escrow.client;
        if (msg.sender != counterparty) revert NotTheCounterparty();
        if (evidenceManifestHash == bytes32(0)) revert ZeroHash();
        if (dispute.counterpartyEvidenceHash != bytes32(0)) revert EvidenceAlreadySubmitted();
        uint256 deadline = dispute.raisedAt + EVIDENCE_RESPONSE_PERIOD;
        if (block.timestamp >= deadline) revert EvidenceResponseWindowClosed(deadline);

        dispute.counterpartyEvidenceHash = evidenceManifestHash;
        emit CounterpartyEvidenceSubmitted(escrowId, msg.sender, evidenceManifestHash);
    }

    function postInitialRuling(string calldata escrowId, uint256 clientBps, bytes32 decisionHash)
        external
        escrowExists(escrowId)
        onlyEscrowArbiter(escrowId)
    {
        Escrow storage escrow = _escrows[escrowId];
        Dispute storage dispute = _disputes[escrowId];
        if (escrow.phase != Phase.DISPUTED) revert InvalidPhase(escrowId, escrow.phase);
        if (clientBps > MAX_BPS) revert InvalidBasisPoints(clientBps);
        if (decisionHash == bytes32(0)) revert ZeroHash();
        uint256 responseDeadline = dispute.raisedAt + EVIDENCE_RESPONSE_PERIOD;
        if (block.timestamp < responseDeadline) revert EvidenceResponsePeriodActive(responseDeadline);
        uint256 stallDeadline = dispute.raisedAt + ARBITER_STALL_PERIOD;
        if (block.timestamp >= stallDeadline) revert ArbiterStallDeadlineReached(stallDeadline);

        dispute.initialClientBps = clientBps;
        dispute.initialRulingAt = block.timestamp;
        dispute.initialDecisionHash = decisionHash;
        escrow.phase = Phase.INITIAL_RULING;
        emit InitialRulingPosted(escrowId, msg.sender, clientBps, decisionHash, block.timestamp + CHALLENGE_PERIOD);
    }

    function challengeRuling(string calldata escrowId) external escrowExists(escrowId) onlyParty(escrowId) {
        Escrow storage escrow = _escrows[escrowId];
        Dispute storage dispute = _disputes[escrowId];
        if (escrow.phase != Phase.INITIAL_RULING) revert InvalidPhase(escrowId, escrow.phase);
        uint256 deadline = dispute.initialRulingAt + CHALLENGE_PERIOD;
        if (block.timestamp >= deadline) revert ChallengeWindowClosed(deadline);

        bool clientLostPrincipal = msg.sender == escrow.client && dispute.initialClientBps < MAX_BPS;
        bool developerLostPrincipal = msg.sender == escrow.developer && dispute.initialClientBps > 0;
        if (!clientLostPrincipal && !developerLostPrincipal) revert ChallengeNotPermitted();

        dispute.challengedAt = block.timestamp;
        escrow.phase = Phase.CHALLENGED;
        emit RulingChallenged(escrowId, msg.sender, block.timestamp);
    }

    function postFinalRuling(string calldata escrowId, uint256 clientBps, bytes32 decisionHash)
        external
        escrowExists(escrowId)
        onlyEscrowArbiter(escrowId)
    {
        Escrow storage escrow = _escrows[escrowId];
        Dispute storage dispute = _disputes[escrowId];
        if (escrow.phase != Phase.CHALLENGED) revert InvalidPhase(escrowId, escrow.phase);
        if (clientBps > MAX_BPS) revert InvalidBasisPoints(clientBps);
        if (decisionHash == bytes32(0)) revert ZeroHash();
        uint256 deadline = dispute.challengedAt + ARBITER_STALL_PERIOD;
        if (block.timestamp >= deadline) revert ArbiterStallDeadlineReached(deadline);

        dispute.finalClientBps = clientBps;
        dispute.finalRulingAt = block.timestamp;
        dispute.finalDecisionHash = decisionHash;
        escrow.phase = Phase.FINAL_RULING;
        emit FinalRulingPosted(
            escrowId, msg.sender, clientBps, decisionHash, block.timestamp + FINAL_RULING_NOTICE_PERIOD
        );
    }

    function finalizeRuling(string calldata escrowId) external escrowExists(escrowId) {
        Escrow storage escrow = _escrows[escrowId];
        Dispute storage dispute = _disputes[escrowId];
        uint256 clientBps = 0;
        bytes32 decisionHash = bytes32(0);
        uint256 deadline = 0;

        if (escrow.phase == Phase.INITIAL_RULING) {
            clientBps = dispute.initialClientBps;
            decisionHash = dispute.initialDecisionHash;
            deadline = dispute.initialRulingAt + CHALLENGE_PERIOD;
        } else if (escrow.phase == Phase.FINAL_RULING) {
            clientBps = dispute.finalClientBps;
            decisionHash = dispute.finalDecisionHash;
            deadline = dispute.finalRulingAt + FINAL_RULING_NOTICE_PERIOD;
        } else {
            revert InvalidPhase(escrowId, escrow.phase);
        }
        if (block.timestamp < deadline) revert RulingNotReady(deadline);
        _resolve(escrowId, clientBps, ResolutionKind.RULING, decisionHash);
    }

    function finalizeArbiterTimeoutSplit(string calldata escrowId) external escrowExists(escrowId) {
        Escrow storage escrow = _escrows[escrowId];
        Dispute storage dispute = _disputes[escrowId];
        uint256 deadline = 0;
        if (escrow.phase == Phase.DISPUTED) {
            deadline = dispute.raisedAt + ARBITER_STALL_PERIOD;
        } else if (escrow.phase == Phase.CHALLENGED) {
            deadline = dispute.challengedAt + ARBITER_STALL_PERIOD;
        } else {
            revert InvalidPhase(escrowId, escrow.phase);
        }
        if (block.timestamp < deadline) revert ArbiterStallNotReached(deadline);
        _resolve(escrowId, MAX_BPS / 2, ResolutionKind.ARBITER_TIMEOUT_SPLIT, bytes32(0));
    }

    function claim(address recipient) external nonReentrant {
        if (recipient == address(0)) revert InvalidAddress();
        uint256 amount = claimable[recipient];
        if (amount == 0) revert NothingToClaim(recipient);

        claimable[recipient] = 0;
        totalClaimable -= amount;
        uint256 balanceBefore = token.balanceOf(recipient);
        token.safeTransfer(recipient, amount);
        uint256 balanceAfter = token.balanceOf(recipient);
        uint256 received = balanceAfter >= balanceBefore ? balanceAfter - balanceBefore : 0;
        if (received != amount) revert RecipientBalanceMismatch(amount, received);
        emit Claimed(recipient, msg.sender, amount);
        _assertSolvent();
    }

    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }

    function transferOwnership(address newOwner) public override onlyOwner {
        _requireProspectiveRole(newOwner);
        super.transferOwnership(newOwner);
    }

    function acceptOwnership() public override {
        _requireProspectiveRole(pendingOwner());
        super.acceptOwnership();
    }

    function renounceOwnership() public pure override {
        revert OwnershipRenunciationDisabled();
    }

    function proposeArbiter(address newArbiter) external onlyOwner {
        if (newArbiter == address(0)) revert InvalidAddress();
        _requireProspectiveRole(newArbiter);
        pendingArbiter = newArbiter;
        emit ArbiterTransferProposed(arbiter, newArbiter);
    }

    function acceptArbiter() external {
        if (msg.sender != pendingArbiter) revert NoPendingArbiter();
        _requireProspectiveRole(msg.sender);
        address oldArbiter = arbiter;
        arbiter = msg.sender;
        pendingArbiter = address(0);
        emit ArbiterUpdated(oldArbiter, msg.sender);
    }

    function proposeFeeRecipient(address newRecipient) external onlyOwner {
        if (newRecipient == address(0)) revert InvalidAddress();
        _requireProspectiveRole(newRecipient);
        pendingFeeRecipient = newRecipient;
        emit FeeRecipientTransferProposed(feeRecipient, newRecipient);
    }

    function acceptFeeRecipient() external {
        if (msg.sender != pendingFeeRecipient) revert NoPendingFeeRecipient();
        _requireProspectiveRole(msg.sender);
        address oldRecipient = feeRecipient;
        feeRecipient = msg.sender;
        pendingFeeRecipient = address(0);
        emit FeeRecipientUpdated(oldRecipient, msg.sender);
    }

    function getEscrow(string calldata escrowId) external view returns (Escrow memory) {
        return _escrows[escrowId];
    }

    function getSettlement(string calldata escrowId) external view returns (SettlementProposal memory) {
        return _settlements[escrowId];
    }

    function getDispute(string calldata escrowId) external view returns (Dispute memory) {
        return _disputes[escrowId];
    }

    function accountedBalance() public view returns (uint256) {
        return totalUnresolvedPrincipal + totalClaimable;
    }

    function isSolvent() external view returns (bool) {
        return token.balanceOf(address(this)) >= accountedBalance();
    }

    function _resolve(string calldata escrowId, uint256 clientBps, ResolutionKind kind, bytes32 decisionHash) internal {
        Escrow storage escrow = _escrows[escrowId];
        if (escrow.phase == Phase.RESOLVED) revert InvalidPhase(escrowId, escrow.phase);

        uint256 clientAmount = Math.mulDiv(escrow.amount, clientBps, MAX_BPS);
        uint256 developerGross = escrow.amount - clientAmount;
        uint256 platformFee = Math.mulDiv(developerGross, PLATFORM_FEE_BPS, MAX_BPS);
        uint256 developerAmount = escrow.amount - clientAmount - platformFee;

        escrow.phase = Phase.RESOLVED;
        escrow.resolutionKind = kind;
        totalUnresolvedPrincipal -= escrow.amount;
        totalClaimable += escrow.amount;
        claimable[escrow.client] += clientAmount;
        claimable[escrow.developer] += developerAmount;
        claimable[escrow.feeRecipient] += platformFee;
        delete _settlements[escrowId];

        emit EscrowResolved(escrowId, kind, clientAmount, developerAmount, platformFee, decisionHash);
        _assertSolvent();
    }

    function _requireProspectiveRole(address candidate) internal view {
        if (candidate == address(0)) revert InvalidAddress();
        if (candidate == owner() || candidate == arbiter || candidate == feeRecipient) {
            revert RoleCollision();
        }
    }

    function _assertSolvent() internal view {
        uint256 accounted = accountedBalance();
        uint256 balance = token.balanceOf(address(this));
        if (balance < accounted) revert Insolvent(accounted, balance);
    }
}
