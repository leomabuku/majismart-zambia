-- ==============================================================================
-- MAJISMART ZAMBIA: Google sign-in identity columns
--
-- The shared API issues its own JWTs. Google Identity Services only proves who
-- the human is; that proof is exchanged at POST /api/auth/google for a MajiSmart
-- token, so profiles remains the single source of truth for roles.
--
-- google_sub      Google's stable subject id ("sub"). Unique per Google account,
--                 never an email, because users can change their address.
-- avatar_url      Profile photo from Google, refreshed on each Google sign-in.
-- auth_provider   How the account was created: 'password', 'google'.
--
-- Existing seeded accounts keep working with email + password; the columns are
-- nullable so old rows are untouched.
-- ==============================================================================

ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS google_sub TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS avatar_url TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS auth_provider TEXT NOT NULL DEFAULT 'password';

-- One Google identity maps to at most one profile.
CREATE UNIQUE INDEX IF NOT EXISTS idx_profiles_google_sub
  ON public.profiles(google_sub)
  WHERE google_sub IS NOT NULL;

COMMENT ON COLUMN public.profiles.google_sub IS 'Google OAuth subject (sub claim). NULL for password-only accounts.';
COMMENT ON COLUMN public.profiles.auth_provider IS 'password | google - how the profile was first created.';
