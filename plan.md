# Paperloom — Premium multi-category commerce redesign

## Approved scope and implementation approach

Continue the existing React 18 + TypeScript + Vite storefront in place. Preserve its editorial design, Poppins/Inter typography, English/Urdu UI, routes, components, bundled imagery, responsive navigation, local cart/wishlist interactions and demo checkout. Do not rebuild the storefront or assume it will only sell stationery.

Connect the existing app to the user-authorized Supabase project `xrrhbnnzjqkqnqdvayjw` through the Supabase connector. Add ordered, version-controlled SQL migrations under `supabase/migrations/`, apply them in order and verify schema, grants, RLS policies, triggers and Storage. Supabase is external; keep Manus Webdev server/database features off. Use only browser-safe Supabase URL/publishable-key environment variables in the frontend. Never commit real credentials or place a service-role key in browser code.

Replace mock product/category reads with explicit Supabase reads. An empty or failed live catalog remains empty or shows a clear error; never silently show invented products. Keep mock content only behind an explicit demo-catalog switch. Do not seed fictitious products, categories, inventory, users, orders, payments, addresses or notifications. The local demo cart/wishlist may persist only item identifiers, quantities and selected variants. Keep checkout, COD and order submission in demo mode; the frontend must not create order rows or claim an order was placed. Any prepared order-creation routine must be unavailable to `anon` and `authenticated`, and the app must not call it.

Connect the existing login/register/recovery UI to Supabase Auth: email/password sign-in and registration, email verification/OTP, password recovery/reset, Google OAuth through Supabase, session restoration and sign-out. Show the provider's actual response; never simulate success. Customer data remains private. Profiles and roles come from Supabase, not browser storage or user-controlled metadata. Admin authorization is enforced by database RLS and protected role records, not by hidden links or client-only route checks.

Create a multi-category schema for profiles and customer roles; categories; products, images and variants; inventory and auditable stock movements; saved addresses and wishlists; orders and immutable line snapshots; payment transaction records; notifications; admin notes and audit logs. Keep catalog publication separate from stock availability. Public reads are limited to published catalog data and non-sensitive availability. Users may read/write only their own customer data. Administrators may manage catalog and operational data only through authenticated admin-role policies. A trusted, server-only order routine, if included, validates current prices/items and performs stock/order writes atomically; it remains disconnected while checkout is demo-only.

## Project structure and responsibility boundaries

- `supabase/migrations/`: ordered additive SQL for schema, constraints, triggers, grants, RLS policies and Storage. Do not add demo seed records.
- `supabase/README.md`: schema/RLS map, migrations, Storage path convention, Auth provider setup and owner-only admin-role bootstrap steps.
- `src/lib/supabase.ts`: one browser Supabase client from `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY`; no privileged credentials.
- `src/contexts/CatalogContext.tsx` or `src/hooks/useCatalog.ts`: shared async catalog state with loading/error/empty outcomes and product/category lookups for existing routes.
- `src/services/products/productService.ts`: async Supabase repository mapping database rows, images, variants and non-sensitive availability to existing domain types; demo adapter only when explicitly selected.
- `src/services/auth/authService.ts` and `src/contexts/AuthContext.tsx`: Supabase Auth operations, restored session, auth-state listener and current user/profile state.
- `src/pages` and existing reusable product/auth components: consume live async state while preserving the current visual design and interactions; checkout remains disconnected from order writes.
- `.env.example`: variable names and safe placeholders only. `.env.local` is ignored and never committed.
- `public/manus-routes.json`: retain current public route patterns and update only if routes change.

## Design

### Design Movement

Contemporary independent-retail editorial design, borrowing the calm art direction of a premium print magazine and translating it into an approachable online store.

### Core Principles

- Lead with the supplied real project imagery and strong, readable product presentation.
- Use whitespace to organize a clear shopping journey rather than to create empty space.
- Apply the new ivory/ink/sage/terracotta system consistently; keep sage and terracotta as accents, not full-page fills.
- Make every demo, unconfigured integration and unconfirmed business detail honest and explicit.

### Color Philosophy

Warm ivory `#F8F6F1` keeps the canvas tactile without making the whole site beige. Deep ink `#20231F` supplies crisp contrast and replaces the previous forest-green-dominant surfaces. Muted sage `#DCE4D6` softens supporting surfaces; terracotta `#B96E52` is a distinctive action/selected-state accent used sparingly. White gives product imagery and forms breathing room; neutral borders and low-contrast shadows separate content without heavy cards.

### Layout Paradigm

Use a magazine-like, asymmetric composition: a wide hero with carefully balanced image and copy, a horizontally paced category/story sequence, and varied editorial feature bands instead of repeating one generic card grid. Retain responsive product grids where comparison is useful. On mobile, collapse into a deliberate vertical story, keep actions touch-sized, and move secondary navigation into a compact menu while preserving the current five-item bottom navigation.

### Signature Elements

1. A large art-directed image window using the existing hero photograph, with small slide-position controls integrated into the composition.
2. A thin terracotta rule or small terracotta detail at headings/actions, paired with quiet sage surfaces.
3. Editorial category/product labels with consistent uppercase micro-labels and restrained image crops.

### Interaction Philosophy

Keep shopping actions immediate and legible: feedback appears in accessible non-blocking toasts, controls have visible focus and meaningful labels, notification empty states do not imply real orders, and provider-dependent operations fail clearly instead of simulating success. Preserve reduced-motion preferences and the existing mobile navigation model.

### Animation

Use brief image-hover and button-feedback transitions; reveal sections only when they enter view, with a small stagger for product cards. The hero automatically advances every 4.5 seconds with a restrained fade, loops continuously, pauses on hover/focus, has no visible previous/next arrows or manual-navigation buttons, preserves the existing keyboard and mobile-swipe gestures, and does not autoplay under reduced motion; retain the existing subtle non-interactive position dots. Add one translucent diagonal reflection sweep across the hero content and existing card surfaces every ~7 seconds, without changing layout, obscuring text, intercepting pointer events, or duplicating the shine on nested children. Disable the shine and other nonessential motion for `prefers-reduced-motion`. Keep current hero images and text. Avoid parallax, bounce, persistent decoration and layout-shifting transitions.

### Typography System

Use Poppins 500/600/700 for headings; desktop hero heading approximately 56–76px and mobile approximately 36–48px. Use Inter 400/500/600 for English descriptions, prices, buttons, forms, navigation and labels; target 16–18px body text on desktop and comfortably readable body text on mobile. Navigation and labels must not feel tiny. Use Noto Sans Arabic for Urdu and RTL UI. Define consistent heading/body scales, line heights and tracking, maintain clear product-name/price hierarchy, tabular price numerals, safe sans-serif fallbacks and optional-display font loading to reduce late layout shifts. Load only the needed font weights.

### Brand Essence

Paperloom is an editorial storefront for useful, considered everyday goods, with room for additional product categories; thoughtful, confident, welcoming.

### Brand Voice

Headlines feel concise and editorial; actions are direct; operational copy is transparent. Example lines: “Good things for everyday living.” and “Find a little more room for what matters.” Do not claim provenance, fulfillment, quality certification or customer trust that has not been confirmed.

### Wordmark & Logo

Preserve the existing Paperloom wordmark and original folded-page mark; refine their contrast and spacing within the new ink/terracotta palette without replacing the brand mark.

### Signature Brand Color

Terracotta `#B96E52` is the ownable accent, reserved for focused emphasis, selected states and primary-action details.

## Runtime, security and delivery constraints

Supabase is external and user-authorized. Keep Manus Webdev server/database features off. Apply only additive schema migrations, with no destructive changes or fictitious seed records. Enable RLS on every application table. Public catalog reads are filtered to published rows; customer data is owner-scoped; admin roles are assigned only by a trusted project owner. Approved product images use a public bucket; unpublished assets use a separate private admin-only draft bucket. Object uploads, replacements and deletion are admin-only, and only approved assets move into the public bucket.

The browser uses only Supabase's public URL and publishable/legacy anon key. Never retrieve, print, commit or ship a service-role key. Google OAuth is enabled in the current project; verify redirect allow-lists for preview/production origins. Email verification/recovery delivery depends on Supabase Auth email settings; never claim success unless Supabase returns it. Do not store addresses, auth tokens, customer form details or orders in local storage.

Keep the existing Vercel static build configuration and do not publish unless separately requested. Checkout remains demonstration-only, COD is disabled, and the client creates no real order or delivery request. Run existing diagnostics, typecheck and production build; save approved changes as a canonical checkpoint without auto-publishing.
