import { createWalletClient, createPublicClient, http, formatUnits } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { getNetwork, type NetworkConfig } from './config.js';
import gridTradingBotAbi from './abi/GridTradingBot.json' with { type: 'json' };
import * as fs from 'fs';
import * as path from 'path';
import 'dotenv/config';

function loadDeployment(networkName: string): { contractAddress: `0x${string}` } {
  const deploymentFile = path.join(process.cwd(), 'deployments', `${networkName}.json`);
  if (!fs.existsSync(deploymentFile)) {
    throw new Error(`No deployment found for ${networkName}. Run deploy first.`);
  }
  return JSON.parse(fs.readFileSync(deploymentFile, 'utf-8'));
}

interface BotStatus {
  network: string;
  contractAddress: string;
  isPaused: boolean;
  isConfigured: boolean;
  levelsInitialized: boolean;
  currentPrice: bigint;
  balanceA: bigint;
  balanceB: bigint;
  gridConfig: {
    tokenA: string;
    tokenB: string;
    lowerPrice: bigint;
    upperPrice: bigint;
    gridLevels: bigint;
    orderSizeA: bigint;
    orderSizeB: bigint;
    poolFee: number;
    maxSlippageBps: bigint;
  };
  levels: Array<{
    index: number;
    price: bigint;
    isBuyLevel: boolean;
    isActive: boolean;
    lastExecutedAt: bigint;
  }>;
}

async function getStatus(networkName: string): Promise<BotStatus> {
  const config: NetworkConfig = getNetwork(networkName);
  const deployment = loadDeployment(networkName);

  const publicClient = createPublicClient({
    chain: config.chain,
    transport: http(config.rpcUrl),
  });

  // Read contract state
  const isPaused = await publicClient.readContract({
    address: deployment.contractAddress,
    abi: gridTradingBotAbi,
    functionName: 'isPaused',
    args: [],
  }) as boolean;

  const gridConfig = await publicClient.readContract({
    address: deployment.contractAddress,
    abi: gridTradingBotAbi,
    functionName: 'getGridConfig',
    args: [],
  }) as BotStatus['gridConfig'];

  const levelCount = await publicClient.readContract({
    address: deployment.contractAddress,
    abi: gridTradingBotAbi,
    functionName: 'getLevelCount',
    args: [],
  }) as bigint;

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

  let currentPrice = 0n;
  let isConfigured = gridConfig.tokenA !== '0x0000000000000000000000000000000000000000';

  if (isConfigured) {
    try {
      currentPrice = await publicClient.readContract({
        address: deployment.contractAddress,
        abi: gridTradingBotAbi,
        functionName: 'getCurrentPrice',
        args: [],
      }) as bigint;
    } catch {
      // Price might fail if pool doesn't exist
      console.log('Warning: Could not fetch current price (pool may not exist)');
    }
  }

  // Fetch all levels
  const levels: BotStatus['levels'] = [];
  for (let i = 0; i < Number(levelCount); i++) {
    const level = await publicClient.readContract({
      address: deployment.contractAddress,
      abi: gridTradingBotAbi,
      functionName: 'getGridLevel',
      args: [BigInt(i)],
    }) as { price: bigint; isBuyLevel: boolean; isActive: boolean; lastExecutedAt: bigint };

    levels.push({
      index: i,
      ...level,
    });
  }

  return {
    network: networkName,
    contractAddress: deployment.contractAddress,
    isPaused,
    isConfigured,
    levelsInitialized: levelCount > 0n,
    currentPrice,
    balanceA,
    balanceB,
    gridConfig,
    levels,
  };
}

function displayStatus(status: BotStatus): void {
  console.log('\n╔════════════════════════════════════════════════════════════════╗');
  console.log('║               GRID TRADING BOT STATUS                          ║');
  console.log('╚════════════════════════════════════════════════════════════════╝\n');

  console.log(`Network:          ${status.network}`);
  console.log(`Contract:         ${status.contractAddress}`);
  console.log(`Status:           ${status.isPaused ? '⏸️  PAUSED' : '▶️  RUNNING'}`);
  console.log(`Configured:       ${status.isConfigured ? '✓ Yes' : '✗ No'}`);
  console.log(`Levels Init:      ${status.levelsInitialized ? '✓ Yes' : '✗ No'}`);

  console.log('\n--- Balances ---');
  console.log(`WETH:             ${formatUnits(status.balanceA, 18)}`);
  console.log(`USDC:             ${formatUnits(status.balanceB, 6)}`);

  if (status.isConfigured) {
    console.log('\n--- Grid Configuration ---');
    console.log(`Token A:          ${status.gridConfig.tokenA}`);
    console.log(`Token B:          ${status.gridConfig.tokenB}`);
    console.log(`Lower Price:      ${formatUnits(status.gridConfig.lowerPrice, 18)} USDC/WETH`);
    console.log(`Upper Price:      ${formatUnits(status.gridConfig.upperPrice, 18)} USDC/WETH`);
    console.log(`Grid Levels:      ${status.gridConfig.gridLevels}`);
    console.log(`Order Size A:     ${formatUnits(status.gridConfig.orderSizeA, 18)} WETH`);
    console.log(`Order Size B:     ${formatUnits(status.gridConfig.orderSizeB, 6)} USDC`);
    console.log(`Pool Fee:         ${Number(status.gridConfig.poolFee) / 10000}%`);
    console.log(`Max Slippage:     ${Number(status.gridConfig.maxSlippageBps) / 100}%`);

    if (status.currentPrice > 0n) {
      console.log(`\nCurrent Price:    ${formatUnits(status.currentPrice, 18)} USDC/WETH`);
    }
  }

  if (status.levels.length > 0) {
    console.log('\n--- Grid Levels ---');
    console.log('┌───────┬──────────────────────┬────────┬──────────┬───────────────────┐');
    console.log('│ Level │ Price (USDC/WETH)    │ Type   │ Active   │ Last Executed     │');
    console.log('├───────┼──────────────────────┼────────┼──────────┼───────────────────┤');

    for (const level of status.levels) {
      const priceStr = formatUnits(level.price, 18).padEnd(20);
      const typeStr = level.isBuyLevel ? 'BUY ' : 'SELL';
      const activeStr = level.isActive ? '  ✓   ' : '  ✗   ';
      const lastExec =
        level.lastExecutedAt > 0n
          ? new Date(Number(level.lastExecutedAt) * 1000).toISOString().slice(0, 19)
          : 'Never            ';

      // Check if current price is near this level
      const priceDiff =
        status.currentPrice > 0n
          ? Math.abs(
              Number(formatUnits(status.currentPrice - level.price, 18))
            )
          : 999999;
      const indicator = priceDiff < 50 ? ' ◄' : '';

      console.log(
        `│ ${String(level.index).padStart(5)} │ ${priceStr} │ ${typeStr}   │ ${activeStr} │ ${lastExec} │${indicator}`
      );
    }
    console.log('└───────┴──────────────────────┴────────┴──────────┴───────────────────┘');
  }
}

async function executeGrid(networkName: string): Promise<void> {
  console.log(`\nExecuting grid on ${networkName}...`);

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

  // Execute grid
  const hash = await walletClient.writeContract({
    address: deployment.contractAddress,
    abi: gridTradingBotAbi,
    functionName: 'executeGrid',
    args: [],
  });

  console.log(`Transaction hash: ${hash}`);
  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  console.log(`Gas used: ${receipt.gasUsed}`);
  console.log('Grid execution complete!');
}

async function watchBot(networkName: string, intervalSeconds: number = 60): Promise<void> {
  console.log(`\nWatching bot on ${networkName} (refresh every ${intervalSeconds}s)...`);
  console.log('Press Ctrl+C to stop.\n');

  const refresh = async () => {
    console.clear();
    const status = await getStatus(networkName);
    displayStatus(status);
    console.log(`\nLast updated: ${new Date().toISOString()}`);
  };

  await refresh();
  setInterval(refresh, intervalSeconds * 1000);
}

// CLI handling - only run when this file is executed directly
import { fileURLToPath } from 'url';

const isMainModule = process.argv[1] === fileURLToPath(import.meta.url);

if (isMainModule) {
  const command = process.argv[2];
  const networkArg = process.argv[3];

  if (!command || !networkArg) {
    console.log('Usage:');
    console.log('  npm run monitor status <network>        - Show bot status');
    console.log('  npm run monitor execute <network>       - Execute grid manually');
    console.log('  npm run monitor watch <network> [secs]  - Watch bot continuously');
    process.exit(1);
  }

  if (command === 'status') {
    getStatus(networkArg)
      .then(displayStatus)
      .catch((error) => {
        console.error('Failed to get status:', error);
        process.exit(1);
      });
  } else if (command === 'execute') {
    executeGrid(networkArg).catch((error) => {
      console.error('Execution failed:', error);
      process.exit(1);
    });
  } else if (command === 'watch') {
    const interval = parseInt(process.argv[4] || '60', 10);
    watchBot(networkArg, interval).catch((error) => {
      console.error('Watch failed:', error);
      process.exit(1);
    });
  } else {
    console.log(`Unknown command: ${command}`);
    process.exit(1);
  }
}

export { getStatus, displayStatus, executeGrid, watchBot };
