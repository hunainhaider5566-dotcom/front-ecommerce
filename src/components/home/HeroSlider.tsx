import { ArrowDownRight, ArrowRight } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useI18n } from '../../i18n/LocaleContext'
import { fetchActiveHomepageHeroes } from '../../services/marketplace/promotionsService'

type HeroSlide = {
  id: string
  kicker: string
  eyebrow: string
  title: string
  description: string
  primaryLabel: string
  primaryHref: string
  secondaryLabel: string
  secondaryHref: string
  image: string
  imageAlt: string
  supportingImage?: string
  supportingAlt?: string
  imageLabel: string
  viewLabel: string
}

const FALLBACK_SLIDES: HeroSlide[] = [
  {
    id: 'editorial-desk',
    kicker: 'A considered collection',
    eyebrow: 'For everyday living',
    title: 'Make space for your ideas.',
    description: 'Considered finds for the routines, ideas and spaces that shape your everyday.',
    primaryLabel: 'Explore the collection',
    primaryHref: '/shop',
    secondaryLabel: 'Browse categories',
    secondaryHref: '/categories',
    image: '/images/paperloom-hero.webp',
    imageAlt: 'An editorial arrangement of notebooks, planner pages and writing tools on a warm desk',
    supportingImage: '/images/study-notebook.webp',
    supportingAlt: 'A study notebook beside the editorial desk arrangement',
    imageLabel: 'Meridion · everyday edit 01',
    viewLabel: 'View the editorial desk',
  },
  {
    id: 'planning-edit',
    kicker: 'Planning, with room to breathe',
    eyebrow: 'A little shape for the day',
    title: 'Plan the day. Keep the thought.',
    description: 'A considered planning edit for days that need a little more shape.',
    primaryLabel: 'Browse the collection',
    primaryHref: '/shop',
    secondaryLabel: 'See all categories',
    secondaryHref: '/categories',
    image: '/images/daily-planner.webp',
    imageAlt: 'A daily planner opened to a clean page with writing tools nearby',
    supportingImage: '/images/study-notebook.webp',
    supportingAlt: 'A study notebook layered with a daily planner',
    imageLabel: 'Meridion · planning edit 02',
    viewLabel: 'View the planning edit',
  },
  {
    id: 'journal-edit',
    kicker: 'Journaling, in progress',
    eyebrow: 'A page for what is next',
    title: "A page for what's next.",
    description: 'Journals, notebooks and study pieces for ideas still taking shape.',
    primaryLabel: 'Explore the collection',
    primaryHref: '/shop',
    secondaryLabel: 'Browse categories',
    secondaryHref: '/categories',
    image: '/images/linen-journal.webp',
    imageAlt: 'A linen-style journal and fountain pen arranged on a cream surface',
    supportingImage: '/images/study-kit.webp',
    supportingAlt: 'A study kit with pens and notes beside a linen-style journal',
    imageLabel: 'Meridion · journal edit 03',
    viewLabel: 'View the journal edit',
  },
]

function safeHref(value: string | null): string {
  if (!value) return '/shop'
  if (value.startsWith('/') || value.startsWith('https://')) return value
  return '/shop'
}

function preloadImage(src: string): Promise<void> {
  const image = new Image()
  image.decoding = 'async'
  image.src = src
  if (typeof image.decode === 'function') {
    return image.decode().then(() => undefined).catch(() => undefined)
  }
  return new Promise((resolve) => {
    if (image.complete) resolve()
    else {
      image.onload = () => resolve()
      image.onerror = () => resolve()
    }
  })
}

export function HeroSlider() {
  const { t } = useI18n()
  const [slides, setSlides] = useState<HeroSlide[]>(FALLBACK_SLIDES)
  const [activeIndex, setActiveIndex] = useState(0)
  const [isHovered, setIsHovered] = useState(false)
  const [isFocusWithin, setIsFocusWithin] = useState(false)
  const [reducedMotion, setReducedMotion] = useState(false)
  const isPaused = isHovered || isFocusWithin
  const touchStartX = useRef<number | null>(null)

  useEffect(() => {
    let cancelled = false
    fetchActiveHomepageHeroes()
      .then((heroes) => {
        if (cancelled || heroes.length === 0) return
        setSlides(heroes.map((hero) => ({
          id: hero.id,
          kicker: hero.image_alt_text || 'Meridion Marketplace',
          eyebrow: hero.subtitle || 'Featured',
          title: hero.title,
          description: hero.subtitle || '',
          primaryLabel: hero.cta_text || 'Explore the collection',
          primaryHref: safeHref(hero.cta_destination),
          secondaryLabel: 'Browse categories',
          secondaryHref: '/categories',
          image: hero.image_url,
          imageAlt: hero.image_alt_text || hero.title,
          imageLabel: hero.title,
          viewLabel: `View ${hero.title}`,
        })))
      })
      .catch(() => { /* the editorial fallback remains available */ })
    return () => { cancelled = true }
  }, [])

  useEffect(() => {
    setActiveIndex(0)
  }, [slides.length])

  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)')
    const updatePreference = () => setReducedMotion(mediaQuery.matches)
    updatePreference()
    mediaQuery.addEventListener('change', updatePreference)
    return () => mediaQuery.removeEventListener('change', updatePreference)
  }, [])

  useEffect(() => {
    if (isPaused || reducedMotion || slides.length < 2) return undefined

    let cancelled = false
    let timer: number | undefined
    const nextSlide = slides[(activeIndex + 1) % slides.length]

    void preloadImage(nextSlide.image).then(() => {
      if (cancelled) return
      timer = window.setTimeout(() => {
        setActiveIndex((current) => (current + 1) % slides.length)
      }, 4500)
    })

    return () => {
      cancelled = true
      if (timer !== undefined) window.clearTimeout(timer)
    }
  }, [activeIndex, isPaused, reducedMotion, slides])

  const selectSlide = (index: number) => {
    setActiveIndex((index + slides.length) % slides.length)
  }
  const handleKeyDown = (event: React.KeyboardEvent<HTMLElement>) => {
    if (event.key === 'ArrowLeft') {
      event.preventDefault()
      selectSlide(activeIndex - 1)
    } else if (event.key === 'ArrowRight') {
      event.preventDefault()
      selectSlide(activeIndex + 1)
    }
  }
  const handleTouchEnd = (event: React.TouchEvent<HTMLElement>) => {
    if (touchStartX.current === null) return
    const distance = event.changedTouches[0].clientX - touchStartX.current
    touchStartX.current = null
    if (Math.abs(distance) < 44) return
    selectSlide(activeIndex + (distance > 0 ? -1 : 1))
  }

  const handleBlur = (event: React.FocusEvent<HTMLElement>) => {
    if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
      setIsFocusWithin(false)
    }
  }

  const activeSlide = slides[activeIndex] ?? slides[0]
  if (!activeSlide) return null

  return (
    <section
      className="home-hero hero-slider__root shine-surface"
      aria-label={t('A considered collection')}
      aria-roledescription="carousel"
      tabIndex={0}
      onKeyDown={handleKeyDown}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      onFocus={() => setIsFocusWithin(true)}
      onBlur={handleBlur}
      onTouchStart={(event) => { touchStartX.current = event.touches[0].clientX }}
      onTouchEnd={handleTouchEnd}
      data-motion={reducedMotion ? 'reduced' : 'full'}
    >
      <div className="hero-slider__viewport" aria-live={isPaused ? 'polite' : 'off'}>
        <article key={activeSlide.id} className="hero-slider__slide is-active" aria-roledescription="slide" aria-label={`${activeIndex + 1} / ${slides.length}`}>
          <div className="hero-slider__copy home-hero__copy">
            <span className="hero-slider__kicker">{t(activeSlide.kicker)}</span>
            <p className="hero-slider__eyebrow">{t(activeSlide.eyebrow)}</p>
            <h1>{t(activeSlide.title)}</h1>
            <p className="hero-slider__description">{t(activeSlide.description)}</p>
            <div className="hero-slider__actions">
              <Link className="hero-slider__primary" to={activeSlide.primaryHref}>{t(activeSlide.primaryLabel)} <ArrowRight size={16} aria-hidden="true" /></Link>
              <Link className="hero-slider__secondary" to={activeSlide.secondaryHref}>{t(activeSlide.secondaryLabel)} <ArrowDownRight size={15} aria-hidden="true" /></Link>
            </div>
            <div className="hero-slider__footnote"><span>{String(activeIndex + 1).padStart(2, '0')}</span><span>{t('Published catalog · Cash on delivery · Nationwide delivery')}</span></div>
          </div>
          <div className="hero-slider__visual">
            <div className="hero-slider__image-frame">
              <img className="hero-slider__image" src={activeSlide.image} alt={t(activeSlide.imageAlt)} loading={activeIndex === 0 ? 'eager' : 'lazy'} />
              <span className="hero-slider__image-label">{t(activeSlide.imageLabel)}</span>
            </div>
            {activeSlide.supportingImage && <img className="hero-slider__supporting-image" src={activeSlide.supportingImage} alt={t(activeSlide.supportingAlt ?? '')} loading="lazy" />}
            <Link className="hero-slider__image-link" to={activeSlide.primaryHref} aria-label={t(activeSlide.viewLabel)}><ArrowRight size={18} aria-hidden="true" /></Link>
          </div>
        </article>
      </div>

      <div className="hero-slider__controls">
        <div className="hero-slider__indicators">
          {slides.map((item, index) => (
            <button
              key={item.id}
              type="button"
              className={`hero-slider__indicator${index === activeIndex ? ' is-active' : ''}`}
              aria-label={`${t('Show slide')} ${index + 1}`}
              aria-pressed={index === activeIndex}
              onClick={() => selectSlide(index)}
            />
          ))}
        </div>
      </div>
      {reducedMotion && <p className="hero-slider__motion-note">{t('Carousel paused')}</p>}
    </section>
  )
}
