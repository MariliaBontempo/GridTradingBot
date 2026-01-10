#!/usr/bin/env node
/**
 * Backup Keeper Script for Grid Trading Bot
 *
 * This script runs as a fallback in case Chainlink Automation fails.
 * It periodically checks for triggerable levels and executes upkeep.
 *
 * Usage:
 *   npm run keeper <network> [interval_seconds]
 *
 * Environment:
 *   PRIVATE_KEY - The private key of the keeper wallet
 */

import { createWalletClient, createPublicClient, http, formatUnits } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { getNetwork, type NetworkConfig } from './config.js';
import gridTradingBotAbi from './abi/GridTradingBot.json' with { type: 'json' };
import * as fs from 'fs';
import * as path from 'path';
import 'dotenv/config';

interface KeeperStats {
  startTime: Date;
  checksPerformed: number;
  upkeepsExecuted: number;
  lastCheckTime: Date | null;
  lastUpkeepTime: Date | null;
  errors: number;
  gasSpent: bigint;
}

function loadDeployment(networkName: string): { contractAddress: `0x${string}` } {
  const deploymentFile = path.join(process.cwd(), 'deployments', `${networkName}.json`);
  if (!fs.existsSync(deploymentFile)) {
    throw new Error(`No deployment found for ${networkName}. Run deploy first.`);
  }
  return JSON.parse(fs.readFileSync(deploymentFile, 'utf-8'));
}

function formatDuration(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) return `${days}d ${hours % 24}h`;
  if (hours > 0) return `${hours}h ${minutes % 60}m`;
  if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
  return `${seconds}s`;
}

function logStats(stats: KeeperStats): void {
  const uptime = Date.now() - stats.startTime.getTime();
  console.log('\n--- Keeper Statistics ---');
  console.log(`Uptime:           ${formatDuration(uptime)}`);
  console.log(`Checks performed: ${stats.checksPerformed}`);
  console.log(`Upkeeps executed: ${stats.upkeepsExecuted}`);
  console.log(`Errors:           ${stats.errors}`);
  console.log(`Gas spent:        ${formatUnits(stats.gasSpent, 18)} ETH`);
  if (stats.lastCheckTime) {
    console.log(`Last check:       ${stats.lastCheckTime.toISOString()}`);
  }
  if (stats.lastUpkeepTime) {
    console.log(`Last upkeep:      ${stats.lastUpkeepTime.toISOString()}`);
  }
  console.log('-------------------------\n');
}

async function runKeeper(networkName: string, intervalSeconds: number): Promise<void> {
  console.log(`\nStarting backup keeper for Grid Trading Bot on ${networkName}`);
  console.log(`Check interval: ${intervalSeconds} seconds`);
  console.log('Press Ctrl+C to stop.\n');

  const config: NetworkConfig = getNetwork(networkName);
  const deployment = loadDeployment(networkName);

  const privateKey = process.env.PRIVATE_KEY;
  if (!privateKey) {
    throw new Error('PRIVATE_KEY environment variable not set');
  }

  const account = privateKeyToAccount(privateKey as `0x${string}`);
  console.log(`Keeper address: ${account.address}`);
  console.log(`Bot contract:   ${deployment.contractAddress}`);

  const publicClient = createPublicClient({
    chain: config.chain,
    transport: http(config.rpcUrl),
  });

  const walletClient = createWalletClient({
    account,
    chain: config.chain,
    transport: http(config.rpcUrl),
  });

  // Check keeper balance
  const balance = await publicClient.getBalance({ address: account.address });
  console.log(`Keeper balance: ${formatUnits(balance, 18)} ETH`);

  if (balance < BigInt('1000000000000000')) {
    // < 0.001 ETH
    console.warn('Warning: Low keeper balance. Consider adding more ETH for gas.');
  }

  const stats: KeeperStats = {
    startTime: new Date(),
    checksPerformed: 0,
    upkeepsExecuted: 0,
    lastCheckTime: null,
    lastUpkeepTime: null,
    errors: 0,
    gasSpent: 0n,
  };

  // Handle graceful shutdown
  process.on('SIGINT', () => {
    console.log('\n\nShutting down keeper...');
    logStats(stats);
    process.exit(0);
  });

  // Main keeper loop
  const keeperLoop = async () => {
    try {
      stats.checksPerformed++;
      stats.lastCheckTime = new Date();

      // Check if upkeep is needed
      const [upkeepNeeded, performData] = await publicClient.readContract({
        address: deployment.contractAddress,
        abi: gridTradingBotAbi,
        functionName: 'checkUpkeep',
        args: ['0x'],
      }) as [boolean, `0x${string}`];

      if (upkeepNeeded) {
        console.log(`[${new Date().toISOString()}] Upkeep needed! Executing...`);

        try {
          // Simulate first to check if it will succeed
          await publicClient.simulateContract({
            address: deployment.contractAddress,
            abi: gridTradingBotAbi,
            functionName: 'performUpkeep',
            args: [performData],
            account,
          });

          // Execute the upkeep
          const hash = await walletClient.writeContract({
            address: deployment.contractAddress,
            abi: gridTradingBotAbi,
            functionName: 'performUpkeep',
            args: [performData],
          });

          console.log(`  Transaction: ${hash}`);
          const receipt = await publicClient.waitForTransactionReceipt({ hash });

          stats.upkeepsExecuted++;
          stats.lastUpkeepTime = new Date();
          stats.gasSpent += receipt.gasUsed * (receipt.effectiveGasPrice || 0n);

          console.log(`  Gas used: ${receipt.gasUsed}`);
          console.log(`  Status: ${receipt.status === 'success' ? 'Success' : 'Failed'}`);
        } catch (execError) {
          console.error(`  Execution failed:`, execError);
          stats.errors++;
        }
      } else {
        // Quiet log for no upkeep needed
        if (stats.checksPerformed % 10 === 0) {
          console.log(`[${new Date().toISOString()}] Check #${stats.checksPerformed}: No upkeep needed`);
        }
      }
    } catch (error) {
      console.error(`[${new Date().toISOString()}] Error checking upkeep:`, error);
      stats.errors++;
    }
  };

  // Initial check
  await keeperLoop();

  // Schedule periodic checks
  setInterval(keeperLoop, intervalSeconds * 1000);

  // Log stats every hour
  setInterval(() => logStats(stats), 3600000);
}

// CLI handling
const networkArg = process.argv[2];
const intervalArg = process.argv[3];

if (!networkArg) {
  console.log('Usage: npm run keeper <network> [interval_seconds]');
  console.log('');
  console.log('Arguments:');
  console.log('  network          Network to run on (arbitrum, arbitrumSepolia)');
  console.log('  interval_seconds Check interval in seconds (default: 30)');
  console.log('');
  console.log('Environment:');
  console.log('  PRIVATE_KEY      Keeper wallet private key');
  console.log('');
  console.log('Example:');
  console.log('  npm run keeper arbitrumSepolia 60');
  process.exit(1);
}

const interval = parseInt(intervalArg || '30', 10);

runKeeper(networkArg, interval).catch((error) => {
  console.error('Keeper failed:', error);
  process.exit(1);
});

export { runKeeper };
