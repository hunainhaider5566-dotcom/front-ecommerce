-- Paperloom Marketplace Phase 1 prerequisite.
-- This is intentionally separate so the enum value commits before later objects reference it.
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'vendor';
