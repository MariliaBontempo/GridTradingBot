import { createWalletClient, createPublicClient, http, parseEther, formatEther } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { getNetwork, type NetworkConfig } from './config.js';
import gridTradingBotAbi from './abi/GridTradingBot.json' with { type: 'json' };
import * as fs from 'fs';
import * as path from 'path';
import 'dotenv/config';

// Read bytecode from compiled contract
function getBytecode(): `0x${string}` {
  const artifactPath = path.join(process.cwd(), '..', 'out', 'GridTradingBot.sol', 'GridTradingBot.json');
  const artifact = JSON.parse(fs.readFileSync(artifactPath, 'utf-8'));
  return artifact.bytecode.object as `0x${string}`;
}

interface DeploymentResult {
  contractAddress: `0x${string}`;
  transactionHash: `0x${string}`;
  network: string;
  deployer: `0x${string}`;
  gasUsed: bigint;
}

async function deploy(networkName: string): Promise<DeploymentResult> {
  console.log(`\nDeploying GridTradingBot to ${networkName}...`);

  // Get network config
  const config: NetworkConfig = getNetwork(networkName);

  // Get private key from environment
  const privateKey = process.env.PRIVATE_KEY;
  if (!privateKey) {
    throw new Error('PRIVATE_KEY environment variable not set');
  }

  // Create account from private key
  const account = privateKeyToAccount(privateKey as `0x${string}`);
  console.log(`Deployer address: ${account.address}`);

  // Create clients
  const publicClient = createPublicClient({
    chain: config.chain,
    transport: http(config.rpcUrl),
  });

  const walletClient = createWalletClient({
    account,
    chain: config.chain,
    transport: http(config.rpcUrl),
  });

  // Check deployer balance
  const balance = await publicClient.getBalance({ address: account.address });
  console.log(`Deployer balance: ${formatEther(balance)} ETH`);

  if (balance < parseEther('0.01')) {
    throw new Error('Insufficient balance for deployment. Need at least 0.01 ETH.');
  }

  // Get bytecode
  const bytecode = getBytecode();
  console.log(`Bytecode size: ${bytecode.length / 2 - 1} bytes`);

  // Deploy contract
  console.log('\nDeploying contract...');
  const hash = await walletClient.deployContract({
    abi: gridTradingBotAbi,
    bytecode,
    args: [config.swapRouter, config.factory],
  });

  console.log(`Transaction hash: ${hash}`);
  console.log('Waiting for confirmation...');

  // Wait for transaction receipt
  const receipt = await publicClient.waitForTransactionReceipt({ hash });

  if (!receipt.contractAddress) {
    throw new Error('Deployment failed - no contract address in receipt');
  }

  console.log(`\nContract deployed successfully!`);
  console.log(`Contract address: ${receipt.contractAddress}`);
  console.log(`Gas used: ${receipt.gasUsed}`);
  console.log(`Block number: ${receipt.blockNumber}`);

  // Save deployment info
  const deploymentInfo = {
    network: networkName,
    contractAddress: receipt.contractAddress,
    transactionHash: hash,
    deployer: account.address,
    swapRouter: config.swapRouter,
    factory: config.factory,
    timestamp: new Date().toISOString(),
    blockNumber: receipt.blockNumber.toString(),
    gasUsed: receipt.gasUsed.toString(),
  };

  const deploymentsDir = path.join(process.cwd(), 'deployments');
  if (!fs.existsSync(deploymentsDir)) {
    fs.mkdirSync(deploymentsDir, { recursive: true });
  }

  const deploymentFile = path.join(deploymentsDir, `${networkName}.json`);
  fs.writeFileSync(deploymentFile, JSON.stringify(deploymentInfo, null, 2));
  console.log(`\nDeployment info saved to: ${deploymentFile}`);

  return {
    contractAddress: receipt.contractAddress,
    transactionHash: hash,
    network: networkName,
    deployer: account.address,
    gasUsed: receipt.gasUsed,
  };
}

// CLI handling - only run when this file is executed directly
import { fileURLToPath } from 'url';

const isMainModule = process.argv[1] === fileURLToPath(import.meta.url);

if (isMainModule) {
  const networkArg = process.argv[2];
  if (!networkArg) {
    console.log('Usage: npm run deploy <network>');
    console.log('Available networks: arbitrum, arbitrumSepolia');
    process.exit(1);
  }

  deploy(networkArg)
    .then((result) => {
      console.log('\n--- Deployment Summary ---');
      console.log(`Network: ${result.network}`);
      console.log(`Contract: ${result.contractAddress}`);
      console.log(`Deployer: ${result.deployer}`);
      console.log(`Tx Hash: ${result.transactionHash}`);
      console.log(`Gas Used: ${result.gasUsed}`);
    })
    .catch((error) => {
      console.error('Deployment failed:', error);
      process.exit(1);
    });
}

export { deploy };
