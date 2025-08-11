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

  // Función para detectar y limpiar wallets conflictivas
  function detectWalletIssues() {
    console.log("Detectando configuración de wallets...")

    if (!window.ethereum) {
      return { hasWallet: false, issue: "No wallet detected" }
    }

    // Detectar múltiples wallets
    if (window.ethereum.providers && window.ethereum.providers.length > 1) {
      console.log("Múltiples wallets detectadas:", window.ethereum.providers.length)

      // Buscar MetaMask específicamente
      const metamaskProvider = window.ethereum.providers.find(
        (provider) => provider.isMetaMask && !provider.isCoreWallet,
      )

      if (metamaskProvider) {
        console.log("Seleccionando MetaMask...")
        return { hasWallet: true, provider: metamaskProvider, issue: null }
      } else {
        return { hasWallet: true, issue: "MetaMask not found among multiple wallets" }
      }
    }

    // Wallet única
    if (window.ethereum.isCoreWallet) {
      return { hasWallet: true, issue: "CoreWallet detected - may cause conflicts" }
    }

    if (window.ethereum.isMetaMask) {
      return { hasWallet: true, provider: window.ethereum, issue: null }
    }

    return { hasWallet: true, provider: window.ethereum, issue: "Unknown wallet type" }
  }

  // Conexión ultra-simplificada
  async function connectWallet() {
    if (isConnecting) return

    setIsConnecting(true)
    setSwapStatus("")

    try {
      console.log("=== INICIANDO CONEXIÓN ===")

      // Detectar problemas de wallet
      const walletCheck = detectWalletIssues()
      console.log("Wallet check result:", walletCheck)

      if (!walletCheck.hasWallet) {
        alert("❌ No se detectó MetaMask. Por favor instala MetaMask.")
        return
      }

      if (walletCheck.issue) {
        console.warn("Wallet issue:", walletCheck.issue)
        if (walletCheck.issue.includes("CoreWallet")) {
          alert(
            "⚠️ CoreWallet detectada. Esta aplicación funciona mejor con MetaMask. Si tienes problemas, desactiva CoreWallet temporalmente.",
          )
        }
      }

      // Usar el provider correcto
      const targetProvider = walletCheck.provider || window.ethereum
      console.log("Using provider:", targetProvider)

      // Solicitar cuentas usando solo la API nativa
      console.log("Solicitando cuentas...")
      const accounts = await targetProvider.request({
        method: "eth_requestAccounts",
      })

      console.log("Cuentas recibidas:", accounts)

      if (!accounts || accounts.length === 0) {
        throw new Error("No se obtuvieron cuentas")
      }

      // Establecer cuenta
      setAccount(accounts[0])
      console.log("✅ Cuenta establecida:", accounts[0])

      // Verificar red
      console.log("Verificando red...")
      const chainId = await targetProvider.request({ method: "eth_chainId" })
      console.log("Red actual:", chainId)

      if (chainId !== "0xaa36a7") {
        console.log("Red incorrecta, intentando cambiar a Sepolia...")
        setSwapStatus("🔄 Cambiando a red Sepolia...")

        try {
          await targetProvider.request({
            method: "wallet_switchEthereumChain",
            params: [{ chainId: "0xaa36a7" }],
          })
          console.log("✅ Cambiado a Sepolia")
        } catch (switchError) {
          console.log("Error cambiando red:", switchError)
          if (switchError.code === 4902) {
            console.log("Agregando red Sepolia...")
            try {
              await targetProvider.request({
                method: "wallet_addEthereumChain",
                params: [
                  {
                    chainId: "0xaa36a7",
                    chainName: "Sepolia Test Network",
                    nativeCurrency: { name: "SepoliaETH", symbol: "ETH", decimals: 18 },
                    rpcUrls: ["https://sepolia.infura.io/v3/"],
                    blockExplorerUrls: ["https://sepolia.etherscan.io/"],
                  },
                ],
              })
              console.log("✅ Red Sepolia agregada")
            } catch (addError) {
              console.error("Error agregando Sepolia:", addError)
              alert("❌ No se pudo agregar la red Sepolia. Por favor agrégala manualmente en MetaMask.")
              return
            }
          } else {
            alert("⚠️ Por favor cambia manualmente a la red Sepolia en MetaMask.")
            return
          }
        }
      }

      setSwapStatus("✅ Wallet conectada exitosamente!")
      console.log("=== CONEXIÓN COMPLETADA ===")
    } catch (error) {
      console.error("=== ERROR EN CONEXIÓN ===")
      console.error("Error completo:", error)
      console.error("Error code:", error.code)
      console.error("Error message:", error.message)

      let errorMessage = "Error desconocido"

      if (error.code === 4001) {
        errorMessage = "Conexión rechazada por el usuario"
      } else if (error.code === -32002) {
        errorMessage = "Ya hay una solicitud pendiente. Revisa MetaMask."
      } else if (error.message) {
        errorMessage = error.message
      }

      setSwapStatus(`❌ Error conectando: ${errorMessage}`)
      alert(`❌ Error conectando: ${errorMessage}`)
    } finally {
      setIsConnecting(false)
    }
  }

  // Función para desconectar wallet
  async function disconnectWallet() {
    try {
      console.log("Desconectando wallet...")

      // Limpiar todos los estados
      setAccount(null)
      setBalances({ A: "0", B: "0" })
      setReserves({ A: "0", B: "0" })
      setAllowances({ A: "0", B: "0" })
      setPrice(null)
      setContractIssues([])
      setSwapStatus("")
      setSwapTxHash("")
      setAmountIn("")
      setEstimatedOut("")

      // Limpiar localStorage
      localStorage.removeItem("walletconnect")
      localStorage.removeItem("WALLETCONNECT_DEEPLINK_CHOICE")

      console.log("✅ Wallet desconectada")
      setSwapStatus("✅ Wallet desconectada. Refresca la página para reconectar.")

      // Recargar después de 2 segundos
      setTimeout(() => {
        window.location.reload()
      }, 2000)
    } catch (error) {
      console.error("Error desconectando:", error)
      window.location.reload()
    }
  }

  // Verificar conexión existente al cargar la página
  useEffect(() => {
    async function checkExistingConnection() {
      if (!window.ethereum) return

      try {
        const accounts = await window.ethereum.request({ method: "eth_accounts" })
        if (accounts && accounts.length > 0) {
          console.log("Conexión existente encontrada:", accounts[0])
          setAccount(accounts[0])

          // Verificar red
          const chainId = await window.ethereum.request({ method: "eth_chainId" })
          if (chainId !== "0xaa36a7") {
            setContractIssues([
              {
                type: "error",
                title: "Red Incorrecta",
                description: `Estás en ${chainId} pero necesitas Sepolia (0xaa36a7)`,
                solution: "Cambia a Sepolia testnet en MetaMask.",
              },
            ])
          }
        }
      } catch (error) {
        console.error("Error verificando conexión existente:", error)
      }
    }

    checkExistingConnection()
  }, [])

  // Cargar datos del contrato cuando hay cuenta
  useEffect(() => {
    if (!account) return

    async function loadData() {
      try {
        console.log("Cargando datos del contrato...")
        setSwapStatus("🔄 Verificando configuración...")

        // Primero verificar que todo esté configurado correctamente
        const isValid = await verifyContractSetup()
        if (!isValid) {
          setSwapStatus("❌ Configuración inválida - revisa las direcciones de contratos")
          return
        }

        setSwapStatus("🔄 Cargando datos del contrato...")

        // Crear provider temporal
        const provider = new ethers.BrowserProvider(window.ethereum)
        const swap = new ethers.Contract(SWAP_CONTRACT_ADDRESS, simpleSwapAbi, provider)
        const issues = []

        // Cargar contratos de tokens
        const tokenAContract = new ethers.Contract(TOKEN_A_ADDRESS, erc20Abi, provider)
        const tokenBContract = new ethers.Contract(TOKEN_B_ADDRESS, erc20Abi, provider)

        // Cargar nombres de tokens con validación
        try {
          console.log("Cargando nombres de tokens...")

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

          console.log("Nombres de tokens cargados:", { A: `${nameA} (${symbolA})`, B: `${nameB} (${symbolB})` })
        } catch (error) {
          console.error("Error loading token names:", error)
          setTokenNames({ A: "Token A (TKA)", B: "Token B (TKB)" })
        }

        // Cargar balances y allowances con validación
        try {
          console.log("Verificando contratos de tokens...")

          // Verificar que los contratos existan
          const [codeA, codeB] = await Promise.all([
            provider.getCode(TOKEN_A_ADDRESS),
            provider.getCode(TOKEN_B_ADDRESS),
          ])

          if (codeA === "0x") {
            issues.push({
              type: "error",
              title: "Token A No Encontrado",
              description: `El contrato en ${TOKEN_A_ADDRESS} no existe o no está desplegado.`,
              solution: "Verifica la dirección del Token A en el archivo .env",
            })
          }

          if (codeB === "0x") {
            issues.push({
              type: "error",
              title: "Token B No Encontrado",
              description: `El contrato en ${TOKEN_B_ADDRESS} no existe o no está desplegado.`,
              solution: "Verifica la dirección del Token B en el archivo .env",
            })
          }

          // Solo intentar cargar balances si los contratos existen
          if (codeA !== "0x" && codeB !== "0x") {
            console.log("Cargando balances de tokens...")

            const [balA, balB, allowanceA, allowanceB] = await Promise.all([
              tokenAContract.balanceOf(account).catch((err) => {
                console.error("Error getting balance A:", err)
                return 0n
              }),
              tokenBContract.balanceOf(account).catch((err) => {
                console.error("Error getting balance B:", err)
                return 0n
              }),
              tokenAContract.allowance(account, SWAP_CONTRACT_ADDRESS).catch((err) => {
                console.error("Error getting allowance A:", err)
                return 0n
              }),
              tokenBContract.allowance(account, SWAP_CONTRACT_ADDRESS).catch((err) => {
                console.error("Error getting allowance B:", err)
                return 0n
              }),
            ])

            setBalances({
              A: ethers.formatEther(balA),
              B: ethers.formatEther(balB),
            })

            setAllowances({
              A: ethers.formatEther(allowanceA),
              B: ethers.formatEther(allowanceB),
            })

            if (balA === 0n && balB === 0n) {
              issues.push({
                type: "warning",
                title: "Sin Tokens",
                description: "No tienes tokens para hacer swap.",
                solution: "Consigue tokens de prueba de un faucet o verifica que estés en la red correcta.",
              })
            }
          } else {
            // Si los contratos no existen, establecer valores por defecto
            setBalances({ A: "0", B: "0" })
            setAllowances({ A: "0", B: "0" })
          }
        } catch (error) {
          console.error("Error loading balances:", error)
          setBalances({ A: "0", B: "0" })
          setAllowances({ A: "0", B: "0" })
          issues.push({
            type: "error",
            title: "Error Cargando Tokens",
            description: "No se pudieron cargar los balances de tokens: " + error.message,
            solution: "Verifica que las direcciones de tokens sean correctas y estés en Sepolia.",
          })
        }

        // Cargar reservas
        try {
          const [reserveA, reserveB] = await swap.getReserves(TOKEN_A_ADDRESS, TOKEN_B_ADDRESS)
          setReserves({
            A: ethers.formatEther(reserveA),
            B: ethers.formatEther(reserveB),
          })

          if (reserveA === 0n && reserveB === 0n) {
            issues.push({
              type: "error",
              title: "Sin Liquidez",
              description: "El pool no tiene liquidez.",
              solution: "Agrega liquidez al pool primero.",
            })
          }
        } catch (error) {
          console.error("Error loading reserves:", error)
          issues.push({
            type: "error",
            title: "Error Cargando Reservas",
            description: "No se pudieron cargar las reservas del pool.",
            solution: "Verifica que el contrato esté desplegado correctamente.",
          })
        }

        // Cargar precio
        try {
          const rawPrice = await swap.getPrice(TOKEN_A_ADDRESS, TOKEN_B_ADDRESS)
          setPrice(ethers.formatEther(rawPrice))

          if (rawPrice === 0n) {
            issues.push({
              type: "warning",
              title: "Precio Cero",
              description: "El precio es 0, indica falta de liquidez.",
              solution: "Agrega liquidez al pool.",
            })
          }
        } catch (error) {
          console.error("Error loading price:", error)
          setPrice("0")
          issues.push({
            type: "error",
            title: "Error Cargando Precio",
            description: "No se pudo obtener el precio del contrato.",
            solution: "Agrega liquidez al pool primero.",
          })
        }

        setContractIssues(issues)
        setSwapStatus("✅ Datos cargados correctamente")

        // Limpiar mensaje después de 3 segundos
        setTimeout(() => setSwapStatus(""), 3000)
      } catch (error) {
        console.error("Error loading data:", error)
        setSwapStatus("❌ Error cargando datos del contrato: " + error.message)
      }
    }

    loadData()
  }, [account, swapTxHash])

  // Función para verificar la configuración del contrato
  async function verifyContractSetup() {
    try {
      console.log("=== VERIFICANDO CONFIGURACIÓN ===")
      const provider = new ethers.BrowserProvider(window.ethereum)

      // Verificar red actual
      const network = await provider.getNetwork()
      console.log("Red actual:", network.name, "ChainId:", network.chainId.toString())

      if (network.chainId !== 11155111n) {
        // Sepolia chainId
        console.warn("⚠️ No estás en Sepolia testnet")
        setContractIssues([
          {
            type: "error",
            title: "Red Incorrecta",
            description: `Estás en ${network.name} (${network.chainId}) pero necesitas Sepolia (11155111)`,
            solution: "Cambia a Sepolia testnet en MetaMask.",
          },
        ])
        return false
      }

      // Verificar contratos
      console.log("Verificando contratos...")
      const [swapCode, tokenACode, tokenBCode] = await Promise.all([
        provider.getCode(SWAP_CONTRACT_ADDRESS),
        provider.getCode(TOKEN_A_ADDRESS),
        provider.getCode(TOKEN_B_ADDRESS),
      ])

      console.log("Swap contract code length:", swapCode.length)
      console.log("Token A code length:", tokenACode.length)
      console.log("Token B code length:", tokenBCode.length)

      const issues = []

      if (swapCode === "0x") {
        issues.push({
          type: "error",
          title: "Contrato Swap No Encontrado",
          description: `El contrato SimpleSwap en ${SWAP_CONTRACT_ADDRESS} no existe.`,
          solution: "Verifica la dirección del contrato en el archivo .env",
        })
      }

      if (tokenACode === "0x") {
        issues.push({
          type: "error",
          title: "Token A No Encontrado",
          description: `El Token A en ${TOKEN_A_ADDRESS} no existe.`,
          solution: "Verifica la dirección del Token A en el archivo .env",
        })
      }

      if (tokenBCode === "0x") {
        issues.push({
          type: "error",
          title: "Token B No Encontrado",
          description: `El Token B en ${TOKEN_B_ADDRESS} no existe.`,
          solution: "Verifica la dirección del Token B en el archivo .env",
        })
      }

      if (issues.length > 0) {
        setContractIssues(issues)
        return false
      }

      console.log("✅ Todos los contratos verificados correctamente")
      return true
    } catch (error) {
      console.error("Error verificando contratos:", error)
      setContractIssues([
        {
          type: "error",
          title: "Error de Verificación",
          description: "No se pudo verificar la configuración de contratos: " + error.message,
          solution: "Verifica tu conexión y que estés en Sepolia testnet.",
        },
      ])
      return false
    }
  }

  // Estimar output
  async function onInChange(e) {
    const val = e.target.value
    setAmountIn(val)
    setSwapStatus("")
    setSwapTxHash("")

    if (!val || !account) {
      setEstimatedOut("")
      return
    }

    try {
      const provider = new ethers.BrowserProvider(window.ethereum)
      const swap = new ethers.Contract(SWAP_CONTRACT_ADDRESS, simpleSwapAbi, provider)

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
        setEstimatedOut("Sin liquidez")
        return
      }

      const amountInWei = ethers.parseEther(val)
      const estimatedOutWei = await swap.getAmountOut(amountInWei, reserveIn, reserveOut)
      setEstimatedOut(ethers.formatEther(estimatedOutWei))
    } catch (error) {
      console.error("Error estimating output:", error)
      setEstimatedOut("Error calculando")
    }
  }

  // Agregar liquidez
  async function addLiquidity() {
    if (!account) return
    setSwapStatus("Agregando liquidez al pool...")

    try {
      const provider = new ethers.BrowserProvider(window.ethereum)
      const signer = await provider.getSigner()
      const swap = new ethers.Contract(SWAP_CONTRACT_ADDRESS, simpleSwapAbi, signer)

      const tokenAContract = new ethers.Contract(TOKEN_A_ADDRESS, erc20Abi, signer)
      const tokenBContract = new ethers.Contract(TOKEN_B_ADDRESS, erc20Abi, signer)

      const liquidityAmount = ethers.parseEther("100")

      // Verificar balances
      const userBalA = await tokenAContract.balanceOf(account)
      const userBalB = await tokenBContract.balanceOf(account)

      if (userBalA < liquidityAmount) {
        setSwapStatus(`❌ Balance insuficiente Token A. Tienes ${ethers.formatEther(userBalA)} pero necesitas 100`)
        return
      }

      if (userBalB < liquidityAmount) {
        setSwapStatus(`❌ Balance insuficiente Token B. Tienes ${ethers.formatEther(userBalB)} pero necesitas 100`)
        return
      }

      // Aprobar tokens
      setSwapStatus("Aprobando Token A...")
      const approveATx = await tokenAContract.approve(SWAP_CONTRACT_ADDRESS, liquidityAmount)
      await approveATx.wait()

      setSwapStatus("Aprobando Token B...")
      const approveBTx = await tokenBContract.approve(SWAP_CONTRACT_ADDRESS, liquidityAmount)
      await approveBTx.wait()

      // Agregar liquidez
      setSwapStatus("Agregando liquidez...")
      const tx = await swap.addLiquidity(
        TOKEN_A_ADDRESS,
        TOKEN_B_ADDRESS,
        liquidityAmount,
        liquidityAmount,
        ethers.parseEther("90"),
        ethers.parseEther("90"),
        account,
        Math.floor(Date.now() / 1000) + 3600,
      )

      await tx.wait()
      setSwapStatus("✅ Liquidez agregada exitosamente!")
      setSwapTxHash(tx.hash)
    } catch (error) {
      console.error("Add liquidity error:", error)
      setSwapStatus("❌ Error agregando liquidez: " + error.message)
    }
  }

  // Realizar swap
  async function doSwap() {
    if (!estimatedOut || !account || estimatedOut === "Sin liquidez" || estimatedOut === "Error calculando") return

    const inputAddr = inputToken === "A" ? TOKEN_A_ADDRESS : TOKEN_B_ADDRESS
    const outputAddr = inputToken === "A" ? TOKEN_B_ADDRESS : TOKEN_A_ADDRESS
    const inWei = ethers.parseEther(amountIn)

    setSwapStatus("Preparando swap...")
    setSwapTxHash("")

    try {
      const provider = new ethers.BrowserProvider(window.ethereum)
      const signer = await provider.getSigner()

      // Verificar allowance
      const currentAllowance = Number.parseFloat(allowances[inputToken])
      const requiredAmount = Number.parseFloat(amountIn)

      if (currentAllowance < requiredAmount) {
        setSwapStatus("Aprobando tokens...")
        const approval = new ethers.Contract(inputAddr, erc20Abi, signer)
        const approveTx = await approval.approve(SWAP_CONTRACT_ADDRESS, inWei)
        await approveTx.wait()
      }

      setSwapStatus("Ejecutando swap...")
      const swapContract = new ethers.Contract(SWAP_CONTRACT_ADDRESS, simpleSwapAbi, signer)

      const estimatedOutWei = ethers.parseEther(estimatedOut)
      const minAmountOut = (estimatedOutWei * 95n) / 100n // 5% slippage

      const tx = await swapContract.swapExactTokensForTokens(
        inWei,
        minAmountOut,
        [inputAddr, outputAddr],
        account,
        Math.floor(Date.now() / 1000) + 3600,
      )

      setSwapStatus("Confirmando transacción...")
      const receipt = await tx.wait()
      setSwapStatus("✅ Swap completado exitosamente!")
      setSwapTxHash(receipt.transactionHash)
    } catch (err) {
      console.error("Swap error:", err)
      setSwapStatus("❌ Swap falló: " + (err.message || "Error desconocido"))
    }
  }

  // Obtener transacciones recientes
  async function fetchRecentTxs() {
    setTxStatus("Cargando...")
    setRecentTxs([])

    try {
      if (!ETHERSCAN_API_KEY) {
        setTxStatus("Falta VITE_ETHERSCAN_API_KEY en .env")
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
      setTxStatus("Error cargando: " + err.message)
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
                  Contrato: {SWAP_CONTRACT_ADDRESS?.slice(0, 6)}...{SWAP_CONTRACT_ADDRESS?.slice(-4)}
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
                  <h3 className="text-lg font-semibold text-yellow-800 dark:text-yellow-200 mb-3">Estado del Pool</h3>
                  <div className="space-y-3">
                    {contractIssues.map((issue, index) => (
                      <div key={index} className="border-l-4 border-yellow-400 pl-4">
                        <h4 className="font-medium text-yellow-800 dark:text-yellow-200">{issue.title}</h4>
                        <p className="text-sm text-yellow-700 dark:text-yellow-300 mt-1">{issue.description}</p>
                        <p className="text-sm text-yellow-600 dark:text-yellow-400 mt-1">
                          <strong>Solución:</strong> {issue.solution}
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
                {!account ? (
                  <button
                    onClick={connectWallet}
                    disabled={isConnecting}
                    className={`w-full py-3 px-4 rounded-lg font-medium transition-colors ${
                      isConnecting
                        ? "bg-gray-400 cursor-not-allowed text-white"
                        : "bg-blue-600 hover:bg-blue-700 text-white"
                    }`}
                  >
                    {isConnecting ? "🔄 Conectando..." : "🦊 Conectar MetaMask"}
                  </button>
                ) : (
                  <div className="space-y-2">
                    <button
                      className="w-full py-3 px-4 rounded-lg font-medium bg-green-100 dark:bg-green-900 text-green-800 dark:text-green-200 border border-green-200 dark:border-green-700"
                      disabled
                    >
                      ✅ Wallet Conectada
                    </button>
                    <button
                      onClick={disconnectWallet}
                      className="w-full py-2 px-3 rounded-lg font-medium bg-red-600 hover:bg-red-700 text-white text-sm transition-colors"
                    >
                      🔌 Desconectar Wallet
                    </button>
                  </div>
                )}

                {account && (
                  <div className="mt-4 p-3 bg-blue-50 dark:bg-blue-900 rounded-lg">
                    <p className="text-xs text-blue-800 dark:text-blue-200">
                      <strong>⚠️ Importante:</strong> Esta aplicación funciona solo en Sepolia testnet.
                    </p>
                  </div>
                )}

                {account && (
                  <p className="mt-2 text-sm text-gray-600 dark:text-gray-400 text-center">
                    {account.slice(0, 6)}...{account.slice(-4)}
                  </p>
                )}
              </div>

              <div className="mb-6">
                <h3 className="text-lg font-semibold mb-3 text-gray-900 dark:text-gray-100">Precio Actual</h3>
                <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-3">
                  <p className="text-sm font-mono">
                    1 {inputToken} ≈ {price || "0"} {outputToken}
                  </p>
                </div>
              </div>

              <div className="mb-6">
                <h3 className="text-lg font-semibold mb-3 text-gray-900 dark:text-gray-100">Tus Balances</h3>
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
                <h3 className="text-lg font-semibold mb-3 text-gray-900 dark:text-gray-100">Reservas del Pool</h3>
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
                  💧 Agregar Liquidez (100 c/u)
                </button>
                <button
                  onClick={() => setShowContractInfo(!showContractInfo)}
                  className="w-full py-2 px-3 bg-gray-600 hover:bg-gray-700 text-white rounded-lg text-sm font-medium transition-colors"
                >
                  <FiInfo className="inline mr-1" />
                  {showContractInfo ? "Ocultar" : "Mostrar"} Info Contrato
                </button>
              </div>

              {showContractInfo && (
                <div className="mt-4 p-4 bg-gray-50 dark:bg-gray-700 rounded-lg text-xs">
                  <h4 className="font-semibold mb-2">Detalles del Contrato:</h4>
                  <p className="mb-1">
                    <strong>Dirección:</strong> {SWAP_CONTRACT_ADDRESS}
                  </p>
                  <p className="mb-1">
                    <strong>Token A:</strong> {TOKEN_A_ADDRESS}
                  </p>
                  <p className="mb-1">
                    <strong>Token B:</strong> {TOKEN_B_ADDRESS}
                  </p>
                  <p className="text-gray-600 dark:text-gray-400 mt-2">
                    Este es un AMM estilo Uniswap V2 con comisiones del 0.3%. Requiere liquidez antes de poder hacer
                    swaps.
                  </p>
                </div>
              )}
            </div>
          </aside>

          <main className="lg:col-span-2">
            <div className="space-y-8">
              <section>
                <h2 className="text-2xl font-bold mb-6 text-gray-900 dark:text-gray-100">Intercambiar Tokens</h2>
                <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-6">
                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                        Token Origen
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
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                        Cantidad
                      </label>
                      <input
                        type="number"
                        placeholder={`Ingresa cantidad de ${tokenNames[inputToken]}`}
                        value={amountIn}
                        onChange={onInChange}
                        className="w-full p-3 border border-gray-300 dark:border-gray-600 rounded-lg bg-transparent focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      />
                    </div>

                    <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-3">
                      <p className="text-sm text-gray-600 dark:text-gray-400">
                        Estimado {tokenNames[outputToken]}: <span className="font-mono">{estimatedOut || "–"}</span>
                      </p>
                      {estimatedOut && !["Sin liquidez", "Error calculando", "–"].includes(estimatedOut) && (
                        <p className="text-xs text-gray-500 dark:text-gray-500 mt-1">
                          Mínimo recibido (5% slippage): {(Number.parseFloat(estimatedOut) * 0.95).toFixed(6)}
                        </p>
                      )}
                    </div>

                    <button
                      onClick={doSwap}
                      disabled={
                        !estimatedOut ||
                        !account ||
                        estimatedOut === "Sin liquidez" ||
                        estimatedOut === "Error calculando"
                      }
                      className="w-full py-3 px-4 bg-green-600 hover:bg-green-700 disabled:bg-gray-400 disabled:cursor-not-allowed text-white rounded-lg font-medium transition-colors"
                    >
                      {!account
                        ? "Conectar Wallet"
                        : !estimatedOut || estimatedOut === "–"
                          ? "Ingresa Cantidad"
                          : estimatedOut === "Sin liquidez"
                            ? "Sin Liquidez - Agrega Liquidez Primero"
                            : estimatedOut === "Error calculando"
                              ? "No se Puede Calcular - Verifica Pool"
                              : "Intercambiar Tokens"}
                    </button>

                    {swapStatus && (
                      <div
                        className={`mt-4 p-3 rounded-lg ${
                          swapStatus.includes("❌") || swapStatus.includes("falló")
                            ? "bg-red-50 dark:bg-red-900"
                            : swapStatus.includes("✅") || swapStatus.includes("exitosamente")
                              ? "bg-green-50 dark:bg-green-900"
                              : "bg-blue-50 dark:bg-blue-900"
                        }`}
                      >
                        <p
                          className={`text-sm whitespace-pre-line ${
                            swapStatus.includes("❌") || swapStatus.includes("falló")
                              ? "text-red-800 dark:text-red-200"
                              : swapStatus.includes("✅") || swapStatus.includes("exitosamente")
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
                          Ver transacción en Etherscan →
                        </a>
                      </div>
                    )}
                  </div>
                </div>
              </section>

              <section>
                <h2 className="text-2xl font-bold mb-6 text-gray-900 dark:text-gray-100">Transacciones Recientes</h2>
                <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-6">
                  <button
                    onClick={fetchRecentTxs}
                    className="mb-4 py-2 px-4 bg-purple-600 hover:bg-purple-700 text-white rounded-lg font-medium transition-colors"
                  >
                    Cargar Transacciones Recientes
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
