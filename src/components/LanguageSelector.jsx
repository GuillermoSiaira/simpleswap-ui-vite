"use client"

import { FaGlobe } from "react-icons/fa"
import { useLanguage } from "../contexts/LanguageContext"

export const LanguageSelector = () => {
  const { language, changeLanguage, t } = useLanguage()

  return (
    <div className="relative">
      <select
        value={language}
        onChange={(e) => changeLanguage(e.target.value)}
        className="bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500 appearance-none cursor-pointer pr-8"
      >
        <option value="es">{t("spanish")}</option>
        <option value="en">{t("english")}</option>
      </select>
      <FaGlobe className="absolute right-2 top-1/2 transform -translate-y-1/2 text-gray-400 pointer-events-none" />
    </div>
  )
}
