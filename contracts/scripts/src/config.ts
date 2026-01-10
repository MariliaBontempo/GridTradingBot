import { arbitrum, arbitrumSepolia } from 'viem/chains';
import type { Chain } from 'viem';

export interface NetworkConfig {
  chain: Chain;
  swapRouter: `0x${string}`;
  factory: `0x${string}`;
  weth: `0x${string}`;
  usdc: `0x${string}`;
  linkToken: `0x${string}`;
  automationRegistry: `0x${string}`;
  rpcUrl: string;
}

export const networks: Record<string, NetworkConfig> = {
  arbitrum: {
    chain: arbitrum,
    swapRouter: '0xE592427A0AEce92De3Edee1F18E0157C05861564',
    factory: '0x1F98431c8aD98523631AE4a59f267346ea31F984',
    weth: '0x82aF49447D8a07e3bd95BD0d56f35241523fBab1',
    usdc: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831',
    linkToken: '0xf97f4df75117a78c1A5a0DBb814Af92458539FB4',
    automationRegistry: '0x37D9dC70bfcd8BC77Ec2858836B923c560E891D1',
    rpcUrl: process.env.ARBITRUM_RPC_URL || 'https://arb1.arbitrum.io/rpc',
  },
  arbitrumSepolia: {
    chain: arbitrumSepolia,
    swapRouter: '0x101F443B4d1b059569D643917553c771E1b9663E',
    factory: '0x248AB79Bbb9bC29bB72f7Cd42F17e054Fc40188e',
    weth: '0x980B62Da83eFf3D4576C647993b0c1D7faf17c73',
    usdc: '0x75faf114eafb1BDbe2F0316DF893fd58CE46AA4d',
    linkToken: '0xb1D4538B4571d411F07960EF2838Ce337FE1E80E',
    automationRegistry: '0x8194399B3f11fc3985FfC7a5c2A5E467E24C3f56',
    rpcUrl: process.env.ARBITRUM_SEPOLIA_RPC_URL || 'https://sepolia-rollup.arbitrum.io/rpc',
  },
};

export const defaultGridConfig = {
  lowerPrice: BigInt('1800000000000000000000'), // 1800 USDC per WETH
  upperPrice: BigInt('2200000000000000000000'), // 2200 USDC per WETH
  gridLevels: 10,
  orderSizeA: BigInt('100000000000000000'),    // 0.1 WETH
  orderSizeB: BigInt('200000000'),              // 200 USDC
  poolFee: 3000,                                // 0.3% fee tier
  maxSlippageBps: 50,                           // 0.5% slippage
};

export function getNetwork(networkName: string): NetworkConfig {
  const config = networks[networkName];
  if (!config) {
    throw new Error(`Unknown network: ${networkName}. Available: ${Object.keys(networks).join(', ')}`);
  }
  return config;
}
