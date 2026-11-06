import type { User } from '@supabase/supabase-js'
import { createEphemeralSupabase, getSupabase } from '../../lib/supabase'

export const OTP_LENGTH = 6

function redirect(path: string) {
  return new URL(path, window.location.origin).toString()
}

function callbackRedirect(nextPath: string, provider?: 'google') {
  const query = new URLSearchParams({ next: nextPath })
  if (provider) query.set('provider', provider)
  return redirect(`/auth/callback?${query.toString()}`)
}

export async function verifyPassword(email: string, password: string) {
  const ephemeral = createEphemeralSupabase()
  const { error } = await ephemeral.auth.signInWithPassword({ email, password })
  await ephemeral.auth.signOut({ scope: 'local' })
  return { error }
}

export function sendLoginOtp(email: string) {
  return getSupabase().auth.signInWithOtp({
    email,
    options: { shouldCreateUser: false },
  })
}

export function verifyLoginOtp(email: string, token: string) {
  return getSupabase().auth.verifyOtp({ email, token, type: 'email' })
}

export function verifySignupOtp(email: string, token: string) {
  return getSupabase().auth.verifyOtp({ email, token, type: 'signup' })
}

export function isGoogleBlockedForUser(user: User): boolean {
  const identities = (user.identities ?? []) as Array<{
    provider?: string
    created_at?: string | null
  }>
  const emailIdentity = identities.find((identity) => identity.provider === 'email')
  const googleIdentity = identities.find((identity) => identity.provider === 'google')
  if (!emailIdentity || !googleIdentity) return false
  if (!emailIdentity.created_at || !googleIdentity.created_at) return true
  return new Date(emailIdentity.created_at).getTime() <= new Date(googleIdentity.created_at).getTime()
}

export const authService = {
  signInWithPassword(email: string, password: string) {
    return verifyPassword(email, password)
  },

  signUp(email: string, password: string, fullName: string) {
    return getSupabase().auth.signUp({
      email,
      password,
      options: {
        data: { full_name: fullName },
        emailRedirectTo: callbackRedirect('/account'),
      },
    })
  },

  resendSignupConfirmation(email: string) {
    return getSupabase().auth.resend({ type: 'signup', email, options: { emailRedirectTo: callbackRedirect('/account') } })
  },

  exchangeCodeForSession(code: string) {
    return getSupabase().auth.exchangeCodeForSession(code)
  },

  getCurrentUser() {
    return getSupabase().auth.getUser()
  },

  sendLoginOtp,
  verifyLoginOtp,
  verifySignupOtp,

  sendPasswordRecovery(email: string) {
    return getSupabase().auth.resetPasswordForEmail(email, { redirectTo: callbackRedirect('/reset-password') })
  },

  updatePassword(password: string) {
    return getSupabase().auth.updateUser({ password })
  },

  signInWithGoogle(redirectPath = '/account') {
    return getSupabase().auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: callbackRedirect(redirectPath, 'google') },
    })
  },

  isGoogleBlockedForUser,

  getOwnProfile() {
    return getSupabase().from('profiles').select('id, full_name, phone, avatar_url, created_at, updated_at').maybeSingle()
  },

  isCurrentUserAdmin() {
    return getSupabase().rpc('current_user_is_admin')
  },

  signOut() {
    return getSupabase().auth.signOut()
  },

  signOutLocal() {
    return getSupabase().auth.signOut({ scope: 'local' })
  },
}
