# Meridion Marketplace storefront

A responsive React + TypeScript + Vite storefront for Meridion Marketplace. The application uses the shared Supabase project `xrrhbnnzjqkqnqdvayjw` for authentication, catalog, shops, stock availability, orders, addresses, wishlists, notifications, returns/complaints and store settings.

This is a real-data application. There is no demo catalog, mock checkout, fabricated order history or sample revenue. Empty tables render honest empty states, and failed Supabase calls render an error instead of falling back to local mock data.

## Run locally

```bash
pnpm install
cp .env.example .env.local
pnpm dev
```

The development server binds to port 3000. `pnpm typecheck` runs the TypeScript build check and `pnpm build` creates the production bundle in `dist`. There are currently no separate test or lint scripts.

`.env.local` needs the browser-safe project values:

```dotenv
VITE_SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=YOUR_SUPABASE_PUBLISHABLE_KEY
```

Never put a service-role key in a Vite environment variable or browser code. RLS and database grants are the security boundary.

## What is implemented

- **Catalog:** published, approved products and active categories are read from Supabase. Product detail pages show real images, variants, prices and boolean availability from `get_public_availability`.
- **Shops:** the public shop directory uses `list_public_shops`, so approved seller shops are visible without exposing the private `seller_profiles` table.
- **Cart:** the guest cart is stored in `localStorage` as product/variant IDs and quantities. It survives sign-in. Prices and availability are always recalculated from the live catalog.
- **Checkout:** checkout requires a signed-in Supabase user. It supports optional GPS or manually entered coordinates and cash on delivery. The browser calls the authenticated `place_order` RPC; the database derives the buyer from `auth.uid()`, revalidates product/variant publication, price, stock and delivery fee, locks inventory, and writes the order and line snapshots in one transaction. An idempotency key prevents duplicate submissions.
- **Orders:** buyers can view only their own orders and line items, open return/refund/complaint cases against eligible items, upload evidence, and follow seller/admin responses.
- **Account:** profile display, saved delivery addresses, wishlist, notifications and cases are backed by Supabase. Guest wishlist items are merged into the account after sign-in.
- **Seller area:** authenticated users can apply to become a seller, resubmit a rejected application, manage an approved shop, submit products for moderation, adjust inventory, fulfil their own order items, and respond to cases. Supplier costs and verification documents remain private.
- **Admin-managed content:** homepage heroes, promotions, categories and store settings (support contacts, delivery fee, COD availability, return window) are managed in the admin dashboard. The storefront reads the live values; the built-in editorial hero is only a visual fallback when no published hero exists.
- **Localisation:** English and Urdu, with RTL support and a locally stored locale preference.

## Main routes

`/`, `/discover`, `/budget`, `/shop`, `/categories`, `/categories/:slug`, `/products/:slug`, `/shops/:slug`, `/search`, `/wishlist`, `/cart`, `/checkout`, `/order-confirmation/:orderNumber`, `/account`, `/vendor/apply`, `/vendor`, `/login`, `/register`, `/forgot-password`, `/verify-email`, `/verify-otp`, `/reset-password`, `/logout`, `/about`, `/contact`, `/faq`, `/privacy`, `/shipping`, `/returns` and a custom 404.

## Database setup

The canonical migrations live in [`supabase/migrations`](supabase/migrations) and must be applied in ascending filename order. The admin dashboard does not keep a second migration chain; it uses this directory.

The latest migration, `20261025090000_marketplace_checkout_security.sql`, adds the checkout RPC, store settings, newsletter subscriptions, public shop directory, admin/vendor product RPCs, complaint evidence policies and private storage buckets. Without it, checkout, store settings and some seller/admin screens will report that the database function or table is unavailable. The app does not hide that state with demo data.

The repository cannot apply migrations to the remote project without the project owner's Supabase credentials. Verify the remote schema and policies after applying the files. See [`supabase/README.md`](supabase/README.md) for the security model and remote verification checklist.

## Deployment

Deploy as a Vite project (for example on Vercel): install with `pnpm install --frozen-lockfile`, build with `pnpm build`, and publish `dist`. `vercel.json` contains the SPA rewrite. Configure the same two public environment variables in the hosting project and add the deployed origin to the Supabase Auth redirect allow-list.
