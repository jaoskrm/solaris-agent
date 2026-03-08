

import React, { useEffect, useRef } from "react"
import { useLocation } from "react-router-dom"
import Lenis from "lenis"

interface SmoothScrollProviderProps {
  children: React.ReactNode
}

export function SmoothScrollProvider({ children }: SmoothScrollProviderProps) {
  const lenisRef = useRef<Lenis | null>(null)
  const location = useLocation()

  useEffect(() => {
    // Destroy existing instance before creating a new one
    if (lenisRef.current) {
      lenisRef.current.destroy()
      lenisRef.current = null
    }

    // Initialize Lenis
    const lenis = new Lenis({
      duration: 1.5,
      easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
      orientation: "vertical",
      gestureOrientation: "vertical",
      smoothWheel: true,
      wheelMultiplier: 1,
      touchMultiplier: 1.5,
      infinite: false,
      lerp: 0.08,
    })

    lenisRef.current = lenis

    // Integration with requestAnimationFrame
    let rafId: number;
    function raf(time: number) {
      lenis.raf(time)
      rafId = requestAnimationFrame(raf)
    }

    rafId = requestAnimationFrame(raf)

    // Cleanup
    return () => {
      lenis.destroy()
      cancelAnimationFrame(rafId)
      lenisRef.current = null
    }
  }, [location.pathname]) // Re-initialize on route change

  return <>{children}</>
}
