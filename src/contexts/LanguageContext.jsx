"use client"

import { createContext, useContext, useState } from "react"

const LanguageContext = createContext()

export const useLanguage = () => {
  const context = useContext(LanguageContext)
  if (!context) {
    throw new Error("useLanguage must be used within a LanguageProvider")
  }
  return context
}

const translations = {
  es: {
    // Header
    title: "SimpleSwap UI",
    subtitle: "Intercambia tokens en Sepolia testnet",

    // Wallet Connection
    connectWallet: "Conectar MetaMask",
    connecting: "Conectando...",
    walletConnected: "Wallet Conectada",
    disconnectWallet: "Desconectar Wallet",
    important: "Importante:",
    sepoliaWarning: "Esta aplicación funciona solo en Sepolia testnet.",

    // Price & Balances
    currentPrice: "Precio Actual",
    yourBalances: "Tus Balances",
    poolReserves: "Reservas del Pool",
    addLiquidity: "Agregar Liquidez",
    showContractInfo: "Mostrar Info Contrato",

    // Swap Interface
    swapTokens: "Intercambiar Tokens",
    sourceToken: "Token Origen",
    amount: "Cantidad",
    enterAmount: "Ingresa cantidad de Token",
    estimated: "Estimado Token",
    enterAmountButton: "Ingresa Cantidad",
    swapping: "Intercambiando...",

    // Transactions
    recentTransactions: "Transacciones Recientes",
    loadRecentTransactions: "Cargar Transacciones Recientes",
    swapSuccessful: "Swap exitoso!",
    viewOnEtherscan: "Ver en Etherscan:",

    // Liquidity
    enterAmountA: "Ingresa cantidad de Token A",
    enterAmountB: "Ingresa cantidad de Token B",
    insufficientTokenA: "Balance insuficiente de Token A",
    insufficientTokenB: "Balance insuficiente de Token B",
    liquidityAdded: "Liquidez agregada exitosamente",
    liquidityError: "Error al agregar liquidez",

    // Errors
    invalidConfiguration: "Configuración inválida - revisa las direcciones de contratos",
    swapError: "Error en el swap:",
    insufficientBalance: "Balance insuficiente",
    tokenContractNotFound: "Contrato de token no encontrado",
    contractCallFailed: "Llamada al contrato falló",
    transactionRejected: "Transacción rechazada por el usuario",
    contractError: "Error en el contrato",

    // Languages
    language: "Idioma",
    spanish: "Español",
    english: "English",
  },
  en: {
    // Header
    title: "SimpleSwap UI",
    subtitle: "Exchange tokens on Sepolia testnet",

    // Wallet Connection
    connectWallet: "Connect MetaMask",
    connecting: "Connecting...",
    walletConnected: "Wallet Connected",
    disconnectWallet: "Disconnect Wallet",
    important: "Important:",
    sepoliaWarning: "This application only works on Sepolia testnet.",

    // Price & Balances
    currentPrice: "Current Price",
    yourBalances: "Your Balances",
    poolReserves: "Pool Reserves",
    addLiquidity: "Add Liquidity",
    showContractInfo: "Show Contract Info",

    // Swap Interface
    swapTokens: "Exchange Tokens",
    sourceToken: "Source Token",
    amount: "Amount",
    enterAmount: "Enter Token amount",
    estimated: "Estimated Token",
    enterAmountButton: "Enter Amount",
    swapping: "Swapping...",

    // Transactions
    recentTransactions: "Recent Transactions",
    loadRecentTransactions: "Load Recent Transactions",
    swapSuccessful: "Swap successful!",
    viewOnEtherscan: "View on Etherscan:",

    // Liquidity
    enterAmountA: "Enter amount of Token A",
    enterAmountB: "Enter amount of Token B",
    insufficientTokenA: "Insufficient Token A balance",
    insufficientTokenB: "Insufficient Token B balance",
    liquidityAdded: "Liquidity added successfully",
    liquidityError: "Error adding liquidity",

    // Errors
    invalidConfiguration: "Invalid configuration - check contract addresses",
    swapError: "Swap error:",
    insufficientBalance: "Insufficient balance",
    tokenContractNotFound: "Token contract not found",
    contractCallFailed: "Contract call failed",
    transactionRejected: "Transaction rejected by user",
    contractError: "Contract error",

    // Languages
    language: "Language",
    spanish: "Español",
    english: "English",
  },
}

export const LanguageProvider = ({ children }) => {
  const [language, setLanguage] = useState("es")

  const t = (key) => {
    return translations[language][key] || key
  }

  const changeLanguage = (newLanguage) => {
    setLanguage(newLanguage)
  }

  return <LanguageContext.Provider value={{ language, changeLanguage, t }}>{children}</LanguageContext.Provider>
}
