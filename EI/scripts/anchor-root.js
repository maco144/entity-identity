#!/usr/bin/env node
/**
 * anchor-root.js — Post the EI registry Merkle root to Ethereum
 *
 * Fetches the current attesters root from the EI API, compares it with what
 * is already on-chain, and calls updateAttestersRoot() only when it has changed.
 * This gives on-chain tamper-evidence for the EI registry at ~50k gas / run.
 *
 * Usage:
 *   node scripts/anchor-root.js [--dry-run] [--network sepolia|mainnet|arbitrum]
 *
 * Required env vars (set in ~/.config/nullcone/env or export directly):
 *   EI_PRIVATE_KEY    — EOA private key that is admin of EntityTypeRegistry
 *   EI_API_URL        — EI REST API base URL (default: http://149.28.33.118:3000)
 *
 * Optional env vars:
 *   EI_RPC_URL        — Override RPC endpoint
 *   EI_CONTRACT_ADDR  — Override EntityTypeRegistry address
 *   EI_NETWORK        — sepolia | mainnet | arbitrum (default: sepolia)
 */

import { ethers } from 'ethers';

// ---------------------------------------------------------------------------
// Network configs
// ---------------------------------------------------------------------------

const NETWORKS = {
  sepolia: {
    rpc: 'https://ethereum-sepolia-rpc.publicnode.com',
    contract: '0xFb637C39439f969e5Cc0b1910308146f1DD529Fe',
    name: 'Sepolia',
  },
  mainnet: {
    rpc: 'https://ethereum-rpc.publicnode.com',
    contract: null, // set EI_CONTRACT_ADDR when mainnet contract is deployed
    name: 'Mainnet',
  },
  arbitrum: {
    rpc: 'https://arbitrum-one-rpc.publicnode.com',
    contract: null, // set EI_CONTRACT_ADDR when arbitrum contract is deployed
    name: 'Arbitrum One',
  },
};

// Minimal ABI — only the functions we need
const REGISTRY_ABI = [
  'function attestersRoot() view returns (bytes32)',
  'function updateAttestersRoot(bytes32 newRoot) external',
  'event AttestersRootUpdated(bytes32 oldRoot, bytes32 newRoot)',
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function log(msg) {
  console.log(`[${new Date().toISOString()}] ${msg}`);
}

function die(msg) {
  console.error(`[anchor-root] ERROR: ${msg}`);
  process.exit(1);
}

async function fetchEIRoot(apiUrl) {
  const url = `${apiUrl}/api/v1/registry`;
  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`EI API ${url} returned ${resp.status}`);
  const data = await resp.json();
  // EI registry endpoint returns { root: "0x...", attesters: [...] }
  const root = data.root ?? data.attestersRoot ?? data.merkleRoot;
  if (!root) throw new Error(`Could not find root in EI response: ${JSON.stringify(data)}`);
  return root;
}

async function getOnChainRoot(contract) {
  return await contract.attestersRoot();
}

function rootsMatch(offChain, onChain) {
  // Normalise both to 0x-prefixed lowercase hex
  const norm = (r) => (r.startsWith('0x') ? r : `0x${r}`).toLowerCase();
  return norm(offChain) === norm(onChain);
}

async function estimateCostUSD(provider, gasUsed) {
  const feeData = await provider.getFeeData();
  const gasPriceWei = feeData.gasPrice ?? feeData.maxFeePerGas;
  const costWei = gasPriceWei * BigInt(gasUsed);
  const costETH = Number(ethers.formatEther(costWei));

  // Fetch ETH/USD from a public endpoint
  let ethUSD = null;
  try {
    const r = await fetch('https://api.coinbase.com/v2/prices/ETH-USD/spot');
    const d = await r.json();
    ethUSD = parseFloat(d?.data?.amount);
  } catch {
    // non-fatal — just skip USD conversion
  }

  return {
    gasPriceGwei: Number(ethers.formatUnits(gasPriceWei, 'gwei')).toFixed(4),
    costETH: costETH.toFixed(8),
    costUSD: ethUSD ? (costETH * ethUSD).toFixed(4) : null,
  };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const networkArg = (args.find(a => a.startsWith('--network='))?.split('=')[1])
  ?? (args[args.indexOf('--network') + 1])
  ?? process.env.EI_NETWORK
  ?? 'sepolia';

const network = NETWORKS[networkArg];
if (!network) die(`Unknown network '${networkArg}'. Choose: ${Object.keys(NETWORKS).join(', ')}`);

const EI_API_URL     = process.env.EI_API_URL     ?? 'http://149.28.33.118:3000';
const EI_RPC_URL     = process.env.EI_RPC_URL     ?? network.rpc;
const CONTRACT_ADDR  = process.env.EI_CONTRACT_ADDR ?? network.contract;
const PRIVATE_KEY    = process.env.EI_PRIVATE_KEY;

if (!CONTRACT_ADDR) die(`No contract address for network '${networkArg}'. Set EI_CONTRACT_ADDR.`);
if (!DRY_RUN && !PRIVATE_KEY) die('EI_PRIVATE_KEY not set. Export it or run with --dry-run.');

log(`Network: ${network.name} (${EI_RPC_URL})`);
log(`Contract: ${CONTRACT_ADDR}`);
log(`EI API: ${EI_API_URL}`);
if (DRY_RUN) log('DRY RUN — no transaction will be sent');

const provider = new ethers.JsonRpcProvider(EI_RPC_URL);

let signer, contract;
if (!DRY_RUN) {
  signer   = new ethers.Wallet(PRIVATE_KEY, provider);
  contract = new ethers.Contract(CONTRACT_ADDR, REGISTRY_ABI, signer);
  log(`Signer: ${signer.address}`);
} else {
  contract = new ethers.Contract(CONTRACT_ADDR, REGISTRY_ABI, provider);
}

// 1. Fetch off-chain root from EI API
log('Fetching EI registry root...');
let offChainRoot;
try {
  offChainRoot = await fetchEIRoot(EI_API_URL);
} catch (err) {
  die(`Failed to fetch EI registry root: ${err.message}`);
}
log(`Off-chain root: ${offChainRoot}`);

// 2. Read on-chain root
log('Reading on-chain root...');
let onChainRoot;
try {
  onChainRoot = await getOnChainRoot(contract);
} catch (err) {
  die(`Failed to read on-chain root: ${err.message}`);
}
log(`On-chain root:  ${onChainRoot}`);

// 3. Compare
if (rootsMatch(offChainRoot, onChainRoot)) {
  log('Roots match — registry already up to date. Nothing to do.');
  process.exit(0);
}

log('Roots differ — anchoring new root to chain...');

if (DRY_RUN) {
  // Estimate gas without sending
  try {
    const gasEst = await contract.updateAttestersRoot.estimateGas(offChainRoot);
    const { gasPriceGwei, costETH, costUSD } = await estimateCostUSD(provider, gasEst);
    log(`Estimated gas: ${gasEst.toString()}`);
    log(`Gas price: ${gasPriceGwei} gwei`);
    log(`Estimated cost: ${costETH} ETH${costUSD ? ` (~$${costUSD} USD)` : ''}`);
  } catch (err) {
    log(`Gas estimation failed: ${err.message}`);
  }
  log('DRY RUN complete — no transaction sent.');
  process.exit(0);
}

// 4. Send transaction
let tx;
try {
  tx = await contract.updateAttestersRoot(offChainRoot);
} catch (err) {
  die(`Transaction failed: ${err.message}`);
}
log(`Transaction sent: ${tx.hash}`);

// 5. Wait for confirmation
log('Waiting for confirmation...');
let receipt;
try {
  receipt = await tx.wait(1);
} catch (err) {
  die(`Transaction reverted or timed out: ${err.message}`);
}

const { gasPriceGwei, costETH, costUSD } = await estimateCostUSD(provider, receipt.gasUsed);

log('');
log('=== Anchor complete ===');
log(`Tx hash:    ${receipt.hash}`);
log(`Block:      ${receipt.blockNumber}`);
log(`Gas used:   ${receipt.gasUsed.toString()}`);
log(`Gas price:  ${gasPriceGwei} gwei`);
log(`Cost:       ${costETH} ETH${costUSD ? ` (~$${costUSD} USD)` : ''}`);
log(`Old root:   ${onChainRoot}`);
log(`New root:   ${offChainRoot}`);
log('');
