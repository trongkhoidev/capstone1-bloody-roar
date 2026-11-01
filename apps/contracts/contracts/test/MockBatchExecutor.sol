// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

// Local-test-only stand-in for a Safe executing multiple calls in one transaction.
contract MockBatchExecutor {
    address private immutable controller = msg.sender;

    function execute(address target, bytes[] calldata calls) external {
        require(msg.sender == controller, "Not controller");
        for (uint256 i = 0; i < calls.length; i++) {
            (bool success, bytes memory result) = target.call(calls[i]);
            if (!success) {
                assembly ("memory-safe") {
                    revert(add(result, 32), mload(result))
                }
            }
        }
    }
}
