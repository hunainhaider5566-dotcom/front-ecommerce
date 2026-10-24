# Paperloom Supabase foundation

This repository contains additive migrations for the Supabase project selected by the Paperloom owner. The current database starts with no public application tables or seeded catalog records. Migrations create structure and security controls only; add real products/categories only after their details are verified.

## Apply migrations

Apply the ordered files in `migrations/` once, in ascending filename order, through the connected Supabase migration workflow. Keep each applied file and its migration-history record together. Do not run tests that insert/delete customer, order or catalog rows against the shared project; the connected database is shared with production.

The schema includes profiles and protected role assignments, categories, products, product images and variants, inventory and movement audit, saved customer addresses and wishlists, order and item snapshots, payment transaction metadata, notifications, admin notes and audit logs. Catalog publication is separate from availability. The public availability RPC returns only a boolean per published product/variant; it never discloses stock counts.

## RLS and authorization

All Paperloom application tables have RLS enabled. Public roles can read published catalog rows and active categories only. Customer profile/address/wishlist/notification reads are owner-scoped. Order reads are restricted to the order's customer and admins. Customers cannot insert or update orders through the browser. Payment transaction records, admin notes, audit logs and inventory quantities are admin-only. Admin role checks use `private.has_role()` against `public.user_roles`, not editable Auth user metadata. The helper schema is not exposed through the Supabase Data API.

The security advisor intentionally reports `public.get_public_availability(uuid[])` as executable by anonymous and authenticated clients because the storefront needs a bounded RPC for product stock status. It accepts at most 100 product IDs, filters to published products, and returns only boolean availability—not quantities. `current_user_is_admin()` and `admin_dashboard_summary()` use invoker rights; `public.create_order(...)` is executable only by `service_role`. Re-check these boundaries if the functions change. Performance-advisor “unused index” notices are expected while these tables are empty; retain indexes that support the documented foreign keys and query patterns rather than treating an empty database as production workload.

A new Auth user receives a profile and the `customer` role through a database trigger. No migration promotes an account to admin. After the intended owner account has been created and its email verified, a trusted project owner may grant admin in the Supabase SQL Editor using the exact account email:

```sql
INSERT INTO public.user_roles (user_id, role)
SELECT id, 'admin'::public.app_role
FROM auth.users
WHERE lower(email) = lower('REPLACE_WITH_VERIFIED_OWNER_EMAIL')
ON CONFLICT (user_id, role) DO NOTHING;
```

Run that only after replacing the placeholder with the verified owner account and confirming the selected project. Never expose this operation as a browser RPC or public sign-up option. Remove the role with a trusted SQL Editor session if access must be revoked.

## Product images

The `product-images` Storage bucket is public for object reads, limited to JPEG, PNG, WebP and AVIF files up to 10 MiB. Storage object listing and all upload/update/delete operations require an authenticated admin role. Store only approved assets there; public-bucket reads are public by design. The separate `product-drafts` bucket is private and all reads/writes require an authenticated admin role. Keep unpublished/sensitive imagery in `product-drafts`; when approved, move it into `product-images` and update `product_images.storage_path` to the public-bucket key before publishing the product. Paths are relative to their bucket; otherwise use a verified HTTPS `image_url`. The app has no image-upload UI in this phase.

## Browser environment

Copy `.env.example` to `.env.local` for local development and fill in `VITE_SUPABASE_URL` plus the Supabase publishable key. The URL and publishable/legacy anon key are browser-visible by design; RLS and grants are the security boundary. Never use `service_role` in Vite, never commit `.env.local`, and never include real values in `.env.example`. Configure the same two public variables in the eventual Vercel environment before publishing.

Set `VITE_CATALOG_MODE=demo` only when intentionally previewing the explicitly fictional local mock catalog. The default is live Supabase when configured and an empty/unconfigured state when it is not; an empty live database never falls back to demo listings.

## Supabase Auth setup

The frontend uses Supabase Auth password, verification/OTP, recovery and OAuth flows. Google OAuth currently reports enabled in this project's Auth settings; confirm the preview and production origins are on the redirect allow-list before launch. Email delivery depends on the project's Auth email/SMTP configuration and was not tested by sending a message. The frontend reports provider failures honestly and does not store credentials or tokens in application local storage.

## Checkout and order creation

The website checkout remains a demo. COD is disabled and the browser does not create order rows, invoke a payment provider or submit a delivery request. The `public.create_order` routine is only executable by `service_role`; it validates current product/variant availability and prices, locks inventory and writes the order plus line snapshots in one database transaction. It is not called by the storefront and must only be called by a trusted server that derives the customer identity, payment method and delivery fee. Do not make it callable by `anon` or `authenticated`, or expose any service-role key, until vendor, delivery, payment and order-processing arrangements are verified.

## Documentation references

- Supabase RLS: https://supabase.com/docs/guides/database/postgres/row-level-security
- Securing the Data API: https://supabase.com/docs/guides/api/securing-your-api
- Supabase Auth: https://supabase.com/docs/guides/auth
- Supabase Storage access control: https://supabase.com/docs/guides/storage/security/access-control
