#!/usr/bin/env node
import { Command } from 'commander';
import chalk from 'chalk';
import { deploy } from './deploy.js';
import { configureGrid, depositFunds } from './configure.js';
import { getStatus, displayStatus, executeGrid, watchBot } from './monitor.js';
import { defaultGridConfig, getNetwork } from './config.js';
import { parseUnits } from 'viem';
import 'dotenv/config';

const program = new Command();

program
  .name('grid-bot')
  .description('CLI for Grid Trading Bot management')
  .version('1.0.0');

// Deploy command
program
  .command('deploy')
  .description('Deploy the GridTradingBot contract')
  .argument('<network>', 'Network to deploy to (arbitrum, arbitrumSepolia)')
  .action(async (network: string) => {
    try {
      console.log(chalk.blue('\n🚀 Deploying Grid Trading Bot...\n'));
      const result = await deploy(network);
      console.log(chalk.green('\n✅ Deployment successful!'));
      console.log(chalk.gray(`   Contract: ${result.contractAddress}`));
    } catch (error) {
      console.error(chalk.red('\n❌ Deployment failed:'), error);
      process.exit(1);
    }
  });

// Configure command
program
  .command('configure')
  .description('Configure the grid parameters')
  .argument('<network>', 'Network (arbitrum, arbitrumSepolia)')
  .option('-l, --lower <price>', 'Lower price bound in USDC', '1800')
  .option('-u, --upper <price>', 'Upper price bound in USDC', '2200')
  .option('-g, --grid-levels <n>', 'Number of grid levels', '10')
  .option('-a, --order-size-a <amount>', 'Order size in WETH', '0.1')
  .option('-b, --order-size-b <amount>', 'Order size in USDC', '200')
  .option('-f, --fee <tier>', 'Pool fee tier (500, 3000, 10000)', '3000')
  .option('-s, --slippage <bps>', 'Max slippage in basis points', '50')
  .action(async (network: string, options) => {
    try {
      console.log(chalk.blue('\n⚙️  Configuring Grid Trading Bot...\n'));

      const gridConfig = {
        lowerPrice: parseUnits(options.lower, 18),
        upperPrice: parseUnits(options.upper, 18),
        gridLevels: parseInt(options.gridLevels, 10),
        orderSizeA: parseUnits(options.orderSizeA, 18),
        orderSizeB: parseUnits(options.orderSizeB, 6),
        poolFee: parseInt(options.fee, 10),
        maxSlippageBps: parseInt(options.slippage, 10),
      };

      await configureGrid(network, gridConfig);
      console.log(chalk.green('\n✅ Configuration complete!'));
    } catch (error) {
      console.error(chalk.red('\n❌ Configuration failed:'), error);
      process.exit(1);
    }
  });

// Deposit command
program
  .command('deposit')
  .description('Deposit funds into the bot')
  .argument('<network>', 'Network (arbitrum, arbitrumSepolia)')
  .option('-a, --weth <amount>', 'Amount of WETH to deposit', '0')
  .option('-b, --usdc <amount>', 'Amount of USDC to deposit', '0')
  .action(async (network: string, options) => {
    try {
      console.log(chalk.blue('\n💰 Depositing funds...\n'));
      const amountA = parseUnits(options.weth, 18);
      const amountB = parseUnits(options.usdc, 6);

      if (amountA === 0n && amountB === 0n) {
        console.log(chalk.yellow('No amounts specified. Use --weth and/or --usdc options.'));
        return;
      }

      await depositFunds(network, amountA, amountB);
      console.log(chalk.green('\n✅ Deposit complete!'));
    } catch (error) {
      console.error(chalk.red('\n❌ Deposit failed:'), error);
      process.exit(1);
    }
  });

// Status command
program
  .command('status')
  .description('Show bot status')
  .argument('<network>', 'Network (arbitrum, arbitrumSepolia)')
  .action(async (network: string) => {
    try {
      const status = await getStatus(network);
      displayStatus(status);
    } catch (error) {
      console.error(chalk.red('\n❌ Failed to get status:'), error);
      process.exit(1);
    }
  });

// Execute command
program
  .command('execute')
  .description('Manually execute the grid')
  .argument('<network>', 'Network (arbitrum, arbitrumSepolia)')
  .action(async (network: string) => {
    try {
      console.log(chalk.blue('\n⚡ Executing grid...\n'));
      await executeGrid(network);
      console.log(chalk.green('\n✅ Execution complete!'));
    } catch (error) {
      console.error(chalk.red('\n❌ Execution failed:'), error);
      process.exit(1);
    }
  });

// Watch command
program
  .command('watch')
  .description('Watch bot status continuously')
  .argument('<network>', 'Network (arbitrum, arbitrumSepolia)')
  .option('-i, --interval <seconds>', 'Refresh interval in seconds', '60')
  .action(async (network: string, options) => {
    try {
      await watchBot(network, parseInt(options.interval, 10));
    } catch (error) {
      console.error(chalk.red('\n❌ Watch failed:'), error);
      process.exit(1);
    }
  });

// Pause command
program
  .command('pause')
  .description('Pause the bot')
  .argument('<network>', 'Network (arbitrum, arbitrumSepolia)')
  .action(async (network: string) => {
    try {
      console.log(chalk.blue('\n⏸️  Pausing bot...\n'));
      const { createWalletClient, createPublicClient, http } = await import('viem');
      const { privateKeyToAccount } = await import('viem/accounts');
      const gridTradingBotAbi = (await import('./abi/GridTradingBot.json', { with: { type: 'json' } })).default;
      const fs = await import('fs');
      const path = await import('path');

      const config = getNetwork(network);
      const deploymentFile = path.join(process.cwd(), 'deployments', `${network}.json`);
      const deployment = JSON.parse(fs.readFileSync(deploymentFile, 'utf-8'));

      const privateKey = process.env.PRIVATE_KEY;
      if (!privateKey) throw new Error('PRIVATE_KEY not set');

      const account = privateKeyToAccount(privateKey as `0x${string}`);
      const publicClient = createPublicClient({ chain: config.chain, transport: http(config.rpcUrl) });
      const walletClient = createWalletClient({ account, chain: config.chain, transport: http(config.rpcUrl) });

      const hash = await walletClient.writeContract({
        address: deployment.contractAddress,
        abi: gridTradingBotAbi,
        functionName: 'pause',
        args: [],
      });

      await publicClient.waitForTransactionReceipt({ hash });
      console.log(chalk.green('\n✅ Bot paused!'));
    } catch (error) {
      console.error(chalk.red('\n❌ Pause failed:'), error);
      process.exit(1);
    }
  });

// Unpause command
program
  .command('unpause')
  .description('Unpause the bot')
  .argument('<network>', 'Network (arbitrum, arbitrumSepolia)')
  .action(async (network: string) => {
    try {
      console.log(chalk.blue('\n▶️  Unpausing bot...\n'));
      const { createWalletClient, createPublicClient, http } = await import('viem');
      const { privateKeyToAccount } = await import('viem/accounts');
      const gridTradingBotAbi = (await import('./abi/GridTradingBot.json', { with: { type: 'json' } })).default;
      const fs = await import('fs');
      const path = await import('path');

      const config = getNetwork(network);
      const deploymentFile = path.join(process.cwd(), 'deployments', `${network}.json`);
      const deployment = JSON.parse(fs.readFileSync(deploymentFile, 'utf-8'));

      const privateKey = process.env.PRIVATE_KEY;
      if (!privateKey) throw new Error('PRIVATE_KEY not set');

      const account = privateKeyToAccount(privateKey as `0x${string}`);
      const publicClient = createPublicClient({ chain: config.chain, transport: http(config.rpcUrl) });
      const walletClient = createWalletClient({ account, chain: config.chain, transport: http(config.rpcUrl) });

      const hash = await walletClient.writeContract({
        address: deployment.contractAddress,
        abi: gridTradingBotAbi,
        functionName: 'unpause',
        args: [],
      });

      await publicClient.waitForTransactionReceipt({ hash });
      console.log(chalk.green('\n✅ Bot unpaused!'));
    } catch (error) {
      console.error(chalk.red('\n❌ Unpause failed:'), error);
      process.exit(1);
    }
  });

// Withdraw command
program
  .command('withdraw')
  .description('Withdraw funds from the bot')
  .argument('<network>', 'Network (arbitrum, arbitrumSepolia)')
  .option('-a, --weth <amount>', 'Amount of WETH to withdraw', '0')
  .option('-b, --usdc <amount>', 'Amount of USDC to withdraw', '0')
  .option('--all', 'Withdraw all funds (emergency)')
  .action(async (network: string, options) => {
    try {
      const { createWalletClient, createPublicClient, http, parseUnits: parseU } = await import('viem');
      const { privateKeyToAccount } = await import('viem/accounts');
      const gridTradingBotAbi = (await import('./abi/GridTradingBot.json', { with: { type: 'json' } })).default;
      const fs = await import('fs');
      const path = await import('path');

      const config = getNetwork(network);
      const deploymentFile = path.join(process.cwd(), 'deployments', `${network}.json`);
      const deployment = JSON.parse(fs.readFileSync(deploymentFile, 'utf-8'));

      const privateKey = process.env.PRIVATE_KEY;
      if (!privateKey) throw new Error('PRIVATE_KEY not set');

      const account = privateKeyToAccount(privateKey as `0x${string}`);
      const publicClient = createPublicClient({ chain: config.chain, transport: http(config.rpcUrl) });
      const walletClient = createWalletClient({ account, chain: config.chain, transport: http(config.rpcUrl) });

      if (options.all) {
        console.log(chalk.yellow('\n🚨 Emergency withdrawal of ALL funds...\n'));
        const hash = await walletClient.writeContract({
          address: deployment.contractAddress,
          abi: gridTradingBotAbi,
          functionName: 'emergencyWithdrawAll',
          args: [],
        });
        await publicClient.waitForTransactionReceipt({ hash });
        console.log(chalk.green('\n✅ Emergency withdrawal complete!'));
      } else {
        console.log(chalk.blue('\n💸 Withdrawing funds...\n'));
        const amountA = parseU(options.weth, 18);
        const amountB = parseU(options.usdc, 6);

        if (amountA > 0n) {
          const hash = await walletClient.writeContract({
            address: deployment.contractAddress,
            abi: gridTradingBotAbi,
            functionName: 'withdrawTokenA',
            args: [amountA],
          });
          await publicClient.waitForTransactionReceipt({ hash });
          console.log(chalk.green(`Withdrew ${options.weth} WETH`));
        }

        if (amountB > 0n) {
          const hash = await walletClient.writeContract({
            address: deployment.contractAddress,
            abi: gridTradingBotAbi,
            functionName: 'withdrawTokenB',
            args: [amountB],
          });
          await publicClient.waitForTransactionReceipt({ hash });
          console.log(chalk.green(`Withdrew ${options.usdc} USDC`));
        }

        console.log(chalk.green('\n✅ Withdrawal complete!'));
      }
    } catch (error) {
      console.error(chalk.red('\n❌ Withdrawal failed:'), error);
      process.exit(1);
    }
  });

// Info command
program
  .command('info')
  .description('Show network configuration')
  .argument('[network]', 'Network name (optional)')
  .action((network?: string) => {
    if (network) {
      try {
        const config = getNetwork(network);
        console.log(chalk.blue(`\n📋 ${network} Configuration:\n`));
        console.log(`  Chain ID:     ${config.chain.id}`);
        console.log(`  Swap Router:  ${config.swapRouter}`);
        console.log(`  Factory:      ${config.factory}`);
        console.log(`  WETH:         ${config.weth}`);
        console.log(`  USDC:         ${config.usdc}`);
        console.log(`  LINK:         ${config.linkToken}`);
        console.log(`  RPC URL:      ${config.rpcUrl}`);
      } catch (error) {
        console.error(chalk.red(`Unknown network: ${network}`));
        process.exit(1);
      }
    } else {
      console.log(chalk.blue('\n📋 Available Networks:\n'));
      console.log('  - arbitrum       (Arbitrum One mainnet)');
      console.log('  - arbitrumSepolia (Arbitrum Sepolia testnet)');
      console.log('\nUse "grid-bot info <network>" for details.');
    }
  });

program.parse();
