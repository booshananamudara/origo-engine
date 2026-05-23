import { useEffect, useState } from "react"

export function useTheme() {
  const [dark, setDark] = useState<boolean>(() => {
    const stored = localStorage.getItem("admin-theme")
    return stored ? stored === "dark" : true
  })

  useEffect(() => {
    document.documentElement.classList.toggle("dark", dark)
    localStorage.setItem("admin-theme", dark ? "dark" : "light")
  }, [dark])

  const toggle = () => setDark((d) => !d)
  return { dark, toggle }
}
