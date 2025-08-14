const { ethers, network } = require("hardhat");
const fs = require("fs");

async function main() {
  console.log("START:", network.name);

  const [deployer, artist, treasury] = await ethers.getSigners();
  console.log("Deployer:", deployer.address);
  console.log("Artist  :", artist.address);
  console.log("Treasury:", treasury.address);

  // 1) mUSDC
  const USDC = await ethers.getContractFactory("MockUSDC");
  console.log("Deploying MockUSDC…");
  const usdc = await USDC.deploy();
  await usdc.waitForDeployment();
  console.log("MockUSDC:", await usdc.getAddress());

  // 2) Artist token
  const Token = await ethers.getContractFactory("ArtistToken");
  console.log("Deploying ArtistToken…");
  const token = await Token.deploy("Weasel Demo Artist", "WEAZ");
  await token.waitForDeployment();
  console.log("ArtistToken:", await token.getAddress());

  // 3) Vesting vault
  const now = Math.floor(Date.now()/1000);
  const cliff = 60*60*24*30;        // 1 month
  const duration = 60*60*24*180;    // 6 months
  const Vault = await ethers.getContractFactory("VestingVault");
  console.log("Deploying VestingVault…");
  const vault = await Vault.deploy(await token.getAddress(), artist.address, now + cliff, duration);
  await vault.waitForDeployment();
  console.log("VestingVault:", await vault.getAddress());
  console.log("Transferring 400k to vault…");
  await (await token.transfer(await vault.getAddress(), ethers.parseEther("400000"))).wait();
  console.log("Vault funded.");

  // 4) IPO: 60% at $0.15
const priceMicroUSDC = 150_000; // $0.15
const IPO = await ethers.getContractFactory("IPOManager");
console.log("Deploying IPOManager…");
const ipo = await IPO.deploy(await token.getAddress(), await usdc.getAddress(), treasury.address, priceMicroUSDC);
await ipo.waitForDeployment();
console.log("IPOManager:", await ipo.getAddress());
console.log("Transferring 600k to IPO…");
await (await token.transfer(await ipo.getAddress(), ethers.parseEther("600000"))).wait();
console.log("IPO funded.");

// 5) Simple AMM (auto-floating price)
const AMM = await ethers.getContractFactory("SimpleAMM");
console.log("Deploying SimpleAMM…");
const amm = await AMM.deploy(await token.getAddress(), await usdc.getAddress(), deployer.address);
await amm.waitForDeployment();
console.log("SimpleAMM:", await amm.getAddress());

// Mint USDC to deployer for seeding
console.log("Minting demo USDC…");
await (await usdc.faucet(6_000_000n * 1_000_000n)).wait(); // 6M USDC

// Buy 50,000 tokens from IPO at $0.15 to seed AMM
const seedTokens = ethers.parseEther("50000");
const seedCost   = (seedTokens * BigInt(priceMicroUSDC)) / 1_000_000_000_000_000_000n;
console.log("Buying seed tokens from IPO…");
await (await usdc.approve(await ipo.getAddress(), seedCost)).wait();
await (await ipo.buy(seedTokens)).wait();

// Add liquidity so starting price ~ $0.15
const usdcLiq = 7_500n * 1_000_000n; // 7,500 USDC
console.log("Adding AMM liquidity…");
await (await token.approve(await amm.getAddress(), seedTokens)).wait();
await (await usdc.approve(await amm.getAddress(), usdcLiq)).wait();
await (await amm.addLiquidity(seedTokens, usdcLiq)).wait();
console.log("AMM liquidity added.");

// Save addresses
const addrs = {
  token: await token.getAddress(),
  usdc: await usdc.getAddress(),
  ipo: await ipo.getAddress(),
  vestingVault: await vault.getAddress(),
  simpleAmm: await amm.getAddress(),
  artist: artist.address,
  treasury: treasury.address
};
fs.writeFileSync("addresses.json", JSON.stringify(addrs, null, 2));
console.log("WROTE addresses.json");
console.log("DONE.");
}

main().catch((e)=>{ console.error("DEPLOY ERROR:", e); process.exit(1); });
