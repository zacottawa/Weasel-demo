// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

contract VestingVault {
    IERC20 public immutable token;
    address public immutable beneficiary;
    uint64  public immutable start;
    uint64  public immutable duration;
    uint256 public released;

    constructor(IERC20 token_, address beneficiary_, uint64 start_, uint64 duration_) {
        token = token_;
        beneficiary = beneficiary_;
        start = start_;
        duration = duration_;
    }

    function releasable() public view returns (uint256) {
        uint256 total = token.balanceOf(address(this)) + released;
        if (block.timestamp < start) return 0;
        if (block.timestamp >= start + duration) return total - released;
        uint256 vested = (total * (block.timestamp - start)) / duration;
        return vested - released;
    }

    function release() external {
        uint256 amount = releasable();
        require(amount > 0, "nothing to release");
        released += amount;
        require(token.transfer(beneficiary, amount), "token transfer failed");
    }
}
