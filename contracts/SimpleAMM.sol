// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * Constant-product AMM (x*y=k), 0.3% fee like Uniswap v2.
 * token: 18 decimals, usdc: 6 decimals (micro-USDC)
 * Spot price floats automatically as buys/sells happen.
 */
contract SimpleAMM is Ownable {
    IERC20 public immutable token; // 18
    IERC20 public immutable usdc;  // 6

    uint256 public reserveToken; // 18
    uint256 public reserveUSDC;  // 6

    uint256 public constant FEE_NUM = 997; // 0.3% fee
    uint256 public constant FEE_DEN = 1000;

    event LiquidityAdded(uint256 tokenIn, uint256 usdcIn);
    event SwapUSDCForTokens(address indexed user, uint256 usdcIn, uint256 tokenOut);
    event SwapTokensForUSDC(address indexed user, uint256 tokenIn, uint256 usdcOut);

    constructor(IERC20 token_, IERC20 usdc_, address owner_) Ownable(owner_) {
        token = token_;
        usdc  = usdc_;
    }

    function addLiquidity(uint256 tokenAmt18, uint256 usdcAmt6) external onlyOwner {
        require(token.transferFrom(msg.sender, address(this), tokenAmt18), "token in fail");
        require(usdc.transferFrom(msg.sender, address(this), usdcAmt6), "usdc in fail");
        reserveToken += tokenAmt18;
        reserveUSDC  += usdcAmt6;
        emit LiquidityAdded(tokenAmt18, usdcAmt6);
    }

    // micro-USDC per 1 token (WEAZ)
    function spotPriceMicroUSDC() public view returns (uint256) {
        require(reserveToken > 0 && reserveUSDC > 0, "no reserves");
        return (reserveUSDC * 1e18) / reserveToken;
    }

    function buyTokens(uint256 usdcIn6) external {
        require(usdcIn6 > 0, "amount=0");
        require(usdc.transferFrom(msg.sender, address(this), usdcIn6), "usdc in fail");
        uint256 usdcInAfterFee = usdcIn6 * FEE_NUM / FEE_DEN;

        uint256 k = reserveToken * reserveUSDC;
        uint256 newU = reserveUSDC + usdcInAfterFee;
        uint256 newT = k / newU;
        uint256 tokenOut = reserveToken - newT;

        reserveUSDC = newU;
        reserveToken = newT;
        require(token.transfer(msg.sender, tokenOut), "token out fail");
        emit SwapUSDCForTokens(msg.sender, usdcIn6, tokenOut);
    }

    function sellTokens(uint256 tokenIn18) external {
        require(tokenIn18 > 0, "amount=0");
        require(token.transferFrom(msg.sender, address(this), tokenIn18), "token in fail");
        uint256 tokenInAfterFee = tokenIn18 * FEE_NUM / FEE_DEN;

        uint256 k = reserveToken * reserveUSDC;
        uint256 newT = reserveToken + tokenInAfterFee;
        uint256 newU = k / newT;
        uint256 usdcOut = reserveUSDC - newU;

        reserveToken = newT;
        reserveUSDC = newU;
        require(usdc.transfer(msg.sender, usdcOut), "usdc out fail");
        emit SwapTokensForUSDC(msg.sender, tokenIn18, usdcOut);
    }

    function reserves() external view returns (uint256, uint256) {
        return (reserveToken, reserveUSDC);
    }
}
