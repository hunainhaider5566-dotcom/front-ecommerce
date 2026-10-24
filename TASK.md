# Meridion Marketplace — Storefront Task Record

## Scope and status

Status: **In progress — Rebranded to Meridion Marketplace**. This repository is the buyer-facing Meridion Marketplace storefront. Vendor routes and seller management tools are built directly into this app. The storefront uses React + TypeScript + Vite + React Router + Supabase JS connected to the shared Supabase project `paperloom-store` (`xrrhbnnzjqkqnqdvayjw`).

The feature branch is `feature/marketplace-transformation`.

## Architecture & Rebranding

- `src/app/App.tsx`: route composition and storefront shell.
- `src/main.tsx`: Vite entry point.
- `src/contexts/AuthContext.tsx`: Supabase session, profile, and user role resolution.
- `src/contexts/CatalogContext.tsx`, `src/services/products/`: catalog loading.
- `src/contexts/CartContext.tsx`, `src/contexts/WishlistContext.tsx`: buyer state with `meridion-` storage keys.
- Branding updated across titles, metadata, headers, footers, auth, info, and vendor application flows.
