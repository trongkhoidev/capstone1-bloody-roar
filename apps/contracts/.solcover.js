module.exports = {
  // Test fixtures are exercised by the suite but are not production bytecode.
  skipFiles: [
    "MockToken.sol",
    "MockUSDC.sol",
    "MockSafe.sol",
    "test/FeeOnTransferToken.sol",
    "test/MockBatchExecutor.sol",
    "test/MockERC20.sol",
  ],
};
