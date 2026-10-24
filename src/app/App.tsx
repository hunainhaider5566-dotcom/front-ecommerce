import { useEffect } from 'react'
import { BrowserRouter, Route, Routes, useLocation } from 'react-router-dom'
import { CartProvider } from '../contexts/CartContext'
import { CatalogProvider } from '../contexts/CatalogContext'
import { AuthProvider } from '../contexts/AuthContext'
import { WishlistProvider } from '../contexts/WishlistContext'
import { ToastProvider } from '../contexts/ToastContext'
import { LocaleProvider, useI18n } from '../i18n/LocaleContext'
import { SiteHeader } from '../components/layout/SiteHeader'
import { SiteFooter } from '../components/layout/SiteFooter'
import { MobileBottomNavigation } from '../components/navigation/MobileBottomNavigation'
import { HomePage } from '../pages/HomePage'
import { ShopPage, CategoriesPage, CategoryPage, SearchPage } from '../pages/ShopPages'
import { DiscoverPage } from '../pages/DiscoverPage'
import { BudgetPage } from '../pages/BudgetPage'
import { PublicShopPage } from '../pages/PublicShopPage'
import { ProductPage } from '../pages/ProductPage'
import { WishlistPage } from '../pages/WishlistPage'
import { CartPage } from '../pages/CartPage'
import { CheckoutPage } from '../pages/CheckoutPage'
import { ConfirmationPage } from '../pages/ConfirmationPage'
import { AboutPage, ContactPage, FAQPage, PrivacyPage, ShippingPage, ReturnsPage } from '../pages/InfoPages'
import { LoginPage, RegisterPage, ForgotPasswordPage, VerifyEmailPage, VerifyOtpPage, ResetPasswordPage, LogoutPage } from '../pages/AuthPages'
import { AccountPage } from '../pages/AccountPage'
import { NotFoundPage } from '../pages/NotFoundPage'
import { VendorApplicationPage, VendorDashboardPage } from '../pages/VendorPages'

function ScrollToTop() {
  const { pathname } = useLocation()
  useEffect(() => { window.scrollTo({ top: 0, behavior: 'instant' }) }, [pathname])
  return null
}

function Storefront() {
  const { t, locale, direction } = useI18n()
  return <div className="app-shell" lang={locale} dir={direction}>
    <a className="skip-link" href="#main-content">{t('Skip to content')}</a>
    <SiteHeader />
    <main id="main-content" className="main-content">
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/discover" element={<DiscoverPage />} />
        <Route path="/budget" element={<BudgetPage />} />
        <Route path="/shops/:slug" element={<PublicShopPage />} />
        <Route path="/shop" element={<ShopPage />} />
        <Route path="/categories" element={<CategoriesPage />} />
        <Route path="/categories/:slug" element={<CategoryPage />} />
        <Route path="/products/:slug" element={<ProductPage />} />
        <Route path="/search" element={<SearchPage />} />
        <Route path="/wishlist" element={<WishlistPage />} />
        <Route path="/cart" element={<CartPage />} />
        <Route path="/checkout" element={<CheckoutPage />} />
        <Route path="/order-confirmation/:orderNumber" element={<ConfirmationPage />} />
        <Route path="/account" element={<AccountPage />} />
        <Route path="/vendor/apply" element={<VendorApplicationPage />} />
        <Route path="/vendor" element={<VendorDashboardPage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
        <Route path="/forgot-password" element={<ForgotPasswordPage />} />
        <Route path="/verify-email" element={<VerifyEmailPage />} />
        <Route path="/verify-otp" element={<VerifyOtpPage />} />
        <Route path="/reset-password" element={<ResetPasswordPage />} />
        <Route path="/logout" element={<LogoutPage />} />
        <Route path="/about" element={<AboutPage />} />
        <Route path="/contact" element={<ContactPage />} />
        <Route path="/faq" element={<FAQPage />} />
        <Route path="/privacy" element={<PrivacyPage />} />
        <Route path="/shipping" element={<ShippingPage />} />
        <Route path="/returns" element={<ReturnsPage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </main>
    <SiteFooter />
    <MobileBottomNavigation />
    <ScrollToTop />
  </div>
}

export function App() {
  return <BrowserRouter><LocaleProvider><ToastProvider><CatalogProvider><AuthProvider><CartProvider><WishlistProvider><Storefront /></WishlistProvider></CartProvider></AuthProvider></CatalogProvider></ToastProvider></LocaleProvider></BrowserRouter>
}
