import { useEffect, useMemo, useState, type ChangeEvent, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { AlertCircle, ArrowRight, CheckCircle2, ClipboardList, FileUp, Heart, Home, MapPin, Package, Pencil, Plus, RefreshCw, ShieldCheck, Store, Trash2, UserRound, X } from 'lucide-react'
import { EmptyState, ErrorState, LoadingState } from '../components/common/States'
import { UserAvatar } from '../components/common/UserAvatar'
import { useAuth } from '../contexts/AuthContext'
import { useI18n } from '../i18n/LocaleContext'
import { useToast } from '../contexts/ToastContext'
import { usePageMeta } from '../hooks/usePageMeta'
import { createAddress, deleteAddress, listMyAddresses, setDefaultAddress, updateAddress, type AddressInput, type SavedAddress } from '../services/account/addressService'
import { createMarketplaceCase, getEvidenceSignedUrl, listMyCases, listMyOrders, listOrderItems, uploadComplaintEvidence } from '../services/orders/orderService'
import type { MarketplaceCaseRecord, OrderItemRecord, OrderRecord } from '../types/order'
import { formatPKR } from '../utils/money'

type Tab = 'orders' | 'addresses' | 'cases'

const emptyAddress: AddressInput = {
  recipient_name: '',
  phone: '',
  address_line_1: '',
  address_line_2: null,
  city: '',
  province: null,
  postal_code: null,
  delivery_instructions: null,
  is_default: false,
}

function addressSummary(value: unknown): string {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return ''
  const address = value as Record<string, unknown>
  return [address.address_line_1, address.address_line_2, address.city].filter((part) => typeof part === 'string' && part).join(', ')
}

function statusClass(status: string): string {
  return `order-status order-status--${status.replace(/_/g, '-')}`
}

export function AccountPage() {
  const { t } = useI18n()
  const { configured, loading, user, isAdmin, error: authError, avatarUrl, displayName } = useAuth()
  const { push } = useToast()
  const [tab, setTab] = useState<Tab>('orders')

  const [orders, setOrders] = useState<OrderRecord[]>([])
  const [itemsByOrder, setItemsByOrder] = useState<Record<string, OrderItemRecord[]>>({})
  const [expandedOrder, setExpandedOrder] = useState<string | null>(null)
  const [ordersLoading, setOrdersLoading] = useState(true)
  const [ordersError, setOrdersError] = useState<string | null>(null)

  const [addresses, setAddresses] = useState<SavedAddress[]>([])
  const [addressesLoading, setAddressesLoading] = useState(true)
  const [addressesError, setAddressesError] = useState<string | null>(null)
  const [addressForm, setAddressForm] = useState<AddressInput | null>(null)
  const [editingAddressId, setEditingAddressId] = useState<string | null>(null)
  const [savingAddress, setSavingAddress] = useState(false)

  const [cases, setCases] = useState<MarketplaceCaseRecord[]>([])
  const [casesLoading, setCasesLoading] = useState(true)
  const [casesError, setCasesError] = useState<string | null>(null)
  const [caseTarget, setCaseTarget] = useState<{ order: OrderRecord; item: OrderItemRecord | null } | null>(null)
  const [caseType, setCaseType] = useState<'return' | 'refund' | 'complaint'>('complaint')
  const [caseReason, setCaseReason] = useState('')
  const [caseEvidence, setCaseEvidence] = useState<File | null>(null)
  const [submittingCase, setSubmittingCase] = useState(false)

  usePageMeta(t('Your account'), t('Manage your orders, delivery addresses, returns and complaints.'))

  async function loadOrders() {
    setOrdersLoading(true)
    setOrdersError(null)
    try {
      const rows = await listMyOrders()
      setOrders(rows)
      const itemEntries = await Promise.all(rows.map(async (order) => [order.id, await listOrderItems(order.id)] as const))
      setItemsByOrder(Object.fromEntries(itemEntries))
    } catch (cause) {
      setOrdersError(cause instanceof Error ? cause.message : 'Orders could not be loaded.')
    } finally {
      setOrdersLoading(false)
    }
  }

  async function loadAddresses() {
    setAddressesLoading(true)
    setAddressesError(null)
    try { setAddresses(await listMyAddresses()) }
    catch (cause) { setAddressesError(cause instanceof Error ? cause.message : 'Addresses could not be loaded.') }
    finally { setAddressesLoading(false) }
  }

  async function loadCases() {
    setCasesLoading(true)
    setCasesError(null)
    try { setCases(await listMyCases()) }
    catch (cause) { setCasesError(cause instanceof Error ? cause.message : 'Returns and complaints could not be loaded.') }
    finally { setCasesLoading(false) }
  }

  useEffect(() => {
    if (!user) { setOrdersLoading(false); setAddressesLoading(false); setCasesLoading(false); return }
    void loadOrders()
    void loadAddresses()
    void loadCases()
  }, [user])

  const orderNumbers = useMemo(() => new Map(orders.map((order) => [order.id, order.order_number])), [orders])

  if (loading) return <section className="account-page"><div className="account-page__inner"><span className="auth-eyebrow">{t('Account')}</span><h1>{t('Restoring your session')}</h1><p role="status">{t('Verifying your session…')}</p></div></section>

  if (!configured || !user) {
    return <section className="account-page"><div className="account-page__inner"><div className="account-page__icon" aria-hidden="true"><UserRound size={28} /></div><span className="auth-eyebrow">{t('Account')}</span><h1>{t(configured ? 'Sign in to view your account' : 'Account access is not configured')}</h1><p>{t(configured ? 'You are not currently signed in.' : 'Account access is currently unavailable.')}</p>{authError && <p className="account-page__note" role="alert">{t(authError)}</p>}<div className="account-page__actions"><Link className="account-page__primary" to="/login">{t('Sign in')}<ArrowRight size={16} aria-hidden="true" /></Link><Link className="account-page__secondary" to="/register">{t('Create account')}</Link></div></div></section>
  }

  function setAddressField(event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) {
    const { name, value, type } = event.target
    setAddressForm((current) => current ? { ...current, [name]: type === 'checkbox' ? (event.target as HTMLInputElement).checked : (value || null) } : current)
  }

  function startEditAddress(address: SavedAddress) {
    setEditingAddressId(address.id)
    setAddressForm({
      recipient_name: address.recipient_name,
      phone: address.phone,
      address_line_1: address.address_line_1,
      address_line_2: address.address_line_2,
      city: address.city,
      province: address.province,
      postal_code: address.postal_code,
      delivery_instructions: address.delivery_instructions,
      is_default: address.is_default,
    })
  }

  async function saveAddress(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!addressForm) return
    if (!addressForm.recipient_name.trim() || !addressForm.phone.trim() || !addressForm.address_line_1.trim() || !addressForm.city.trim()) {
      push(t('Recipient, phone, street address and city are required.'), 'error')
      return
    }
    setSavingAddress(true)
    try {
      if (editingAddressId) await updateAddress(editingAddressId, addressForm)
      else await createAddress(addressForm)
      push(t(editingAddressId ? 'Address updated.' : 'Address saved.'), 'success')
      setAddressForm(null)
      setEditingAddressId(null)
      await loadAddresses()
    } catch (cause) {
      push(cause instanceof Error ? cause.message : t('The address could not be saved.'), 'error')
    } finally {
      setSavingAddress(false)
    }
  }

  async function removeAddress(id: string) {
    try {
      await deleteAddress(id)
      setAddresses((current) => current.filter((address) => address.id !== id))
      if (editingAddressId === id) { setAddressForm(null); setEditingAddressId(null) }
      push(t('Address removed.'), 'success')
    } catch (cause) {
      push(cause instanceof Error ? cause.message : t('The address could not be removed.'), 'error')
    }
  }

  async function makeDefault(id: string) {
    try {
      await setDefaultAddress(id)
      await loadAddresses()
      push(t('Default address updated.'), 'success')
    } catch (cause) {
      push(cause instanceof Error ? cause.message : t('The default address could not be updated.'), 'error')
    }
  }

  function openCase(order: OrderRecord, item: OrderItemRecord | null) {
    setCaseTarget({ order, item })
    setCaseType('complaint')
    setCaseReason('')
    setCaseEvidence(null)
    setTab('cases')
  }

  async function submitCase(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!caseTarget) return
    if (caseReason.trim().length < 3) { push(t('Add a short reason for your case.'), 'error'); return }
    setSubmittingCase(true)
    try {
      let evidencePath: string | null = null
      if (caseEvidence) evidencePath = await uploadComplaintEvidence(caseTarget.order.id, caseEvidence)
      await createMarketplaceCase({
        orderId: caseTarget.order.id,
        orderItemId: caseTarget.item?.id ?? null,
        sellerId: caseTarget.item?.seller_id ?? null,
        caseType,
        reason: caseReason,
        evidencePath,
      })
      push(t('Your case has been submitted.'), 'success')
      setCaseTarget(null)
      setCaseReason('')
      setCaseEvidence(null)
      await loadCases()
    } catch (cause) {
      push(cause instanceof Error ? cause.message : t('The case could not be submitted.'), 'error')
    } finally {
      setSubmittingCase(false)
    }
  }

  async function viewEvidence(path: string) {
    const url = await getEvidenceSignedUrl(path)
    if (url) window.open(url, '_blank', 'noopener,noreferrer')
    else push(t('The evidence file could not be opened.'), 'error')
  }

  return <div className="page-shell account-dashboard">
    <header className="account-dashboard__header">
      <div className="account-dashboard__identity">
        <div className="account-dashboard__avatar">{avatarUrl ? <UserAvatar avatarUrl={avatarUrl} name={displayName} size={30} /> : <UserRound size={26} />}</div>
        <div>
          <span className="eyebrow">{t('Your account')}</span>
          <h1>{displayName || t('My account')}</h1>
          <p>{user.email}{isAdmin ? <span className="account-dashboard__admin"><ShieldCheck size={14} /> {t('Administrator')}</span> : null}</p>
        </div>
      </div>
      <div className="account-dashboard__quick-links">
        <Link to="/wishlist"><Heart size={15} /> {t('Wishlist')}</Link>
        <Link to="/vendor"><Store size={15} /> {t('Seller area')}</Link>
        <Link to="/logout">{t('Sign out')}</Link>
      </div>
    </header>

    <nav className="account-tabs" aria-label={t('Account sections')}>
      <button type="button" className={tab === 'orders' ? 'is-active' : ''} onClick={() => setTab('orders')}><Package size={16} /> {t('Orders')}{orders.length > 0 ? ` · ${orders.length}` : ''}</button>
      <button type="button" className={tab === 'addresses' ? 'is-active' : ''} onClick={() => setTab('addresses')}><Home size={16} /> {t('Addresses')}</button>
      <button type="button" className={tab === 'cases' ? 'is-active' : ''} onClick={() => setTab('cases')}><ClipboardList size={16} /> {t('Returns & complaints')}{cases.length > 0 ? ` · ${cases.length}` : ''}</button>
    </nav>

    {tab === 'orders' && <section className="account-panel" aria-labelledby="account-orders-title">
      <div className="account-panel__heading"><div><h2 id="account-orders-title">{t('Order history')}</h2><p>{t('Track delivery and open a return or complaint from an order.')}</p></div><button type="button" className="button button--outline" onClick={() => void loadOrders()} disabled={ordersLoading}><RefreshCw size={15} className={ordersLoading ? 'spin' : ''} /> {t('Refresh')}</button></div>
      {ordersLoading && <LoadingState label={t('Loading your orders…')} />}
      {ordersError && <><ErrorState message={ordersError} /><button type="button" className="button button--outline" onClick={() => void loadOrders()}>{t('Try again')}</button></>}
      {!ordersLoading && !ordersError && orders.length === 0 && <EmptyState title={t('No orders yet')} description={t('Your placed orders will appear here with their delivery and case status.')} actionLabel={t('Browse the catalog')} actionHref="/shop" />}
      {!ordersLoading && !ordersError && orders.length > 0 && <div className="order-list">
        {orders.map((order) => {
          const items = itemsByOrder[order.id] ?? []
          const open = expandedOrder === order.id
          return <article className={`order-card${open ? ' is-open' : ''}`} key={order.id}>
            <button type="button" className="order-card__summary" onClick={() => setExpandedOrder(open ? null : order.id)} aria-expanded={open}>
              <div><strong>{order.order_number}</strong><span>{new Date(order.created_at).toLocaleDateString()}</span></div>
              <div><span className={statusClass(order.order_status)}>{t(order.order_status)}</span><span className={statusClass(order.payment_status)}>{order.payment_method === 'cod' ? t('Cash on delivery') : t(order.payment_method)}</span></div>
              <div className="order-card__total"><strong>{formatPKR(Number(order.total))}</strong><span>{items.length} {items.length === 1 ? t('item') : t('items')}</span></div>
            </button>
            {open && <div className="order-card__detail">
              <ul className="order-line-list">
                {items.map((item) => <li key={item.id}>
                  <div><strong>{item.product_name_snapshot}</strong><span>{t('Qty')} {item.quantity} · {formatPKR(Number(item.unit_price))}</span><span className={statusClass(item.vendor_fulfillment_status)}>{t(item.vendor_fulfillment_status)}</span></div>
                  <div className="order-line-list__actions"><strong>{formatPKR(Number(item.line_total))}</strong><button type="button" className="text-button" onClick={() => openCase(order, item)}>{t('Open a case')}</button></div>
                </li>)}
              </ul>
              <div className="order-card__meta">
                <div><span className="eyebrow">{t('Deliver to')}</span><p>{order.customer_name} · {order.customer_phone}</p><p>{addressSummary(order.shipping_address_snapshot) || t('Address on file')}</p>{order.delivery_location_name && <p><MapPin size={13} /> {order.delivery_location_name}</p>}</div>
                <div><span className="eyebrow">{t('Payment')}</span><p>{t('Item subtotal')}: {formatPKR(Number(order.subtotal))}</p><p>{t('Delivery fee')}: {formatPKR(Number(order.delivery_fee))}</p><p><strong>{t('Total')}: {formatPKR(Number(order.total))}</strong></p></div>
              </div>
              <div className="order-card__actions"><Link to={`/order-confirmation/${order.order_number}`} className="text-button">{t('View confirmation')}</Link><button type="button" className="text-button" onClick={() => openCase(order, null)}>{t('Report an order issue')}</button></div>
            </div>}
          </article>
        })}
      </div>}
    </section>}

    {tab === 'addresses' && <section className="account-panel" aria-labelledby="account-addresses-title">
      <div className="account-panel__heading"><div><h2 id="account-addresses-title">{t('Delivery addresses')}</h2><p>{t('Save addresses to speed up checkout.')}</p></div>{!addressForm && <button type="button" className="button button--dark" onClick={() => { setAddressForm({ ...emptyAddress, is_default: addresses.length === 0 }); setEditingAddressId(null) }}><Plus size={15} /> {t('Add address')}</button>}</div>
      {addressesLoading && <LoadingState label={t('Loading addresses…')} />}
      {addressesError && <><ErrorState message={addressesError} /><button type="button" className="button button--outline" onClick={() => void loadAddresses()}>{t('Try again')}</button></>}
      {!addressesLoading && !addressesError && addresses.length === 0 && !addressForm && <EmptyState title={t('No saved addresses')} description={t('Add an address here or save one during checkout.')} actionLabel={t('Add address')} actionHref="#" />}
      {!addressesLoading && addresses.length > 0 && <div className="address-grid">
        {addresses.map((address) => <article className="address-card" key={address.id}>
          <div className="address-card__head"><strong>{address.recipient_name}</strong>{address.is_default && <span className="address-card__default"><CheckCircle2 size={13} /> {t('Default')}</span>}</div>
          <p>{address.address_line_1}{address.address_line_2 ? `, ${address.address_line_2}` : ''}</p>
          <p>{address.city}{address.province ? `, ${address.province}` : ''}{address.postal_code ? ` ${address.postal_code}` : ''}</p>
          <p>{address.phone}</p>
          {address.delivery_instructions && <p className="address-card__note">{address.delivery_instructions}</p>}
          <div className="address-card__actions">
            <button type="button" className="text-button" onClick={() => startEditAddress(address)}><Pencil size={14} /> {t('Edit')}</button>
            {!address.is_default && <button type="button" className="text-button" onClick={() => void makeDefault(address.id)}><CheckCircle2 size={14} /> {t('Make default')}</button>}
            <button type="button" className="text-button text-button--danger" onClick={() => void removeAddress(address.id)}><Trash2 size={14} /> {t('Remove')}</button>
          </div>
        </article>)}
      </div>}
      {addressForm && <form className="address-form shine-surface" onSubmit={saveAddress}>
        <div className="account-panel__heading"><h2>{t(editingAddressId ? 'Edit address' : 'New address')}</h2><button type="button" className="icon-button" aria-label={t('Close address form')} onClick={() => { setAddressForm(null); setEditingAddressId(null) }}><X size={17} /></button></div>
        <div className="form-grid">
          <div className="form-field"><label htmlFor="address-recipient">{t('Recipient name')} <span>*</span></label><input id="address-recipient" name="recipient_name" value={addressForm.recipient_name} onChange={setAddressField} autoComplete="name" required /></div>
          <div className="form-field"><label htmlFor="address-phone">{t('Phone')} <span>*</span></label><input id="address-phone" name="phone" value={addressForm.phone} onChange={setAddressField} autoComplete="tel" required /></div>
          <div className="form-field form-field--wide"><label htmlFor="address-line1">{t('Street address')} <span>*</span></label><input id="address-line1" name="address_line_1" value={addressForm.address_line_1} onChange={setAddressField} autoComplete="address-line1" required /></div>
          <div className="form-field form-field--wide"><label htmlFor="address-line2">{t('Apartment, area or landmark')}</label><input id="address-line2" name="address_line_2" value={addressForm.address_line_2 ?? ''} onChange={setAddressField} autoComplete="address-line2" /></div>
          <div className="form-field"><label htmlFor="address-city">{t('City')} <span>*</span></label><input id="address-city" name="city" value={addressForm.city} onChange={setAddressField} autoComplete="address-level2" required /></div>
          <div className="form-field"><label htmlFor="address-province">{t('Province')}</label><input id="address-province" name="province" value={addressForm.province ?? ''} onChange={setAddressField} autoComplete="address-level1" /></div>
          <div className="form-field"><label htmlFor="address-postal">{t('Postal code')}</label><input id="address-postal" name="postal_code" value={addressForm.postal_code ?? ''} onChange={setAddressField} autoComplete="postal-code" /></div>
          <div className="form-field form-field--wide"><label htmlFor="address-instructions">{t('Delivery instructions')}</label><textarea id="address-instructions" name="delivery_instructions" rows={2} value={addressForm.delivery_instructions ?? ''} onChange={setAddressField} /></div>
        </div>
        <label className="checkout-save-address"><input type="checkbox" name="is_default" checked={addressForm.is_default} onChange={setAddressField} /> {t('Use as my default address')}</label>
        <div className="address-form__actions"><button type="submit" className="button button--dark" disabled={savingAddress}>{savingAddress ? t('Saving…') : t('Save address')}</button><button type="button" className="button button--outline" onClick={() => { setAddressForm(null); setEditingAddressId(null) }}>{t('Cancel')}</button></div>
      </form>}
    </section>}

    {tab === 'cases' && <section className="account-panel" aria-labelledby="account-cases-title">
      <div className="account-panel__heading"><div><h2 id="account-cases-title">{t('Returns & complaints')}</h2><p>{t('Open a case from an order item and follow the seller response.')}</p></div><button type="button" className="button button--outline" onClick={() => void loadCases()} disabled={casesLoading}><RefreshCw size={15} className={casesLoading ? 'spin' : ''} /> {t('Refresh')}</button></div>
      {caseTarget && <form className="case-form shine-surface" onSubmit={submitCase}>
        <div className="account-panel__heading"><div><h3>{t('New case for')} {caseTarget.order.order_number}</h3><p>{caseTarget.item ? caseTarget.item.product_name_snapshot : t('Whole order')}</p></div><button type="button" className="icon-button" aria-label={t('Close case form')} onClick={() => setCaseTarget(null)}><X size={17} /></button></div>
        <div className="form-grid">
          <div className="form-field"><label htmlFor="case-type">{t('Case type')}</label><select id="case-type" value={caseType} onChange={(event) => setCaseType(event.target.value as typeof caseType)}><option value="complaint">{t('Complaint')}</option><option value="return">{t('Return')}</option><option value="refund">{t('Refund')}</option></select></div>
          <div className="form-field form-field--wide"><label htmlFor="case-reason">{t('What happened?')} <span>*</span></label><textarea id="case-reason" rows={4} value={caseReason} onChange={(event) => setCaseReason(event.target.value)} placeholder={t('Describe the issue and what would resolve it.')} required /></div>
          <div className="form-field form-field--wide"><label htmlFor="case-evidence">{t('Evidence (optional)')}</label><input id="case-evidence" type="file" accept="image/*,application/pdf" onChange={(event) => setCaseEvidence(event.target.files?.[0] ?? null)} /><p className="form-help"><FileUp size={13} /> {t('Images or PDF, up to 10 MB.')}</p></div>
        </div>
        <div className="address-form__actions"><button type="submit" className="button button--dark" disabled={submittingCase}>{submittingCase ? t('Submitting…') : t('Submit case')}</button><button type="button" className="button button--outline" onClick={() => setCaseTarget(null)}>{t('Cancel')}</button></div>
      </form>}
      {casesLoading && <LoadingState label={t('Loading your cases…')} />}
      {casesError && <><ErrorState message={casesError} /><button type="button" className="button button--outline" onClick={() => void loadCases()}>{t('Try again')}</button></>}
      {!casesLoading && !casesError && cases.length === 0 && <EmptyState title={t('No returns or complaints')} description={t('Open a case from a delivered or shipped order item if something is wrong.')} actionLabel={t('View your orders')} actionHref="#" />}
      {!casesLoading && !casesError && cases.length > 0 && <div className="case-list">
        {cases.map((item) => <article className="case-card" key={item.id}>
          <div className="case-card__head"><div><strong>{t(item.case_type)}</strong><span>{orderNumbers.get(item.order_id) || item.order_id}</span></div><span className={statusClass(item.status)}>{t(item.status)}</span></div>
          <p>{item.reason}</p>
          {item.seller_response && <div className="case-card__response"><span className="eyebrow">{t('Seller response')}</span><p>{item.seller_response}</p></div>}
          {item.admin_decision && <div className="case-card__response"><span className="eyebrow">{t('Marketplace decision')}</span><p>{item.admin_decision}</p></div>}
          <div className="case-card__footer"><span>{new Date(item.created_at).toLocaleString()}</span>{item.evidence_path && <button type="button" className="text-button" onClick={() => void viewEvidence(item.evidence_path!)}><FileUp size={14} /> {t('View evidence')}</button>}</div>
        </article>)}
      </div>}
      {!caseTarget && orders.length > 0 && <p className="account-panel__hint"><AlertCircle size={14} /> {t('To open a new case, expand an order in the Orders tab and choose an item.')}</p>}
    </section>}
  </div>
}
