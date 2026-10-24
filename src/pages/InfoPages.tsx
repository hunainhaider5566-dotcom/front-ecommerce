import { ArrowRight, ExternalLink, Leaf, MessageCircle, NotebookPen, ShieldCheck } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useCart } from '../contexts/CartContext'
import { useWishlist } from '../contexts/WishlistContext'
import { usePageMeta } from '../hooks/usePageMeta'
import { useStoreSettings } from '../hooks/useStoreSettings'
import { supportDestination } from '../utils/support'
import { useI18n } from '../i18n/LocaleContext'
import { formatPKR } from '../utils/money'

function InfoLayout({ eyebrow, title, intro, children }: { eyebrow: string; title: React.ReactNode; intro: string; children: React.ReactNode }) {
  return <div className="page-shell info-page"><header className="info-page__heading"><span className="eyebrow">{eyebrow}</span><h1>{title}</h1><p>{intro}</p></header>{children}</div>
}

export function AboutPage() {
  const { t } = useI18n()
  const settings = useStoreSettings()
  usePageMeta(t('About Meridion'), t('A multi-vendor marketplace for thoughtful goods across everyday routines.'))
  return <InfoLayout eyebrow={t('A little about us')} title={<>{t('Space for the')} <em>{t('everyday idea.')}</em></>} intro={t(`${settings.storeName} is a multi-vendor marketplace connecting independent sellers with buyers across Pakistan.`)}>
    <div className="info-feature-grid">
      <article><span><Leaf size={19} /></span><h2>{t('Thoughtful by design')}</h2><p>{t('A quiet visual language for considered goods, creative routines and everyday moments.')}</p></article>
      <article><span><NotebookPen size={19} /></span><h2>{t('Useful, not precious')}</h2><p>{t('Useful goods should fit changing routines, thoughtful spaces and ordinary moments.')}</p></article>
      <article><span><ShieldCheck size={19} /></span><h2>{t('Verified sellers')}</h2><p>{t('Seller applications are reviewed before products are published, and products pass a moderation step.')}</p></article>
    </div>
    <section className="placeholder-panel"><span className="eyebrow">{t('How the marketplace works')}</span><h2>{t('Buyer protection, built in')}</h2><p>{t('Orders, returns and complaints are recorded against your account. Cash on delivery orders are confirmed by the marketplace before fulfillment.')}</p><Link to="/shop" className="text-link">{t('Browse the catalog')} <ArrowRight size={15} /></Link></section>
  </InfoLayout>
}

export function ContactPage() {
  const { t } = useI18n()
  const settings = useStoreSettings()
  usePageMeta(t('Contact'), t('Contact Meridion Marketplace support.'))
  const destination = supportDestination(undefined, settings.supportWhatsapp)
  const email = settings.supportEmail
  const phone = settings.supportPhone
  return <InfoLayout eyebrow={t('Questions & notes')} title={<>{t('Let’s keep the')} <em>{t('conversation clear.')}</em></>} intro={t('Reach the marketplace support team for help with orders, delivery, returns or seller questions.')}>
    <section className="placeholder-panel contact-placeholder">
      <span className="contact-placeholder__icon"><MessageCircle size={21} /></span>
      <div>
        <span className="eyebrow">{t('Customer support')}</span>
        <h2>{t('We are here to help')}</h2>
        {email || phone ? <p>{email && <>{t('Email us at')} <a className="text-link" href={`mailto:${email}`}>{email}</a></>}{email && phone ? ' · ' : null}{phone && <>{t('Call')} <a className="text-link" href={`tel:${phone.replace(/\s/g, '')}`}>{phone}</a></>}</p> : <p>{t('Support contact details have not been published yet. You can still track orders and open a case from your account.')}</p>}
        {destination.startsWith('https://') && <a className="button button--dark" href={destination} target="_blank" rel="noopener noreferrer">{t('Open WhatsApp')} <ExternalLink size={15} /></a>}
        <p><Link className="text-link" to="/faq">{t('Read the FAQ')} <ArrowRight size={15} /></Link></p>
      </div>
    </section>
  </InfoLayout>
}

export function FAQPage() {
  const { t } = useI18n()
  const settings = useStoreSettings()
  usePageMeta(t('Frequently asked questions'), t('Answers about ordering, delivery, returns and seller verification.'))
  const faqItems = [
    { question: 'Is Meridion accepting orders?', answer: settings.codEnabled ? 'Yes. Signed-in customers can place cash-on-delivery orders from published products. The marketplace validates price, stock and delivery fee when the order is created.' : 'Cash on delivery is currently paused, so checkout is unavailable. Published products and their stock status can still be browsed.' },
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
  usePageMeta(t('Privacy'), t('How Meridion Marketplace stores account, order and cart information.'))
  return <InfoLayout eyebrow={t('Privacy')} title={<>{t('A careful note on')} <em>{t('your details.')}</em></>} intro={t('This page explains what the marketplace stores and why. It is not legal advice.')}>
    <article className="policy-copy">
      <h2>{t('Account and order information')}</h2><p>{t('When you create an account, your name, email and (optionally) phone number are stored to identify you and secure your account. When you place an order, your recipient name, phone, delivery address and optional location pin are stored against that order so it can be fulfilled and supported.')}</p>
      <h2>{t('Cart and wishlist')}</h2><p>{t('Your cart is stored in this browser until you place an order. Wishlist items are stored in this browser for guests and with your account after you sign in.')}</p>
      <button type="button" className="button button--outline" onClick={() => { cart.clear(); wishlist.ids.forEach((id) => { void wishlist.toggle(id) }) }}>{t('Clear local cart & wishlist')}</button>
      <h2>{t('Who can see your information')}</h2><p>{t('Sellers receive only the order details needed to fulfil their items. Marketplace administrators can review orders, sellers and cases to resolve issues. Supplier costs and private seller documents are never shown to buyers.')}</p>
      <h2>{t('Your choices')}</h2><p>{t('You can update saved addresses and remove wishlist items from your account. To request deletion of your account or order data, contact support with your account email and order numbers.')}</p>
    </article>
  </InfoLayout>
}

export function ShippingPage() {
  const { t } = useI18n()
  const settings = useStoreSettings()
  usePageMeta(t('Shipping and delivery'), t('Delivery fee, order handling and delivery timelines.'))
  return <InfoLayout eyebrow={t('Shipping & delivery')} title={<>{t('The delivery details,')} <em>{t('clearly.')}</em></>} intro={t('How orders are handled from checkout to delivery.')}>
    <article className="policy-copy">
      <h2>{t('Delivery fee')}</h2><p>{t('A delivery fee of')} {formatPKR(settings.deliveryFee)} {t('is added to each order. The final fee is validated by the marketplace when the order is placed.')}</p>
      <h2>{t('Order handling')}</h2><p>{t('Orders are split by seller for fulfilment. Each seller confirms and processes their items, and the overall order status is updated as delivery progresses.')}</p>
      <h2>{t('Delivery timing')}</h2><p>{t('Timing depends on the seller, destination and courier. Track the latest status and tracking details from your account.')}</p>
      <h2>{t('Location pin')}</h2><p>{t('You can optionally share a GPS pin at checkout to help the courier find your address. You can also leave it blank and provide a street address.')}</p>
    </article>
    <Link to="/contact" className="text-link">{t('Contact support')} <ArrowRight size={15} /></Link>
  </InfoLayout>
}

export function ReturnsPage() {
  const { t } = useI18n()
  const settings = useStoreSettings()
  usePageMeta(t('Returns and complaints'), t('How to open a return, refund or complaint from your account.'))
  return <InfoLayout eyebrow={t('Returns & complaints')} title={<>{t('A fair process,')} <em>{t('in your account.')}</em></>} intro={t('Open a return, refund or complaint against a delivered order item.')}>
    <article className="policy-copy">
      <h2>{t('Return window')}</h2><p>{t('Open a case within')} {settings.returnWindowDays} {t('days of delivery. Include the item, the reason and any evidence that helps the seller understand the issue.')}</p>
      <h2>{t('What happens next')}</h2><p>{t('The seller can respond, and the marketplace reviews the case. You can follow the status from your account. Decisions are recorded against the case.')}</p>
      <h2>{t('Refunds')}</h2><p>{t('Approved refunds are handled through the original payment method where possible. Cash-on-delivery orders are refunded using the arrangement confirmed in the case.')}</p>
    </article>
    <Link to="/account" className="text-link">{t('Go to your account')} <ArrowRight size={15} /></Link>
  </InfoLayout>
}
