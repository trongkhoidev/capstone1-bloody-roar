// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {BloodyRoarEscrow} from "../../contracts/BloodyRoarEscrow.sol";
import {MockUSDC} from "../../contracts/MockUSDC.sol";

interface Vm {
    function assume(bool condition) external;
    function prank(address sender) external;
    function startPrank(address sender) external;
    function stopPrank() external;
    function warp(uint256 timestamp) external;
}

abstract contract ForgeTest {
    Vm internal constant vm = Vm(address(uint160(uint256(keccak256("hevm cheat code")))));

    function assertTrue(bool condition, string memory message) internal pure {
        require(condition, message);
    }

    function assertEq(uint256 actual, uint256 expected, string memory message) internal pure {
        require(actual == expected, message);
    }
}

contract EscrowHandler is ForgeTest {
    MockUSDC public immutable token;
    BloodyRoarEscrow public immutable escrow;
    address public immutable client;
    address public immutable developer;
    address public immutable arbiter;
    address public immutable feeRecipient;
    address public immutable outsider;

    uint256 public ghostDeposited;
    uint256 public ghostClaimed;
    bool public authorizationBroken;
    bool public terminalityBroken;
    mapping(uint256 index => bool seen) public terminalSeen;

    constructor(
        MockUSDC token_,
        BloodyRoarEscrow escrow_,
        address client_,
        address developer_,
        address arbiter_,
        address feeRecipient_,
        address outsider_
    ) {
        token = token_;
        escrow = escrow_;
        client = client_;
        developer = developer_;
        arbiter = arbiter_;
        feeRecipient = feeRecipient_;
        outsider = outsider_;
    }

    function deposit(uint256 seed, uint96 rawAmount, uint32 rawDuration) external {
        uint256 index = seed % 8;
        string memory escrowId = id(index);
        if (escrow.getEscrow(escrowId).client != address(0)) return;
        uint256 amount = uint256(rawAmount) % 1_000_000_000_000 + 1;
        uint256 duration = uint256(rawDuration) % 30 days + 1;
        vm.prank(client);
        try escrow.deposit(escrowId, developer, amount, block.timestamp + duration, keccak256(bytes(escrowId))) {
            ghostDeposited += amount;
        } catch {}
        _record(index);
    }

    function submit(uint256 seed) external {
        uint256 index = seed % 8;
        vm.prank(developer);
        try escrow.submitWork(id(index), keccak256(abi.encode("delivery", index))) {} catch {}
        _record(index);
    }

    function release(uint256 seed) external {
        uint256 index = seed % 8;
        vm.prank(client);
        try escrow.releaseFunds(id(index)) {} catch {}
        _record(index);
    }

    function settle(uint256 seed, uint16 rawBps) external {
        uint256 index = seed % 8;
        uint256 bps = uint256(rawBps) % 10_001;
        vm.prank(client);
        try escrow.proposeSettlement(id(index), bps) {} catch {}
        vm.prank(developer);
        try escrow.acceptSettlement(id(index)) {} catch {}
        _record(index);
    }

    function dispute(uint256 seed) external {
        uint256 index = seed % 8;
        vm.prank(client);
        try escrow.raiseDispute(id(index), keccak256(abi.encode("evidence", index))) {} catch {}
        _record(index);
    }

    function advanceAndFallback(uint256 seed, uint32 rawSeconds) external {
        uint256 index = seed % 8;
        vm.warp(block.timestamp + (uint256(rawSeconds) % 45 days));
        try escrow.finalizeArbiterTimeoutSplit(id(index)) {} catch {}
        _record(index);
    }

    function claim(uint256 selector) external {
        address recipient = selector % 3 == 0 ? client : selector % 3 == 1 ? developer : feeRecipient;
        uint256 amount = escrow.claimable(recipient);
        if (amount == 0) return;
        try escrow.claim(recipient) {
            ghostClaimed += amount;
        } catch {}
    }

    function attackAuthorization(uint256 seed) external {
        uint256 index = seed % 8;
        vm.prank(outsider);
        try escrow.releaseFunds(id(index)) {
            authorizationBroken = true;
        } catch {}
        _record(index);
    }

    function id(uint256 index) public pure returns (string memory) {
        if (index == 0) return "invariant-0";
        if (index == 1) return "invariant-1";
        if (index == 2) return "invariant-2";
        if (index == 3) return "invariant-3";
        if (index == 4) return "invariant-4";
        if (index == 5) return "invariant-5";
        if (index == 6) return "invariant-6";
        return "invariant-7";
    }

    function _record(uint256 index) internal {
        BloodyRoarEscrow.Phase phase = escrow.getEscrow(id(index)).phase;
        if (terminalSeen[index] && phase != BloodyRoarEscrow.Phase.RESOLVED) {
            terminalityBroken = true;
        }
        if (phase == BloodyRoarEscrow.Phase.RESOLVED) terminalSeen[index] = true;
    }
}

contract BloodyRoarEscrowFuzzTest is ForgeTest {
    MockUSDC internal token;
    BloodyRoarEscrow internal escrow;

    address internal constant OWNER = address(0x1001);
    address internal constant ARBITER = address(0x1002);
    address internal constant FEE_RECIPIENT = address(0x1003);
    address internal constant CLIENT = address(0x2001);
    address internal constant DEVELOPER = address(0x2002);
    address internal constant OUTSIDER = address(0x3001);

    function setUp() public {
        token = new MockUSDC();
        escrow = new BloodyRoarEscrow(address(token), OWNER, ARBITER, FEE_RECIPIENT);
        token.mint(CLIENT, type(uint128).max);
        vm.prank(CLIENT);
        token.approve(address(escrow), type(uint256).max);
    }

    function testFuzz_resolutionConservesEveryUnit(uint128 rawAmount, uint16 rawBps) public {
        uint256 amount = uint256(rawAmount) % 1e30 + 1;
        uint256 clientBps = uint256(rawBps) % 10_001;
        vm.prank(CLIENT);
        escrow.deposit("fuzz", DEVELOPER, amount, block.timestamp + 1 days, keccak256("terms"));
        vm.prank(CLIENT);
        escrow.proposeSettlement("fuzz", clientBps);
        vm.prank(DEVELOPER);
        escrow.acceptSettlement("fuzz");

        uint256 credits = escrow.claimable(CLIENT) + escrow.claimable(DEVELOPER) + escrow.claimable(FEE_RECIPIENT);
        assertEq(credits, amount, "allocation must conserve principal");
        assertEq(escrow.accountedBalance(), amount, "accounted balance must equal deposit");
        assertTrue(escrow.isSolvent(), "resolved escrow must remain solvent");
    }

    function testFuzz_unauthorizedCallerCannotResolve(address caller) public {
        vm.assume(caller != CLIENT && caller != DEVELOPER && caller != address(0));
        vm.prank(CLIENT);
        escrow.deposit("auth", DEVELOPER, 1_000_000, block.timestamp + 1 days, keccak256("terms"));
        vm.prank(DEVELOPER);
        escrow.submitWork("auth", keccak256("delivery"));
        vm.prank(caller);
        (bool success,) = address(escrow).call(abi.encodeCall(escrow.releaseFunds, ("auth")));
        assertTrue(!success, "outsider resolved escrow");
        assertEq(uint256(escrow.getEscrow("auth").phase), uint256(BloodyRoarEscrow.Phase.FUNDED), "phase changed");
    }

    function test_timestampBoundariesPreferFallback() public {
        vm.prank(CLIENT);
        escrow.deposit("boundary", DEVELOPER, 1_000_000, block.timestamp + 1 days, keccak256("terms"));
        vm.prank(CLIENT);
        escrow.raiseDispute("boundary", keccak256("evidence"));
        uint256 raisedAt = escrow.getDispute("boundary").raisedAt;

        vm.warp(raisedAt + 30 days - 1);
        (bool early,) = address(escrow).call(abi.encodeCall(escrow.finalizeArbiterTimeoutSplit, ("boundary")));
        assertTrue(!early, "fallback succeeded before boundary");

        vm.warp(raisedAt + 30 days);
        vm.prank(ARBITER);
        (bool lateRuling,) =
            address(escrow).call(abi.encodeCall(escrow.postInitialRuling, ("boundary", 5_000, keccak256("decision"))));
        assertTrue(!lateRuling, "arbiter won timeout boundary");
        escrow.finalizeArbiterTimeoutSplit("boundary");
        assertEq(
            uint256(escrow.getEscrow("boundary").phase),
            uint256(BloodyRoarEscrow.Phase.RESOLVED),
            "fallback did not resolve"
        );
    }
}

contract BloodyRoarEscrowInvariantTest is ForgeTest {
    MockUSDC internal token;
    BloodyRoarEscrow internal escrow;
    EscrowHandler internal handler;
    address[] private _targets;

    address internal constant OWNER = address(0x1001);
    address internal constant ARBITER = address(0x1002);
    address internal constant FEE_RECIPIENT = address(0x1003);
    address internal constant CLIENT = address(0x2001);
    address internal constant DEVELOPER = address(0x2002);
    address internal constant OUTSIDER = address(0x3001);

    function setUp() public {
        token = new MockUSDC();
        escrow = new BloodyRoarEscrow(address(token), OWNER, ARBITER, FEE_RECIPIENT);
        token.mint(CLIENT, type(uint128).max);
        vm.prank(CLIENT);
        token.approve(address(escrow), type(uint256).max);
        handler = new EscrowHandler(token, escrow, CLIENT, DEVELOPER, ARBITER, FEE_RECIPIENT, OUTSIDER);
        _targets.push(address(handler));
    }

    function targetContracts() public view returns (address[] memory) {
        return _targets;
    }

    function invariant_solvency() public view {
        assertTrue(token.balanceOf(address(escrow)) >= escrow.accountedBalance(), "insolvent");
        assertTrue(escrow.isSolvent(), "solvency getter disagrees");
    }

    function invariant_conservationAndClaims() public view {
        assertEq(
            escrow.accountedBalance() + handler.ghostClaimed(),
            handler.ghostDeposited(),
            "deposited units were created or lost"
        );
        assertEq(token.balanceOf(address(escrow)), escrow.accountedBalance(), "token balance diverged from liabilities");
    }

    function invariant_terminalityAndAuthorization() public view {
        assertTrue(!handler.terminalityBroken(), "terminal resolution reversed");
        assertTrue(!handler.authorizationBroken(), "outsider resolved escrow");
        for (uint256 i = 0; i < 8; i++) {
            if (handler.terminalSeen(i)) {
                assertEq(
                    uint256(escrow.getEscrow(handler.id(i)).phase),
                    uint256(BloodyRoarEscrow.Phase.RESOLVED),
                    "terminal escrow changed phase"
                );
            }
        }
    }
}
