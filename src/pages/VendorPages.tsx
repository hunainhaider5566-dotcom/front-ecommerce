import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { Link, Navigate, useLocation } from 'react-router-dom'
import { AlertCircle, ArrowRight, Boxes, ClipboardList, ExternalLink, FileUp, LayoutDashboard, LocateFixed, MapPin, Package, PackageSearch, Pencil, Plus, Printer, RefreshCw, Search, Settings, ShieldCheck, Store, Truck, X } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import { useCatalog } from '../contexts/CatalogContext'
import { useToast } from '../contexts/ToastContext'
import { useI18n } from '../i18n/LocaleContext'
import { usePageMeta } from '../hooks/usePageMeta'
import { getMyAccountSuspensionReason } from '../services/account/notificationService'
import { LoadingState } from '../components/common/States'
import { ShopLocationPicker } from '../components/shops/ShopLocationPicker'
import { formatPKR } from '../utils/money'
import {
  adjustOwnInventory,
  applyAsSeller,
  createVendorProduct,
  getCaseEvidenceUrl,
  getOwnSellerProfile,
  listOwnCases,
  listOwnInventory,
  listOwnOrderItems,
  listOwnProducts,
  resubmitSellerApplication,
  respondToCase,
  updateOwnShop,
  updateVendorProduct,
  setVendorDailyAvailability,
  setVendorProductVisibility,
  markVendorOrderReady,
  uploadOwnProductImage,
  uploadVendorDocument,
  removeVendorDocument,
  uploadVendorShopImage,
  removeVendorShopImage,
  listOwnSupportTickets,
  createOwnSupportTicket,
  type MarketplaceCase,
  type SellerProfile,
  type VendorInventory,
  type VendorOrderItem,
  type VendorProduct,
  type VendorSupportTicket,
} from '../services/marketplace/vendorService'

function SignInForVendor() {
  const location = useLocation()
  const returnTo = `${location.pathname}${location.search}${location.hash}`
  return <Navigate to={`/login?redirect=${encodeURIComponent(returnTo)}`} replace state={{ from: returnTo }} />
}

function VendorGate({ children }: { children: React.ReactNode }) {
  const { user, loading, configured } = useAuth()
  if (loading) return <LoadingState label="Loading your seller account…" />
  if (!configured || !user) return <SignInForVendor />
  return <>{children}</>
}

function StatusBadge({ status }: { status: string }) {
  const { t } = useI18n()
  return <span className={`vendor-status__badge vendor-status__badge--${status}`}>{t(status.replace(/_/g, ' '))}</span>
}

function VendorStatusCard({ profile, onEdit }: { profile: SellerProfile; onEdit?: () => void }) {
  const { t } = useI18n()
  const approved = profile.status === 'approved'
  const rejected = profile.status === 'rejected'
  return <section className="page-shell info-page">
    <header className="info-page__heading"><span className="eyebrow">{t('Seller application')}</span><h1>{profile.shop_name} <em>{t(profile.status)}.</em></h1><p>{approved ? t('Your seller tools are active. Keep product, stock and fulfilment information current.') : rejected ? t('Your application needs attention before seller tools can be enabled.') : t('Your shop details are with the marketplace team for review.')}</p></header>
    <div className="placeholder-panel vendor-status">
      <StatusBadge status={profile.status} />
      {profile.rejection_reason && <p><strong>{t('Review note')}:</strong> {profile.rejection_reason}</p>}
      <p>{t('Submitted')} {new Intl.DateTimeFormat('en', { dateStyle: 'medium' }).format(new Date(profile.created_at))}.</p>
      {profile.document_path && <p><FileUp size={15} /> {t('A private verification document is on file.')}</p>}
      <div className="vendor-status__actions">
        {approved && <Link className="button button--dark" to="/vendor">{t('Open vendor dashboard')} <ArrowRight size={15} /></Link>}
        {!approved && <Link className="button button--dark" to={`/shops/${profile.slug}`}>{t('View public shop')} <ExternalLink size={15} /></Link>}
        {onEdit && <button type="button" className="button button--outline" onClick={onEdit}><Pencil size={15} /> {t('Update application details')}</button>}
        <Link className="text-link" to="/account">{t('Back to account')}</Link>
      </div>
    </div>
    {!approved && <VerificationDocumentSection profile={profile} onSaved={() => undefined} />}
  </section>
}

function AccountSuspensionNotice({ reason }: { reason: string | null }) {
  const { t } = useI18n()
  return <section className="page-shell"><div className="placeholder-panel vendor-status vendor-suspension-notice" role="status"><span className="vendor-status__badge vendor-status__badge--suspended">{t('Account suspended')}</span><h2>{t('Seller access is suspended')}</h2><p>{t('Your account is suspended, so seller applications and vendor tools are unavailable.')}</p>{reason && <p><strong>{t('Reason')}:</strong> {reason}</p>}<Link className="text-link" to="/contact">{t('Contact marketplace support')} <ArrowRight size={15} /></Link></div></section>
}

function ShopForm({ profile, onSaved, mode = 'apply' }: { profile: SellerProfile | null; onSaved: (profile: SellerProfile) => void; mode?: 'apply' | 'settings' }) {
  const { t } = useI18n()
  const { push } = useToast()
  const [saving, setSaving] = useState(false)
  const [shopImage, setShopImage] = useState<File | null>(null)
  const [verificationDocument, setVerificationDocument] = useState<File | null>(null)
  const [shopPreview, setShopPreview] = useState<string | null>(null)
  const [shopLatitude, setShopLatitude] = useState(profile?.shop_lat?.toString() ?? '')
  const [shopLongitude, setShopLongitude] = useState(profile?.shop_lng?.toString() ?? '')
  const [shopLocationLabel, setShopLocationLabel] = useState(profile?.shop_location_label ?? '')
  const [showShopOnMap, setShowShopOnMap] = useState(profile?.show_shop_on_map ?? false)
  const [locationLoading, setLocationLoading] = useState(false)

  useEffect(() => {
    if (!shopImage) { setShopPreview(null); return }
    const preview = URL.createObjectURL(shopImage)
    setShopPreview(preview)
    return () => URL.revokeObjectURL(preview)
  }, [shopImage])

  function useShopLocation() {
    if (!navigator.geolocation) { push(t('This browser cannot read your location.'), 'error'); return }
    setLocationLoading(true)
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => { setShopLatitude(coords.latitude.toFixed(6)); setShopLongitude(coords.longitude.toFixed(6)); setLocationLoading(false); push(t('Shop location added. Add a public area label before saving.'), 'success') },
      () => { setLocationLoading(false); push(t('Location could not be read. Allow location access and try again.'), 'error') },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 60000 },
    )
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = event.currentTarget
    const data = new FormData(form)
    const shopName = String(data.get('shop_name') ?? '').trim()
    const slug = String(data.get('slug') ?? '').trim().toLowerCase()
    const description = String(data.get('description') ?? '').trim()
    const contactEmail = String(data.get('contact_email') ?? '').trim() || null
    const phone = String(data.get('phone') ?? '').trim() || null
    const showLocation = mode === 'settings' && data.get('show_shop_on_map') === 'on'
    const latitude = shopLatitude.trim() ? Number(shopLatitude) : null
    const longitude = shopLongitude.trim() ? Number(shopLongitude) : null
    const locationLabel = shopLocationLabel.trim()
    if (shopName.length < 2) { push(t('Enter a shop name of at least two characters.'), 'error'); return }
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) { push(t('Use a URL-safe slug, for example acme-traders.'), 'error'); return }
    if (contactEmail && !/^\S+@\S+\.\S+$/.test(contactEmail)) { push(t('Enter a valid contact email.'), 'error'); return }
    if (phone && phone.replace(/\D/g, '').length < 7) { push(t('Enter a valid phone number.'), 'error'); return }
    if (!profile && !verificationDocument) { push(t('Upload an identity or business document before submitting your application.'), 'error'); return }
    if (profile && !profile.document_path && !verificationDocument) { push(t('Upload an identity or business document before submitting your application.'), 'error'); return }
    if (showLocation && (latitude === null || longitude === null || !Number.isFinite(latitude) || !Number.isFinite(longitude) || latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180 || locationLabel.length < 2)) { push(t('Add valid coordinates and a public area label to show this shop on Explore.'), 'error'); return }

    setSaving(true)
    try {
      let uploadedImage: { path: string; url: string } | null = null
      let uploadedDocument: string | null = null
      let committed = false
      try {
        if (shopImage && profile) uploadedImage = await uploadVendorShopImage(shopImage)
        if (verificationDocument) uploadedDocument = await uploadVendorDocument(verificationDocument)
        const input = { shop_name: shopName, slug, description, contact_email: contactEmail, phone, ...(uploadedImage ? { shop_image_url: uploadedImage.url } : {}), ...(uploadedDocument ? { document_path: uploadedDocument } : {}), ...(mode === 'settings' ? { shop_lat: latitude, shop_lng: longitude, shop_location_label: locationLabel, show_shop_on_map: showLocation } : {}) }
        const saved = profile ? await updateOwnShop(input) : await applyAsSeller(input)
        committed = true
        if (uploadedImage && profile?.shop_image_url?.includes('/shop-images/')) {
          const previousPath = decodeURIComponent(new URL(profile.shop_image_url).pathname.split('/shop-images/').at(-1) ?? '')
          if (previousPath) await removeVendorShopImage(previousPath).catch(() => undefined)
        }
        push(t(profile ? 'Shop details updated.' : 'Seller application submitted for review.'), 'success')
        if (profile && profile.status === 'rejected') {
          const resubmitted = await resubmitSellerApplication()
          onSaved(resubmitted)
        } else {
          onSaved(saved)
        }
      } catch (cause) {
        if (uploadedImage && !committed) await removeVendorShopImage(uploadedImage.path).catch(() => undefined)
        if (uploadedDocument && !committed) await removeVendorDocument(uploadedDocument).catch(() => undefined)
        throw cause
      }
      form.reset()
      setShopImage(null)
      setVerificationDocument(null)
    } catch (cause) {
      push(cause instanceof Error ? cause.message : t('The shop details could not be saved.'), 'error')
    } finally {
      setSaving(false)
    }
  }

  return <form className="placeholder-panel vendor-form" onSubmit={submit}>
    <h2>{t(mode === 'settings' ? 'Shop settings' : profile ? 'Update application' : 'Apply to open a shop')}</h2>
    <p>{t('Your public shop details and private verification information are handled separately. Only approved shops can publish products.')}</p>
    <div className="form-field"><label htmlFor="shop_name">{t('Shop name')} <span>*</span></label><input id="shop_name" name="shop_name" required maxLength={160} defaultValue={profile?.shop_name ?? ''} placeholder="e.g. Acme Traders" /></div>
    <div className="form-field"><label htmlFor="slug">{t('Shop URL slug')} <span>*</span></label><input id="slug" name="slug" required pattern="[a-z0-9]+(?:-[a-z0-9]+)*" defaultValue={profile?.slug ?? ''} placeholder="acme-traders" /></div>
    <div className="form-field"><label htmlFor="contact_email">{t('Business contact email')}</label><input id="contact_email" name="contact_email" type="email" defaultValue={profile?.contact_email ?? ''} placeholder="vendor@acme.com" /></div>
    <div className="form-field"><label htmlFor="phone">{t('Business phone')}</label><input id="phone" name="phone" type="tel" defaultValue={profile?.phone ?? ''} placeholder="+92 300 0000000" /></div>
    <div className="form-field form-field--wide"><label htmlFor="description">{t('Shop description')}</label><textarea id="description" name="description" rows={4} maxLength={2000} defaultValue={profile?.description ?? ''} placeholder={t('Describe your products, sourcing and fulfilment.')} /></div>
    {mode === 'settings' && <div className="form-field form-field--wide"><label htmlFor="shop-image">{t('Public shop picture')}</label>{(shopPreview || profile?.shop_image_url) && <img className="vendor-shop-image-preview" src={shopPreview ?? profile?.shop_image_url ?? ''} alt={t('Current shop picture')} />}<input id="shop-image" type="file" accept="image/jpeg,image/png,image/webp,image/avif" onChange={(event) => setShopImage(event.target.files?.[0] ?? null)} /><p className="form-help"><Store size={13} /> {t('Shown on your public shop page. JPG, PNG, WebP or AVIF up to 5 MB.')}</p></div>}
    {mode === 'settings' && <div className="form-field form-field--wide vendor-map-settings"><h3><MapPin size={17} /> {t('Explore map location')}</h3><p>{t('Add your shop location and choose whether customers may see its approximate area on the Explore map. Exact coordinates are rounded before publication.')}</p><button type="button" className="button button--outline" onClick={useShopLocation} disabled={locationLoading}><LocateFixed size={15} /> {t(locationLoading ? 'Getting location…' : shopLatitude && shopLongitude ? 'Refresh my location' : 'Use this device location')}</button><ShopLocationPicker point={shopLatitude && shopLongitude ? { latitude: Number(shopLatitude), longitude: Number(shopLongitude) } : null} onChange={({ latitude, longitude }) => { setShopLatitude(latitude.toFixed(6)); setShopLongitude(longitude.toFixed(6)) }} /><div className="form-field"><label htmlFor="shop-location-label">{t('Public area label')}</label><input id="shop-location-label" value={shopLocationLabel} onChange={(event) => setShopLocationLabel(event.target.value)} maxLength={120} placeholder={t('e.g. Gulberg, Lahore')} /></div><label className="vendor-map-opt-in"><input type="checkbox" name="show_shop_on_map" checked={showShopOnMap} onChange={(event) => setShowShopOnMap(event.target.checked)} /> <span>{t('Show my approximate shop location to customers on Explore')}</span></label></div>}
    {(!profile || !profile.document_path) && <div className="form-field form-field--wide"><label htmlFor="application-document">{t('Identity or business registration document')} <span>*</span></label><input id="application-document" type="file" accept="application/pdf,image/jpeg,image/png,image/webp" required={!profile?.document_path} onChange={(event) => setVerificationDocument(event.target.files?.[0] ?? null)} /><p className="form-help"><ShieldCheck size={13} /> {t('Required for review. PDF, JPG, PNG or WebP up to 10 MB. Only marketplace administrators can open this file.')}</p></div>}
    <div className="vendor-form__actions"><button className="button button--dark" disabled={saving}>{saving ? t('Saving…') : t(mode === 'settings' ? 'Save shop settings' : profile ? 'Save application' : 'Submit for verification')}</button><Link className="text-link" to="/account">{t('Back to account')}</Link></div>
  </form>
}

function VerificationDocumentSection({ profile, onSaved }: { profile: SellerProfile; onSaved: (profile: SellerProfile) => void }) {
  const { t } = useI18n()
  const { push } = useToast()
  const [file, setFile] = useState<File | null>(null)
  const [saving, setSaving] = useState(false)
  const [hasDocument, setHasDocument] = useState(Boolean(profile.document_path))
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!file) { push(t('Choose a verification document first.'), 'error'); return }
    setSaving(true)
    try {
      const documentPath = await uploadVendorDocument(file)
      const saved = await updateOwnShop({ shop_name: profile.shop_name, slug: profile.slug, description: profile.description, contact_email: profile.contact_email, phone: profile.phone, document_path: documentPath })
      onSaved(saved)
      setFile(null)
      setHasDocument(true)
      push(t('Private verification document saved.'), 'success')
    } catch (cause) { push(cause instanceof Error ? cause.message : t('The verification document could not be saved.'), 'error') }
    finally { setSaving(false) }
  }
  return <form className="placeholder-panel vendor-form vendor-verification" onSubmit={(event) => void submit(event)}>
    <h2>{t('Private verification documents')}</h2>
    <p>{t(hasDocument ? 'A private verification document is on file.' : 'No private verification document is on file.')}</p>
    <div className="form-field"><label htmlFor="vendor-private-document">{t('Identity or business registration document')}</label><input id="vendor-private-document" type="file" accept="application/pdf,image/jpeg,image/png,image/webp" onChange={(event) => setFile(event.target.files?.[0] ?? null)} /><p className="form-help"><ShieldCheck size={13} /> {t('PDF, JPG, PNG or WebP up to 10 MB. Only marketplace administrators can open this file.')}</p></div>
    <button type="submit" className="button button--outline" disabled={saving || !file}>{saving ? t('Uploading…') : t(hasDocument ? 'Replace private document' : 'Upload private document')}</button>
  </form>
}

export function VendorApplicationPage() {
  const { t } = useI18n()
  const { user, loading: authLoading } = useAuth()
  const [profile, setProfile] = useState<SellerProfile | null>(null)
  const [accountSuspensionReason, setAccountSuspensionReason] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState(false)
  usePageMeta(t('Seller application'), t('Apply to sell on JTBazar.'))

  useEffect(() => {
    let cancelled = false
    if (!user) { setLoading(false); return }
    void Promise.allSettled([getOwnSellerProfile(), getMyAccountSuspensionReason()])
      .then(([profileResult, suspensionResult]) => {
        if (cancelled) return
        const nextProfile = profileResult.status === 'fulfilled' ? profileResult.value : null
        setProfile(nextProfile)
        setAccountSuspensionReason(suspensionResult.status === 'fulfilled' ? suspensionResult.value : null)
        setEditing(!nextProfile)
      })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [user])

  if (authLoading) return <LoadingState label="Checking your account…" />
  if (!user) return <SignInForVendor />
  if (loading) return <LoadingState label="Loading seller application…" />
  if (accountSuspensionReason) return <VendorGate><AccountSuspensionNotice reason={accountSuspensionReason} /></VendorGate>
  if (profile?.status === 'suspended') return <VendorGate><AccountSuspensionNotice reason={profile.rejection_reason} /></VendorGate>

  if (profile?.status === 'approved') return <Navigate to="/vendor" replace />
  if (profile && !editing) {
    return <VendorGate><VendorStatusCard profile={profile} onEdit={() => setEditing(true)} /></VendorGate>
  }

  return <VendorGate><section className="page-shell info-page">
    {!profile && <header className="info-page__heading"><span className="eyebrow">JTBazar</span><h1>{t('Apply to open a')} <em>{t('shop.')}</em></h1><p>{t('Submit your seller details for platform review. Approval is required before listings, inventory and fulfilment tools are enabled.')}</p></header>}
    {profile && <header className="info-page__heading"><span className="eyebrow">{t('Seller application')}</span><h1>{t('Update your')} <em>{t('shop details.')}</em></h1><p>{t('Update the details below. A rejected application is sent back for review when you save.')}</p></header>}
    <ShopForm profile={profile} mode={profile ? 'settings' : 'apply'} onSaved={(saved) => { setProfile(saved); setEditing(false) }} />
    {profile && <button type="button" className="text-button vendor-cancel-edit" onClick={() => setEditing(false)}><X size={14} /> {t('Cancel')}</button>}
  </section></VendorGate>
}

type DashboardTab = 'overview' | 'listings' | 'inventory' | 'orders' | 'cases' | 'settings'

export function VendorDashboardPage() {
  const { t } = useI18n()
  const { user, loading: authLoading } = useAuth()
  const { push } = useToast()
  const { categories } = useCatalog()
  const [profile, setProfile] = useState<SellerProfile | null>(null)
  const [accountSuspensionReason, setAccountSuspensionReason] = useState<string | null>(null)
  const [products, setProducts] = useState<VendorProduct[]>([])
  const [inventory, setInventory] = useState<VendorInventory[]>([])
  const [cases, setCases] = useState<MarketplaceCase[]>([])
  const [orderItems, setOrderItems] = useState<VendorOrderItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [tab, setTab] = useState<DashboardTab>('overview')
  const [editingProduct, setEditingProduct] = useState<VendorProduct | null>(null)
  const [creatingProduct, setCreatingProduct] = useState(false)
  const [stockProduct, setStockProduct] = useState<VendorProduct | null>(null)
  const [stockQuantity, setStockQuantity] = useState('0')
  const [stockMinimum, setStockMinimum] = useState('1')
  const [stockMinimumValue, setStockMinimumValue] = useState('0')
  const [savingStock, setSavingStock] = useState(false)
  usePageMeta(t('Vendor dashboard'), t('Manage listings, stock, fulfilment and customer cases.'))

  async function load() {
    setLoading(true)
    setError(null)
    try {
      const suspensionReason = await getMyAccountSuspensionReason().catch(() => null)
      setAccountSuspensionReason(suspensionReason)
      if (suspensionReason) { setProfile(null); return }
      const nextProfile = await getOwnSellerProfile()
      setProfile(nextProfile)
      if (nextProfile?.status === 'approved') {
        const results = await Promise.allSettled([listOwnProducts(), listOwnInventory(), listOwnCases(), listOwnOrderItems()] as const)
        const [productsResult, inventoryResult, casesResult, ordersResult] = results
        setProducts(productsResult.status === 'fulfilled' ? productsResult.value : [])
        setInventory(inventoryResult.status === 'fulfilled' ? inventoryResult.value : [])
        setCases(casesResult.status === 'fulfilled' ? casesResult.value : [])
        setOrderItems(ordersResult.status === 'fulfilled' ? ordersResult.value : [])
        const failures = [
          { label: 'Listings', result: productsResult }, { label: 'Inventory', result: inventoryResult },
          { label: 'Cases', result: casesResult }, { label: 'Fulfilment', result: ordersResult },
        ].flatMap(({ label, result }) => result.status === 'rejected' ? [`${label}: ${result.reason instanceof Error ? result.reason.message : 'could not be loaded'}`] : [])
        setError(failures.length ? failures.join(' · ') : null)
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Vendor data could not be loaded.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (authLoading) return
    if (!user) { setLoading(false); return }
    void load()
  }, [authLoading, user?.id])

  const categoriesById = useMemo(() => new Map(categories.map((category) => [category.id, category.name])), [categories])

  if (authLoading) return <LoadingState label="Checking your account…" />
  if (!user) return <SignInForVendor />
  if (loading) return <LoadingState label="Loading vendor dashboard…" />
  if (accountSuspensionReason) return <VendorGate><AccountSuspensionNotice reason={accountSuspensionReason} /></VendorGate>
  if (!profile) return <VendorGate><section className="page-shell"><div className="placeholder-panel vendor-status"><h2>{t('No seller application yet')}</h2><p>{t('Apply for a seller account to manage listings and orders.')}</p><Link className="button button--dark" to="/vendor/apply">{t('Apply to sell')}</Link></div></section></VendorGate>
  if (profile.status === 'suspended') return <VendorGate><AccountSuspensionNotice reason={profile.rejection_reason} /></VendorGate>
  if (profile.status !== 'approved') return <VendorGate><VendorStatusCard profile={profile} /></VendorGate>

  const openCases = cases.filter((item) => !['resolved', 'rejected', 'approved'].includes(item.status)).length

  return <VendorGate><section className="page-shell vendor-dashboard">
    <header className="vendor-dashboard__header">
      <div><span className="eyebrow">{profile.shop_name}</span><h1>{t('Vendor')} <em>{t('dashboard.')}</em></h1><p>{t('Listings begin in moderation, stock changes are recorded, and customer cases stay within your authorized seller boundary.')}</p></div>
      <div className="vendor-dashboard__links"><Link to={`/shops/${profile.slug}`} className="text-link">{t('View public shop')} <ExternalLink size={14} /></Link><button type="button" className="button button--outline" onClick={() => void load()}><RefreshCw size={15} /> {t('Refresh')}</button></div>
    </header>

    {error && <div className="placeholder-panel vendor-error"><AlertCircle size={18} /> {error}</div>}

    <div className="vendor-dashboard-layout">
    <aside className="vendor-sidebar" aria-label={t('Vendor dashboard navigation')}>
    <nav className="vendor-tabs" aria-label={t('Vendor sections')}>
      {([
        { value: 'overview', label: 'Overview', icon: LayoutDashboard },
        { value: 'listings', label: 'Listings', icon: PackageSearch },
        { value: 'inventory', label: 'Inventory', icon: Boxes },
        { value: 'orders', label: 'Fulfilment', icon: Truck },
        { value: 'cases', label: 'Cases', icon: ClipboardList },
        { value: 'settings', label: 'Shop settings', icon: Settings },
      ] as const).map(({ value, label, icon: Icon }) => <button key={value} type="button" className={tab === value ? 'is-active' : ''} aria-current={tab === value ? 'page' : undefined} onClick={() => setTab(value)}><Icon size={17} aria-hidden="true" /><span>{t(label)}</span></button>)}
    </nav>
    <Link to="/account" className="vendor-sidebar-account">{t('Account settings')}</Link>
    </aside>
    <div className="vendor-dashboard-main">
    <div className="vendor-metrics">
      <div><Store size={18} /><strong>{products.length}</strong><span>{t('Listings')}</span></div>
      <div><Boxes size={18} /><strong>{inventory.filter((item) => item.quantity > 0).length}</strong><span>{t('Stock records')}</span></div>
      <div><Truck size={18} /><strong>{orderItems.filter((item) => !['delivered', 'cancelled'].includes(item.vendor_fulfillment_status)).length}</strong><span>{t('Open fulfilment')}</span></div>
      <div><ClipboardList size={18} /><strong>{openCases}</strong><span>{t('Open cases')}</span></div>
    </div>

    {tab === 'overview' && <div className="vendor-grid">
      <section className="placeholder-panel vendor-stack">
        <h2>{t('Recent listings')}</h2>
        {products.slice(0, 5).map((product) => <div className="vendor-list__row" key={product.id}><div><strong>{product.name}</strong><small>{formatPKR(Number(product.price))} · {product.publication_status.replace(/_/g, ' ')} · {t('moderation')}: {product.moderation_status.replace(/_/g, ' ')}</small></div><StatusBadge status={product.publication_status} /></div>)}
        {products.length === 0 && <p>{t('No listings yet. Create your first listing to enter moderation.')}</p>}
        <button type="button" className="text-link" onClick={() => { setCreatingProduct(true); setTab('listings') }}><Plus size={14} /> {t('Create a listing')}</button>
      </section>
      <section className="placeholder-panel vendor-stack">
        <h2>{t('Latest orders')}</h2>
        {orderItems.slice(0, 5).map((item) => <div className="vendor-list__row" key={item.id}><div><strong>{item.order_number} · {item.product_name_snapshot}</strong><small>{t('Qty')} {item.quantity} · {formatPKR(Number(item.line_total))}</small></div><StatusBadge status={item.vendor_fulfillment_status} /></div>)}
        {orderItems.length === 0 && <p>{t('No vendor order items yet. Buyer contact and address details are intentionally excluded from this view.')}</p>}
        <button type="button" className="text-link" onClick={() => setTab('orders')}>{t('Open fulfilment')} <ArrowRight size={14} /></button>
      </section>
    </div>}

    {tab === 'listings' && <section className="account-panel">
      <div className="account-panel__heading"><div><h2>{t('Listings')}</h2><p>{t('Vendor edits are re-checked by moderation before publication. Supplier costs stay private.')}</p></div>{!creatingProduct && !editingProduct && <button type="button" className="button button--dark" onClick={() => setCreatingProduct(true)}><Plus size={15} /> {t('New listing')}</button>}</div>
      {(creatingProduct || editingProduct) && <ProductEditor
        product={editingProduct}
        categories={[...categoriesById.entries()].map(([id, name]) => ({ id, name }))}
        onCancel={() => { setCreatingProduct(false); setEditingProduct(null) }}
        onSaved={async (message) => { push(message, 'success'); setCreatingProduct(false); setEditingProduct(null); await load() }}
      />}
      {products.length === 0 && !creatingProduct && <div className="empty-state"><Package size={28} /><h2>{t('No listings yet')}</h2><p>{t('Submit a listing for moderation. It will appear in the catalog once approved.')}</p></div>}
      {products.length > 0 && <div className="admin-table-wrap"><table className="admin-table vendor-table"><thead><tr><th>{t('Product')}</th><th>{t('Price')}</th><th>{t('Publication')}</th><th>{t('Moderation')}</th><th>{t('Costs')}</th><th>{t('Actions')}</th></tr></thead><tbody>{products.map((product) => <tr key={product.id}><td data-label={t('Product')}><strong>{product.name}</strong><small>{categoriesById.get(product.category_id ?? '') ?? t('No category')}</small></td><td data-label={t('Price')}>{formatPKR(Number(product.price))}</td><td data-label={t('Publication')}><StatusBadge status={product.publication_status} /></td><td data-label={t('Moderation')}><StatusBadge status={product.moderation_status} /></td><td data-label={t('Costs')}><small>{t('Supplier')}: {product.supplier_cost === null ? '—' : formatPKR(Number(product.supplier_cost))}<br />{t('Fulfilment')}: {formatPKR(Number(product.fulfillment_expense))}</small></td><td data-label={t('Actions')}><button type="button" className="text-button" onClick={() => { setEditingProduct(product); setCreatingProduct(false) }}><Pencil size={14} /> {t('Edit')}</button>{product.moderation_status === 'approved' && <button type="button" className="text-button" onClick={() => void setVendorProductVisibility(product.id, !product.vendor_hidden).then(() => load()).catch((cause) => push(cause instanceof Error ? cause.message : t('Visibility update failed.'), 'error'))}>{product.vendor_hidden ? t('Unhide') : t('Hide')}</button>}{(categoriesById.get(product.category_id ?? '') ?? '').toLowerCase().match(/food|grocery|groceries|fresh produce/) && <button type="button" className="text-button" onClick={() => { setStockProduct(product); setStockQuantity(String(product.daily_available_quantity ?? 0)); setStockMinimum(String(product.daily_minimum_quantity ?? 1)); setStockMinimumValue('0') }}>{t('Set today’s stock')}</button>}</td></tr>)}</tbody></table></div>}
    </section>}

    {stockProduct && <div className="dialog-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !savingStock) setStockProduct(null) }}>
      <section className="dialog-card" role="dialog" aria-modal="true" aria-labelledby="daily-stock-title">
        <div className="account-panel__heading"><div><h2 id="daily-stock-title">{t('Set today’s stock')}</h2><p>{stockProduct.name}</p></div><button type="button" className="icon-button" aria-label={t('Close')} onClick={() => setStockProduct(null)} disabled={savingStock}><X size={18} /></button></div>
        <label className="form-field"><span>{t('Today’s available quantity')}</span><input type="number" min="0" step="1" value={stockQuantity} onChange={(event) => setStockQuantity(event.target.value)} /></label>
        <label className="form-field"><span>{t('Minimum quantity per order')}</span><input type="number" min="1" step="1" value={stockMinimum} onChange={(event) => setStockMinimum(event.target.value)} /></label>
        <label className="form-field"><span>{t('Shop minimum order value (PKR)')}</span><input type="number" min="0" step="1" value={stockMinimumValue} onChange={(event) => setStockMinimumValue(event.target.value)} /></label>
        <div className="dialog-actions"><button type="button" className="button button--outline" onClick={() => setStockProduct(null)} disabled={savingStock}>{t('Cancel')}</button><button type="button" className="button button--dark" disabled={savingStock || !Number.isInteger(Number(stockQuantity)) || Number(stockQuantity)<0 || !Number.isInteger(Number(stockMinimum)) || Number(stockMinimum)<1 || !Number.isFinite(Number(stockMinimumValue)) || Number(stockMinimumValue)<0} onClick={async () => { setSavingStock(true); try { await setVendorDailyAvailability({ productId: stockProduct.id, isDailyItem: true, availableQuantity: Number(stockQuantity), minimumQuantity: Number(stockMinimum), minimumOrderValue: Number(stockMinimumValue) }); push(t('Today’s availability and minimum order rules saved.'), 'success'); setStockProduct(null); await load() } catch (cause) { push(cause instanceof Error ? cause.message : t('Availability update failed.'), 'error') } finally { setSavingStock(false) } }}>{savingStock ? t('Saving…') : t('Save availability')}</button></div>
      </section>
    </div>}
    {tab === 'inventory' && <section className="account-panel">
      <div className="account-panel__heading"><div><h2>{t('Inventory')}</h2><p>{t('Stock changes are recorded in the inventory movement log.')}</p></div><button type="button" className="button button--outline" onClick={() => void load()}><RefreshCw size={15} /> {t('Refresh')}</button></div>
      {inventory.length === 0 ? <div className="empty-state"><Boxes size={28} /><h2>{t('No stock records')}</h2><p>{t('Stock records appear when a listing with inventory tracking is created.')}</p></div> : <div className="admin-table-wrap"><table className="admin-table vendor-table"><thead><tr><th>{t('Product')}</th><th>{t('Variant')}</th><th>{t('Quantity')}</th><th>{t('Updated')}</th><th>{t('Adjust')}</th></tr></thead><tbody>{inventory.map((item) => <InventoryRow key={item.id} item={item} onSaved={async (message) => { push(message, 'success'); await load() }} onError={(message) => push(message, 'error')} />)}</tbody></table></div>}
    </section>}

    {tab === 'orders' && <VendorOrdersPanel items={orderItems} onError={(message) => push(message, 'error')} />}

    {tab === 'cases' && <section className="account-panel">
      <div className="account-panel__heading"><div><h2>{t('Support & cases')}</h2><p>{t('Create a support ticket or respond to customer returns and complaints.')}</p></div><button type="button" className="button button--outline" onClick={() => void load()}><RefreshCw size={15} /> {t('Refresh')}</button></div>
      <VendorSupportDesk sellerId={profile.id} onError={(message) => push(message, 'error')} />
      <h3 className="vendor-cases-subheading">{t('Customer cases')}</h3>
      {cases.length === 0 ? <div className="empty-state"><ClipboardList size={28} /><h2>{t('No cases')}</h2><p>{t('Buyer cases for your items will appear here.')}</p></div> : <div className="case-list">{cases.map((item) => <CaseResponse key={item.id} item={item} onResponded={async () => { push(t('Response sent.'), 'success'); await load() }} onError={(message) => push(message, 'error')} />)}</div>}
    </section>}

    {tab === 'settings' && <section className="account-panel">
      <div className="account-panel__heading"><div><h2>{t('Shop settings')}</h2><p>{t('Update the public details and logo customers see on your shop page.')}</p></div></div>
      <ShopForm profile={profile} mode="settings" onSaved={(saved) => { setProfile(saved); push(t('Shop settings saved.'), 'success') }} />
    </section>}
    </div></div>
  </section></VendorGate>
}

function ProductEditor({ product, categories, onCancel, onSaved }: {
  product: VendorProduct | null
  categories: { id: string; name: string }[]
  onCancel: () => void
  onSaved: (message: string) => Promise<void>
}) {
  const { t } = useI18n()
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [imageFile, setImageFile] = useState<File | null>(null)
  const [imagePreview, setImagePreview] = useState<string | null>(null)
  const [createdProductId, setCreatedProductId] = useState<string | null>(null)
  const editing = Boolean(product)

  useEffect(() => {
    if (!imageFile) { setImagePreview(null); return }
    const previewUrl = URL.createObjectURL(imageFile)
    setImagePreview(previewUrl)
    return () => URL.revokeObjectURL(previewUrl)
  }, [imageFile])

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const data = new FormData(event.currentTarget)
    const price = Number(data.get('price'))
    const supplierCostRaw = String(data.get('supplier_cost') ?? '').trim()
    const supplierCost = supplierCostRaw ? Number(supplierCostRaw) : null
    const fulfillmentExpense = Number(data.get('fulfillment_expense') || 0)
    const minimumProfit = Number(data.get('minimum_profit') || 0)
    if (!Number.isFinite(price) || price < 0) { setError(t('Enter a valid selling price.')); return }
    if (supplierCost !== null && (!Number.isFinite(supplierCost) || supplierCost < 0)) { setError(t('Enter a valid supplier cost.')); return }
    if (!Number.isFinite(fulfillmentExpense) || fulfillmentExpense < 0 || !Number.isFinite(minimumProfit) || minimumProfit < 0) { setError(t('Enter valid fulfilment and profit values.')); return }
    setSaving(true)
    setError(null)
    try {
      const input = {
        name: String(data.get('name') ?? '').trim(),
        slug: String(data.get('slug') ?? '').trim(),
        sku: String(data.get('sku') ?? '').trim() || null,
        short_description: String(data.get('short_description') ?? '').trim(),
        description: String(data.get('description') ?? '').trim(),
        price,
        supplier_cost: supplierCost,
        fulfillment_expense: fulfillmentExpense,
        minimum_profit: minimumProfit,
      }
      const wasEditing = Boolean(product || createdProductId)
      let productId = product?.id ?? createdProductId
      if (productId) {
        await updateVendorProduct(productId, input)
      } else {
        productId = await createVendorProduct({ ...input, category_id: String(data.get('category_id') ?? '') || null, track_inventory: data.get('track_inventory') === 'on' })
        setCreatedProductId(productId)
      }
      if (imageFile && productId) {
        await uploadOwnProductImage(productId, imageFile, input.name)
      }
      await onSaved(t(wasEditing ? 'Product changes submitted for moderation.' : 'Listing submitted for moderation.'))
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : t('The listing could not be saved.')
      setError(createdProductId && !product
        ? `${t('The listing was created, but its image could not be saved. Correct the image and submit again; the listing will not be duplicated.')} ${message}`
        : message)
    } finally {
      setSaving(false)
    }
  }

  return <form className="vendor-form shine-surface vendor-form--editor" onSubmit={submit}>
    <div className="account-panel__heading"><h2>{t(editing ? 'Edit listing' : 'New listing')}</h2><button type="button" className="icon-button" onClick={onCancel} aria-label={t('Close listing form')}><X size={17} /></button></div>
    {error && <p className="field-error" role="alert"><AlertCircle size={15} /> {error}</p>}
    <div className="form-field"><label htmlFor="product-name">{t('Product name')} <span>*</span></label><input id="product-name" name="name" required defaultValue={product?.name ?? ''} /></div>
    <div className="form-field"><label htmlFor="product-slug">{t('Slug')} <span>*</span></label><input id="product-slug" name="slug" required pattern="[a-z0-9]+(?:-[a-z0-9]+)*" defaultValue={product?.slug ?? ''} /></div>
    <div className="form-field"><label htmlFor="product-sku">{t('SKU')}</label><input id="product-sku" name="sku" defaultValue={product?.sku ?? ''} /></div>
    <div className="form-field"><label htmlFor="product-category">{t('Category')}</label><select id="product-category" name="category_id" defaultValue={product?.category_id ?? ''}>{categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select></div>
    <div className="form-field"><label htmlFor="product-price">{t('Selling price')} <span>*</span></label><input id="product-price" name="price" type="number" min="0" step="0.01" required defaultValue={product ? String(product.price) : ''} /></div>
    <div className="form-field"><label htmlFor="product-supplier-cost">{t('Supplier cost')} <span>{t('private')}</span></label><input id="product-supplier-cost" name="supplier_cost" type="number" min="0" step="0.01" defaultValue={product?.supplier_cost == null ? '' : String(product.supplier_cost)} /></div>
    <div className="form-field"><label htmlFor="product-fulfilment">{t('Fulfilment expense')}</label><input id="product-fulfilment" name="fulfillment_expense" type="number" min="0" step="0.01" defaultValue={product ? String(product.fulfillment_expense) : '0'} /></div>
    <div className="form-field"><label htmlFor="product-profit">{t('Minimum profit')}</label><input id="product-profit" name="minimum_profit" type="number" min="0" step="0.01" defaultValue={product ? String(product.minimum_profit) : '0'} /></div>
    <div className="form-field form-field--wide"><label htmlFor="product-image">{t('Product image')} {imageFile && <span>· {imageFile.name}</span>}</label>{imagePreview && <img className="vendor-product-image-preview" src={imagePreview} alt={t('Selected product preview')} />}<input id="product-image" name="product_image" type="file" accept="image/jpeg,image/png,image/webp,image/avif" onChange={(event) => setImageFile(event.target.files?.[0] ?? null)} /><p className="form-help">{t('JPG, PNG, WebP or AVIF · maximum 10 MB. You can add another image when editing the listing.')}</p></div>
    <div className="form-field form-field--wide"><label htmlFor="product-short">{t('Short description')}</label><input id="product-short" name="short_description" maxLength={300} defaultValue={product?.short_description ?? ''} /></div>
    <div className="form-field form-field--wide"><label htmlFor="product-description">{t('Full description')}</label><textarea id="product-description" name="description" rows={5} defaultValue={product?.description ?? ''} /></div>
    {!editing && <label className="checkout-save-address"><input type="checkbox" name="track_inventory" defaultChecked /> {t('Track inventory for this listing')}</label>}
    <div className="vendor-form__actions"><button type="submit" className="button button--dark" disabled={saving}>{saving ? t('Saving…') : t(editing ? 'Save changes' : 'Submit listing')}</button><button type="button" className="button button--outline" onClick={onCancel}>{t('Cancel')}</button></div>
  </form>
}

function InventoryRow({ item, onSaved, onError }: { item: VendorInventory; onSaved: (message: string) => Promise<void>; onError: (message: string) => void }) {
  const { t } = useI18n()
  const [editing, setEditing] = useState(false)
  const [quantity, setQuantity] = useState(String(item.quantity))
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const value = Number(quantity)
    if (!Number.isInteger(value) || value < 0) { onError(t('Stock must be a whole number of zero or more.')); return }
    if (!note.trim()) { onError(t('Add a reason for this stock adjustment.')); return }
    setSaving(true)
    try { await adjustOwnInventory(item.id, value, note.trim()); setEditing(false); setNote(''); await onSaved(t('Inventory updated.')) }
    catch (cause) { onError(cause instanceof Error ? cause.message : t('Inventory could not be updated.')) }
    finally { setSaving(false) }
  }
  return <tr>
    <td data-label={t('Product')}><strong>{item.product_name}</strong></td>
    <td data-label={t('Variant')}>{item.variant_name ?? t('Default')}</td>
    <td data-label={t('Quantity')}>{item.quantity}</td>
    <td data-label={t('Updated')}><small>{new Date(item.updated_at).toLocaleDateString()}</small></td>
    <td data-label={t('Adjust')}>{editing ? <form className="inline-form" onSubmit={save}><input aria-label={t('New quantity')} type="number" min="0" step="1" autoFocus value={quantity} onChange={(event) => setQuantity(event.target.value)} /><input aria-label={t('Adjustment reason')} value={note} onChange={(event) => setNote(event.target.value)} placeholder={t('Reason')} /><button type="submit" className="text-button" disabled={saving}>{saving ? t('Saving…') : t('Save')}</button><button type="button" className="text-button" onClick={() => setEditing(false)}>{t('Cancel')}</button></form> : <button type="button" className="text-button" onClick={() => setEditing(true)}><Pencil size={14} /> {t('Adjust')}</button>}</td>
  </tr>
}

function formatVariantSnapshot(variant: unknown): string {
  if (!variant || typeof variant !== 'object' || Array.isArray(variant)) return '—'
  const snapshot = variant as Record<string, unknown>
  const parts: string[] = []
  const label = typeof snapshot.label === 'string' ? snapshot.label.trim() : ''
  const value = typeof snapshot.value === 'string' || typeof snapshot.value === 'number' ? String(snapshot.value).trim() : ''
  if (label && value) parts.push(`${label}: ${value}`)
  else if (value) parts.push(value)

  const attributes = snapshot.attributes && typeof snapshot.attributes === 'object' && !Array.isArray(snapshot.attributes)
    ? snapshot.attributes as Record<string, unknown>
    : {}
  const humanize = (key: string) => key.replace(/[_-]+/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase())
  const readableValue = (raw: unknown) => {
    if (typeof raw === 'string') {
      const trimmed = raw.trim()
      return trimmed ? trimmed.replace(/^\p{L}/u, (letter) => letter.toUpperCase()) : ''
    }
    if (typeof raw === 'number' || typeof raw === 'boolean') return String(raw)
    return ''
  }
  for (const [key, raw] of Object.entries(attributes)) {
    const text = readableValue(raw)
    if (text) parts.push(`${humanize(key)}: ${text}`)
  }
  for (const [key, raw] of Object.entries(snapshot)) {
    if (['label', 'value', 'attributes'].includes(key)) continue
    const text = readableValue(raw)
    if (text) parts.push(`${humanize(key)}: ${text}`)
  }
  return [...new Set(parts)].join(' · ') || '—'
}

function VendorOrdersPanel({ items, onError }: { items: VendorOrderItem[]; onError: (message: string) => void }) {
  const { t } = useI18n()
  const [printingOrderId, setPrintingOrderId] = useState<string | null>(null)
  const [pageItems, setPageItems] = useState(items)
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('all')
  const [page, setPage] = useState(0)
  const [fetching, setFetching] = useState(false)
  const pageSize = 12
  const totalOrders = Number(pageItems[0]?.total_orders ?? 0)
  const totalPages = Math.max(1, Math.ceil(totalOrders / pageSize))
  const orderGroups = useMemo(() => {
    const groups = new Map<string, VendorOrderItem[]>()
    for (const item of pageItems) groups.set(item.order_id, [...(groups.get(item.order_id) ?? []), item])
    return [...groups.entries()].map(([id, orderItems]) => ({ id, items: orderItems }))
  }, [pageItems])

  async function reloadPage() {
    setFetching(true)
    try {
      const rows = await listOwnOrderItems({ page, pageSize, search, status })
      setPageItems(rows)
    } catch (cause) { onError(cause instanceof Error ? cause.message : t('Orders could not be loaded.')) }
    finally { setFetching(false) }
  }

  useEffect(() => {
    const timer = window.setTimeout(() => { void reloadPage() }, 250)
    return () => window.clearTimeout(timer)
  }, [search, status, page])

  useEffect(() => {
    if (!printingOrderId) return
    const frame = window.requestAnimationFrame(() => window.print())
    return () => window.cancelAnimationFrame(frame)
  }, [printingOrderId])

  useEffect(() => {
    const clearPrint = () => setPrintingOrderId(null)
    window.addEventListener('afterprint', clearPrint)
    return () => window.removeEventListener('afterprint', clearPrint)
  }, [])

  return <section className="account-panel">
    <div className="account-panel__heading"><div><h2>{t('My product orders')}</h2><p>{t('View orders for your own products and check whether each order has been delivered. Customer contact and delivery details are managed by the marketplace team.')}</p></div></div>
    <div className="vendor-order-filters"><label className="vendor-order-search"><Search size={16} /><input value={search} onChange={(event) => { setSearch(event.target.value); setPage(0) }} placeholder={t('Search order number or product')} /></label><label><span>{t('Delivery status')}</span><select value={status} onChange={(event) => { setStatus(event.target.value); setPage(0) }}><option value="all">{t('All delivery statuses')}</option>{['pending','delivered','not_delivered'].map((value) => <option key={value} value={value}>{t(value.replace(/_/g, ' '))}</option>)}</select></label></div>
    {pageItems.length === 0 ? <div className="empty-state"><PackageSearch size={28} /><h2>{search || status !== 'all' ? t('No matching orders') : t('No product orders yet')}</h2><p>{search || status !== 'all' ? t('Clear the search or choose another delivery status to see more orders.') : t('Orders for your products will appear here after a customer places an order.')}</p></div> : <div className={`vendor-list${fetching ? ' is-loading' : ''}`} aria-busy={fetching}>{orderGroups.map(({ id, items: orderItems }) => <section className="vendor-order-group" key={id}>
      <header className="vendor-order-group__head"><div><strong>{orderItems[0].order_number}</strong><small>{new Date(orderItems[0].order_created_at).toLocaleString()} · {orderItems.length} {t(orderItems.length === 1 ? 'item' : 'items')}</small></div><div className="vendor-order-group__actions"><button type="button" className="button button--dark" onClick={() => void markVendorOrderReady(id).then(() => { return reloadPage() }).catch((cause) => onError(cause instanceof Error ? cause.message : t('Order could not be marked ready.')))}>{t('Ready for pickup')}</button><button type="button" className="button button--outline vendor-order-slip-action" onClick={() => setPrintingOrderId(id)}><Printer size={15} /> {t('Print product slip')}</button></div></header>
      {orderItems.map((item) => <article className="vendor-order-card" key={item.id}>
        <div className="vendor-order-card__head">{item.product_image_url && <img src={item.product_image_url} alt="" loading="lazy" style={{ width: 56, height: 56, objectFit: 'cover', borderRadius: 8, flexShrink: 0 }} />}<div><strong>{item.product_name_snapshot}</strong><small>{t('Qty')} {item.quantity} · {t('Variant')}: {formatVariantSnapshot(item.variant_snapshot)} · {new Date(item.created_at).toLocaleDateString()}</small></div><StatusBadge status={item.vendor_fulfillment_status === 'delivered' ? 'delivered' : item.vendor_fulfillment_status === 'pending' ? 'pending' : 'not_delivered'} /></div>
      </article>)}
      {printingOrderId === id && <VendorOrderSlip items={orderItems} />}
    </section>)}</div>}
    <div className="vendor-api-pagination"><span>{totalOrders ? `${page * pageSize + 1}–${Math.min(totalOrders, (page + 1) * pageSize)} ${t('of')} ${totalOrders} ${t('orders')}` : t('No orders')}</span><div><button type="button" className="button button--outline" disabled={page === 0 || fetching} onClick={() => setPage((value) => Math.max(0, value - 1))}>{t('Previous')}</button><span>{page + 1} / {totalPages}</span><button type="button" className="button button--outline" disabled={page + 1 >= totalPages || fetching} onClick={() => setPage((value) => value + 1)}>{t('Next')}</button></div></div>
  </section>
}

function VendorOrderSlip({ items }: { items: VendorOrderItem[] }) {
  const { t } = useI18n()
  const order = items[0]
  return <article className="vendor-print-slip" data-active="true">
    <header className="vendor-print-slip__header"><div><span>{t('Product packing slip')}</span><h1>JTBazar</h1></div><div><strong>{order.order_number}</strong><small>{new Date(order.order_created_at).toLocaleString()}</small></div></header>
    <table><thead><tr><th>{t('Product')}</th><th>{t('SKU')}</th><th>{t('Variant')}</th><th>{t('Qty')}</th></tr></thead><tbody>{items.map((item) => <tr key={item.id}><td>{item.product_name_snapshot}</td><td>{item.sku_snapshot || '—'}</td><td>{formatVariantSnapshot(item.variant_snapshot)}</td><td>{item.quantity}</td></tr>)}</tbody></table>
    <footer>{t('Product and quantity summary only. Customer contact and delivery details are managed by the marketplace team.')}</footer>
  </article>
}

function CaseResponse({ item, onResponded, onError }: { item: MarketplaceCase; onResponded: () => Promise<void>; onError: (message: string) => void }) {
  const { t } = useI18n()
  const [response, setResponse] = useState(item.seller_response ?? '')
  const [saving, setSaving] = useState(false)
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSaving(true)
    try { await respondToCase(item.id, response); await onResponded() }
    catch (cause) { onError(cause instanceof Error ? cause.message : t('The response could not be sent.')) }
    finally { setSaving(false) }
  }
  const canRespond = ['open', 'seller_responded', 'under_review'].includes(item.status)
  return <article className="case-card">
    <div className="case-card__head"><div><strong>{t(item.case_type)}</strong><span>{new Date(item.created_at).toLocaleString()}</span></div><StatusBadge status={item.status} /></div>
    <p>{item.reason}</p>
    {item.seller_response && <div className="case-card__response"><span className="eyebrow">{t('Your response')}</span><p>{item.seller_response}</p></div>}
    {item.admin_decision && <div className="case-card__response"><span className="eyebrow">{t('Marketplace decision')}</span><p>{item.admin_decision}</p></div>}
    <div className="case-card__footer">
      {item.evidence_path && <button type="button" className="text-button" onClick={async () => { const url = await getCaseEvidenceUrl(item.evidence_path!); if (url) window.open(url, '_blank', 'noopener,noreferrer'); else onError(t('The evidence file could not be opened.')) }}><FileUp size={14} /> {t('View evidence')}</button>}
      {canRespond && <form className="case-response-form" onSubmit={submit}><label className="sr-only" htmlFor={`case-response-${item.id}`}>{t('Your response')}</label><textarea id={`case-response-${item.id}`} rows={3} value={response} onChange={(event) => setResponse(event.target.value)} placeholder={t('Explain what you can offer or what you have checked.')} /><button type="submit" className="button button--dark" disabled={saving}>{saving ? t('Sending…') : t('Send response')}</button></form>}
    </div>
  </article>
}

function VendorSupportDesk({ sellerId, onError }: { sellerId: string; onError: (message: string) => void }) {
  const { t } = useI18n()
  const { push } = useToast()
  const [tickets, setTickets] = useState<VendorSupportTicket[]>([])
  const [saving, setSaving] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [refresh, setRefresh] = useState(0)
  useEffect(() => { let active = true; void listOwnSupportTickets().then((rows) => { if (active) { setTickets(rows); setLoadError(null) } }).catch((cause: unknown) => { if (active) setLoadError(cause instanceof Error ? cause.message : t('Support tickets could not be loaded.')) }); return () => { active = false } }, [refresh, t])
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = event.currentTarget
    const data = new FormData(form)
    const subject = String(data.get('subject') ?? '').trim()
    const message = String(data.get('message') ?? '').trim()
    setSaving(true)
    try { const emailed = await createOwnSupportTicket(sellerId, subject, message); form.reset(); push(emailed ? t('Support ticket sent to the marketplace team.') : 'Ticket saved. Email notifications are not configured yet.', 'success'); setRefresh((value) => value + 1) }
    catch (cause) { onError(cause instanceof Error ? cause.message : t('Support ticket could not be created.')) }
    finally { setSaving(false) }
  }
  return <div className="vendor-support-desk">
    <form className="vendor-support-form" onSubmit={(event) => void submit(event)}><h3>{t('Contact marketplace support')}</h3><div className="form-field"><label htmlFor="vendor-ticket-subject">{t('Subject')}</label><input id="vendor-ticket-subject" name="subject" required minLength={3} maxLength={180} /></div><div className="form-field"><label htmlFor="vendor-ticket-message">{t('How can we help?')}</label><textarea id="vendor-ticket-message" name="message" required minLength={3} maxLength={4000} rows={4} /></div><button type="submit" className="button button--dark" disabled={saving}>{saving ? t('Sending…') : t('Create support ticket')}</button></form>
    <div className="vendor-support-list"><h3>{t('Your support tickets')}</h3>{loadError ? <p className="field-error">{loadError}</p> : tickets.length === 0 ? <p>{t('No support tickets yet.')}</p> : tickets.map((ticket) => <article className="vendor-support-ticket" key={ticket.id}><div><strong>{ticket.subject}</strong><StatusBadge status={ticket.status} /></div><p>{ticket.message}</p>{ticket.admin_response && <blockquote><b>{t('Marketplace reply')}</b><br />{ticket.admin_response}</blockquote>}<small>{new Date(ticket.created_at).toLocaleString()}</small></article>)}</div>
  </div>
}
