// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {BloodyRoarEscrow} from "../../contracts/BloodyRoarEscrow.sol";

contract BaseSepoliaForkTest {
    address private constant USDC = 0x036CbD53842c5426634e7929541eC2318f3dCF7e;
    address private constant OWNER = address(0x1001);
    address private constant ARBITER = address(0x1002);
    address private constant FEE_RECIPIENT = address(0x1003);

    function test_CanonicalUsdcMetadataAndDeployment() public {
        // The regular offline fuzz suite discovers this file on chain 31337.
        // The dedicated fork command executes the assertions on chain 84532.
        if (block.chainid != 84_532) return;

        require(USDC.code.length > 0, "canonical USDC has no bytecode");
        (bool decimalsOk, bytes memory decimalsData) = USDC.staticcall(abi.encodeWithSignature("decimals()"));
        (bool nameOk, bytes memory nameData) = USDC.staticcall(abi.encodeWithSignature("name()"));
        (bool symbolOk, bytes memory symbolData) = USDC.staticcall(abi.encodeWithSignature("symbol()"));

        require(decimalsOk && abi.decode(decimalsData, (uint8)) == 6, "unexpected decimals");
        require(nameOk && keccak256(bytes(abi.decode(nameData, (string)))) == keccak256("USDC"), "unexpected name");
        require(
            symbolOk && keccak256(bytes(abi.decode(symbolData, (string)))) == keccak256("USDC"), "unexpected symbol"
        );

        BloodyRoarEscrow escrow = new BloodyRoarEscrow(USDC, OWNER, ARBITER, FEE_RECIPIENT);
        require(address(escrow.token()) == USDC, "token readback mismatch");
        require(escrow.owner() == OWNER, "owner readback mismatch");
        require(escrow.arbiter() == ARBITER, "arbiter readback mismatch");
        require(escrow.feeRecipient() == FEE_RECIPIENT, "fee readback mismatch");
    }
}
