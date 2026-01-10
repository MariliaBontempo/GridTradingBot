# Grid Trading Bot for Uniswap V3

An on-chain grid trading bot for Uniswap V3 on Arbitrum. The bot executes automated grid trading strategies with configurable price ranges and order sizes.

## Features

- **On-chain Grid Logic**: All trading logic executes on-chain for transparency and trustlessness
- **TWAP Oracle**: Uses Uniswap V3 TWAP for manipulation-resistant price feeds
- **Chainlink Automation**: Automated execution via Chainlink Automation (Keepers)
- **Slippage Protection**: Configurable maximum slippage with revert on excessive slippage
- **Emergency Controls**: Pause, emergency withdrawal, and level management functions
- **Geometric Grid Spacing**: Grid levels use geometric spacing for better coverage

## Architecture

```
contracts/
├── src/
│   ├── GridTradingBot.sol       # Main contract
│   ├── interfaces/
│   │   ├── IGridTradingBot.sol  # Interface definitions
│   │   └── IAutomationCompatible.sol  # Chainlink interface
│   └── libraries/
│       └── TWAPLib.sol          # TWAP price calculation
├── test/
│   ├── GridTradingBot.t.sol     # Unit tests
│   └── mocks/                   # Mock contracts
└── scripts/
    └── src/
        ├── deploy.ts            # Deployment script
        ├── configure.ts         # Configuration script
        ├── monitor.ts           # Monitoring script
        ├── keeper.ts            # Backup keeper
        └── cli.ts               # CLI interface
```

## Prerequisites

- [Foundry](https://book.getfoundry.sh/getting-started/installation)
- [Node.js](https://nodejs.org/) v18+
- Arbitrum Sepolia testnet ETH for testing
- Private key with funds for deployment

## Installation

```bash
# Clone and navigate
cd contracts

# Install Foundry dependencies
forge install

# Install TypeScript dependencies
cd scripts && npm install
```

## Configuration

Create a `.env` file in the `contracts` directory:

```bash
cp .env.example .env
```

Edit `.env` with your values:
```
PRIVATE_KEY=0x...
ARBITRUM_RPC_URL=https://arb1.arbitrum.io/rpc
ARBITRUM_SEPOLIA_RPC_URL=https://sepolia-rollup.arbitrum.io/rpc
```

## Development

### Build Contracts
```bash
forge build
```

### Run Tests
```bash
forge test
```

### Run Tests with Verbosity
```bash
forge test -vvv
```

### Gas Report
```bash
forge test --gas-report
```

## Deployment

### Using TypeScript CLI

```bash
cd scripts

# Deploy to testnet
npm run cli deploy arbitrumSepolia

# Deploy to mainnet
npm run cli deploy arbitrum
```

### Using Foundry Script

```bash
# Testnet
forge script script/Deploy.s.sol:DeployScript --rpc-url $ARBITRUM_SEPOLIA_RPC_URL --broadcast

# Mainnet
forge script script/Deploy.s.sol:DeployScript --rpc-url $ARBITRUM_RPC_URL --broadcast --verify
```

## Usage

### Configure Grid

```bash
cd scripts

# Configure with defaults (1800-2200 range, 10 levels)
npm run cli configure arbitrumSepolia

# Configure with custom parameters
npm run cli configure arbitrumSepolia \
  --lower 1500 \
  --upper 2500 \
  --grid-levels 20 \
  --order-size-a 0.05 \
  --order-size-b 100 \
  --slippage 100
```

### Deposit Funds

```bash
# Deposit WETH and USDC
npm run cli deposit arbitrumSepolia --weth 1.0 --usdc 2000
```

### Monitor Status

```bash
# Show current status
npm run cli status arbitrumSepolia

# Watch status continuously (60s refresh)
npm run cli watch arbitrumSepolia --interval 60
```

### Manual Execution

```bash
npm run cli execute arbitrumSepolia
```

### Pause/Unpause

```bash
npm run cli pause arbitrumSepolia
npm run cli unpause arbitrumSepolia
```

### Withdraw Funds

```bash
# Partial withdrawal
npm run cli withdraw arbitrumSepolia --weth 0.5 --usdc 1000

# Emergency withdraw all
npm run cli withdraw arbitrumSepolia --all
```

## Chainlink Automation Setup

1. Go to [Chainlink Automation](https://automation.chain.link/)
2. Connect your wallet
3. Register a new Upkeep:
   - **Upkeep Type**: Custom logic
   - **Contract Address**: Your deployed GridTradingBot address
   - **Name**: Grid Trading Bot
   - **Gas Limit**: 500000
   - **Starting Balance**: 5-10 LINK

The bot implements `IAutomationCompatibleInterface`:
- `checkUpkeep()`: Returns true when price triggers any grid level
- `performUpkeep()`: Executes the triggered swaps

### Backup Keeper

If Chainlink Automation is unavailable, run the backup keeper:

```bash
cd scripts
npm run keeper arbitrumSepolia 30  # Check every 30 seconds
```

## Grid Configuration Parameters

| Parameter | Description | Example |
|-----------|-------------|---------|
| `tokenA` | Base token (e.g., WETH) | 0x82aF49447D8a07e3bd95BD0d56f35241523fBab1 |
| `tokenB` | Quote token (e.g., USDC) | 0xaf88d065e77c8cC2239327C5EDb3A432268e5831 |
| `lowerPrice` | Lower grid bound (scaled by 1e18) | 1800000000000000000000 |
| `upperPrice` | Upper grid bound (scaled by 1e18) | 2200000000000000000000 |
| `gridLevels` | Number of grid levels (2-100) | 10 |
| `orderSizeA` | Token A per order | 100000000000000000 (0.1 WETH) |
| `orderSizeB` | Token B per order | 200000000 (200 USDC) |
| `poolFee` | Uniswap V3 fee tier | 3000 (0.3%) |
| `maxSlippageBps` | Max slippage in basis points | 50 (0.5%) |

## Security Considerations

### MEV Protection
The contract uses TWAP prices (60-second window by default) rather than spot prices to reduce manipulation risk. However, additional MEV protection is recommended:
- Use Flashbots Protect RPC
- Consider MEV Blocker or similar services
- Monitor for sandwich attacks

### Access Control
- Only the owner can deposit, withdraw, configure, and pause
- Emergency withdrawal available even when paused
- Ownership transferable

### Slippage
- Maximum 10% slippage limit (configurable)
- Each swap checks output against expected amount
- Failed swaps don't revert the entire transaction

### Auditing
This code has NOT been audited. Use at your own risk on mainnet.

## Network Addresses

### Arbitrum Mainnet
- SwapRouter: `0xE592427A0AEce92De3Edee1F18E0157C05861564`
- Factory: `0x1F98431c8aD98523631AE4a59f267346ea31F984`
- WETH: `0x82aF49447D8a07e3bd95BD0d56f35241523fBab1`
- USDC: `0xaf88d065e77c8cC2239327C5EDb3A432268e5831`
- LINK: `0xf97f4df75117a78c1A5a0DBb814Af92458539FB4`

### Arbitrum Sepolia
- SwapRouter: `0x101F443B4d1b059569D643917553c771E1b9663E`
- Factory: `0x248AB79Bbb9bC29bB72f7Cd42F17e054Fc40188e`
- WETH: `0x980B62Da83eFf3D4576C647993b0c1D7faf17c73`
- USDC: `0x75faf114eafb1BDbe2F0316DF893fd58CE46AA4d`
- LINK: `0xb1D4538B4571d411F07960EF2838Ce337FE1E80E`

## Gas Estimates

| Function | Estimated Gas |
|----------|---------------|
| configureGrid | ~235,000 |
| initializeLevels (10 levels) | ~764,000 |
| depositTokenA | ~277,000 |
| depositTokenB | ~277,000 |
| executeGrid (1 swap) | ~200,000+ |
| checkUpkeep | ~25,000 |
| performUpkeep | ~200,000+ |

## Testing Coverage

The contract has 86 unit tests covering:
- Constructor and initialization
- Deposits and withdrawals
- Grid configuration validation
- Level initialization
- Pause/unpause functionality
- Slippage and cooldown settings
- Emergency functions
- Chainlink Automation integration
- Access control

Run tests with coverage:
```bash
forge coverage
```

## Disclaimer

This software is provided "as is" without warranty of any kind. Use at your own risk. Trading cryptocurrencies involves substantial risk of loss. Always test thoroughly on testnet before deploying to mainnet.

## License

MIT
