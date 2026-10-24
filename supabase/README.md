# Meridion Supabase foundation

This directory is the canonical migration source for both the Meridion storefront and the admin dashboard. The shared project is `paperloom-store` (ref `xrrhbnnzjqkqnqdvayjw`). Do not keep or apply a second copy of these migrations from the admin application.

## Apply migrations

Apply the files in `migrations/` once, in ascending filename order, through the connected Supabase migration workflow. Keep each applied file and its migration-history record together. Do not run tests that insert or delete customer, order or catalog rows against the shared production project.

The migration chain creates:

- profiles, protected role assignments and the customer role trigger;
- categories, products, images, variants, inventory and inventory-movement audit;
- saved addresses, wishlists, orders, order-item snapshots, payment metadata, notifications, admin notes and audit logs;
- seller profiles, moderation, multi-vendor order fulfilment, marketplace cases and private evidence;
- homepage heroes, promotions, newsletter subscribers and store settings;
- public-safe catalog/shop RPCs and the authenticated checkout RPC.

The latest two files are:

- `20261025085000_admin_inventory_adjustment.sql` — canonical inventory-adjustment function and grants.
- `20261025090000_marketplace_checkout_security.sql` — checkout, store settings, newsletter, public shops, admin/vendor product RPCs, case evidence and storage hardening.

`20261025090000_marketplace_checkout_security.sql` is additive and idempotent where PostgreSQL permits. It adds `orders.idempotency_key`, seller `phone`/`document_path`, `store_settings`, `newsletter_subscribers`, and the following public functions:

| Function | Caller | Purpose |
| --- | --- | --- |
| `place_order(...)` | authenticated buyer | Validates catalog price/stock, locks inventory, applies the live delivery fee, and writes the order plus line snapshots. Buyer identity comes from `auth.uid()`. |
| `get_public_availability(uuid[])` | anon, authenticated | Returns only boolean availability for published products/variants. |
| `list_public_shops()` | anon, authenticated | Returns approved shop names/descriptions and product counts without exposing `seller_profiles`. |
| `subscribe_newsletter(email, source)` | anon, authenticated | Inserts a normalised newsletter subscription. |
| `seller_resubmit_application()` | authenticated seller | Moves the caller's rejected application back to pending review. |
| `vendor_list_products()` | authenticated vendor | Returns the caller's full product rows, including private cost fields, after a seller-status check. |
| `vendor_update_order_item(...)` | authenticated vendor | Updates fulfilment fields only for the vendor's own order items. |
| `admin_list_products(search)` | admin | Returns full product rows for administration after an admin role check. |
| `admin_customer_summary()` | admin | Returns customer profile, email, order count and lifetime value. |
| `admin_update_store_settings(jsonb)` | admin | Validates and updates the singleton store settings row. |

## RLS and authorization

All application tables have RLS enabled. Public roles can read published catalog rows, active categories, published heroes/promotions and approved public shop summaries only. Customer profile, address, wishlist, notification and order reads are owner-scoped. Sellers can read and update only their own shop, products, inventory, order items and cases. Admin role checks use `private.has_role()` against `public.user_roles`, never editable Auth user metadata. The `private` schema is not exposed through the Data API.

The checkout migration revokes broad `SELECT` on `products` and grants only public-safe columns to `anon`/`authenticated`. Do not reintroduce `select('*')` or unrestricted joins against `products`; supplier cost, fulfilment expense and minimum profit must stay private. Full product reads for sellers and admins go through the role-checked RPCs above.

Customers cannot insert or update orders through the browser. `place_order` is `SECURITY DEFINER`, derives the buyer from `auth.uid()`, checks the current publication/moderation state, verifies variant ownership, locks stock rows, and computes the delivery fee from `store_settings`. It is granted only to `authenticated`.

`public.get_public_availability(uuid[])` is intentionally executable by anonymous and authenticated clients because the storefront needs bounded stock status. It accepts at most 100 product IDs, filters to published products and returns booleans, not quantities. `public.create_order(...)` remains executable only by `service_role` and is not used by the storefront.

## Store settings

`public.store_settings` has one row (`id = 'default'`) with the store name, support email/phone/WhatsApp, delivery fee, COD availability and return window. Public roles can read it; only the `admin_update_store_settings` RPC can update it. The storefront reads these values for checkout, the footer and help pages. Database-side checkout uses the same delivery fee, so a stale browser value cannot change the order total.

## Storage

The migration creates and secures these buckets:

- `product-images` — public reads; admin-only upload/update/delete; JPEG, PNG, WebP and AVIF up to 10 MiB.
- `product-drafts` — private; admin-only drafts.
- `vendor-documents` — private; sellers can upload/read only their own folder, admins can review.
- `complaint-evidence` — private; buyers can upload evidence for their own cases, sellers/admins can read evidence for cases they can access.

If a bucket is missing in the remote project, apply the migration rather than creating a public bucket manually. Do not make `vendor-documents` or `complaint-evidence` public.

## Auth and admin access

A new Auth user receives a profile and the `customer` role through a database trigger. No migration promotes an account to admin. After the intended owner account exists and its email is verified, a trusted project owner may grant admin in the Supabase SQL Editor:

```sql
INSERT INTO public.user_roles (user_id, role)
SELECT id, 'admin'::public.app_role
FROM auth.users
WHERE lower(email) = lower('REPLACE_WITH_VERIFIED_OWNER_EMAIL')
ON CONFLICT (user_id, role) DO NOTHING;
```

Run this only after replacing the placeholder with the verified owner account and confirming the selected project. Never expose role assignment as a browser RPC or public sign-up option.

The frontend uses Supabase Auth password, verification/OTP, recovery and OAuth flows. Confirm preview and production origins are on the redirect allow-list. Email delivery depends on the project's Auth email/SMTP configuration and must be tested separately.

## Remote verification checklist

The newest migrations are not confirmed applied to the remote project from this workspace. After applying them with owner credentials, verify:

1. `supabase migration list` shows every file in this directory as applied.
2. `store_settings` contains exactly one row and public `SELECT` succeeds while anonymous updates fail.
3. `place_order` is executable by `authenticated` only; `anon` receives permission denied.
4. A test buyer can place one COD order, sees it in `/account`, and the admin dashboard sees the same order. Repeating the same idempotency key must not create a second order.
5. An anonymous request cannot read `seller_profiles`, `product_inventory` quantities, supplier cost columns or private case evidence.
6. A non-admin authenticated user receives an error from `admin_list_products()` and `admin_customer_summary()`.
7. A seller can read only their own products/order items and cannot read another seller's documents or cases.
8. All four storage buckets exist with the intended public/private flags and policies.

Do not claim remote verification until these checks have been run against the project.
