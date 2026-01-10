import { createWalletClient, createPublicClient, http, parseUnits, formatUnits } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { getNetwork, defaultGridConfig, type NetworkConfig } from './config.js';
import gridTradingBotAbi from './abi/GridTradingBot.json' with { type: 'json' };
import * as fs from 'fs';
import * as path from 'path';
import 'dotenv/config';

// ERC20 ABI for approvals and balance checks
const erc20Abi = [
  {
    type: 'function',
    name: 'approve',
    inputs: [
      { name: 'spender', type: 'address' },
      { name: 'amount', type: 'uint256' },
    ],
    outputs: [{ type: 'bool' }],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'balanceOf',
    inputs: [{ name: 'account', type: 'address' }],
    outputs: [{ type: 'uint256' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'decimals',
    inputs: [],
    outputs: [{ type: 'uint8' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'symbol',
    inputs: [],
    outputs: [{ type: 'string' }],
    stateMutability: 'view',
  },
] as const;

interface GridConfigInput {
  lowerPrice: bigint;
  upperPrice: bigint;
  gridLevels: number;
  orderSizeA: bigint;
  orderSizeB: bigint;
  poolFee: number;
  maxSlippageBps: number;
}

function loadDeployment(networkName: string): { contractAddress: `0x${string}` } {
  const deploymentFile = path.join(process.cwd(), 'deployments', `${networkName}.json`);
  if (!fs.existsSync(deploymentFile)) {
    throw new Error(`No deployment found for ${networkName}. Run deploy first.`);
  }
  return JSON.parse(fs.readFileSync(deploymentFile, 'utf-8'));
}

async function configureGrid(
  networkName: string,
  gridConfig: GridConfigInput = defaultGridConfig
): Promise<void> {
  console.log(`\nConfiguring GridTradingBot on ${networkName}...`);

  // Get network config and deployment
  const config: NetworkConfig = getNetwork(networkName);
  const deployment = loadDeployment(networkName);

  console.log(`Contract address: ${deployment.contractAddress}`);

  // Get private key
  const privateKey = process.env.PRIVATE_KEY;
  if (!privateKey) {
    throw new Error('PRIVATE_KEY environment variable not set');
  }

  // Create account and clients
  const account = privateKeyToAccount(privateKey as `0x${string}`);

  const publicClient = createPublicClient({
    chain: config.chain,
    transport: http(config.rpcUrl),
  });

  const walletClient = createWalletClient({
    account,
    chain: config.chain,
    transport: http(config.rpcUrl),
  });

  // Build grid config struct
  const gridConfigStruct = {
    tokenA: config.weth,
    tokenB: config.usdc,
    lowerPrice: gridConfig.lowerPrice,
    upperPrice: gridConfig.upperPrice,
    gridLevels: BigInt(gridConfig.gridLevels),
    orderSizeA: gridConfig.orderSizeA,
    orderSizeB: gridConfig.orderSizeB,
    poolFee: gridConfig.poolFee,
    maxSlippageBps: BigInt(gridConfig.maxSlippageBps),
  };

  console.log('\nGrid Configuration:');
  console.log(`  Token A (WETH): ${config.weth}`);
  console.log(`  Token B (USDC): ${config.usdc}`);
  console.log(`  Lower Price: ${formatUnits(gridConfig.lowerPrice, 18)} USDC/WETH`);
  console.log(`  Upper Price: ${formatUnits(gridConfig.upperPrice, 18)} USDC/WETH`);
  console.log(`  Grid Levels: ${gridConfig.gridLevels}`);
  console.log(`  Order Size A: ${formatUnits(gridConfig.orderSizeA, 18)} WETH`);
  console.log(`  Order Size B: ${formatUnits(gridConfig.orderSizeB, 6)} USDC`);
  console.log(`  Pool Fee: ${gridConfig.poolFee / 10000}%`);
  console.log(`  Max Slippage: ${gridConfig.maxSlippageBps / 100}%`);

  // Configure grid
  console.log('\nSending configureGrid transaction...');
  const configHash = await walletClient.writeContract({
    address: deployment.contractAddress,
    abi: gridTradingBotAbi,
    functionName: 'configureGrid',
    args: [gridConfigStruct],
  });

  console.log(`Transaction hash: ${configHash}`);
  await publicClient.waitForTransactionReceipt({ hash: configHash });
  console.log('Grid configured successfully!');

  // Initialize levels
  console.log('\nInitializing grid levels...');
  const initHash = await walletClient.writeContract({
    address: deployment.contractAddress,
    abi: gridTradingBotAbi,
    functionName: 'initializeLevels',
    args: [],
  });

  console.log(`Transaction hash: ${initHash}`);
  await publicClient.waitForTransactionReceipt({ hash: initHash });
  console.log('Grid levels initialized!');

  // Fetch and display level details
  console.log('\n--- Grid Levels ---');
  for (let i = 0; i < gridConfig.gridLevels; i++) {
    const level = await publicClient.readContract({
      address: deployment.contractAddress,
      abi: gridTradingBotAbi,
      functionName: 'getGridLevel',
      args: [BigInt(i)],
    }) as { price: bigint; isBuyLevel: boolean; isActive: boolean };

    console.log(
      `Level ${i}: Price ${formatUnits(level.price, 18)} USDC/WETH | ${level.isBuyLevel ? 'BUY' : 'SELL'} | ${level.isActive ? 'ACTIVE' : 'INACTIVE'}`
    );
  }
}

async function depositFunds(
  networkName: string,
  amountA: bigint,
  amountB: bigint
): Promise<void> {
  console.log(`\nDepositing funds on ${networkName}...`);

  const config: NetworkConfig = getNetwork(networkName);
  const deployment = loadDeployment(networkName);

  const privateKey = process.env.PRIVATE_KEY;
  if (!privateKey) {
    throw new Error('PRIVATE_KEY environment variable not set');
  }

  const account = privateKeyToAccount(privateKey as `0x${string}`);

  const publicClient = createPublicClient({
    chain: config.chain,
    transport: http(config.rpcUrl),
  });

  const walletClient = createWalletClient({
    account,
    chain: config.chain,
    transport: http(config.rpcUrl),
  });

  // Approve and deposit Token A (WETH)
  if (amountA > 0n) {
    console.log(`\nApproving ${formatUnits(amountA, 18)} WETH...`);
    const approveHashA = await walletClient.writeContract({
      address: config.weth,
      abi: erc20Abi,
      functionName: 'approve',
      args: [deployment.contractAddress, amountA],
    });
    await publicClient.waitForTransactionReceipt({ hash: approveHashA });

    console.log(`Depositing ${formatUnits(amountA, 18)} WETH...`);
    const depositHashA = await walletClient.writeContract({
      address: deployment.contractAddress,
      abi: gridTradingBotAbi,
      functionName: 'depositTokenA',
      args: [amountA],
    });
    await publicClient.waitForTransactionReceipt({ hash: depositHashA });
    console.log('WETH deposited successfully!');
  }

  // Approve and deposit Token B (USDC)
  if (amountB > 0n) {
    console.log(`\nApproving ${formatUnits(amountB, 6)} USDC...`);
    const approveHashB = await walletClient.writeContract({
      address: config.usdc,
      abi: erc20Abi,
      functionName: 'approve',
      args: [deployment.contractAddress, amountB],
    });
    await publicClient.waitForTransactionReceipt({ hash: approveHashB });

    console.log(`Depositing ${formatUnits(amountB, 6)} USDC...`);
    const depositHashB = await walletClient.writeContract({
      address: deployment.contractAddress,
      abi: gridTradingBotAbi,
      functionName: 'depositTokenB',
      args: [amountB],
    });
    await publicClient.waitForTransactionReceipt({ hash: depositHashB });
    console.log('USDC deposited successfully!');
  }

  // Show final balances
  const balanceA = await publicClient.readContract({
    address: deployment.contractAddress,
    abi: gridTradingBotAbi,
    functionName: 'getBalanceA',
    args: [],
  }) as bigint;

  const balanceB = await publicClient.readContract({
    address: deployment.contractAddress,
    abi: gridTradingBotAbi,
    functionName: 'getBalanceB',
    args: [],
  }) as bigint;

  console.log('\n--- Contract Balances ---');
  console.log(`WETH: ${formatUnits(balanceA, 18)}`);
  console.log(`USDC: ${formatUnits(balanceB, 6)}`);
}

// CLI handling - only run when this file is executed directly
import { fileURLToPath } from 'url';

const isMainModule = process.argv[1] === fileURLToPath(import.meta.url);

if (isMainModule) {
  const command = process.argv[2];
  const networkArg = process.argv[3];

  if (!command || !networkArg) {
    console.log('Usage:');
    console.log('  npm run configure grid <network>           - Configure grid with defaults');
    console.log('  npm run configure deposit <network> <weth> <usdc> - Deposit funds');
    process.exit(1);
  }

  if (command === 'grid') {
    configureGrid(networkArg).catch((error) => {
      console.error('Configuration failed:', error);
      process.exit(1);
    });
  } else if (command === 'deposit') {
    const amountA = parseUnits(process.argv[4] || '0', 18);
    const amountB = parseUnits(process.argv[5] || '0', 6);
    depositFunds(networkArg, amountA, amountB).catch((error) => {
      console.error('Deposit failed:', error);
      process.exit(1);
    });
  } else {
    console.log(`Unknown command: ${command}`);
    process.exit(1);
  }
}

export { configureGrid, depositFunds };
