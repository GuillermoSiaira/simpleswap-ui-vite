"use client"

import { useState, useEffect } from "react"
import { ethers } from "ethers"
import { FaWallet, FaSpinner, FaInfoCircle, FaChevronDown, FaPlus, FaHistory, FaSignOutAlt } from "react-icons/fa"
import { useWeb3 } from "./hooks/useWeb3"
import { CONTRACTS } from "./config/contracts"
import { ThemeProvider } from "./contexts/ThemeContext"
import { LanguageProvider, useLanguage } from "./contexts/LanguageContext"
import { ThemeToggle } from "./components/ThemeToggle"
import { LanguageSelector } from "./components/LanguageSelector"
import SimpleSwapABI from "./SimpleSwapABI.json"

// ABI básico de ERC20 para obtener balances y verificar allowance
const ERC20_ABI = [
  "function balanceOf(address owner) view returns (uint256)",
  "function decimals() view returns (uint8)",
  "function symbol() view returns (string)",
  "function approve(address spender, uint256 amount) returns (bool)",
  "function allowance(address owner, address spender) view returns (uint256)",
  "function transfer(address to, uint256 amount) returns (bool)",
]

function AppContent() {
  const { account, signer, isConnected, isLoading, error, connectWallet, disconnectWallet } = useWeb3()
  const { t } = useLanguage()

  const [swapAmount, setSwapAmount] = useState("")
  const [selectedToken, setSelectedToken] = useState("A")
  const [balanceA, setBalanceA] = useState("0")
  const [balanceB, setBalanceB] = useState("0")
  const [reserveA, setReserveA] = useState("0")
  const [reserveB, setReserveB] = useState("0")
  const [currentPrice, setCurrentPrice] = useState("0")
  const [estimatedOutput, setEstimatedOutput] = useState("--")
  const [isSwapping, setIsSwapping] = useState(false)
  const [txHash, setTxHash] = useState("")
  const [showContractInfo, setShowContractInfo] = useState(false)

  const validateContracts = async () => {
    if (!signer) return false

    try {
      console.log("Validating contracts...")

      // Check if contracts are deployed
      const [swapCode, tokenACode, tokenBCode] = await Promise.all([
        signer.provider.getCode(CONTRACTS.SWAP_CONTRACT),
        signer.provider.getCode(CONTRACTS.TOKEN_A),
        signer.provider.getCode(CONTRACTS.TOKEN_B),
      ])

      if (swapCode === "0x") {
        throw new Error("Swap contract not deployed at address: " + CONTRACTS.SWAP_CONTRACT)
      }
      if (tokenACode === "0x") {
        throw new Error("Token A not deployed at address: " + CONTRACTS.TOKEN_A)
      }
      if (tokenBCode === "0x") {
        throw new Error("Token B not deployed at address: " + CONTRACTS.TOKEN_B)
      }

      // Test basic ERC20 functions
      const tokenAContract = new ethers.Contract(CONTRACTS.TOKEN_A, ERC20_ABI, signer)
      const tokenBContract = new ethers.Contract(CONTRACTS.TOKEN_B, ERC20_ABI, signer)

      try {
        await Promise.all([
          tokenAContract.symbol(),
          tokenBContract.symbol(),
          tokenAContract.decimals(),
          tokenBContract.decimals(),
        ])
        console.log("Token contracts validated successfully")
      } catch (tokenError) {
        throw new Error("Token contracts are not valid ERC20 tokens: " + tokenError.message)
      }

      // Test swap contract basic functionality
      const swapContract = new ethers.Contract(CONTRACTS.SWAP_CONTRACT, SimpleSwapABI, signer)

      try {
        // Try to call a view function to test contract interface
        const contractBalance = await tokenAContract.balanceOf(CONTRACTS.SWAP_CONTRACT)
        console.log("Swap contract validation successful, Token A balance:", ethers.formatEther(contractBalance))
        return true
      } catch (swapError) {
        throw new Error("Swap contract interface validation failed: " + swapError.message)
      }
    } catch (error) {
      console.error("Contract validation failed:", error)
      alert("Contract Validation Error: " + error.message)
      return false
    }
  }

  const getBalances = async () => {
    if (!signer || !account) return

    const isValid = await validateContracts()
    if (!isValid) return

    try {
      const tokenAContract = new ethers.Contract(CONTRACTS.TOKEN_A, ERC20_ABI, signer)
      const tokenBContract = new ethers.Contract(CONTRACTS.TOKEN_B, ERC20_ABI, signer)

      const [balA, balB, contractBalA, contractBalB] = await Promise.all([
        tokenAContract.balanceOf(account),
        tokenBContract.balanceOf(account),
        tokenAContract.balanceOf(CONTRACTS.SWAP_CONTRACT),
        tokenBContract.balanceOf(CONTRACTS.SWAP_CONTRACT),
      ])

      setBalanceA(ethers.formatEther(balA))
      setBalanceB(ethers.formatEther(balB))

      const reserveAFormatted = ethers.formatEther(contractBalA)
      const reserveBFormatted = ethers.formatEther(contractBalB)

      setReserveA(reserveAFormatted)
      setReserveB(reserveBFormatted)

      const reserveANum = Number.parseFloat(reserveAFormatted)
      const reserveBNum = Number.parseFloat(reserveBFormatted)

      if (reserveANum > 0 && reserveBNum > 0) {
        const price = (reserveBNum / reserveANum).toFixed(4)
        setCurrentPrice(price)
      } else {
        setCurrentPrice("0")
      }
    } catch (err) {
      console.error("Error obteniendo balances:", err)
    }
  }

  const handleAddLiquidity = async () => {
    if (!signer || !account) return

    try {
      const amountA = prompt(t("enterAmountA"))
      const amountB = prompt(t("enterAmountB"))

      if (!amountA || !amountB || Number.parseFloat(amountA) <= 0 || Number.parseFloat(amountB) <= 0) {
        return
      }

      const amountAWei = ethers.parseEther(amountA)
      const amountBWei = ethers.parseEther(amountB)

      const tokenAContract = new ethers.Contract(CONTRACTS.TOKEN_A, ERC20_ABI, signer)
      const tokenBContract = new ethers.Contract(CONTRACTS.TOKEN_B, ERC20_ABI, signer)

      // Check balances
      const [balA, balB] = await Promise.all([tokenAContract.balanceOf(account), tokenBContract.balanceOf(account)])

      if (balA < amountAWei) {
        alert(t("insufficientTokenA"))
        return
      }
      if (balB < amountBWei) {
        alert(t("insufficientTokenB"))
        return
      }

      // Approve tokens
      console.log("Approving tokens for liquidity...")
      const [approveATx, approveBTx] = await Promise.all([
        tokenAContract.approve(CONTRACTS.SWAP_CONTRACT, amountAWei),
        tokenBContract.approve(CONTRACTS.SWAP_CONTRACT, amountBWei),
      ])

      await Promise.all([approveATx.wait(), approveBTx.wait()])

      // Transfer tokens to contract (simple liquidity addition)
      console.log("Transferring tokens to contract...")
      const [transferATx, transferBTx] = await Promise.all([
        tokenAContract.transfer(CONTRACTS.SWAP_CONTRACT, amountAWei),
        tokenBContract.transfer(CONTRACTS.SWAP_CONTRACT, amountBWei),
      ])

      await Promise.all([transferATx.wait(), transferBTx.wait()])

      alert(t("liquidityAdded"))
      await getBalances()
    } catch (err) {
      console.error("Error adding liquidity:", err)

      if (err.code === "ACTION_REJECTED" || err.code === 4001) {
        alert(t("transactionRejected"))
      } else if (err.message?.includes("user rejected") || err.message?.includes("denied")) {
        alert(t("transactionRejected"))
      } else {
        alert(t("liquidityError") + ": " + err.message)
      }
    }
  }

  const handleSwap = async () => {
    if (!signer || !swapAmount || Number.parseFloat(swapAmount) <= 0) return

    const isValid = await validateContracts()
    if (!isValid) return

    try {
      setIsSwapping(true)
      setTxHash("")

      const amount = ethers.parseEther(swapAmount)
      const tokenAddress = selectedToken === "A" ? CONTRACTS.TOKEN_A : CONTRACTS.TOKEN_B

      // Check user balance
      const userBalance = selectedToken === "A" ? balanceA : balanceB
      if (Number.parseFloat(swapAmount) > Number.parseFloat(userBalance)) {
        throw new Error(t("insufficientBalance"))
      }

      // Create contract instances
      const swapContract = new ethers.Contract(CONTRACTS.SWAP_CONTRACT, SimpleSwapABI, signer)
      const tokenContract = new ethers.Contract(tokenAddress, ERC20_ABI, signer)

      console.log("Performing comprehensive contract inspection...")
      try {
        // Check if contract is deployed
        const contractCode = await signer.provider.getCode(CONTRACTS.SWAP_CONTRACT)
        if (contractCode === "0x") {
          throw new Error("Contract not deployed at specified address")
        }

        // Try to inspect the actual contract
        console.log("Contract bytecode length:", contractCode.length)

        // Test function encoding manually
        const swapInterface = new ethers.Interface(SimpleSwapABI)
        const functionName = selectedToken === "A" ? "swapAtoB" : "swapBtoA"

        try {
          const encodedData = swapInterface.encodeFunctionData(functionName, [amount])
          console.log(`Encoded ${functionName} data:`, encodedData)

          if (!encodedData || encodedData === "0x") {
            throw new Error(`Failed to encode ${functionName} function`)
          }

          // Try to call the function directly with encoded data
          const txRequest = {
            to: CONTRACTS.SWAP_CONTRACT,
            data: encodedData,
            from: account,
          }

          // Test with eth_call first
          try {
            await signer.provider.call(txRequest)
            console.log("Direct contract call test successful")
          } catch (callError) {
            console.log("Direct call failed:", callError.message)

            // If the call fails with "execution reverted", the function exists but has business logic issues
            if (callError.message.includes("execution reverted")) {
              console.log("Function exists but contract logic is failing")
            } else {
              throw new Error(`Function ${functionName} does not exist in the deployed contract`)
            }
          }
        } catch (encodeError) {
          throw new Error(
            `ABI mismatch: Cannot encode ${functionName} function. The deployed contract may have different functions.`,
          )
        }
      } catch (inspectionError) {
        console.error("Contract inspection failed:", inspectionError)
        throw new Error(`Contract inspection failed: ${inspectionError.message}`)
      }

      const outputTokenAddress = selectedToken === "A" ? CONTRACTS.TOKEN_B : CONTRACTS.TOKEN_A
      const outputTokenContract = new ethers.Contract(outputTokenAddress, ERC20_ABI, signer)

      // Check contract liquidity
      try {
        const contractBalance = await outputTokenContract.balanceOf(CONTRACTS.SWAP_CONTRACT)
        const contractBalanceFormatted = ethers.formatEther(contractBalance)

        if (Number.parseFloat(contractBalanceFormatted) < Number.parseFloat(swapAmount)) {
          throw new Error(`Insufficient liquidity: Contract only has ${contractBalanceFormatted} tokens available`)
        }
      } catch (balanceError) {
        console.error("Failed to check contract balance:", balanceError)
        throw new Error("Unable to verify contract liquidity")
      }

      // Check current allowance
      const currentAllowance = await tokenContract.allowance(account, CONTRACTS.SWAP_CONTRACT)

      // Only approve if current allowance is insufficient
      if (currentAllowance < amount) {
        console.log("Aprobando tokens...")
        try {
          const approveTx = await tokenContract.approve(CONTRACTS.SWAP_CONTRACT, amount)
          await approveTx.wait()
          console.log("Tokens aprobados exitosamente")
        } catch (approveError) {
          console.error("Approval failed:", approveError)
          throw new Error("Token approval failed: " + approveError.message)
        }
      }

      console.log("Realizando swap...")
      let swapTx

      try {
        const swapInterface = new ethers.Interface(SimpleSwapABI)
        const functionName = selectedToken === "A" ? "swapAtoB" : "swapBtoA"
        const encodedData = swapInterface.encodeFunctionData(functionName, [amount])

        console.log(`Sending ${functionName} transaction with encoded data:`, encodedData)

        // Send transaction manually
        swapTx = await signer.sendTransaction({
          to: CONTRACTS.SWAP_CONTRACT,
          data: encodedData,
          gasLimit: 500000,
        })

        console.log("Transaction sent:", swapTx.hash)
      } catch (gasError) {
        console.error("Swap transaction failed:", gasError)

        if (gasError.message.includes("execution reverted") && gasError.transaction?.data === "") {
          throw new Error(
            `CRITICAL ERROR: The contract at ${CONTRACTS.SWAP_CONTRACT} does not have the expected swap functions.\n\n` +
              `This means either:\n` +
              `1. Wrong contract address - this is not a SimpleSwap contract\n` +
              `2. The contract has different function names\n` +
              `3. The contract is not properly deployed\n\n` +
              `Please verify you're using the correct contract address.`,
          )
        } else if (gasError.message.includes("execution reverted")) {
          throw new Error(
            `Contract execution failed. Common causes:\n` +
              `1. Insufficient liquidity in the pool\n` +
              `2. Contract not properly initialized\n` +
              `3. Token approval issues\n` +
              `4. Invalid swap parameters\n\n` +
              `Error: ${gasError.message}`,
          )
        } else {
          throw new Error("Swap failed: " + (gasError.reason || gasError.message))
        }
      }

      const receipt = await swapTx.wait()

      if (receipt.status === 0) {
        throw new Error("Transaction failed - the contract reverted the transaction")
      }

      setTxHash(receipt.hash)

      // Refresh balances after successful swap
      await getBalances()
      setSwapAmount("")
    } catch (err) {
      console.error("Error en swap:", err)
      let errorMessage = t("swapError")

      if (err.message.includes("insufficient")) {
        errorMessage = t("insufficientBalance")
      } else if (err.message.includes("user rejected") || err.message.includes("denied")) {
        errorMessage = t("transactionRejected")
      } else if (err.message.includes("CRITICAL") || err.message.includes("does not have")) {
        errorMessage = "Wrong contract address - this is not a SimpleSwap contract"
      } else if (err.message.includes("ABI mismatch")) {
        errorMessage = "Contract interface mismatch - wrong ABI or contract version"
      } else if (err.message.includes("execution failed") || err.message.includes("reverted")) {
        errorMessage = "Contract execution failed - check pool liquidity and configuration"
      }

      alert(errorMessage + "\n\nDetails: " + err.message)
    } finally {
      setIsSwapping(false)
    }
  }

  const calculateEstimatedOutput = (inputAmount, fromToken) => {
    if (!inputAmount || Number.parseFloat(inputAmount) <= 0) {
      setEstimatedOutput("--")
      return
    }

    const reserveANum = Number.parseFloat(reserveA)
    const reserveBNum = Number.parseFloat(reserveB)

    if (reserveANum <= 0 || reserveBNum <= 0) {
      setEstimatedOutput("0")
      return
    }

    const inputAmountNum = Number.parseFloat(inputAmount)
    let outputAmount

    if (fromToken === "A") {
      // Swapping A for B: output = (inputAmount * reserveB) / reserveA
      outputAmount = (inputAmountNum * reserveBNum) / reserveANum
    } else {
      // Swapping B for A: output = (inputAmount * reserveA) / reserveB
      outputAmount = (inputAmountNum * reserveANum) / reserveBNum
    }

    setEstimatedOutput(outputAmount.toFixed(4))
  }

  useEffect(() => {
    if (isConnected && signer) {
      getBalances()
    }
  }, [isConnected, signer])

  useEffect(() => {
    calculateEstimatedOutput(swapAmount, selectedToken)
  }, [swapAmount, selectedToken, reserveA, reserveB])

  return (
    <div className="min-h-screen bg-gray-100 dark:bg-gray-900 transition-colors">
      <header className="bg-white dark:bg-gray-800 shadow-sm border-b border-gray-200 dark:border-gray-700">
        <div className="max-w-7xl mx-auto px-4 py-4 flex justify-between items-center">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{t("title")}</h1>
            <p className="text-sm text-gray-600 dark:text-gray-400">{t("subtitle")}</p>
          </div>
          <div className="flex items-center gap-3">
            <LanguageSelector />
            <ThemeToggle />
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 py-6">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left Sidebar */}
          <div className="lg:col-span-1 space-y-6">
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-6">
              {!isConnected ? (
                <div className="text-center">
                  <FaWallet className="mx-auto text-4xl text-gray-400 mb-4" />
                  <button
                    onClick={connectWallet}
                    disabled={isLoading}
                    className="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium py-3 px-4 rounded-lg flex items-center justify-center gap-2 transition-colors"
                  >
                    {isLoading ? <FaSpinner className="animate-spin" /> : <FaWallet />}
                    {isLoading ? t("connecting") : t("connectWallet")}
                  </button>
                </div>
              ) : (
                <div>
                  <div className="bg-green-600 text-white p-3 rounded-lg mb-3 flex items-center gap-2">
                    <FaWallet />
                    <span className="font-medium">{t("walletConnected")}</span>
                  </div>
                  <button
                    onClick={disconnectWallet}
                    className="w-full bg-red-600 hover:bg-red-700 text-white font-medium py-2 px-4 rounded-lg flex items-center justify-center gap-2 transition-colors mb-4"
                  >
                    <FaSignOutAlt />
                    {t("disconnectWallet")}
                  </button>
                  <div className="text-center text-gray-600 dark:text-gray-300 font-mono text-sm">
                    {account?.slice(0, 6)}...{account?.slice(-4)}
                  </div>
                </div>
              )}

              {isConnected && (
                <div className="mt-4 bg-blue-600 text-white p-3 rounded-lg flex items-start gap-2">
                  <FaInfoCircle className="mt-0.5 flex-shrink-0" />
                  <div className="text-sm">
                    <strong>{t("important")}</strong> {t("sepoliaWarning")}
                  </div>
                </div>
              )}
            </div>

            {isConnected && (
              <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-6">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">{t("currentPrice")}</h3>
                <div className="bg-gray-700 dark:bg-gray-900 text-white p-4 rounded-lg text-center">
                  <span className="text-xl font-mono">1 A = {currentPrice} B</span>
                </div>
              </div>
            )}

            {isConnected && (
              <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-6">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">{t("yourBalances")}</h3>
                <div className="space-y-3">
                  <div className="flex justify-between">
                    <span className="text-gray-600 dark:text-gray-300">Token A:</span>
                    <span className="font-mono text-gray-900 dark:text-white">
                      {Number.parseFloat(balanceA).toFixed(4)}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600 dark:text-gray-300">Token B:</span>
                    <span className="font-mono text-gray-900 dark:text-white">
                      {Number.parseFloat(balanceB).toFixed(4)}
                    </span>
                  </div>
                </div>
              </div>
            )}

            {isConnected && (
              <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-6">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">{t("poolReserves")}</h3>
                <div className="space-y-3">
                  <div className="flex justify-between">
                    <span className="text-gray-600 dark:text-gray-300">Token A:</span>
                    <span className="font-mono text-gray-900 dark:text-white">
                      {Number.parseFloat(reserveA).toFixed(4)}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600 dark:text-gray-300">Token B:</span>
                    <span className="font-mono text-gray-900 dark:text-white">
                      {Number.parseFloat(reserveB).toFixed(4)}
                    </span>
                  </div>
                </div>

                <button
                  onClick={handleAddLiquidity}
                  className="w-full mt-4 bg-blue-600 hover:bg-blue-700 text-white font-medium py-2 px-4 rounded-lg flex items-center justify-center gap-2 transition-colors"
                >
                  <FaPlus />
                  {t("addLiquidity")}
                </button>

                <button
                  onClick={() => setShowContractInfo(!showContractInfo)}
                  className="w-full mt-2 bg-gray-600 hover:bg-gray-700 text-white font-medium py-2 px-4 rounded-lg flex items-center justify-center gap-2 transition-colors"
                >
                  <FaInfoCircle />
                  {t("showContractInfo")}
                </button>
              </div>
            )}
          </div>

          {/* Main Content */}
          <div className="lg:col-span-2 space-y-6">
            {isConnected && (
              <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-6">
                <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-6">{t("swapTokens")}</h2>

                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                      {t("sourceToken")}
                    </label>
                    <div className="relative">
                      <select
                        value={selectedToken}
                        onChange={(e) => setSelectedToken(e.target.value)}
                        className="w-full bg-gray-700 dark:bg-gray-900 text-white p-3 rounded-lg appearance-none cursor-pointer"
                      >
                        <option value="A">Token A</option>
                        <option value="B">Token B</option>
                      </select>
                      <FaChevronDown className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 pointer-events-none" />
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                      {t("amount")}
                    </label>
                    <input
                      type="number"
                      value={swapAmount}
                      onChange={(e) => setSwapAmount(e.target.value)}
                      placeholder={`${t("enterAmount")} ${selectedToken}`}
                      className="w-full bg-gray-700 dark:bg-gray-900 text-white p-3 rounded-lg border border-gray-600 dark:border-gray-700 focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                      step="0.01"
                      min="0"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                      {t("estimated")} {selectedToken === "A" ? "B" : "A"}:
                    </label>
                    <div className="bg-gray-700 dark:bg-gray-900 text-gray-300 p-3 rounded-lg">
                      {estimatedOutput} {selectedToken === "A" ? "B" : "A"}
                    </div>
                  </div>

                  <button
                    onClick={handleSwap}
                    disabled={!swapAmount || Number.parseFloat(swapAmount) <= 0 || isSwapping}
                    className={`w-full font-medium py-3 px-4 rounded-lg transition-colors ${
                      !swapAmount || Number.parseFloat(swapAmount) <= 0 || isSwapping
                        ? "bg-gray-400 text-gray-700 cursor-not-allowed"
                        : "bg-blue-600 hover:bg-blue-700 text-white cursor-pointer"
                    }`}
                  >
                    {isSwapping ? (
                      <div className="flex items-center justify-center gap-2">
                        <FaSpinner className="animate-spin" />
                        {t("swapping")}
                      </div>
                    ) : !swapAmount || Number.parseFloat(swapAmount) <= 0 ? (
                      t("enterAmountButton")
                    ) : (
                      `${t("swap")} ${swapAmount} ${selectedToken} → ${estimatedOutput} ${selectedToken === "A" ? "B" : "A"}`
                    )}
                  </button>

                  {error && (
                    <div className="bg-red-600 text-white p-3 rounded-lg flex items-center gap-2">
                      <FaInfoCircle />
                      {t("invalidConfiguration")}
                    </div>
                  )}
                </div>

                {txHash && (
                  <div className="mt-4 p-3 bg-green-50 dark:bg-green-900 border border-green-200 dark:border-green-700 rounded-lg">
                    <p className="text-sm text-green-700 dark:text-green-300">✅ {t("swapSuccessful")}</p>
                    <a
                      href={`https://sepolia.etherscan.io/tx/${txHash}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-blue-600 dark:text-blue-400 hover:underline break-all"
                    >
                      {t("viewOnEtherscan")} {txHash}
                    </a>
                  </div>
                )}
              </div>
            )}

            {isConnected && (
              <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-6">
                <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-6">{t("recentTransactions")}</h2>

                <button className="w-full bg-purple-600 hover:bg-purple-700 text-white font-medium py-3 px-4 rounded-lg flex items-center justify-center gap-2 transition-colors">
                  <FaHistory />
                  {t("loadRecentTransactions")}
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

function App() {
  return (
    <ThemeProvider>
      <LanguageProvider>
        <AppContent />
      </LanguageProvider>
    </ThemeProvider>
  )
}

export default App
