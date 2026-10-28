import { useEffect, useState, type FormEvent } from 'react'
import { ArrowRight, Clock3, ExternalLink, Leaf, Mail, MapPin, MessageCircle, NotebookPen, PackageCheck, Phone, Send, ShieldCheck, ShoppingBag, Store, Truck } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useCart } from '../contexts/CartContext'
import { useWishlist } from '../contexts/WishlistContext'
import { usePageMeta } from '../hooks/usePageMeta'
import { useStoreSettings } from '../hooks/useStoreSettings'
import { supportDestination } from '../utils/support'
import { useI18n } from '../i18n/LocaleContext'
import { formatPKR } from '../utils/money'
import { useAuth } from '../contexts/AuthContext'
import { createCustomerSupportTicket, listMyCustomerSupportTickets, notifySupportEmail, type CustomerSupportTicket } from '../services/account/supportService'

function InfoLayout({ eyebrow, title, intro, children }: { eyebrow: string; title: React.ReactNode; intro: string; children: React.ReactNode }) {
  return <div className="page-shell info-page"><header className="info-page__heading"><span className="eyebrow">{eyebrow}</span><h1>{title}</h1><p>{intro}</p></header>{children}</div>
}

export function AboutPage() {
  const { t } = useI18n()
  const settings = useStoreSettings()
  usePageMeta(t('About JTBazar'), t('A multi-vendor marketplace for thoughtful goods across everyday routines.'))
  return <InfoLayout eyebrow={t('A little about us')} title={<>{t('Space for the')} <em>{t('everyday idea.')}</em></>} intro={t(`${settings.storeName} is a multi-vendor marketplace connecting independent sellers with buyers across Pakistan.`)}>
    <section className="about-story">
      <div className="about-story__copy"><span className="eyebrow">{t('Our point of view')}</span><h2>{t('A marketplace made of many small stories.')}</h2><p>{t('JTBazar brings independent shops and their carefully chosen goods together in one place. Browse the catalog, learn about the shop behind an item, and keep your order details together in your account.')}</p><Link to="/shop" className="button button--dark">{t('Explore the marketplace')} <ArrowRight size={16} /></Link></div>
      <div className="about-story__visual" aria-hidden="true"><span className="about-story__orbit about-story__orbit--one" /><span className="about-story__orbit about-story__orbit--two" /><span className="about-story__visual-mark"><ShoppingBag size={38} /></span><span className="about-story__visual-label">JTBazar · Pakistan</span></div>
    </section>
    <div className="info-feature-grid about-values">
      <article><span><Leaf size={19} /></span><h2>{t('Thoughtful by design')}</h2><p>{t('A considered range of goods for creative routines, useful spaces and everyday moments.')}</p></article>
      <article><span><Store size={19} /></span><h2>{t('Independent shops')}</h2><p>{t('Each shop has its own identity, products and story. Find the seller details on shop and product pages.')}</p></article>
      <article><span><ShieldCheck size={19} /></span><h2>{t('Reviewed before listing')}</h2><p>{t('Seller applications are reviewed and products pass marketplace moderation before publication.')}</p></article>
    </div>
    <section className="about-journey"><div><span className="eyebrow">{t('How it works')}</span><h2>{t('From discovery to delivery')}</h2></div><div className="about-journey__steps"><article><span>01</span><strong>{t('Discover')}</strong><p>{t('Explore products and independent stores.')}</p></article><article><span>02</span><strong>{t('Place your order')}</strong><p>{t('Sign in to check out and keep order details in your account.')}</p></article><article><span>03</span><strong>{t('Follow progress')}</strong><p>{t('See marketplace and seller updates from your account.')}</p></article></div></section>
  </InfoLayout>
}

export function ContactPage() {
  const { t } = useI18n()
  const settings = useStoreSettings()
  const { user } = useAuth()
  const [formMessage, setFormMessage] = useState('')
  const [tickets, setTickets] = useState<CustomerSupportTicket[]>([])
  const [sending, setSending] = useState(false)
  useEffect(() => { if (!user) { setTickets([]); return }; void listMyCustomerSupportTickets().then(setTickets).catch(() => {}) }, [user?.id])
  usePageMeta(t('Contact'), t('Contact JTBazar support.'))
  const destination = supportDestination(undefined, settings.supportWhatsapp)
  const email = settings.supportEmail
  const phone = settings.supportPhone
  async function submitContact(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = event.currentTarget
    const data = new FormData(form)
    const subject = String(data.get('subject') ?? '').trim()
    if (user) {
      setSending(true)
      try {
        const ticket = await createCustomerSupportTicket(subject, String(data.get('message') ?? '').trim())
        const emailed = await notifySupportEmail(ticket.id, 'customer', 'created')
        setTickets((current) => [ticket, ...current])
        form.reset()
        setFormMessage(emailed ? 'Support request sent. We will reply here and by email.' : 'Support request saved. Email notifications are not configured yet.')
      } catch (cause) { setFormMessage(cause instanceof Error ? cause.message : 'Support request could not be sent.') }
      finally { setSending(false) }
      return
    }
    const message = `Name: ${String(data.get('name') ?? '').trim()}\nEmail: ${String(data.get('email') ?? '').trim()}\nTopic: ${subject}\n\n${String(data.get('message') ?? '').trim()}`
    if (email) {
      window.location.href = `mailto:${email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(message)}`
      setFormMessage(t('Your email app is opening with your message ready to send.'))
    } else if (destination.startsWith('https://')) {
      window.open(supportDestination(message, settings.supportWhatsapp), '_blank', 'noopener,noreferrer')
      setFormMessage(t('WhatsApp is opening with your message ready to send.'))
    } else {
      setFormMessage(t('Support has not published an email or WhatsApp contact yet. Please use the FAQ or account support options.'))
    }
  }
  return <InfoLayout eyebrow={t('Questions & notes')} title={<>{t('Let’s keep the')} <em>{t('conversation clear.')}</em></>} intro={t('Reach the marketplace support team for help with orders, delivery, returns or seller questions.')}>
    <div className="contact-layout">
    <section className="contact-form-panel">
      <div className="contact-form-heading"><span className="eyebrow">{t('Send a message')}</span><h2>{t('How can we help?')}</h2><p>{t('Share a few details and we will help you find the right next step.')}</p></div>
      <form className="contact-form" onSubmit={submitContact}>
        <div className="form-grid">
          {!user && <><div className="form-field"><label htmlFor="contact-name">{t('Your name')} <span>*</span></label><input id="contact-name" name="name" autoComplete="name" required maxLength={120} /></div>
          <div className="form-field"><label htmlFor="contact-email">{t('Email address')} <span>*</span></label><input id="contact-email" name="email" type="email" autoComplete="email" required maxLength={254} /></div></>}
          <div className="form-field form-field--wide"><label htmlFor="contact-subject">{t('What do you need help with?')} <span>*</span></label><select id="contact-subject" name="subject" required defaultValue=""><option value="" disabled>{t('Choose a topic')}</option><option>{t('Order or delivery')}</option><option>{t('Return or refund')}</option><option>{t('Seller question')}</option><option>{t('Other')}</option></select></div>
          <div className="form-field form-field--wide"><label htmlFor="contact-message">{t('Message')} <span>*</span></label><textarea id="contact-message" name="message" rows={6} required minLength={10} maxLength={4000} placeholder={t('Include your order number if your message is about an order.')} /></div>
        </div>
        <div className="contact-form-submit"><button className="button button--dark" type="submit" disabled={sending}>{sending ? 'Sending…' : user ? 'Send support request' : t('Continue to support')} <Send size={15} /></button>{formMessage && <p role="status">{formMessage}</p>}</div>
      </form>
    </section>
    <aside className="contact-aside"><div className="contact-aside__intro"><span className="contact-aside__icon"><MessageCircle size={21} /></span><span className="eyebrow">{t('Customer support')}</span><h2>{t('A real person, one clear message away.')}</h2><p>{t('Choose the contact route that works for your question. For an order, add its order number so we can find it faster.')}</p></div>
      <div className="contact-methods">
        {email && <a className="contact-method" href={`mailto:${email}`}><span><Mail size={17} /></span><span><small>{t('Email support')}</small><strong>{email}</strong></span><ArrowRight size={15} /></a>}
        {phone && <a className="contact-method" href={`tel:${phone.replace(/\s/g, '')}`}><span><Phone size={17} /></span><span><small>{t('Call support')}</small><strong>{phone}</strong></span><ArrowRight size={15} /></a>}
        {destination.startsWith('https://') && <a className="contact-method" href={destination} target="_blank" rel="noopener noreferrer"><span><MessageCircle size={17} /></span><span><small>{t('WhatsApp')}</small><strong>{t('Message our support team')}</strong></span><ExternalLink size={14} /></a>}
        <Link className="contact-method" to="/faq"><span><PackageCheck size={17} /></span><span><small>{t('Looking for an answer?')}</small><strong>{t('Browse common questions')}</strong></span><ArrowRight size={15} /></Link>
      </div>
      <div className="contact-aside__note"><ShieldCheck size={16} /><p>{user ? t('Your message is saved as a private support request. You can return here to follow its status.') : t('Signed-in customers can send a private support request and follow its status from this page.')}</p></div>
    </aside>
    </div>
    {user && tickets.length > 0 && <section className="contact-history"><div className="contact-history__heading"><span className="eyebrow">{t('Your requests')}</span><h2>{t('Support history')}</h2></div>{tickets.map((ticket) => <article key={ticket.id} className="contact-history__item"><div><strong>{ticket.subject}</strong><span className={`support-ticket-status support-ticket-status--${ticket.status}`}>{ticket.status.replace('_', ' ')}</span></div><p>{ticket.message}</p><small>{new Date(ticket.created_at).toLocaleDateString()}</small>{ticket.admin_response && <blockquote><strong>{t('Marketplace reply')}</strong><br />{ticket.admin_response}</blockquote>}</article>)}</section>}
  </InfoLayout>
}

export function FAQPage() {
  const { t } = useI18n()
  const settings = useStoreSettings()
  usePageMeta(t('Frequently asked questions'), t('Answers about ordering, delivery, returns and seller verification.'))
  const faqItems = [
    { question: 'Is JTBazar accepting orders?', answer: settings.codEnabled ? 'Yes. Signed-in customers can place cash-on-delivery orders from published products. The marketplace validates price, stock and delivery fee when the order is created.' : 'Cash on delivery is currently paused, so checkout is unavailable. Published products and their stock status can still be browsed.' },
    { question: 'Is cash on delivery available?', answer: settings.codEnabled ? `Yes. Cash on delivery is available, with a delivery fee of ${formatPKR(settings.deliveryFee)} per order.` : 'Cash on delivery is currently paused. Please contact support before ordering.' },
    { question: 'How is stock confirmed?', answer: 'Availability is shown from the published catalog and checked again by the database when you place an order. If an item sells out first, the order is rejected safely.' },
    { question: 'What is the delivery timeline?', answer: 'Delivery timing depends on the seller and courier. You can track order and vendor fulfilment status from your account after placing an order.' },
    { question: 'What is the return or refund policy?', answer: `Returns and complaints can be opened from your account within ${settings.returnWindowDays} days of delivery. Include a reason and, where useful, evidence. The seller responds and the marketplace reviews the case.` },
    { question: 'How do I contact support?', answer: settings.supportEmail ? `Email ${settings.supportEmail} or use the contact page. Include your order number so we can help faster.` : 'Use the contact page for the support details published by the marketplace. Include your order number so we can help faster.' },
    { question: 'What happens to my checkout details?', answer: 'Your order and delivery details are stored with your account so you can track the order, save addresses and open a return. Your cart is kept on this device until you place the order.' },
  ]
  return <InfoLayout eyebrow={t('Helpful notes')} title={<>{t('Frequently')} <em>{t('asked.')}</em></>} intro={t('Straight answers about ordering, delivery and marketplace policies.')}><div className="info-accordion">{faqItems.map((item) => <details className="faq-item" key={item.question}><summary>{t(item.question)}<span aria-hidden="true">+</span></summary><p>{t(item.answer)}</p></details>)}</div></InfoLayout>
}

export function PrivacyPage() {
  const { t } = useI18n()
  const cart = useCart()
  const wishlist = useWishlist()
  const { user } = useAuth()
  usePageMeta(t('Privacy'), t('How JTBazar stores account, order and cart information.'))
  return <InfoLayout eyebrow={t('Privacy')} title={<>{t('A careful note on')} <em>{t('your details.')}</em></>} intro={t('This page explains what the marketplace stores and why. It is not legal advice.')}>
    <div className="policy-grid privacy-grid">
      <article className="policy-card"><span className="policy-card__icon"><ShieldCheck size={18} /></span><span className="eyebrow">{t('What is stored')}</span><h2>{t('Account and order information')}</h2><p>{t('Your profile name, email and optional phone help identify your account. An order stores the recipient name, phone, delivery address, items, payment status and optional delivery pin so the order can be fulfilled and supported.')}</p></article>
      <article className="policy-card"><span className="policy-card__icon"><ShoppingBag size={18} /></span><span className="eyebrow">{t('Saved for you')}</span><h2>{t('Cart and wishlist')}</h2><p>{user ? t('Your cart is kept in this browser. Wishlist items are linked to your signed-in account and can be available when you sign in on another device.') : t('Your guest cart and saved items are kept in this browser. Sign in to save wishlist items with your account.')}</p></article>
      <article className="policy-card"><span className="policy-card__icon"><Store size={18} /></span><span className="eyebrow">{t('Who can access it')}</span><h2>{t('Order fulfilment and support')}</h2><p>{t('A seller sees the order and delivery details needed to fulfil that seller’s items. Marketplace administrators review orders, seller applications and support cases. Private seller documents and supplier costs are not displayed to buyers.')}</p></article>
      <article className="policy-card"><span className="policy-card__icon"><Mail size={18} /></span><span className="eyebrow">{t('Your choices')}</span><h2>{t('Update or ask for help')}</h2><p>{t('Update saved addresses or remove saved items from your account. For an account or order-data request, contact support from the email connected to your account and include relevant order numbers.')}</p><Link className="text-link" to="/contact">{t('Contact support')} <ArrowRight size={15} /></Link></article>
    </div>
    <section className="privacy-local-controls"><div><span className="eyebrow">{t('On this device')}</span><h2>{t('Clear your cart')}</h2><p>{user ? t('This clears the cart saved in this browser. Your account wishlist stays saved.') : t('This clears the guest cart and saved items in this browser only.')}</p></div><button type="button" className="button button--outline" onClick={() => { cart.clear(); if (!user) wishlist.ids.forEach((id) => { void wishlist.toggle(id) }) }}>{user ? t('Clear device cart') : t('Clear device cart and saved items')}</button></section>
  </InfoLayout>
}

export function ShippingPage() {
  const { t } = useI18n()
  const settings = useStoreSettings()
  usePageMeta(t('Shipping and delivery'), t('Delivery fee, order handling and delivery timelines.'))
  return <InfoLayout eyebrow={t('Shipping & delivery')} title={<>{t('The delivery details,')} <em>{t('clearly.')}</em></>} intro={t('How orders are handled from checkout to delivery.')}>
    <div className="policy-summary"><span className="policy-summary__icon"><Truck size={21} /></span><div><span className="eyebrow">{t('Delivery at a glance')}</span><h2>{formatPKR(settings.deliveryFee)} <small>{t('delivery fee per order')}</small></h2><p>{t('The checkout and order record show the final fee before you place the order.')}</p></div><span className="policy-summary__badge">{t(settings.codEnabled ? 'Cash on delivery available' : 'Cash on delivery paused')}</span></div>
    <div className="policy-grid">
      <article className="policy-card"><span className="policy-card__icon"><PackageCheck size={18} /></span><span className="eyebrow">01 · {t('After checkout')}</span><h2>{t('Seller-by-seller fulfilment')}</h2><p>{t('A multi-seller order is divided into the items each shop needs to prepare. You can follow the order and seller fulfilment updates from your account.')}</p></article>
      <article className="policy-card"><span className="policy-card__icon"><Clock3 size={18} /></span><span className="eyebrow">02 · {t('Delivery timing')}</span><h2>{t('Follow the latest update')}</h2><p>{t('Delivery timing varies by seller, destination and courier. The marketplace does not promise a fixed delivery date until a seller or courier provides one.')}</p></article>
      <article className="policy-card"><span className="policy-card__icon"><MapPin size={18} /></span><span className="eyebrow">03 · {t('Delivery address')}</span><h2>{t('Add a pin if it helps')}</h2><p>{t('You may share a GPS pin at checkout to help locate the delivery address. A clear written street address is still required.')}</p></article>
    </div>
    <div className="policy-page-cta"><div><strong>{t('Need help with a delivery?')}</strong><p>{t('Include your order number so support can find the right order.')}</p></div><Link className="button button--dark" to="/contact">{t('Contact support')} <ArrowRight size={15} /></Link></div>
  </InfoLayout>
}

export function ReturnsPage() {
  const { t } = useI18n()
  const settings = useStoreSettings()
  usePageMeta(t('Returns and complaints'), t('How to open a return, refund or complaint from your account.'))
  return <InfoLayout eyebrow={t('Returns & complaints')} title={<>{t('A fair process,')} <em>{t('in your account.')}</em></>} intro={t('Open a return, refund or complaint against a delivered order item.')}>
    <div className="policy-summary policy-summary--returns"><span className="policy-summary__icon"><ArrowRight size={21} /></span><div><span className="eyebrow">{t('Your return window')}</span><h2>{settings.returnWindowDays} <small>{t('days after delivery')}</small></h2><p>{t('Open a case from your account while the order is eligible.')}</p></div><Link className="button button--dark" to="/account">{t('Open your orders')} <ArrowRight size={15} /></Link></div>
    <div className="policy-grid policy-grid--three">
      <article className="policy-card"><span className="policy-card__icon"><NotebookPen size={18} /></span><span className="eyebrow">01 · {t('Tell us what happened')}</span><h2>{t('Choose the item and reason')}</h2><p>{t('Open a return, refund or complaint case from the eligible order. Describe the issue and attach evidence where it helps explain your request.')}</p></article>
      <article className="policy-card"><span className="policy-card__icon"><MessageCircle size={18} /></span><span className="eyebrow">02 · {t('Review')}</span><h2>{t('Seller and marketplace review')}</h2><p>{t('The seller can respond, and the marketplace reviews the case. The case status and recorded decision remain available in your account.')}</p></article>
      <article className="policy-card"><span className="policy-card__icon"><ShieldCheck size={18} /></span><span className="eyebrow">03 · {t('Resolution')}</span><h2>{t('Agree the next step')}</h2><p>{t('The case decision records the agreed resolution. Support can help clarify the next step for a refund or return arrangement.')}</p></article>
    </div>
    <div className="policy-page-cta"><div><strong>{t('Need help opening a case?')}</strong><p>{t('Contact support with the order number and a short description.')}</p></div><Link className="button button--outline" to="/contact">{t('Contact support')} <ArrowRight size={15} /></Link></div>
  </InfoLayout>
}
