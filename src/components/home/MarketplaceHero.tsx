import { ArrowRight, Check, MapPin, Store } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useI18n } from '../../i18n/LocaleContext'
import type { Product } from '../../types/product'
import type { PublicShop } from '../../types/shop'
import { formatPKR } from '../../utils/money'

type HeroSliderProps = {
  product?: Product
  shop?: PublicShop
}

export function MarketplaceHero({ product, shop }: HeroSliderProps) {
  const { t } = useI18n()

  return (
    <section className="marketplace-hero" aria-labelledby="marketplace-hero-title">
      <div className="marketplace-hero__copy">
        <span className="marketplace-hero__eyebrow"><span aria-hidden="true" />{t('One marketplace, more possibilities')}</span>
        <h1 id="marketplace-hero-title">{t('Everything You Need,')}<br />{t('All in One Place')}</h1>
        <p className="marketplace-hero__description">{t('Buy and sell products, discover services, find properties, and connect with trusted vendors across multiple categories.')}</p>
        <div className="marketplace-hero__actions">
          <Link className="marketplace-hero__primary" to="/shop">{t('Start Shopping')}<ArrowRight size={17} aria-hidden="true" /></Link>
          <Link className="marketplace-hero__secondary" to="/vendor/apply">{t('Become a Seller')}<ArrowRight size={16} aria-hidden="true" /></Link>
        </div>
        <div className="marketplace-hero__trust"><span className="marketplace-hero__trust-icon"><Check size={15} aria-hidden="true" /></span><span>{t('Trusted by buyers and sellers')}</span></div>
      </div>

      <div className="marketplace-hero__visual" aria-label={t('A shopper with shopping bags')}>
        <div className="marketplace-hero__globe" aria-hidden="true"><span /><span /><span /><span /><span /></div>
        <div className="marketplace-hero__photo-wrap">
          <img className="marketplace-hero__photo" src="/images/marketplace-shopper.webp" alt={t('A shopper carrying shopping bags in a bright mall')} width="1600" height="900" fetchPriority="high" decoding="async" />
        </div>

        {product?.images[0] && <Link className="marketplace-hero__product" to={`/products/${product.slug}`} aria-label={`${t('View')} ${t(product.name)}`}>
          <img src={product.images[0]} alt="" loading="lazy" />
          <span className="marketplace-hero__product-copy"><small>{t('Featured product')}</small><strong>{t(product.name)}</strong><b>{formatPKR(product.price)}</b></span>
          <span className="marketplace-hero__card-arrow"><ArrowRight size={15} aria-hidden="true" /></span>
        </Link>}

        {shop?.shopImageUrl && <Link className="marketplace-hero__shop" to={`/shops/${shop.slug}`} aria-label={`${t('View store')} ${t(shop.shopName)}`}>
          <img src={shop.shopImageUrl} alt="" loading="lazy" />
          <span className="marketplace-hero__shop-copy"><small><Store size={12} aria-hidden="true" />{t('Marketplace shop')}</small><strong>{t(shop.shopName)}</strong>{shop.shopLocationLabel && <span className="marketplace-hero__shop-location"><MapPin size={11} aria-hidden="true" />{t(shop.shopLocationLabel)}</span>}</span>
        </Link>}
      </div>
    </section>
  )
}
