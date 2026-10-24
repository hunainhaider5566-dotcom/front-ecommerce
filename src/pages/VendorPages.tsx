import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { Link, Navigate, useLocation } from 'react-router-dom'
import { AlertCircle, ArrowRight, Boxes, ClipboardList, ExternalLink, FileUp, LayoutDashboard, Package, PackageSearch, Pencil, Plus, RefreshCw, Settings, ShieldCheck, Store, Truck, X } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import { useCatalog } from '../contexts/CatalogContext'
import { useToast } from '../contexts/ToastContext'
import { useI18n } from '../i18n/LocaleContext'
import { usePageMeta } from '../hooks/usePageMeta'
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
  updateOwnOrderItem,
  updateOwnShop,
  updateVendorProduct,
  uploadVendorDocument,
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
  if (loading) return <section className="page-shell"><div className="placeholder-panel"><RefreshCw className="spin" size={18} /> Loading your seller account…</div></section>
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
    <VerificationDocumentSection profile={profile} onSaved={() => undefined} />
  </section>
}

function ShopForm({ profile, onSaved, mode = 'apply' }: { profile: SellerProfile | null; onSaved: (profile: SellerProfile) => void; mode?: 'apply' | 'settings' }) {
  const { t } = useI18n()
  const { push } = useToast()
  const [saving, setSaving] = useState(false)
  const [shopImage, setShopImage] = useState<File | null>(null)
  const [shopPreview, setShopPreview] = useState<string | null>(null)

  useEffect(() => {
    if (!shopImage) { setShopPreview(null); return }
    const preview = URL.createObjectURL(shopImage)
    setShopPreview(preview)
    return () => URL.revokeObjectURL(preview)
  }, [shopImage])

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = event.currentTarget
    const data = new FormData(form)
    const shopName = String(data.get('shop_name') ?? '').trim()
    const slug = String(data.get('slug') ?? '').trim().toLowerCase()
    const description = String(data.get('description') ?? '').trim()
    const contactEmail = String(data.get('contact_email') ?? '').trim() || null
    const phone = String(data.get('phone') ?? '').trim() || null
    if (shopName.length < 2) { push(t('Enter a shop name of at least two characters.'), 'error'); return }
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) { push(t('Use a URL-safe slug, for example acme-traders.'), 'error'); return }
    if (contactEmail && !/^\S+@\S+\.\S+$/.test(contactEmail)) { push(t('Enter a valid contact email.'), 'error'); return }
    if (phone && phone.replace(/\D/g, '').length < 7) { push(t('Enter a valid phone number.'), 'error'); return }

    setSaving(true)
    try {
      let uploadedImage: { path: string; url: string } | null = null
      let committed = false
      try {
        if (shopImage && profile) uploadedImage = await uploadVendorShopImage(shopImage)
        const input = { shop_name: shopName, slug, description, contact_email: contactEmail, phone, ...(uploadedImage ? { shop_image_url: uploadedImage.url } : {}) }
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
        throw cause
      }
      form.reset()
      setShopImage(null)
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
  const { user } = useAuth()
  const [profile, setProfile] = useState<SellerProfile | null>(null)
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState(false)
  usePageMeta(t('Seller application'), t('Apply to sell on Meridion Marketplace.'))

  useEffect(() => {
    let cancelled = false
    if (!user) { setLoading(false); return }
    getOwnSellerProfile()
      .then((next) => { if (!cancelled) { setProfile(next); setEditing(!next) } })
      .catch(() => { if (!cancelled) setProfile(null) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [user])

  if (!user) return <SignInForVendor />
  if (loading) return <section className="page-shell"><div className="placeholder-panel">{t('Loading seller application…')}</div></section>

  if (profile && !editing) {
    return <VendorGate><VendorStatusCard profile={profile} onEdit={() => setEditing(true)} /></VendorGate>
  }

  return <VendorGate><section className="page-shell info-page">
    {!profile && <header className="info-page__heading"><span className="eyebrow">Meridion Marketplace</span><h1>{t('Apply to open a')} <em>{t('shop.')}</em></h1><p>{t('Submit your seller details for platform review. Approval is required before listings, inventory and fulfilment tools are enabled.')}</p></header>}
    {profile && <header className="info-page__heading"><span className="eyebrow">{t('Seller application')}</span><h1>{t('Update your')} <em>{t('shop details.')}</em></h1><p>{t('Update the details below. A rejected application is sent back for review when you save.')}</p></header>}
    <ShopForm profile={profile} mode={profile ? 'settings' : 'apply'} onSaved={(saved) => { setProfile(saved); setEditing(false) }} />
    {profile && <button type="button" className="text-button vendor-cancel-edit" onClick={() => setEditing(false)}><X size={14} /> {t('Cancel')}</button>}
  </section></VendorGate>
}

type DashboardTab = 'overview' | 'listings' | 'inventory' | 'orders' | 'cases' | 'settings'

export function VendorDashboardPage() {
  const { t } = useI18n()
  const { push } = useToast()
  const { categories } = useCatalog()
  const [profile, setProfile] = useState<SellerProfile | null>(null)
  const [products, setProducts] = useState<VendorProduct[]>([])
  const [inventory, setInventory] = useState<VendorInventory[]>([])
  const [cases, setCases] = useState<MarketplaceCase[]>([])
  const [orderItems, setOrderItems] = useState<VendorOrderItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [tab, setTab] = useState<DashboardTab>('overview')
  const [editingProduct, setEditingProduct] = useState<VendorProduct | null>(null)
  const [creatingProduct, setCreatingProduct] = useState(false)
  usePageMeta(t('Vendor dashboard'), t('Manage listings, stock, fulfilment and customer cases.'))

  async function load() {
    setLoading(true)
    setError(null)
    try {
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

  useEffect(() => { void load() }, [])

  const categoriesById = useMemo(() => new Map(categories.map((category) => [category.id, category.name])), [categories])

  if (loading) return <section className="page-shell"><div className="placeholder-panel"><RefreshCw className="spin" size={18} /> Loading vendor dashboard…</div></section>
  if (!profile) return <VendorGate><section className="page-shell"><div className="placeholder-panel vendor-status"><h2>{t('No seller application yet')}</h2><p>{t('Apply for a seller account to manage listings and orders.')}</p><Link className="button button--dark" to="/vendor/apply">{t('Apply to sell')}</Link></div></section></VendorGate>
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
      {products.length > 0 && <div className="admin-table-wrap"><table className="admin-table vendor-table"><thead><tr><th>{t('Product')}</th><th>{t('Price')}</th><th>{t('Publication')}</th><th>{t('Moderation')}</th><th>{t('Costs')}</th><th>{t('Actions')}</th></tr></thead><tbody>{products.map((product) => <tr key={product.id}><td data-label={t('Product')}><strong>{product.name}</strong><small>{categoriesById.get(product.category_id ?? '') ?? t('No category')}</small></td><td data-label={t('Price')}>{formatPKR(Number(product.price))}</td><td data-label={t('Publication')}><StatusBadge status={product.publication_status} /></td><td data-label={t('Moderation')}><StatusBadge status={product.moderation_status} /></td><td data-label={t('Costs')}><small>{t('Supplier')}: {product.supplier_cost === null ? '—' : formatPKR(Number(product.supplier_cost))}<br />{t('Fulfilment')}: {formatPKR(Number(product.fulfillment_expense))}</small></td><td data-label={t('Actions')}><button type="button" className="text-button" onClick={() => { setEditingProduct(product); setCreatingProduct(false) }}><Pencil size={14} /> {t('Edit')}</button></td></tr>)}</tbody></table></div>}
    </section>}

    {tab === 'inventory' && <section className="account-panel">
      <div className="account-panel__heading"><div><h2>{t('Inventory')}</h2><p>{t('Stock changes are recorded in the inventory movement log.')}</p></div><button type="button" className="button button--outline" onClick={() => void load()}><RefreshCw size={15} /> {t('Refresh')}</button></div>
      {inventory.length === 0 ? <div className="empty-state"><Boxes size={28} /><h2>{t('No stock records')}</h2><p>{t('Stock records appear when a listing with inventory tracking is created.')}</p></div> : <div className="admin-table-wrap"><table className="admin-table vendor-table"><thead><tr><th>{t('Product')}</th><th>{t('Variant')}</th><th>{t('Quantity')}</th><th>{t('Updated')}</th><th>{t('Adjust')}</th></tr></thead><tbody>{inventory.map((item) => <InventoryRow key={item.id} item={item} onSaved={async (message) => { push(message, 'success'); await load() }} onError={(message) => push(message, 'error')} />)}</tbody></table></div>}
    </section>}

    {tab === 'orders' && <VendorOrdersPanel items={orderItems} onUpdated={load} onError={(message) => push(message, 'error')} />}

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
  const editing = Boolean(product)

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
      if (product) {
        await updateVendorProduct(product.id, input)
        await onSaved(t('Product changes submitted for moderation.'))
      } else {
        await createVendorProduct({ ...input, category_id: String(data.get('category_id') ?? '') || null, track_inventory: data.get('track_inventory') === 'on' })
        await onSaved(t('Listing submitted for moderation.'))
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t('The listing could not be saved.'))
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

function VendorOrdersPanel({ items, onUpdated, onError }: { items: VendorOrderItem[]; onUpdated: () => Promise<void>; onError: (message: string) => void }) {
  const { t } = useI18n()
  return <section className="account-panel">
    <div className="account-panel__heading"><div><h2>{t('Fulfilment')}</h2><p>{t('Advance each item as you process and ship it. Buyer contact details are intentionally excluded.')}</p></div></div>
    {items.length === 0 ? <div className="empty-state"><Truck size={28} /><h2>{t('No order items')}</h2><p>{t('Vendor order items will appear here after a buyer places an order.')}</p></div> : <div className="vendor-list">{items.map((item) => <OrderItemRow key={item.id} item={item} onUpdated={onUpdated} onError={onError} />)}</div>}
  </section>
}

function OrderItemRow({ item, onUpdated, onError }: { item: VendorOrderItem; onUpdated: () => Promise<void>; onError: (message: string) => void }) {
  const { t } = useI18n()
  const nextStatus = item.vendor_fulfillment_status === 'pending' ? 'accepted' : item.vendor_fulfillment_status === 'accepted' ? 'processing' : item.vendor_fulfillment_status === 'processing' ? 'shipped' : item.vendor_fulfillment_status === 'shipped' ? 'delivered' : null
  const [trackingNumber, setTrackingNumber] = useState(item.tracking_number ?? '')
  const [trackingUrl, setTrackingUrl] = useState(item.tracking_url ?? '')
  const [note, setNote] = useState(item.vendor_note ?? '')
  const [saving, setSaving] = useState(false)
  async function advance() {
    if (!nextStatus) return
    setSaving(true)
    try {
      await updateOwnOrderItem(item.id, nextStatus, trackingNumber.trim() || null, trackingUrl.trim() || null, note.trim() || null)
      await onUpdated()
    } catch (cause) { onError(cause instanceof Error ? cause.message : t('Fulfilment update failed.')) }
    finally { setSaving(false) }
  }
  return <div className="vendor-order-card">
    <div className="vendor-order-card__head"><div><strong>{item.order_number} · {item.product_name_snapshot}</strong><small>{t('Qty')} {item.quantity} · {formatPKR(Number(item.line_total))} · {new Date(item.created_at).toLocaleDateString()}</small></div><StatusBadge status={item.vendor_fulfillment_status} /></div>
    {nextStatus && <div className="vendor-order-card__fields">
      <small className="vendor-form-help--wide">{t('Add tracking details when available. They are saved with each fulfilment update.')}</small>
      <div className="form-field"><label htmlFor={`tracking-number-${item.id}`}>{t('Tracking number')}</label><input id={`tracking-number-${item.id}`} value={trackingNumber} onChange={(event) => setTrackingNumber(event.target.value)} /></div>
      <div className="form-field"><label htmlFor={`tracking-url-${item.id}`}>{t('Tracking URL')}</label><input id={`tracking-url-${item.id}`} type="url" placeholder="https://" value={trackingUrl} onChange={(event) => setTrackingUrl(event.target.value)} /></div>
      <div className="form-field form-field--wide"><label htmlFor={`vendor-note-${item.id}`}>{t('Note to buyer')}</label><input id={`vendor-note-${item.id}`} value={note} onChange={(event) => setNote(event.target.value)} /></div>
      <button type="button" className="button button--dark" onClick={() => void advance()} disabled={saving}>{saving ? t('Updating…') : <>{t('Mark as')} {t(nextStatus)} <ArrowRight size={15} /></>}</button>
    </div>}
    {item.tracking_number && <p className="vendor-order-card__tracking">{t('Tracking')}: {item.tracking_number} {item.tracking_url && <a href={item.tracking_url} target="_blank" rel="noopener noreferrer">· {t('Open link')}</a>}</p>}
  </div>
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
    try { await createOwnSupportTicket(sellerId, subject, message); form.reset(); push(t('Support ticket sent to the marketplace team.'), 'success'); setRefresh((value) => value + 1) }
    catch (cause) { onError(cause instanceof Error ? cause.message : t('Support ticket could not be created.')) }
    finally { setSaving(false) }
  }
  return <div className="vendor-support-desk">
    <form className="vendor-support-form" onSubmit={(event) => void submit(event)}><h3>{t('Contact marketplace support')}</h3><div className="form-field"><label htmlFor="vendor-ticket-subject">{t('Subject')}</label><input id="vendor-ticket-subject" name="subject" required minLength={3} maxLength={180} /></div><div className="form-field"><label htmlFor="vendor-ticket-message">{t('How can we help?')}</label><textarea id="vendor-ticket-message" name="message" required minLength={3} maxLength={4000} rows={4} /></div><button type="submit" className="button button--dark" disabled={saving}>{saving ? t('Sending…') : t('Create support ticket')}</button></form>
    <div className="vendor-support-list"><h3>{t('Your support tickets')}</h3>{loadError ? <p className="field-error">{loadError}</p> : tickets.length === 0 ? <p>{t('No support tickets yet.')}</p> : tickets.map((ticket) => <article className="vendor-support-ticket" key={ticket.id}><div><strong>{ticket.subject}</strong><StatusBadge status={ticket.status} /></div><p>{ticket.message}</p>{ticket.admin_response && <blockquote><b>{t('Marketplace reply')}</b><br />{ticket.admin_response}</blockquote>}<small>{new Date(ticket.created_at).toLocaleString()}</small></article>)}</div>
  </div>
}
