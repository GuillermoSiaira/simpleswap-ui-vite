"use client"

import { FaSun, FaMoon } from "react-icons/fa"
import { useTheme } from "../contexts/ThemeContext"

export const ThemeToggle = () => {
  const { isDark, toggleTheme } = useTheme()

  return (
    <button
      onClick={toggleTheme}
      className="p-2 rounded-lg bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors"
      title={isDark ? "Cambiar a modo claro" : "Cambiar a modo oscuro"}
    >
      {isDark ? <FaSun className="text-yellow-500 text-lg" /> : <FaMoon className="text-gray-600 text-lg" />}
    </button>
  )
}
