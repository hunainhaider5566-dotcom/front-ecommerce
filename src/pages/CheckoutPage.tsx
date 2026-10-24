import { ArrowLeft, ArrowRight, AlertCircle, CheckCircle2, MapPin, Navigation, ShieldCheck } from 'lucide-react'
import { useEffect, useRef, useState, type ChangeEvent, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { EmptyState, ErrorState, LoadingState } from '../components/common/States'
import { CartItem } from '../components/cart/CartItem'
import { useCart } from '../contexts/CartContext'
import { useCatalog } from '../contexts/CatalogContext'
import { useAuth } from '../contexts/AuthContext'
import { useToast } from '../contexts/ToastContext'
import { usePageMeta } from '../hooks/usePageMeta'
import { useStoreSettings } from '../hooks/useStoreSettings'
import { useI18n } from '../i18n/LocaleContext'
import { createAddress, listMyAddresses, type SavedAddress } from '../services/account/addressService'
import { placeOrder } from '../services/orders/orderService'
import type { CheckoutFormValues } from '../types/order'
import { formatPKR } from '../utils/money'
import { getCartLineUnitPrice, isCartLineAvailable } from '../utils/cart'

interface LocationCoordinates {
  lat: number
  lng: number
  name: string
  capturedAt: string
}

function newCheckoutKey() {
  try { return crypto.randomUUID() } catch { return `${Date.now()}-${Math.random().toString(36).slice(2)}-checkout` }
}

const emptyForm: CheckoutFormValues = {
  fullName: '',
  phone: '',
  email: '',
  city: '',
  area: '',
  address: '',
  instructions: '',
}

export function CheckoutPage() {
  const { t } = useI18n()
  usePageMeta(t('Checkout'), t('Confirm your delivery details and place a cash-on-delivery order securely.'))
  const { lines, setQuantity, remove, clear } = useCart()
  const { findProductById, status, error, refresh } = useCatalog()
  const { user, profile, displayName } = useAuth()
  const { push } = useToast()
  const settings = useStoreSettings()
  const navigate = useNavigate()

  const [form, setForm] = useState<CheckoutFormValues>(emptyForm)
  const [addresses, setAddresses] = useState<SavedAddress[]>([])
  const [saveAddress, setSaveAddress] = useState(false)
  const [coords, setCoords] = useState<LocationCoordinates | null>(null)
  const [manualCoords, setManualCoords] = useState({ lat: '', lng: '', name: '' })
  const [geoLoading, setGeoLoading] = useState(false)
  const [geoError, setGeoError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const idempotencyKey = useRef(newCheckoutKey())

  useEffect(() => {
    if (!user) return
    setForm((current) => ({
      ...current,
      fullName: current.fullName || displayName || '',
      email: current.email || user.email || '',
      phone: current.phone || profile?.phone || '',
    }))
  }, [user, displayName, profile?.phone])

  useEffect(() => {
    if (!user) { setAddresses([]); return }
    void listMyAddresses().then((rows) => {
      setAddresses(rows)
      const preferred = rows.find((row) => row.is_default) ?? rows[0]
      if (preferred) {
        setForm((current) => ({
          ...current,
          fullName: current.fullName || preferred.recipient_name,
          phone: current.phone || preferred.phone,
          city: current.city || preferred.city,
          address: current.address || [preferred.address_line_1, preferred.address_line_2].filter(Boolean).join(', '),
          instructions: current.instructions || preferred.delivery_instructions || '',
        }))
      }
    }).catch(() => undefined)
  }, [user])

  const subtotal = lines.reduce((sum, line) => sum + getCartLineUnitPrice(findProductById(line.productId), line) * line.quantity, 0)
  const total = subtotal + settings.deliveryFee
  const linesAvailable = lines.length > 0 && lines.every((line) => isCartLineAvailable(findProductById(line.productId), line))

  if (status === 'loading' && lines.length > 0) return <div className="page-shell"><LoadingState label={t('Preparing checkout…')} /></div>
  if (status === 'error' && lines.length > 0) return <div className="page-shell"><ErrorState message={error || t('The catalog could not be loaded.')} /><button type="button" className="button button--outline" onClick={refresh}>{t('Try again')}</button><Link className="back-link" to="/cart">{t('Return to cart')}</Link></div>
  if (lines.length === 0) return <div className="page-shell"><EmptyState title={t('Your cart is empty')} description={t('Add items to your cart before checking out.')} actionLabel={t('Browse the catalog')} actionHref="/shop" /></div>

  if (!user) {
    return <div className="page-shell checkout-page">
      <Link to="/cart" className="back-link"><ArrowLeft size={15} /> {t('Back to cart')}</Link>
      <div className="page-heading"><span className="eyebrow">{t('Checkout')}</span><h1>{t('Sign in to')} <em>{t('place your order.')}</em></h1><p>{t('Orders are linked to a verified account so you can track delivery, open returns and receive updates. Your cart has been kept on this device.')}</p></div>
      <div className="checkout-signin-panel shine-surface">
        <ShieldCheck size={26} aria-hidden="true" />
        <h2>{t('Secure account checkout')}</h2>
        <p>{t('Sign in or create an account, then return here to confirm your delivery details.')}</p>
        <div className="checkout-signin-actions">
          <Link className="button button--dark" to={`/login?redirect=${encodeURIComponent('/checkout')}`}>{t('Sign in')} <ArrowRight size={16} /></Link>
          <Link className="button button--outline" to={`/register?redirect=${encodeURIComponent('/checkout')}`}>{t('Create an account')}</Link>
        </div>
      </div>
    </div>
  }

  function setField(event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) {
    const { name, value } = event.target
    setForm((current) => ({ ...current, [name]: value }))
  }

  function applyAddress(id: string) {
    const saved = addresses.find((address) => address.id === id)
    if (!saved) return
    setForm((current) => ({
      ...current,
      fullName: saved.recipient_name,
      phone: saved.phone,
      city: saved.city,
      address: [saved.address_line_1, saved.address_line_2].filter(Boolean).join(', '),
      instructions: saved.delivery_instructions ?? '',
    }))
  }

  function handleGetCurrentLocation() {
    if (!navigator.geolocation) {
      setGeoError(t('Geolocation is not supported by this browser. Enter an address or coordinates manually.'))
      return
    }
    setGeoLoading(true)
    setGeoError(null)
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setCoords({
          lat: Number(position.coords.latitude.toFixed(7)),
          lng: Number(position.coords.longitude.toFixed(7)),
          name: `${form.city || 'Delivery'}, Pakistan`,
          capturedAt: new Date().toISOString(),
        })
        setGeoLoading(false)
        push(t('Location coordinates captured.'), 'success')
      },
      (geoFailure) => {
        setGeoLoading(false)
        setGeoError(geoFailure.code === geoFailure.PERMISSION_DENIED
          ? t('Location permission was denied. You can enter coordinates manually or use your street address.')
          : t('GPS coordinates could not be read. You can enter them manually or use your street address.'))
      },
      { enableHighAccuracy: true, timeout: 10000 },
    )
  }

  function resolvedLocation(): LocationCoordinates | null {
    if (coords) return coords
    const lat = Number(manualCoords.lat)
    const lng = Number(manualCoords.lng)
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || manualCoords.lat === '' || manualCoords.lng === '') return null
    if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null
    return {
      lat,
      lng,
      name: manualCoords.name.trim() || `${form.area || form.city}, ${form.city}`,
      capturedAt: new Date().toISOString(),
    }
  }

  async function submitOrder(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!linesAvailable) { push(t('Remove unavailable items before placing your order.'), 'error'); return }
    if (!form.fullName.trim() || !form.phone.trim() || !form.city.trim() || !form.address.trim()) {
      push(t('Please complete the recipient, phone, city and street address fields.'), 'error')
      return
    }
    if (!settings.codEnabled) { push(t('Cash on delivery is currently unavailable.'), 'error'); return }
    const location = resolvedLocation()
    setSubmitting(true)
    try {
      const placed = await placeOrder({
        customerName: form.fullName.trim(),
        customerPhone: form.phone.trim(),
        customerEmail: form.email.trim() || null,
        shippingAddress: {
          recipient_name: form.fullName.trim(),
          phone: form.phone.trim(),
          address_line_1: form.address.trim(),
          address_line_2: form.area.trim() || null,
          city: form.city.trim(),
          province: null,
          postal_code: null,
          delivery_instructions: form.instructions.trim() || null,
          latitude: location?.lat ?? null,
          longitude: location?.lng ?? null,
        },
        items: lines.map((line) => ({ product_id: line.productId, variant_id: line.variantId ?? null, quantity: line.quantity })),
        idempotencyKey: idempotencyKey.current,
        customerNote: form.instructions.trim() || null,
        deliveryLat: location?.lat ?? null,
        deliveryLng: location?.lng ?? null,
        deliveryLocationName: location?.name ?? null,
        deliveryLocationCapturedAt: location?.capturedAt ?? null,
      })

      if (saveAddress) {
        try {
          await createAddress({
            recipient_name: form.fullName.trim(),
            phone: form.phone.trim(),
            address_line_1: form.address.trim(),
            address_line_2: form.area.trim() || null,
            city: form.city.trim(),
            province: null,
            postal_code: null,
            delivery_instructions: form.instructions.trim() || null,
            is_default: addresses.length === 0,
          })
        } catch {
          push(t('The order was placed, but the address could not be saved.'), 'error')
        }
      }

      clear()
      push(`${t('Order')} ${placed.orderNumber} ${t('placed successfully.')}`, 'success')
      navigate(`/order-confirmation/${encodeURIComponent(placed.orderNumber)}`, { replace: true })
    } catch (cause) {
      push(cause instanceof Error ? cause.message : t('The order could not be placed. Please try again.'), 'error')
    } finally {
      setSubmitting(false)
    }
  }

  return <div className="page-shell checkout-page">
    <Link to="/cart" className="back-link"><ArrowLeft size={15} /> {t('Back to cart')}</Link>
    <div className="page-heading"><span className="eyebrow">{t('Secure checkout')}</span><h1>{t('Confirm your')} <em>{t('delivery details.')}</em></h1><p>{t('Cash on delivery. Your price, stock and delivery fee are validated by the marketplace when the order is placed.')}</p></div>

    <div className="checkout-layout">
      <form className="checkout-form" onSubmit={submitOrder} noValidate>
        {addresses.length > 0 && <section className="form-section">
          <h2>{t('Saved addresses')}</h2>
          <div className="saved-address-list">
            {addresses.map((address) => <button type="button" key={address.id} className="saved-address" onClick={() => applyAddress(address.id)}>
              <strong>{address.recipient_name}{address.is_default ? ` · ${t('Default')}` : ''}</strong>
              <span>{address.address_line_1}, {address.city}</span>
              <small>{address.phone}</small>
            </button>)}
          </div>
        </section>}

        <section className="form-section">
          <h2>{t('01 · Recipient and contact')}</h2>
          <div className="form-grid">
            <div className="form-field"><label htmlFor="fullName">{t('Full name')} <span>*</span></label><input id="fullName" name="fullName" value={form.fullName} onChange={setField} autoComplete="name" required /></div>
            <div className="form-field"><label htmlFor="phone">{t('Mobile number')} <span>*</span></label><input id="phone" name="phone" type="tel" placeholder="03xx xxx xxxx" value={form.phone} onChange={setField} autoComplete="tel" required /></div>
            <div className="form-field"><label htmlFor="email">{t('Email address')}</label><input id="email" name="email" type="email" value={form.email} onChange={setField} autoComplete="email" /></div>
          </div>
        </section>

        <section className="form-section">
          <h2>{t('02 · Delivery address and optional location pin')}</h2>
          <div className="form-grid">
            <div className="form-field"><label htmlFor="city">{t('City')} <span>*</span></label><input id="city" name="city" value={form.city} onChange={setField} autoComplete="address-level2" required /></div>
            <div className="form-field"><label htmlFor="area">{t('Area / locality')}</label><input id="area" name="area" placeholder="e.g. Gulberg III" value={form.area} onChange={setField} autoComplete="address-level3" /></div>
            <div className="form-field form-field--wide"><label htmlFor="address">{t('Full street address')} <span>*</span></label><textarea id="address" name="address" rows={3} placeholder="House/apartment number, street, block…" value={form.address} onChange={setField} autoComplete="street-address" required /></div>
            <div className="form-field form-field--wide"><label htmlFor="instructions">{t('Delivery instructions')} <span>{t('optional')}</span></label><textarea id="instructions" name="instructions" rows={2} placeholder="Gate code, landmark, calling preferences…" value={form.instructions} onChange={setField} /></div>
          </div>

          <div className="location-pin-box shine-surface">
            <div className="location-pin-header">
              <div><h3><MapPin size={18} /> {t('Delivery location pin')}</h3><p>{t('Optional GPS coordinates help the courier find your address.')}</p></div>
              <button type="button" className="button button--outline" onClick={handleGetCurrentLocation} disabled={geoLoading}><Navigation size={16} className={geoLoading ? 'spin' : ''} />{t(geoLoading ? 'Locating…' : 'Use my current location')}</button>
            </div>
            {geoError && <p className="field-error"><AlertCircle size={15} /> {geoError}</p>}
            {coords
              ? <div className="coords-confirmed-badge"><CheckCircle2 size={18} /><div><strong>{t('GPS location captured')}</strong><span>{coords.lat}, {coords.lng}</span><button type="button" className="text-button" onClick={() => setCoords(null)}>{t('Clear pin')}</button></div></div>
              : <div className="manual-coords">
                <p>{t('No GPS? You can leave this blank and deliver by street address, or enter coordinates manually.')}</p>
                <div className="form-grid">
                  <div className="form-field"><label htmlFor="manualLat">{t('Latitude')}</label><input id="manualLat" inputMode="decimal" value={manualCoords.lat} onChange={(event) => setManualCoords((current) => ({ ...current, lat: event.target.value }))} placeholder="31.5204" /></div>
                  <div className="form-field"><label htmlFor="manualLng">{t('Longitude')}</label><input id="manualLng" inputMode="decimal" value={manualCoords.lng} onChange={(event) => setManualCoords((current) => ({ ...current, lng: event.target.value }))} placeholder="74.3587" /></div>
                  <div className="form-field"><label htmlFor="pinName">{t('Location label')}</label><input id="pinName" value={manualCoords.name} onChange={(event) => setManualCoords((current) => ({ ...current, name: event.target.value }))} placeholder={t('e.g. Home')} /></div>
                </div>
              </div>}
          </div>
        </section>

        <label className="checkout-save-address"><input type="checkbox" checked={saveAddress} onChange={(event) => setSaveAddress(event.target.checked)} /> {t('Save this address to my account')}</label>

        {!settings.codEnabled && <p className="field-error"><AlertCircle size={15} /> {t('Cash on delivery is currently unavailable. Please contact support before ordering.')}</p>}

        <button className="button button--dark button--full checkout-submit" type="submit" disabled={submitting || !linesAvailable || !settings.codEnabled}>
          {t(submitting ? 'Placing order…' : 'Place order · Cash on delivery')} <ArrowRight size={16} />
        </button>
        <p className="checkout-secure-note"><ShieldCheck size={14} /> {t('Your order is created by the marketplace database, not by your browser.')}</p>
      </form>

      <aside className="checkout-sidebar">
        <div className="checkout-order-card">
          <h2>{t('Your order')}</h2>
          <div className="checkout-mini-items">{lines.map((line) => <CartItem key={`${line.productId}-${line.variantId ?? 'default'}`} line={line} compact onQuantity={(quantity) => setQuantity(line.productId, line.variantId, quantity)} onRemove={() => remove(line.productId, line.variantId)} />)}</div>
          <div className="order-summary">
            <div className="order-summary__row"><span>{t('Item subtotal')}</span><strong>{formatPKR(subtotal)}</strong></div>
            <div className="order-summary__row"><span>{t('Delivery fee')}</span><strong>{formatPKR(settings.deliveryFee)}</strong></div>
            <div className="order-summary__total"><span>{t('Total')}</span><strong>{formatPKR(total)}</strong></div>
            <p>{t('The final charge is confirmed by the marketplace at order placement.')}</p>
          </div>
        </div>
      </aside>
    </div>
  </div>
}
