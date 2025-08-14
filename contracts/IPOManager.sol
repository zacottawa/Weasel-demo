// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

contract IPOManager {
    IERC20  public immutable token;   // 18 decimals
    IERC20  public immutable usdc;    // 6 decimals
    address public immutable treasury;
    uint256 public immutable priceMicroUSDCPerToken; // e.g. 50_000 = $0.05
    uint256 public sold; // in 1e18 units

    uint256 public constant SALE_CAP   = 600_000 * 1e18; // 60%
    uint256 public constant WALLET_CAP = 50_000  * 1e18; // anti-whale demo

    constructor(IERC20 token_, IERC20 usdc_, address treasury_, uint256 price_) {
        token = token_;
        usdc = usdc_;
        treasury = treasury_;
        priceMicroUSDCPerToken = price_;
    }

    function remaining() external view returns (uint256) { return SALE_CAP - sold; }

    function buy(uint256 amountTokens) external {
        require(amountTokens > 0, "amount=0");
        require(sold + amountTokens <= SALE_CAP, "sold out");
        require(token.balanceOf(msg.sender) + amountTokens <= WALLET_CAP, "wallet cap");

        // Convert tokens(18) to micro-USDC(6): (amountTokens * price) / 1e18
        uint256 costUSDC = (amountTokens * priceMicroUSDCPerToken) / 1e18;
        require(usdc.transferFrom(msg.sender, treasury, costUSDC), "USDC xfer fail");

        sold += amountTokens;
        require(token.transfer(msg.sender, amountTokens), "token xfer fail");
    }
}
