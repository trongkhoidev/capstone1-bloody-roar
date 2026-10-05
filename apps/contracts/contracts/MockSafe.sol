// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 *  @dev Test-only Safe-shaped contract for deployment-gate tests.
 */
contract MockSafe {
    address private _singleton;
    address[] private _owners;

    constructor(address singleton_, address[3] memory owners_) {
        _singleton = singleton_;
        _owners = owners_;
    }

    function VERSION() external pure returns (string memory) {
        return "1.4.1";
    }

    function getOwners() external view returns (address[] memory) {
        return _owners;
    }

    function getThreshold() external pure returns (uint256) {
        return 2;
    }

    function getModulesPaginated(address, uint256) external pure returns (address[] memory modules, address next) {
        modules = new address[](0);
        next = address(1);
    }
}
