# Paperloom — approved redesign outcomes

## 1. Improve the existing project without breaking its working store
- [x] Inspect and improve the existing project rather than rebuilding it unnecessarily. Preserve working features and reusable components, current routes and product/category data boundaries. Do not replace the current homepage hero image: retain `public/images/paperloom-hero.webp` as image one in the improved hero slider. Use real bundled project assets for further slides; do not create broken image paths. If a needed image is unavailable, reuse a real bundled image with a different crop/position until a real asset is supplied.
- [x] Keep the brand configurable for multiple product categories in the future; do not hard-code the store as stationery-only. Avoid fake reviews, fake sales figures, fake customer testimonials and unsupported trust claims.
- [x] Preserve the existing demo catalog, product detail, gallery, cart, wishlist, checkout, policy/help and responsive navigation behavior; retain the current Vite/React/TypeScript project and bundled image assets.

## 2. New premium visual direction and typography
- [x] Create a sophisticated editorial-commerce aesthetic with strong visual hierarchy, premium product presentation, generous but purposeful whitespace, confident typography and consistent spacing. Remove generic AI-template styling, repetitive layouts, awkward spacing, tiny typography and unnecessary decorative elements without losing useful content or functionality.
- [x] Use warm ivory `#F8F6F1`, deep ink `#20231F`, muted sage `#DCE4D6`, terracotta `#B96E52`, white `#FFFFFF`, soft neutral borders and subtle shadows consistently. Treat these as a starting palette; do not make the entire website dark green or beige.
- [x] Use Poppins for headings and Inter for body text. Use a responsive desktop hero heading of approximately 56–76px and mobile hero heading of approximately 36–48px. Use 16–18px body text on desktop and comfortably readable mobile text. Navigation and form labels must never feel tiny. Establish consistent type scales, line heights and font weights.
- [x] Use Lucide icons consistently. Avoid emoji icons, excessive rounded cards, fake glassmorphism, unnecessary gradients and randomly placed decorative shapes.

## 3. Homepage hero slider
- [x] Build a functional, responsive 2–3-slide carousel and keep the current hero image as slide one. Use real existing project assets for additional slides where available; otherwise use the existing image with alternative crops/positioning. Use large, high-contrast headings, readable supporting copy and a prominent CTA; keep text readable over images and avoid awkward cropping.
- [x] Add previous/next controls, slide indicators and mobile swipe support. Autoplay is slow/subtle, pauses on hover and keyboard focus, respects reduced-motion preferences, and uses smooth fade or restrained slide transitions. Keep the composition balanced with a deliberate responsive height and art-directed rather than generic appearance.

## 4. Homepage content, configurable catalog and motion
- [x] Include hero slider, shop-by-category, featured products, new arrivals, curated collections, promotional editorial section, brand/value proposition, newsletter signup UI and customer-support/contact CTA.
- [x] Keep category and product data configurable so future categories can be added without a redesign. Use the real existing mock catalog as clearly identified demo content; do not invent new live products or inventory.
- [x] Add subtle scroll-reveal animations, staggered product-card entrances, image-hover transitions, button feedback and smooth section transitions. Avoid excessive motion, keep animations lightweight and performant, and respect `prefers-reduced-motion`.
- [x] Newsletter signup remains UI-only until a real service is configured. It must not transmit or persist subscriber addresses and must not claim that a subscription succeeded.

## 5. Header, search, wishlist, cart, language and notifications
- [x] Build a responsive premium header with brand logo; shop/category navigation; functional search UI; wishlist icon and item count; cart icon and item count; notification bell; account/login entry; and English/Urdu language selector. On mobile, keep navigation clean and usable without overcrowding the header; preserve the existing mobile navigation model.
- [x] Clicking the notification bell opens a notification panel or page. Provide suitable notification items only when genuine backend data exists; otherwise show an honest empty state. Do not invent real order or delivery updates. Keep presentation ready for backend notification data.
- [x] Search, navigation, category links and existing storefront routes continue working. Account and notification controls must open their actual screens/panels rather than dead decorative controls.

## 6. Cart, wishlist and accessible toast feedback
- [x] Add-to-cart updates cart state immediately and shows a non-blocking accessible success toast such as “Added to cart”. Prevent duplicate clicks from causing unintended duplicate actions. Support quantity updates, remove-item actions and totals. Persist demo cart state only within the existing safe architecture and store no personal customer data.
- [x] Wishlist add/remove works on both product cards and product-detail pages, with synchronized button/count state and immediate accessible toast feedback when an item is added or removed.
- [x] Use accessible, appropriately styled success/error toasts; never use blocking browser alerts. Maintain keyboard operation, screen-reader announcements, visible focus and reduced-motion behavior for notifications.

## 7. Authentication experience screens and behavior
- [x] Provide consistent, responsive UI routes for login, registration, forgot password, email verification, OTP verification, reset password, Google sign-in, logout, loading, error and success/provider-status states. Add an account entry point and organize account UI to support future order history, saved addresses and wishlist synchronization.
- [x] Login UI includes email and password, show/hide password, remember-me where supported, forgot-password link, continue-with-Google button and register link.
- [x] Register UI includes full name, email, password and confirmation, password visibility toggle, password validation with clear inline errors, terms/privacy acknowledgement and the email-verification next step.
- [x] OTP UI uses accessible digit boxes or an equivalent usable input, autofocus and keyboard navigation, paste support, resend countdown/loading state, and clear invalid/expired feedback. Use actual Supabase OTP/verification responses; never accept an invented code, and show delivery/configuration errors honestly.
- [x] Forgot/reset UI presents the request-reset and verification/update steps, validates password confirmation locally and gives truthful feedback. Show success only when Supabase confirms the request or password update; surface provider errors.
- [x] Google sign-in is not simulated. If Google OAuth/provider credentials are missing, show a clear configuration-dependent unavailable state rather than claiming success.

## 8. Authentication backend, security and demo-only limit
- [x] Inspect existing backend setup before choosing an integration. If Supabase is configured or explicitly intended in a later approved phase, use Supabase Auth for email/password and Google OAuth, the provider’s actual supported verification/reset flow, public environment variables only, protected account pages, session-expiry handling and secure server/database authorization for privileged actions. Never expose service-role keys, OAuth client secrets or other private credentials in frontend code. A hidden admin link or frontend route guard alone is not admin security.
- [x] The user-authorized Supabase project `xrrhbnnzjqkqnqdvayjw` is the external Auth/catalog backend; Manus Webdev-managed server/database features remain disabled. Use real provider results and database-enforced authorization. Checkout, COD and live order submission remain disabled; never simulate auth success or order creation.
- [x] Supabase Auth credentials and OTPs go only to Supabase Auth, with the client session kept in tab-scoped `sessionStorage`, not application `localStorage`. Demo checkout fields remain in memory and are never transmitted or persisted. Do not create fake signed-in sessions or demo Auth users.

## 9. English/Urdu translation and RTL
- [x] Add a functional English/Urdu language switcher with organized locale files or an equivalent maintainable translation system. Translate interface labels, buttons, navigation, forms, validation messages, empty states, toasts and footer content.
- [x] English uses LTR. Urdu uses correct RTL direction and right alignment where appropriate. Forms, navigation, icons, spacing and dropdowns remain usable in RTL. Use an appropriate Urdu-compatible Noto Nastaliq Urdu or Noto Sans Arabic font chosen for readable interface rendering. Persist only the selected locale across navigation and refresh.
- [x] The language toggle must translate the rest of the actual interface, not only the selector. Existing product catalogue text may remain clearly identified demo content, but all interface chrome and interactive states must be translated.

## 10. Footer, contacts, social and configured placeholders
- [x] Create a premium structured footer with brand logo/description, shop/category links, About, Contact, FAQ, Shipping, Returns and Privacy links, contact email/phone/WhatsApp/address only when genuine values are configured, social icons for Facebook/Instagram/TikTok/WhatsApp, newsletter UI, copyright and English/Urdu support.
- [x] Use only real configured social URLs and contact information. If missing, place clearly identifiable empty placeholders in one configuration file; do not invent details or link destinations. Render social icons visibly with suitable size and accessible labels, but never use a fabricated destination.

## 11. Preserve honest demo-store behavior and existing route functionality
- [x] Preserve all existing product/catalog/search/filter/sort/product-detail/gallery/cart/wishlist/FAQ/support/footer routes and interactions. Keep product/category data configurable and sample content marked demo-only. Preserve quantity guards, local persistence of non-sensitive cart/wishlist identifiers only, image fallbacks, empty/unavailable states, and the existing route manifest.
- [x] Checkout remains a demonstration; COD and real order creation are disabled. Do not transmit or persist checkout form details, contact vendors/couriers, invent availability or fulfillment, claim an order was placed, or add fake order IDs, business claims, shipping/refund terms, contact destinations, reviews or statistics. Account data users submit to the requested Supabase Auth/profile backend remains protected by its RLS policies.
- [x] The shop may keep its present stationery sample catalog, but store structure and editorial language must support future additional product categories without making stationery an architectural assumption.

## 12. Responsive design, accessibility and engineering quality
- [x] Deliver fully responsive desktop, tablet and mobile layouts with no horizontal overflow and comfortable touch targets. Provide accessible labels, semantic HTML, keyboard navigation, visible focus, meaningful image alt text, form validation/errors and loading/error/empty/success/provider-unavailable states. Respect reduced motion and avoid unnecessary dependencies.
- [x] Reuse existing project conventions/dependencies and preserve working features/components. Keep components modular; make reusable header, footer, hero slider, toast system, product cards, notifications, language switcher and auth forms; avoid duplicated logic and monolithic components.
- [x] Handle authentication credentials, OTPs and session tokens only through Supabase Auth; keep client tokens in tab-scoped `sessionStorage` and never application `localStorage`. Newsletter remains UI-only; demo checkout details remain in memory. Keep checkout disabled for real transactions until vendor, courier, order backend and settlement flow are verified.

## 13. Implementation and delivery
- [x] Add all new page routes and keep `public/manus-routes.json` synchronized. Preserve the Vite/React/TypeScript application and the current Vercel static-build configuration.
- [x] Update the project plan, implement in the existing codebase, run TypeScript and production build checks, and inspect the requested hero, authentication flows, language switching/RTL, notifications, cart/wishlist toasts, footer links and desktop/tablet/mobile behavior. Resolve console errors and broken imports.
- [x] Clearly report what is functional in the connected frontend, which Auth email-delivery and OAuth redirect settings remain environment-dependent, and what business contact/fulfillment details are still unverified. Save a checkpoint; do not publish without separate authorization.


## 14. Automatic hero carousel and moving-light treatment
- [x] Make the homepage hero carousel fully automatic and advance to the next slide every 4–5 seconds. Automatically start on page load, loop continuously from last to first and pause while hovered on desktop, then resume when the pointer leaves. Respect `prefers-reduced-motion` by disabling automatic transitions. Use smooth, premium fades or horizontal transitions; prevent layout shifts, flickering and blank slides, and preserve the current hero images and text unchanged. Do not introduce image-cropping changes.
- [x] Remove visible previous/next arrow buttons and all manual slider navigation buttons. Keep subtle indicator dots only if they already exist and fit the design; otherwise remove all slider controls. Preserve existing non-button keyboard and mobile-swipe gestures. Do not replace arrows with another visible manual-navigation control.
- [x] Add a subtle, elegant moving light reflection across the homepage hero text/heading and hero content area; product cards throughout the website; category cards, collection cards, featured-product sections and other existing card components. Buttons may receive the effect only where tasteful and where readability remains unaffected.
- [x] The reflection is a soft, translucent diagonal band with transparent edges, travelling left-to-right and disappearing, repeating approximately every 5–8 seconds. Use lightweight CSS gradients and pseudo-elements where appropriate; keep original text colors readable and preserve each element’s size, position, border radius and layout. The shine must traverse actual text and complete card surfaces without changing geometry.
- [x] Apply the effect through reusable CSS classes/shared components so future product/category cards can use it consistently. Avoid repeating the same shine through nested elements; do not shine every tiny icon or word. Avoid excessive glow, flashing, glitter, strong blur and distraction.
- [x] Prevent horizontal overflow. Shine layers must use `pointer-events: none` and not block clicks, links, hover interactions or controls. Preserve existing hover states, shadows, focus outlines and button behavior. Ensure the effect works on desktop/mobile, respect `prefers-reduced-motion: reduce`, and do not add an animation library; use lightweight CSS animation only.
- [x] Do not modify backend logic, authentication, cart, wishlist or database functionality for this request.

## 15. Supabase project connection and safe application configuration
- [x] Use the user-selected Supabase project `xrrhbnnzjqkqnqdvayjw` through the Supabase connector. Connect the existing Vite app with one Supabase client and browser-safe `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` variables. Add `.env.example` with placeholders and keep `.env.local`/real values out of Git. Never put a service-role key, OAuth client secret or other privileged credential in frontend code.
- [x] Keep the existing multi-category brand structure; do not hard-code the store as stationery. Do not rebuild the existing frontend or unnecessarily replace its responsive layout, design, typography, routes and interactions.

## 16. Version-controlled schema and live migration deployment
- [x] Create ordered SQL migration files under `supabase/migrations/` and apply them to the connected Supabase project. Include profiles and user roles; categories; products, images and variants; inventory and stock movements; saved addresses and wishlists; orders and order items; payment transactions; notifications; admin order notes and audit logs; necessary indexes, constraints, triggers, grants and functions. Verify the resulting database schema and migration history.
- [x] Do not seed invented products, categories, prices, inventory, customer addresses, user accounts, notifications, payment records or orders. The previously empty `public` schema must result in an honest empty live catalog, not a silent mock-data fallback.

## 17. Authentication, profiles and role assignment
- [x] Connect the existing authentication UI to Supabase Auth for email/password Login and Register, Forgot Password and Reset Password, email verification and OTP, Google Sign-in, session restoration and Logout. Use actual provider results; do not simulate account creation, sign-in, email delivery, verification, password change or OAuth success. Explain errors and missing Google/email provider configuration honestly.
- [x] Create a profile row for each newly authenticated user through a trusted Auth trigger. A new customer cannot self-assign an admin role; protected role records are managed only through a trusted project-owner path. Do not persist credentials, OTPs or Auth tokens in local storage.

## 18. Catalog reads, publication and stock availability
- [x] Implement Supabase-backed product and category reads for the existing storefront. Public visitors can read only published/active products, active categories and their public images/variants. Product records include names, slugs, descriptions, prices/currency, category, specifications, publication state and timestamps; products may have multiple images and optional variants.
- [x] Model publication separately from inventory/availability. Public availability must not reveal exact stock quantities. Admins can manage categories, products, images, variants and stock through authenticated admin-authorized access. A live query error is shown as an error; a successful empty response stays empty. Mock content is available only through an explicit demo-catalog setting.

## 19. Strict RLS and private customer records
- [x] Enable and enforce Row Level Security for every new application table. Public read is limited to published catalog information; unauthenticated clients cannot write catalog, customer, inventory, order, payment, notification or role records. Authenticated customers can read or change only their own profile, saved addresses, wishlist entries and notifications, subject to field-level protections where appropriate.
- [x] Administrators are identified by protected database roles and can manage only authorized operational records. Admin checks must be database-enforced; hiding routes or buttons is not authorization. Users cannot read another user's profile, address, wishlist, notification or order data or promote themselves to admin.

## 20. Order foundation without live checkout
- [x] Create order and order-item schemas that preserve customer/shipping snapshots, quantities, price-at-order and product/variant snapshots, totals, status and timestamps. Include payment method/status and payment transaction records without storing card data. Customer access is read-only and limited to their own orders; order creation and privileged state changes are not granted to ordinary browser clients.
- [x] Any prepared order-creation routine must be callable only by a trusted server/service role, validate current published items/prices/quantities, and perform stock deduction plus order/order-item writes atomically. The existing storefront checkout remains DEMO MODE: no COD, payment, order insert, delivery request or claim that an order was placed. Do not connect browser checkout to a real order routine.

## 21. Admin foundation and auditability
- [x] Support authenticated admin management of catalog and inventory, auditable stock adjustments, safe order-status management, notification records and a dashboard/reporting summary that exposes only intended data. Admin order notes and audit events are not visible to customers. Keep admin role bootstrap instructions restricted to a trusted project owner; do not provide a public self-service escalation path.

## 22. Product-image Storage security
- [x] Configure a product-image Storage bucket for public reads, with uploads, replacement and deletion restricted to authenticated admins. Keep the database image index and object path aligned. Do not expose private drafts, service keys or signed URLs in public content.

## 23. Frontend domain types and service integration
- [x] Update TypeScript types to match the migrated schema and adapt the current product service to asynchronous Supabase reads. Preserve the existing responsive storefront and working product detail, gallery, search/category browsing, local demo cart and wishlist, price display and empty/error/loading states. Use live rows and do not invent products when the database is empty.
- [x] Preserve local persistence only for non-sensitive cart/wishlist identifiers, quantities/variants and the existing locale preference. Customer data, credentials, OTPs, Auth tokens and order records must not be written to local storage.

## 24. Documentation, validation and delivery
- [x] Document environment setup, migrations, Auth email/Google provider requirements, RLS boundaries, admin bootstrap, Storage conventions and the deliberate demo-only checkout boundary. Keep real secrets out of Git; do not include secret values in `.env.example`.
- [x] Run configured TypeScript diagnostics, project typecheck and production build. Inspect migrations and app data/auth boundaries, verify Supabase tables/policies and advisor findings, and preserve the existing Vercel/static build configuration.
- [x] Save a canonical project checkpoint; do not publish unless separately requested.
