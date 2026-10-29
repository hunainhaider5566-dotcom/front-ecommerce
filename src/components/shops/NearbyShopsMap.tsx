import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Crosshair, LocateFixed, MapPin, Navigation, Store } from 'lucide-react'
import { useI18n } from '../../i18n/LocaleContext'
import type { PublicShop } from '../../types/shop'

type Coordinates = { latitude: number; longitude: number }
const LAHORE: Coordinates = { latitude: 31.5204, longitude: 74.3587 }

function distanceKm(from: Coordinates, to: Coordinates) {
  const radians = (value: number) => value * Math.PI / 180
  const dLat = radians(to.latitude - from.latitude)
  const dLng = radians(to.longitude - from.longitude)
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(radians(from.latitude)) * Math.cos(radians(to.latitude)) * Math.sin(dLng / 2) ** 2
  return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

export function NearbyShopsMap({ shops }: { shops: PublicShop[] }) {
  const { t } = useI18n()
  const [location, setLocation] = useState<Coordinates | null>(null)
  const [locationState, setLocationState] = useState<'locating' | 'ready' | 'denied' | 'unsupported'>('locating')
  const [zoom, setZoom] = useState(13)
  const locate = useCallback(() => {
    if (!navigator.geolocation) { setLocationState('unsupported'); return }
    setLocationState('locating')
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => { setLocation({ latitude: coords.latitude, longitude: coords.longitude }); setLocationState('ready') },
      () => setLocationState('denied'),
      { enableHighAccuracy: false, timeout: 12000, maximumAge: 300000 },
    )
  }, [])

  useEffect(() => { locate() }, [locate])

  const mappedShops = useMemo(() => shops.flatMap((shop) => shop.latitude !== null && shop.longitude !== null && shop.shopLocationLabel
    ? [{ shop, coordinates: { latitude: shop.latitude, longitude: shop.longitude }, distance: location ? distanceKm(location, { latitude: shop.latitude, longitude: shop.longitude }) : null }]
    : []).sort((a, b) => (a.distance ?? Number.POSITIVE_INFINITY) - (b.distance ?? Number.POSITIVE_INFINITY)), [shops, location])

  const center = location ?? (mappedShops.length
    ? { latitude: mappedShops.reduce((sum, row) => sum + row.coordinates.latitude, 0) / mappedShops.length, longitude: mappedShops.reduce((sum, row) => sum + row.coordinates.longitude, 0) / mappedShops.length }
    : { latitude: 24.8607, longitude: 67.0011 })
  const listedShops = mappedShops.length ? mappedShops : shops.map((shop) => ({ shop, coordinates: null, distance: null }))
  const longitudeSpan = 0.16 * 2 ** (13 - zoom)
  const latitudeSpan = longitudeSpan * 0.62
  const bounds = { west: center.longitude - longitudeSpan / 2, east: center.longitude + longitudeSpan / 2, south: center.latitude - latitudeSpan / 2, north: center.latitude + latitudeSpan / 2 }
  const mapSrc = `https://www.openstreetmap.org/export/embed.html?bbox=${bounds.west}%2C${bounds.south}%2C${bounds.east}%2C${bounds.north}&layer=mapnik${location ? `&marker=${location.latitude}%2C${location.longitude}` : ''}`
  const visiblePins = mappedShops.filter(({ coordinates }) => coordinates.longitude >= bounds.west && coordinates.longitude <= bounds.east && coordinates.latitude >= bounds.south && coordinates.latitude <= bounds.north)

  return <section className="nearby-shops" aria-labelledby="nearby-shops-title">
    <header className="nearby-shops__heading"><div><span className="eyebrow">{t('Explore nearby')}</span><h2 id="nearby-shops-title">{t('Find shops around you.')}</h2><p>{t('Discover marketplace sellers near your current location.')}</p></div><button type="button" className="button button--outline nearby-shops__locate" onClick={locate} disabled={locationState === 'locating'}><LocateFixed size={16} /> {t(locationState === 'locating' ? 'Finding you…' : location ? 'Update location' : 'Use my location')}</button></header>
    <p className="nearby-shops__privacy"><Crosshair size={14} /> {t(location ? 'Your location is only used to sort nearby shops and centre this map; it is not saved.' : locationState === 'denied' ? 'Location access was not available. Allow it or browse shops by their shared area.' : 'Allow location access to sort shops by distance. Your coordinates are not saved.')}</p>
    <div className="nearby-shops__layout">
      <div className="nearby-shops__map-frame">
        <iframe title={t('Map of nearby shops')} src={mapSrc} loading="lazy" referrerPolicy="no-referrer-when-downgrade" />
        <div className="nearby-shops__pins" aria-label={t('Shop map markers')}>
          {visiblePins.map(({ shop, coordinates }) => <Link key={shop.id} className="nearby-shops__pin" to={`/shops/${shop.slug}`} style={{ left: `${((coordinates.longitude - bounds.west) / longitudeSpan) * 100}%`, top: `${((bounds.north - coordinates.latitude) / latitudeSpan) * 100}%` }} title={`${shop.shopName} · ${shop.shopLocationLabel}`}><span><Store size={13} />{shop.shopName}</span><MapPin size={28} fill="currentColor" /></Link>)}
        </div>
        <div className="nearby-shops__map-controls"><button type="button" aria-label={t('Zoom in')} onClick={() => setZoom((value) => Math.min(16, value + 1))}>+</button><button type="button" aria-label={t('Zoom out')} onClick={() => setZoom((value) => Math.max(10, value - 1))}>−</button></div>
        {location && <span className="nearby-shops__you"><span />{t('You are here')}</span>}
        <span className="nearby-shops__attribution">© OpenStreetMap</span>
      </div>
      <div className="nearby-shops__results"><div className="nearby-shops__results-heading"><div><span className="eyebrow">{t('Local sellers')}</span><h3>{t(location && mappedShops.length ? 'Closest shops' : 'Marketplace shops')}</h3></div><span>{shops.length}</span></div>
        {shops.length === 0 ? <div className="nearby-shops__empty"><Store size={23} /><strong>{t('No shops are available yet')}</strong><p>{t('New marketplace shops will appear here when sellers open their stores.')}</p><Link to="/shop" className="text-link">{t('Browse marketplace')} <Navigation size={14} /></Link></div> : <div className="nearby-shops__list">{listedShops.slice(0, 12).map(({ shop, distance }) => <article className="nearby-shop-card" key={shop.id}><Link to={`/shops/${shop.slug}`} className="nearby-shop-card__image">{shop.shopImageUrl ? <img src={shop.shopImageUrl} alt="" loading="lazy" /> : <Store size={18} />}</Link><div className="nearby-shop-card__details"><Link to={`/shops/${shop.slug}`}><strong>{shop.shopName}</strong></Link><span><MapPin size={12} /> {shop.shopLocationLabel}</span></div>{distance !== null && <span className="nearby-shop-card__distance">{distance < 1 ? `${Math.round(distance * 1000)} m` : `${distance.toFixed(1)} km`}</span>}</article>)}</div>}
      </div>
    </div>
  </section>
}
