export const CONTRACTS = {
  TOKEN_A: "0xc3C4B92ccD54E42e23911F5212fE628370d99e2E", // Token A Final
  TOKEN_B: "0x19546E766F5168dcDbB1A8F93733fFA23Aa79D52", // Token B Final
  SWAP_CONTRACT: "0xBfBe54b54868C37034Cfa6A8E9E5d045CC1B8278", // Your custom swap contract
}

export const SEPOLIA_CHAIN_ID = 11155111

export const SEPOLIA_RPC = "https://sepolia.infura.io/v3/YOUR_INFURA_KEY"

// Alternative public RPC endpoints for Sepolia
export const PUBLIC_SEPOLIA_RPCS = [
  "https://rpc.sepolia.org",
  "https://sepolia.gateway.tenderly.co",
  "https://ethereum-sepolia.blockpi.network/v1/rpc/public",
]

export const TOKEN_METADATA = {
  [CONTRACTS.TOKEN_A]: {
    name: "Token A",
    symbol: "TKNA",
    decimals: 18,
  },
  [CONTRACTS.TOKEN_B]: {
    name: "Token B",
    symbol: "TKNB",
    decimals: 18,
  },
}
