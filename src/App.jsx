"use client"

import { useState, useEffect } from "react"
import { ethers } from "ethers"
import simpleSwapAbi from "./SimpleSwapABI.json"
import Select from "react-select"
import axios from "axios"
import { FiSun, FiMoon, FiExternalLink, FiAlertTriangle, FiInfo } from "react-icons/fi"

// Minimal ERC‑20 ABI for approve() and balanceOf()
const erc20Abi = [
  "function approve(address spender, uint256 amount) external returns (bool)",
  "function balanceOf(address who) external view returns (uint256)",
  "function symbol() external view returns (string)",
  "function name() external view returns (string)",
  "function decimals() external view returns (uint8)",
  "function allowance(address owner, address spender) external view returns (uint256)",
  "function transfer(address to, uint256 amount) external returns (bool)",
]

// Contract addresses - Fixed environment variable access
const TOKEN_A_ADDRESS = import.meta.env?.VITE_TOKEN_A || "0xc3C4B92ccD54E42e23911F5212fE628370d99e2E"
const TOKEN_B_ADDRESS = import.meta.env?.VITE_TOKEN_B || "0x19546E766F5168dcDbB1A8F93733fFA23Aa79D52"
const SWAP_CONTRACT_ADDRESS = import.meta.env?.VITE_SWAP_ADDRESS || "0xBfBe54b54868C37034Cfa6A8E9E5d045CC1B8278"
const ETHERSCAN_API_KEY = import.meta.env?.VITE_ETHERSCAN_API_KEY || "KBYRHPKJ5BYUF6246M4TTW47ZVG7UNXD59"

function App() {
  // State hooks
  const [account, setAccount] = useState(null)
  const [price, setPrice] = useState(null)
  const [reserves, setReserves] = useState({ A: "0", B: "0" })
  const [balances, setBalances] = useState({ A: "0", B: "0" })
  const [inputToken, setInputToken] = useState("A")
  const [outputToken, setOutputToken] = useState("B")
  const [amountIn, setAmountIn] = useState("")
  const [estimatedOut, setEstimatedOut] = useState("")
  const [swapStatus, setSwapStatus] = useState("")
  const [swapTxHash, setSwapTxHash] = useState("")
  const [isDarkMode, setIsDarkMode] = useState(false)
  const [recentTxs, setRecentTxs] = useState([])
  const [txStatus, setTxStatus] = useState("")
  const [isConnecting, setIsConnecting] = useState(false)
  const [tokenNames, setTokenNames] = useState({ A: "Token A", B: "Token B" })
  const [allowances, setAllowances] = useState({ A: "0", B: "0" })
  const [contractIssues, setContractIssues] = useState([])
  const [showContractInfo, setShowContractInfo] = useState(false)

  // Debug: Log environment variables
  useEffect(() => {
    console.log("Environment variables:")
    console.log("TOKEN_A_ADDRESS:", TOKEN_A_ADDRESS)
    console.log("TOKEN_B_ADDRESS:", TOKEN_B_ADDRESS)
    console.log("SWAP_CONTRACT_ADDRESS:", SWAP_CONTRACT_ADDRESS)
    console.log("ETHERSCAN_API_KEY:", ETHERSCAN_API_KEY ? "Set" : "Not set")
    console.log("import.meta.env:", import.meta.env)
  }, [])

  // Persist dark mode in localStorage
  useEffect(() => {
    const saved = localStorage.getItem("darkMode") === "true"
    setIsDarkMode(saved)
  }, [])

  useEffect(() => {
    document.documentElement.classList.toggle("dark", isDarkMode)
    localStorage.setItem("darkMode", isDarkMode)
  }, [isDarkMode])

  // Handle MetaMask account changes
  useEffect(() => {
    if (typeof window !== "undefined" && window.ethereum) {
      const handleAccountsChanged = (accounts) => {
        if (accounts.length === 0) {
          setAccount(null)
          console.log("MetaMask disconnected")
        } else {
          setAccount(accounts[0])
          console.log("Account changed to:", accounts[0])
        }
      }

      const handleChainChanged = (chainId) => {
        console.log("Chain changed to:", chainId)
        window.location.reload()
      }

      window.ethereum.on("accountsChanged", handleAccountsChanged)
      window.ethereum.on("chainChanged", handleChainChanged)

      // Check if already connected
      window.ethereum
        .request({ method: "eth_accounts" })
        .then((accounts) => {
          if (accounts.length > 0) {
            setAccount(accounts[0])
          }
        })
        .catch(console.error)

      return () => {
        if (window.ethereum.removeListener) {
          window.ethereum.removeListener("accountsChanged", handleAccountsChanged)
          window.ethereum.removeListener("chainChanged", handleChainChanged)
        }
      }
    }
  }, [])

  // Load token names
  useEffect(() => {
    if (!account || typeof window === "undefined" || !window.ethereum) return

    async function loadTokenNames() {
      try {
        const provider = new ethers.BrowserProvider(window.ethereum)
        const tokenAContract = new ethers.Contract(TOKEN_A_ADDRESS, erc20Abi, provider)
        const tokenBContract = new ethers.Contract(TOKEN_B_ADDRESS, erc20Abi, provider)

        const [nameA, symbolA, nameB, symbolB] = await Promise.all([
          tokenAContract.name().catch(() => "Token A"),
          tokenAContract.symbol().catch(() => "TKA"),
          tokenBContract.name().catch(() => "Token B"),
          tokenBContract.symbol().catch(() => "TKB"),
        ])

        setTokenNames({
          A: `${nameA} (${symbolA})`,
          B: `${nameB} (${symbolB})`,
        })
      } catch (error) {
        console.error("Error loading token names:", error)
      }
    }

    loadTokenNames()
  }, [account])

  // Connect to MetaMask and switch to Sepolia
  async function connectWallet() {
    if (typeof window === "undefined" || !window.ethereum) {
      alert("MetaMask not detected. Please install MetaMask extension.")
      return
    }

    setIsConnecting(true)

    try {
      // Request account access
      const accounts = await window.ethereum.request({
        method: "eth_requestAccounts",
      })

      if (accounts.length === 0) {
        alert("No accounts found. Please unlock MetaMask.")
        return
      }

      console.log("Accounts found:", accounts)

      // Try to switch to Sepolia
      try {
        await window.ethereum.request({
          method: "wallet_switchEthereumChain",
          params: [{ chainId: "0xaa36a7" }],
        })
        console.log("Successfully switched to Sepolia")
      } catch (switchError) {
        console.log("Switch error:", switchError)
        if (switchError.code === 4902) {
          try {
            await window.ethereum.request({
              method: "wallet_addEthereumChain",
              params: [
                {
                  chainId: "0xaa36a7",
                  chainName: "Sepolia Test Network",
                  nativeCurrency: {
                    name: "SepoliaETH",
                    symbol: "ETH",
                    decimals: 18,
                  },
                  rpcUrls: ["https://sepolia.infura.io/v3/"],
                  blockExplorerUrls: ["https://sepolia.etherscan.io/"],
                },
              ],
            })
            console.log("Successfully added Sepolia network")
          } catch (addError) {
            console.error("Failed to add Sepolia network:", addError)
            alert("Failed to add Sepolia network to MetaMask")
            return
          }
        } else {
          console.error("Failed to switch to Sepolia:", switchError)
          console.warn("Continuing with current network")
        }
      }

      setAccount(accounts[0])
      console.log("Connected to MetaMask:", accounts[0])
    } catch (error) {
      console.error("Failed to connect to MetaMask:", error)
      alert("Failed to connect to MetaMask: " + (error.message || error))
    } finally {
      setIsConnecting(false)
    }
  }

  // Load contract data and analyze issues
  useEffect(() => {
    if (!account || typeof window === "undefined" || !window.ethereum) return

    async function loadData() {
      try {
        console.log("Loading data for account:", account)
        console.log("Using SimpleSwap contract:", SWAP_CONTRACT_ADDRESS)

        const provider = new ethers.BrowserProvider(window.ethereum)
        const swap = new ethers.Contract(SWAP_CONTRACT_ADDRESS, simpleSwapAbi, provider)
        const issues = []

        try {
          // Load user balances
          const tokenAContract = new ethers.Contract(TOKEN_A_ADDRESS, erc20Abi, provider)
          const tokenBContract = new ethers.Contract(TOKEN_B_ADDRESS, erc20Abi, provider)

          const [balA, balB, allowanceA, allowanceB] = await Promise.all([
            tokenAContract.balanceOf(account),
            tokenBContract.balanceOf(account),
            tokenAContract.allowance(account, SWAP_CONTRACT_ADDRESS),
            tokenBContract.allowance(account, SWAP_CONTRACT_ADDRESS),
          ])

          setBalances({
            A: ethers.formatEther(balA),
            B: ethers.formatEther(balB),
          })

          setAllowances({
            A: ethers.formatEther(allowanceA),
            B: ethers.formatEther(allowanceB),
          })

          // Load reserves using the correct function
          const [reserveA, reserveB] = await swap.getReserves(TOKEN_A_ADDRESS, TOKEN_B_ADDRESS)
          setReserves({
            A: ethers.formatEther(reserveA),
            B: ethers.formatEther(reserveB),
          })

          console.log("User balances:", { A: ethers.formatEther(balA), B: ethers.formatEther(balB) })
          console.log("Reserves:", { A: ethers.formatEther(reserveA), B: ethers.formatEther(reserveB) })

          // Analyze potential issues
          if (reserveA === 0n && reserveB === 0n) {
            issues.push({
              type: "error",
              title: "No Liquidity in Pool",
              description: "The pool has no liquidity. You need to add liquidity before swapping.",
              solution: "Use addLiquidity function or ask the pool owner to add liquidity.",
            })
          }

          if (balA === 0n && balB === 0n) {
            issues.push({
              type: "warning",
              title: "No User Tokens",
              description: "You don't have any tokens to swap.",
              solution: "Get some test tokens from a faucet or mint them if possible.",
            })
          }
        } catch (balanceError) {
          console.error("Error loading balances:", balanceError)
          issues.push({
            type: "error",
            title: "Token Loading Failed",
            description: "Could not load token balances. Tokens may not exist on this network.",
            solution: "Check that the token addresses are correct for Sepolia testnet.",
          })
        }

        try {
          // Load price using the available getPrice function
          const rawPrice = await swap.getPrice(TOKEN_A_ADDRESS, TOKEN_B_ADDRESS)
          setPrice(ethers.formatEther(rawPrice))
          console.log("Price A→B:", ethers.formatEther(rawPrice))

          if (rawPrice === 0n) {
            issues.push({
              type: "warning",
              title: "Zero Price",
              description: "The contract is returning a price of 0, indicating no liquidity.",
              solution: "Add liquidity to the pool first.",
            })
          }
        } catch (priceError) {
          console.error("Error loading price:", priceError)
          issues.push({
            type: "error",
            title: "Price Loading Failed",
            description: "Could not get price from contract. May indicate no reserves.",
            solution: "Add liquidity to the pool first.",
          })
          setPrice("0")
        }

        setContractIssues(issues)
      } catch (error) {
        console.error("Error loading data:", error)
        setSwapStatus("Error loading contract data: " + error.message)
      }
    }

    loadData()
  }, [account, swapTxHash, inputToken])

  // Estimate output on amount change
  async function onInChange(e) {
    const val = e.target.value
    setAmountIn(val)
    setSwapStatus("")
    setSwapTxHash("")

    if (!val || !account || typeof window === "undefined" || !window.ethereum) {
      setEstimatedOut("")
      return
    }

    try {
      const provider = new ethers.BrowserProvider(window.ethereum)
      const swap = new ethers.Contract(SWAP_CONTRACT_ADDRESS, simpleSwapAbi, provider)

      // Get reserves for the correct direction
      const [reserveA, reserveB] = await swap.getReserves(TOKEN_A_ADDRESS, TOKEN_B_ADDRESS)

      let reserveIn, reserveOut
      if (inputToken === "A") {
        reserveIn = reserveA
        reserveOut = reserveB
      } else {
        reserveIn = reserveB
        reserveOut = reserveA
      }

      if (reserveIn === 0n || reserveOut === 0n) {
        setEstimatedOut("No liquidity")
        return
      }

      const amountInWei = ethers.parseEther(val)
      const estimatedOutWei = await swap.getAmountOut(amountInWei, reserveIn, reserveOut)

      setEstimatedOut(ethers.formatEther(estimatedOutWei))
      console.log("Estimated output:", ethers.formatEther(estimatedOutWei))
    } catch (error) {
      console.error("Error estimating output:", error)
      setEstimatedOut("Error calculating")
    }
  }

  // Add liquidity function
  async function addLiquidity() {
    if (!account || typeof window === "undefined" || !window.ethereum) return
    setSwapStatus("Adding liquidity to the pool...")

    try {
      const provider = new ethers.BrowserProvider(window.ethereum)
      const signer = await provider.getSigner()
      const swap = new ethers.Contract(SWAP_CONTRACT_ADDRESS, simpleSwapAbi, signer)

      const tokenAContract = new ethers.Contract(TOKEN_A_ADDRESS, erc20Abi, signer)
      const tokenBContract = new ethers.Contract(TOKEN_B_ADDRESS, erc20Abi, signer)

      const liquidityAmount = ethers.parseEther("100") // Add 100 tokens each

      // Check user balances first
      const userBalA = await tokenAContract.balanceOf(account)
      const userBalB = await tokenBContract.balanceOf(account)

      if (userBalA < liquidityAmount) {
        setSwapStatus(`❌ Insufficient Token A balance. You have ${ethers.formatEther(userBalA)} but need 100`)
        return
      }

      if (userBalB < liquidityAmount) {
        setSwapStatus(`❌ Insufficient Token B balance. You have ${ethers.formatEther(userBalB)} but need 100`)
        return
      }

      // Approve tokens
      setSwapStatus("Approving Token A...")
      const approveATx = await tokenAContract.approve(SWAP_CONTRACT_ADDRESS, liquidityAmount)
      await approveATx.wait()

      setSwapStatus("Approving Token B...")
      const approveBTx = await tokenBContract.approve(SWAP_CONTRACT_ADDRESS, liquidityAmount)
      await approveBTx.wait()

      // Add liquidity
      setSwapStatus("Adding liquidity...")
      const tx = await swap.addLiquidity(
        TOKEN_A_ADDRESS,
        TOKEN_B_ADDRESS,
        liquidityAmount, // amountADesired
        liquidityAmount, // amountBDesired
        ethers.parseEther("90"), // amountAMin (10% slippage)
        ethers.parseEther("90"), // amountBMin (10% slippage)
        account, // to
        Math.floor(Date.now() / 1000) + 3600, // deadline (1 hour)
      )

      await tx.wait()
      setSwapStatus("✅ Liquidity added successfully!")
      setSwapTxHash(tx.hash)
    } catch (error) {
      console.error("Add liquidity error:", error)
      setSwapStatus("❌ Failed to add liquidity: " + error.message)
    }
  }

  // Perform swap using the correct function
  async function doSwap() {
    if (
      !estimatedOut ||
      !account ||
      estimatedOut === "No liquidity" ||
      estimatedOut === "Error calculating" ||
      typeof window === "undefined" ||
      !window.ethereum
    )
      return

    const inputAddr = inputToken === "A" ? TOKEN_A_ADDRESS : TOKEN_B_ADDRESS
    const outputAddr = inputToken === "A" ? TOKEN_B_ADDRESS : TOKEN_A_ADDRESS
    const inWei = ethers.parseEther(amountIn)

    setSwapStatus("Preparing swap...")
    setSwapTxHash("")

    try {
      const provider = new ethers.BrowserProvider(window.ethereum)
      const signer = await provider.getSigner()

      // Check current allowance
      const currentAllowance = Number.parseFloat(allowances[inputToken])
      const requiredAmount = Number.parseFloat(amountIn)

      if (currentAllowance < requiredAmount) {
        setSwapStatus("Approving tokens...")
        const approval = new ethers.Contract(inputAddr, erc20Abi, signer)
        const approveTx = await approval.approve(SWAP_CONTRACT_ADDRESS, inWei)
        await approveTx.wait()
        console.log("Approval successful")
      }

      setSwapStatus("Executing swap...")
      const swapContract = new ethers.Contract(SWAP_CONTRACT_ADDRESS, simpleSwapAbi, signer)

      // Calculate minimum output (5% slippage tolerance)
      const estimatedOutWei = ethers.parseEther(estimatedOut)
      const minAmountOut = (estimatedOutWei * 95n) / 100n // 5% slippage

      // Use the correct function: swapExactTokensForTokens
      const tx = await swapContract.swapExactTokensForTokens(
        inWei, // amountIn
        minAmountOut, // amountOutMin
        [inputAddr, outputAddr], // path
        account, // to
        Math.floor(Date.now() / 1000) + 3600, // deadline (1 hour)
      )

      setSwapStatus("Confirming transaction...")
      const receipt = await tx.wait()
      setSwapStatus("✅ Swap completed successfully!")
      setSwapTxHash(receipt.transactionHash)
    } catch (err) {
      console.error("Swap error:", err)
      setSwapStatus("❌ Swap failed: " + (err.message || "Unknown error"))
    }
  }

  // Fetch recent transactions
  async function fetchRecentTxs() {
    setTxStatus("Fetching…")
    setRecentTxs([])

    try {
      if (!ETHERSCAN_API_KEY) {
        setTxStatus("Missing VITE_ETHERSCAN_API_KEY in .env")
        return
      }

      const url = new URL("https://api-sepolia.etherscan.io/api")
      url.searchParams.set("module", "account")
      url.searchParams.set("action", "txlist")
      url.searchParams.set("address", SWAP_CONTRACT_ADDRESS)
      url.searchParams.set("sort", "desc")
      url.searchParams.set("page", "1")
      url.searchParams.set("offset", "10")
      url.searchParams.set("apikey", ETHERSCAN_API_KEY)

      const res = await axios.get(url.toString())

      if (res.data.status === "1") {
        setRecentTxs(res.data.result.slice(0, 10))
        setTxStatus("")
      } else {
        setTxStatus("Error: " + res.data.message)
      }
    } catch (err) {
      console.error("Fetch transactions error:", err)
      setTxStatus("Fetch failed: " + err.message)
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-gray-100">
      <header className="bg-white dark:bg-gray-800 shadow-sm border-b border-gray-200 dark:border-gray-700">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <h1 className="text-2xl font-bold text-blue-600 dark:text-blue-400">SimpleSwap UI</h1>
            <div className="flex items-center space-x-4">
              <a
                href={`https://sepolia.etherscan.io/address/${SWAP_CONTRACT_ADDRESS}#code`}
                target="_blank"
                rel="noreferrer"
                className="flex items-center space-x-1 text-sm text-gray-500 dark:text-gray-400 hover:text-blue-600 dark:hover:text-blue-400"
              >
                <span>
                  Contract: {SWAP_CONTRACT_ADDRESS?.slice(0, 6)}...{SWAP_CONTRACT_ADDRESS?.slice(-4)}
                </span>
                <FiExternalLink size={14} />
              </a>
              <button
                onClick={() => setIsDarkMode(!isDarkMode)}
                className="p-2 rounded-lg bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
              >
                {isDarkMode ? <FiSun size={20} /> : <FiMoon size={20} />}
              </button>
            </div>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Contract Issues Alert */}
        {contractIssues.length > 0 && (
          <div className="mb-8">
            <div className="bg-yellow-50 dark:bg-yellow-900 border border-yellow-200 dark:border-yellow-700 rounded-xl p-6">
              <div className="flex items-start space-x-3">
                <FiAlertTriangle className="text-yellow-600 dark:text-yellow-400 mt-1" size={20} />
                <div className="flex-1">
                  <h3 className="text-lg font-semibold text-yellow-800 dark:text-yellow-200 mb-3">Pool Status</h3>
                  <div className="space-y-3">
                    {contractIssues.map((issue, index) => (
                      <div key={index} className="border-l-4 border-yellow-400 pl-4">
                        <h4 className="font-medium text-yellow-800 dark:text-yellow-200">{issue.title}</h4>
                        <p className="text-sm text-yellow-700 dark:text-yellow-300 mt-1">{issue.description}</p>
                        <p className="text-sm text-yellow-600 dark:text-yellow-400 mt-1">
                          <strong>Solution:</strong> {issue.solution}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <aside className="lg:col-span-1">
            <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-6 sticky top-8">
              <div className="mb-6">
                <button
                  onClick={connectWallet}
                  disabled={isConnecting}
                  className={`w-full py-3 px-4 rounded-lg font-medium transition-colors ${
                    account
                      ? "bg-green-100 dark:bg-green-900 text-green-800 dark:text-green-200 border border-green-200 dark:border-green-700"
                      : isConnecting
                        ? "bg-gray-400 cursor-not-allowed text-white"
                        : "bg-blue-600 hover:bg-blue-700 text-white"
                  }`}
                >
                  {isConnecting ? "Connecting..." : account ? "✅ Wallet Connected" : "Connect Wallet"}
                </button>
                {account && (
                  <p className="mt-2 text-sm text-gray-600 dark:text-gray-400 text-center">
                    {account.slice(0, 6)}...{account.slice(-4)}
                  </p>
                )}
              </div>

              <div className="mb-6">
                <h3 className="text-lg font-semibold mb-3 text-gray-900 dark:text-gray-100">Current Price</h3>
                <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-3">
                  <p className="text-sm font-mono">
                    1 {inputToken} ≈ {price || "0"} {outputToken}
                  </p>
                </div>
              </div>

              <div className="mb-6">
                <h3 className="text-lg font-semibold mb-3 text-gray-900 dark:text-gray-100">Your Balances</h3>
                <div className="space-y-2">
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-gray-600 dark:text-gray-400">{tokenNames.A}:</span>
                    <span className="text-sm font-mono">{Number.parseFloat(balances.A).toFixed(4)}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-gray-600 dark:text-gray-400">{tokenNames.B}:</span>
                    <span className="text-sm font-mono">{Number.parseFloat(balances.B).toFixed(4)}</span>
                  </div>
                </div>
              </div>

              <div className="mb-6">
                <h3 className="text-lg font-semibold mb-3 text-gray-900 dark:text-gray-100">Pool Reserves</h3>
                <div className="space-y-2">
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-gray-600 dark:text-gray-400">{tokenNames.A}:</span>
                    <span className="text-sm font-mono">{Number.parseFloat(reserves.A).toFixed(4)}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-gray-600 dark:text-gray-400">{tokenNames.B}:</span>
                    <span className="text-sm font-mono">{Number.parseFloat(reserves.B).toFixed(4)}</span>
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                <button
                  onClick={addLiquidity}
                  disabled={!account}
                  className="w-full py-2 px-3 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white rounded-lg text-sm font-medium transition-colors"
                >
                  💧 Add Liquidity (100 each)
                </button>
                <button
                  onClick={() => setShowContractInfo(!showContractInfo)}
                  className="w-full py-2 px-3 bg-gray-600 hover:bg-gray-700 text-white rounded-lg text-sm font-medium transition-colors"
                >
                  <FiInfo className="inline mr-1" />
                  {showContractInfo ? "Hide" : "Show"} Contract Info
                </button>
              </div>

              {showContractInfo && (
                <div className="mt-4 p-4 bg-gray-50 dark:bg-gray-700 rounded-lg text-xs">
                  <h4 className="font-semibold mb-2">Contract Details:</h4>
                  <p className="mb-1">
                    <strong>Address:</strong> {SWAP_CONTRACT_ADDRESS}
                  </p>
                  <p className="mb-1">
                    <strong>Token A:</strong> {TOKEN_A_ADDRESS}
                  </p>
                  <p className="mb-1">
                    <strong>Token B:</strong> {TOKEN_B_ADDRESS}
                  </p>
                  <p className="text-gray-600 dark:text-gray-400 mt-2">
                    This is a Uniswap V2-style AMM with 0.3% trading fees. It requires liquidity to be added before
                    swaps can be performed.
                  </p>
                </div>
              )}
            </div>
          </aside>

          <main className="lg:col-span-2">
            <div className="space-y-8">
              <section>
                <h2 className="text-2xl font-bold mb-6 text-gray-900 dark:text-gray-100">Swap Tokens</h2>
                <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-6">
                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                        From Token
                      </label>
                      <Select
                        options={[
                          { value: "A", label: tokenNames.A },
                          { value: "B", label: tokenNames.B },
                        ]}
                        value={{ value: inputToken, label: tokenNames[inputToken] }}
                        onChange={(sel) => {
                          setInputToken(sel.value)
                          setOutputToken(sel.value === "A" ? "B" : "A")
                          setAmountIn("")
                          setEstimatedOut("")
                        }}
                        classNamePrefix="select"
                        className="text-gray-900"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Amount</label>
                      <input
                        type="number"
                        placeholder={`Enter ${tokenNames[inputToken]} amount`}
                        value={amountIn}
                        onChange={onInChange}
                        className="w-full p-3 border border-gray-300 dark:border-gray-600 rounded-lg bg-transparent focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      />
                    </div>

                    <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-3">
                      <p className="text-sm text-gray-600 dark:text-gray-400">
                        Estimated {tokenNames[outputToken]}: <span className="font-mono">{estimatedOut || "–"}</span>
                      </p>
                      {estimatedOut && !["No liquidity", "Error calculating", "–"].includes(estimatedOut) && (
                        <p className="text-xs text-gray-500 dark:text-gray-500 mt-1">
                          Minimum received (5% slippage): {(Number.parseFloat(estimatedOut) * 0.95).toFixed(6)}
                        </p>
                      )}
                    </div>

                    <button
                      onClick={doSwap}
                      disabled={
                        !estimatedOut ||
                        !account ||
                        estimatedOut === "No liquidity" ||
                        estimatedOut === "Error calculating"
                      }
                      className="w-full py-3 px-4 bg-green-600 hover:bg-green-700 disabled:bg-gray-400 disabled:cursor-not-allowed text-white rounded-lg font-medium transition-colors"
                    >
                      {!account
                        ? "Connect Wallet"
                        : !estimatedOut || estimatedOut === "–"
                          ? "Enter Amount"
                          : estimatedOut === "No liquidity"
                            ? "No Liquidity - Add Liquidity First"
                            : estimatedOut === "Error calculating"
                              ? "Cannot Calculate - Check Pool"
                              : "Swap Tokens"}
                    </button>

                    {swapStatus && (
                      <div
                        className={`mt-4 p-3 rounded-lg ${
                          swapStatus.includes("❌") || swapStatus.includes("failed")
                            ? "bg-red-50 dark:bg-red-900"
                            : swapStatus.includes("✅") || swapStatus.includes("successfully")
                              ? "bg-green-50 dark:bg-green-900"
                              : "bg-blue-50 dark:bg-blue-900"
                        }`}
                      >
                        <p
                          className={`text-sm whitespace-pre-line ${
                            swapStatus.includes("❌") || swapStatus.includes("failed")
                              ? "text-red-800 dark:text-red-200"
                              : swapStatus.includes("✅") || swapStatus.includes("successfully")
                                ? "text-green-800 dark:text-green-200"
                                : "text-blue-800 dark:text-blue-200"
                          }`}
                        >
                          {swapStatus}
                        </p>
                      </div>
                    )}

                    {swapTxHash && (
                      <div className="mt-4">
                        <a
                          href={`https://sepolia.etherscan.io/tx/${swapTxHash}`}
                          target="_blank"
                          rel="noreferrer"
                          className="text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300 text-sm underline"
                        >
                          View transaction on Etherscan →
                        </a>
                      </div>
                    )}
                  </div>
                </div>
              </section>

              <section>
                <h2 className="text-2xl font-bold mb-6 text-gray-900 dark:text-gray-100">Recent Transactions</h2>
                <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-6">
                  <button
                    onClick={fetchRecentTxs}
                    className="mb-4 py-2 px-4 bg-purple-600 hover:bg-purple-700 text-white rounded-lg font-medium transition-colors"
                  >
                    Load Recent Transactions
                  </button>

                  {txStatus && (
                    <div className="mb-4 p-3 bg-yellow-50 dark:bg-yellow-900 rounded-lg">
                      <p className="text-sm text-yellow-800 dark:text-yellow-200">{txStatus}</p>
                    </div>
                  )}

                  {recentTxs.length > 0 && (
                    <div className="space-y-2">
                      {recentTxs.map((tx) => (
                        <div
                          key={tx.hash}
                          className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-700 rounded-lg"
                        >
                          <div>
                            <a
                              href={`https://sepolia.etherscan.io/tx/${tx.hash}`}
                              target="_blank"
                              rel="noreferrer"
                              className="text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300 font-mono text-sm underline"
                            >
                              {tx.hash.slice(0, 10)}...{tx.hash.slice(-8)}
                            </a>
                          </div>
                          <div className="text-sm text-gray-600 dark:text-gray-400">
                            {new Date(tx.timeStamp * 1000).toLocaleDateString()}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </section>
            </div>
          </main>
        </div>
      </div>
    </div>
  )
}

export default App
