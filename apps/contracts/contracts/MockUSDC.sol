// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/**
 *  @dev Test-only six-decimal token with configurable issuer controls.
 */
contract MockUSDC is ERC20 {
    uint256 public feeBps;
    address public feeSink;
    mapping(address account => bool blocked) public isBlocked;

    constructor() ERC20("Mock USD Coin", "mUSDC") {
        feeSink = address(0xdead);
    }

    function decimals() public pure override returns (uint8) {
        return 6;
    }

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }

    function burn(address from, uint256 amount) external {
        _burn(from, amount);
    }

    function setFee(uint256 newFeeBps, address newFeeSink) external {
        require(newFeeBps <= 1_000, "fee too high");
        require(newFeeSink != address(0), "zero sink");
        feeBps = newFeeBps;
        feeSink = newFeeSink;
    }

    function setBlocked(address account, bool blocked) external {
        isBlocked[account] = blocked;
    }

    function _update(address from, address to, uint256 value) internal override {
        require(!isBlocked[from] && !isBlocked[to], "blocked");
        if (from != address(0) && to != address(0) && feeBps != 0) {
            uint256 fee = (value * feeBps) / 10_000;
            super._update(from, to, value - fee);
            super._update(from, feeSink, fee);
        } else {
            super._update(from, to, value);
        }
    }
}
