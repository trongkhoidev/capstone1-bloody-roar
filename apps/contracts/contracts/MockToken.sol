// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/**
 *  @dev Test-only token used to exercise constructor token validation.
 */
contract MockToken is ERC20 {
    uint8 private immutable _tokenDecimals;

    constructor(uint8 tokenDecimals) ERC20("Mock Token", "MOCK") {
        _tokenDecimals = tokenDecimals;
    }

    function decimals() public view override returns (uint8) {
        return _tokenDecimals;
    }
}
