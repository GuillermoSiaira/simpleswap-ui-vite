"use client"

import { useState, useEffect } from "react"
import { ethers } from "ethers"
import { SEPOLIA_CHAIN_ID } from "../config/contracts"

export const useWeb3 = () => {
  const [account, setAccount] = useState(null)
  const [provider, setProvider] = useState(null)
  const [signer, setSigner] = useState(null)
  const [isConnected, setIsConnected] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState(null)

  const connectWallet = async () => {
    if (!window.ethereum) {
      setError("MetaMask no está instalado")
      return
    }

    try {
      setIsLoading(true)
      setError(null)

      // Solicitar acceso a la cuenta
      const accounts = await window.ethereum.request({
        method: "eth_requestAccounts",
      })

      // Verificar que estamos en Sepolia
      const chainId = await window.ethereum.request({
        method: "eth_chainId",
      })

      if (Number.parseInt(chainId, 16) !== SEPOLIA_CHAIN_ID) {
        try {
          await window.ethereum.request({
            method: "wallet_switchEthereumChain",
            params: [{ chainId: `0x${SEPOLIA_CHAIN_ID.toString(16)}` }],
          })
        } catch (switchError) {
          setError("Por favor cambia a la red Sepolia testnet")
          return
        }
      }

      // Configurar provider y signer
      const web3Provider = new ethers.BrowserProvider(window.ethereum)
      const web3Signer = await web3Provider.getSigner()

      setProvider(web3Provider)
      setSigner(web3Signer)
      setAccount(accounts[0])
      setIsConnected(true)
    } catch (err) {
      setError(err.message)
    } finally {
      setIsLoading(false)
    }
  }

  const disconnectWallet = () => {
    setAccount(null)
    setProvider(null)
    setSigner(null)
    setIsConnected(false)
    setError(null)
  }

  // Simple check for account changes without event listeners
  useEffect(() => {
    const checkConnection = async () => {
      if (!window.ethereum) return

      try {
        const accounts = await window.ethereum.request({
          method: "eth_accounts",
        })

        if (accounts.length > 0 && !isConnected) {
          // Auto-connect if previously connected
          const web3Provider = new ethers.BrowserProvider(window.ethereum)
          const web3Signer = await web3Provider.getSigner()

          setProvider(web3Provider)
          setSigner(web3Signer)
          setAccount(accounts[0])
          setIsConnected(true)
        } else if (accounts.length === 0 && isConnected) {
          disconnectWallet()
        }
      } catch (error) {
        console.warn("Error checking connection:", error)
      }
    }

    checkConnection()
  }, [isConnected])

  return {
    account,
    provider,
    signer,
    isConnected,
    isLoading,
    error,
    connectWallet,
    disconnectWallet,
  }
}
