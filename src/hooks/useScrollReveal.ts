import { useEffect, useRef } from 'react'

/** Adds an enhancement class only when IntersectionObserver and motion are available. */
export function useScrollReveal<T extends HTMLElement>() {
  const rootRef = useRef<T | null>(null)

  useEffect(() => {
    const root = rootRef.current
    if (!root || !('IntersectionObserver' in window) || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return

    const sections = root.querySelectorAll<HTMLElement>('.home-section, .home-editorial, .home-values, .home-newsletter, .home-support, .home-faq')
    if (!sections.length) return

    root.classList.add('home-page--reveal')
    const observer = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue
        entry.target.classList.add('is-revealed')
        observer.unobserve(entry.target)
      }
    }, { threshold: 0.12, rootMargin: '0px 0px -32px 0px' })

    sections.forEach((section) => observer.observe(section))
    return () => {
      observer.disconnect()
      root.classList.remove('home-page--reveal')
    }
  }, [])

  return rootRef
}
