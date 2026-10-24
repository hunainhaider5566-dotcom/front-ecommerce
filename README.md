# Paperloom — Considered Goods Demo Storefront

A responsive, client-rendered React + TypeScript + Vite storefront frontend for a configurable, multi-category brand concept. Its current sample catalog is stationery-led, but the store UI and category data are not restricted to stationery. This is a **demo-only** experience: sample products, prices and availability are not live offers; checkout, COD and real order submission are disabled; no vendor, courier, payment, email, OTP or authentication provider is connected.

## Run locally

```bash
pnpm install
pnpm dev
```

Type-check and create a production bundle with `pnpm typecheck` and `pnpm build`. The development app binds to port 3000. The app uses React Router, Tailwind CSS, Lucide React and browser local storage for only cart quantities/product/variant IDs and wishlist product IDs.

For Vercel, import the repository as a Vite project, install with `pnpm install --frozen-lockfile`, run `pnpm build`, and set the output directory to `dist`. `vercel.json` contains the SPA route rewrite for client-side navigation.

## Routes

The project includes `/`, `/shop`, `/categories`, `/categories/:slug`, `/products/:slug`, `/search`, `/wishlist`, `/cart`, `/checkout`, `/order-confirmation`, `/account`, `/login`, `/register`, `/forgot-password`, `/verify-email`, `/verify-otp`, `/reset-password`, `/logout`, `/about`, `/contact`, `/faq`, `/privacy`, `/shipping`, `/returns` and a custom 404. Auth pages are presentation/validation only and never simulate a session; credentials, email addresses and OTPs are not transmitted to any provider or service and are not persisted. Reserved admin routes are not implemented. `public/manus-routes.json` declares the page route patterns.

## Language and account preview

The interface supports English and Urdu; Urdu switches the document to RTL and stores only the locale preference. The account screens show future order-history, saved-address and wishlist-sync placeholders. Login, registration, email/OTP verification, Google sign-in and password-reset flows are UI-only: there is no auth provider or email service, so no account, session, email, OTP or password change can be created or claimed. The registration and recovery forms clear their fictional input after local preview validation.

## Demo and configuration

`src/config/store.ts` sets `DEMO_MODE = true`, `COD_ENABLED = false`, `STORE_CURRENCY = 'PKR'`, a blank WhatsApp number and an unconfigured delivery fee (`null`). Checkout test values are explicitly fictional and are not persisted or transmitted. The order-service adapter returns a demo response stating that no real order exists; it performs no write and creates no order ID. Confirmation does not depend on a URL query parameter.

Prices, specifications, descriptions and availability in `src/data/mockProducts.ts` are sample content only. The `demo` availability status means interaction is allowed solely in this mock cart, not that a real item is in stock. Shipping, returns, contacts and social accounts remain placeholders until verified. The site is client-rendered; route-specific titles/descriptions update in the browser, but this project does not claim server-rendered or complete crawler SEO.

All five generated editorial stationery images are bundled as optimized WebP files in `public/images/`, so the frontend does not depend on project-specific image-storage routing and can be built from this repository in Vercel or OpenCode.

## Backend phase before launch

No Supabase integration is configured. Replace `src/services/products/productService.ts` with a server-backed data service and replace the demo order adapter only after a secure backend is implemented. The backend must independently validate prices, availability, variant choices, quantities, delivery fees and totals; create orders server-side; use Supabase PostgreSQL with Row Level Security; protect administrative operations with authentication; and avoid trusting browser totals. Confirm vendor, stock, payment/COD, courier, contact, privacy, shipping, returns and refund terms before launch. Do not place Supabase service-role credentials in browser code.

## Continuing in OpenCode IDE

The project uses a conventional Vite source tree and `pnpm-lock.yaml`. Continue UI work locally with the commands above. Before adding Supabase, define server-only credentials and secure API boundaries; keep customer data out of local storage and never enable live checkout from a client-only flag.
