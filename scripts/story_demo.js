// scripts/story_demo.js
// End-to-end story with wallet-cap aware IPO selling:
// - Shows allocations
// - Sells out remaining IPO (550k) using multiple wallets capped at 50k each
// - Applies $50k of secondary AMM buys to push price up

const { ethers, network } = require("hardhat");
const fs = require("fs");

function u6(n) { return BigInt(n) * 1_000_000n; } // USDC helper (6 dp)
function fmtUSDmicro(x) {
  return "$" + (Number(x) / 1e6).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function fmtUSD(x) {
  return "$" + Number(x).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

async function main() {
  console.log("NETWORK:", network.name);
  const addrs = JSON.parse(fs.readFileSync("addresses.json","utf8"));

  // pull a bunch of accounts so we can respect the 50k wallet cap
  const signers = await ethers.getSigners();
  const [deployer, ...fans] = signers;   // fans[0], fans[1], ...

  const Token = await ethers.getContractAt("ArtistToken", addrs.token);
  const USDC  = await ethers.getContractAt("MockUSDC", addrs.usdc);
  const IPO   = await ethers.getContractAt("IPOManager", addrs.ipo);
  const AMM   = await ethers.getContractAt("SimpleAMM", addrs.simpleAmm);

  // --- Snapshot allocations
  const totalSupply = await Token.totalSupply();
  const vaultBal    = await Token.balanceOf(addrs.vestingVault);
  const ipoBal      = await Token.balanceOf(addrs.ipo);
  console.log("TOTAL SUPPLY :", ethers.formatEther(totalSupply), "WEAZ");
  console.log("VAULT TOKENS :", ethers.formatEther(vaultBal), "WEAZ  (artist locked; vesting)");
  console.log("IPO TOKENS   :", ethers.formatEther(ipoBal),   "WEAZ  (for sale at $0.15)");

  // --- IPO sellout with wallet cap = 50k
  // remaining after deploy’s 50k seed is typically 550k; we’ll sell that in 11 chunks of 50k
  const PRICE = 150_000n; // micro-USDC per WEAZ ($0.15)
  let remaining = await IPO.remaining(); // 18 dp
  console.log("IPO REMAINING (start):", ethers.formatEther(remaining), "WEAZ");

  // Give each fan enough USDC to buy up to 50k tokens (50k * $0.15 = $7,500)
  // We'll prep the first 12 fans to be safe.
  for (let i = 0; i < 12 && i < fans.length; i++) {
    await (await USDC.connect(fans[i]).faucet(u6(10_000))).wait(); // $10k per fan
  }

  // Helper: one capped IPO purchase (<= 50,000 WEAZ) by a given fan
  async function buyIPOUpTo50k(who, maxTokensWhole) {
    const amt = ethers.parseEther(maxTokensWhole.toString());          // 18 dp
    const cost = (amt * PRICE) / 1_000_000_000_000_000_000n;           // 6 dp
    await (await USDC.connect(who).approve(addrs.ipo, cost)).wait();
    await (await IPO.connect(who).buy(amt)).wait();
    console.log(`IPO BUY: ${who.address.slice(0,8)}… bought ${maxTokensWhole.toLocaleString()} WEAZ for ${fmtUSDmicro(cost)}`);
  }

  // Sell out the IPO in 50k chunks across fans
  const chunkWei = ethers.parseEther("50000"); // 50,000 * 1e18
  let fanIndex = 0;
  while (remaining > 0n) {
    const buyer = fans[fanIndex % fans.length];
    const thisChunk = remaining >= chunkWei ? chunkWei : remaining; // last smaller chunk if needed
    const thisChunkWhole = Number(ethers.formatEther(thisChunk));

    // Ensure wallet-cap: do not exceed 50k per wallet
    if (thisChunkWhole > 50000) {
      // shouldn't happen because we cap chunkWei, but just in case
      throw new Error("Chunk exceeds wallet cap");
    }

    await buyIPOUpTo50k(buyer, thisChunkWhole);
    remaining = await IPO.remaining();
    fanIndex++;
  }

  console.log("IPO REMAINING (end):", ethers.formatEther(remaining), "WEAZ");
  const treasuryUSDC = await USDC.balanceOf(addrs.treasury);
  console.log("TREASURY USDC AFTER IPO:", fmtUSDmicro(treasuryUSDC)); // ≈ $90,000 on full sellout

  // --- AMM secondary: show price floating upward with $50,000 buy pressure
  const p0 = await AMM.spotPriceMicroUSDC();
  console.log("AMM SPOT START:", (Number(p0)/1e6).toFixed(6), "USD / WEAZ");

  const totalSecondary = 50_000;           // $50k of demand
  const steps = 10;
  const perStep = u6(totalSecondary / steps); // $5k per step

  // Use one fan (fans[0]) to simulate net demand on secondary
  for (let i = 1; i <= steps; i++) {
    await (await USDC.connect(fans[0]).faucet(perStep)).wait(); // top-up if needed
    await (await USDC.connect(fans[0]).approve(addrs.simpleAmm, perStep)).wait();
    await (await AMM.connect(fans[0]).buyTokens(perStep)).wait();
    const p = await AMM.spotPriceMicroUSDC();
    console.log(`AFTER $${i*(totalSecondary/steps)} SECONDARY BUY: spot ≈ ${(Number(p)/1e6).toFixed(6)} USD / WEAZ`);
  }

  // --- Final snapshots
  const [tokRes, usdRes] = await AMM.reserves();
  console.log("AMM RESERVES:", ethers.formatEther(tokRes), "WEAZ,", fmtUSDmicro(usdRes), "USDC");

  // Free-float market cap estimate ( circulating = 600k after full IPO sellout )
  const float = 600_000;
  const finalSpot = Number(await AMM.spotPriceMicroUSDC()) / 1e6;
  const mcap = float * finalSpot;
  console.log("FREE-FLOAT MARKET CAP ESTIMATE:", fmtUSD(mcap), `(float ${float.toLocaleString()} × $${finalSpot.toFixed(6)})`);
}

main().catch(e => { console.error(e); process.exit(1); });
