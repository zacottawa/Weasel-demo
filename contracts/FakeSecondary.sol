// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * Demo-only secondary market you control:
 * - Owner funds this contract with token + mUSDC liquidity
 * - Owner can set a demo price (microUSDC per token)
 * - Users can buy/sell at that price if liquidity exists
 */
contract FakeSecondary is Ownable {
    IERC20 public immutable token; // 18 dec
    IERC20 public immutable usdc;  // 6 dec
    uint256 public priceMicroUSDCPerToken; // e.g., 120_000 = $0.12

    constructor(IERC20 token_, IERC20 usdc_, uint256 initialPriceMicroUSDC)
        Ownable(msg.sender) // OZ v5 requires initial owner
    {
        token = token_;
        usdc = usdc_;
        priceMicroUSDCPerToken = initialPriceMicroUSDC;
    }

    function setPrice(uint256 newPriceMicroUSDC) external onlyOwner {
        require(newPriceMicroUSDC > 0, "price=0");
        priceMicroUSDCPerToken = newPriceMicroUSDC;
    }

    function depositLiquidity(uint256 tokenAmt18, uint256 usdcAmt6) external onlyOwner {
        require(token.transferFrom(msg.sender, address(this), tokenAmt18), "token dep fail");
        require(usdc.transferFrom(msg.sender, address(this), usdcAmt6), "usdc dep fail");
    }

    function buyTokens(uint256 tokenAmt18) external {
        // Convert tokens(18) -> micro-USDC(6): (amount * price) / 1e18
        uint256 costUSDC = (tokenAmt18 * priceMicroUSDCPerToken) / 1e18;
        require(usdc.transferFrom(msg.sender, address(this), costUSDC), "usdc in fail");
        require(token.transfer(msg.sender, tokenAmt18), "token out fail");
    }

    function sellTokens(uint256 tokenAmt18) external {
        // Convert tokens(18) -> micro-USDC(6): (amount * price) / 1e18
        uint256 payoutUSDC = (tokenAmt18 * priceMicroUSDCPerToken) / 1e18;
        require(token.transferFrom(msg.sender, address(this), tokenAmt18), "token in fail");
        require(usdc.transfer(msg.sender, payoutUSDC), "usdc out fail");
    }

    function balances() external view returns (uint256 tokenBal, uint256 usdcBal) {
        tokenBal = token.balanceOf(address(this));
        usdcBal = usdc.balanceOf(address(this));
    }
}
