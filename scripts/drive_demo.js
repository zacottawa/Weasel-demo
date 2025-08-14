const { ethers, network } = require("hardhat");
const fs = require("fs");
const path = require("path");

async function main() {
  console.log("NETWORK:", network.name);
  const addrs = JSON.parse(fs.readFileSync(path.join(process.cwd(), "addresses.json"), "utf8"));
  const [you, artist, treasury] = await ethers.getSigners();

  const Token = await ethers.getContractAt("ArtistToken", addrs.token);
  const USDC  = await ethers.getContractAt("MockUSDC", addrs.usdc);
  const IPO   = await ethers.getContractAt("IPOManager", addrs.ipo);
  const Vault = await ethers.getContractAt("VestingVault", addrs.vestingVault);
  const SEC   = await ethers.getContractAt("FakeSecondary", addrs.fakeSecondary);

  console.log("TOTAL SUPPLY:", (await Token.totalSupply()).toString());
  console.log("IPO TOKENS  :", (await Token.balanceOf(addrs.ipo)).toString());
  console.log("VAULT TOKENS:", (await Token.balanceOf(addrs.vestingVault)).toString());

  // Buy 2,000 tokens from IPO at $0.05
  const price = 50_000n; // micro-USDC/token
  const twoK  = ethers.parseEther("2000");
  const cost  = (twoK * price) / 1_000_000_000_000_000_000n; // (18 * 6) / 18 -> 6 dp
  console.log("APPROVING USDC:", cost.toString());
  await (await USDC.approve(addrs.ipo, cost)).wait();
  console.log("BUYING 2000 FROM IPO…");
  await (await IPO.buy(twoK)).wait();

  console.log("YOU TOKEN BAL:", (await Token.balanceOf(you.address)).toString());
  console.log("IPO REMAINING:", (await IPO.remaining()).toString());

  // Vesting release after time travel
  console.log("TIME TRAVEL + RELEASE…");
  await network.provider.send("evm_increaseTime", [60*60*24*40]); // +40 days
  await network.provider.send("evm_mine");
  await (await Vault.connect(artist).release()).wait();
  console.log("ARTIST TOKEN BAL:", (await Token.balanceOf(artist.address)).toString());

  // Secondary market: set price to $0.15, buy 1000, sell 500
  console.log("SET SECONDARY PRICE → $0.15");
  await (await SEC.setPrice(150_000)).wait();

  const oneK = ethers.parseEther("1000");
  const secCost = (oneK * 150_000n) / 1_000_000_000_000_000_000n;
  console.log("BUY 1000 ON SECONDARY…");
  await (await USDC.approve(addrs.fakeSecondary, secCost)).wait();
  await (await SEC.buyTokens(oneK)).wait();

  const fiveHund = ethers.parseEther("500");
  console.log("SELL 500 ON SECONDARY…");
  await (await Token.approve(addrs.fakeSecondary, fiveHund)).wait();
  await (await SEC.sellTokens(fiveHund)).wait();

  const [tokLiq, usdcLiq] = await SEC.balances();
  console.log("SECONDARY LIQ TOKENS:", tokLiq.toString());
  console.log("SECONDARY LIQ USDC  :", usdcLiq.toString());
  console.log("DONE DEMO.");
}

main().catch(e => { console.error(e); process.exit(1); });
