import { getSupabase } from '../../lib/supabase'

function redirect(path: string) {
  return new URL(path, window.location.origin).toString()
}

function callbackRedirect(nextPath: string) {
  return redirect(`/auth/callback?next=${encodeURIComponent(nextPath)}`)
}

export const authService = {
  signInWithPassword(email: string, password: string) {
    return getSupabase().auth.signInWithPassword({ email, password })
  },

  signUp(email: string, password: string, fullName: string) {
    return getSupabase().auth.signUp({
      email,
      password,
      options: {
        data: { full_name: fullName },
        emailRedirectTo: callbackRedirect('/account?verified=1'),
      },
    })
  },

  resendSignupVerification(email: string) {
    return getSupabase().auth.resend({ type: 'signup', email, options: { emailRedirectTo: callbackRedirect('/account?verified=1') } })
  },

  verifySignupOtp(email: string, token: string) {
    return getSupabase().auth.verifyOtp({ email, token, type: 'signup' })
  },

  exchangeCodeForSession(code: string) {
    return getSupabase().auth.exchangeCodeForSession(code)
  },

  sendPasswordRecovery(email: string) {
    return getSupabase().auth.resetPasswordForEmail(email, { redirectTo: callbackRedirect('/reset-password') })
  },

  updatePassword(password: string) {
    return getSupabase().auth.updateUser({ password })
  },

  signInWithGoogle(redirectPath = '/account') {
    return getSupabase().auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: callbackRedirect(redirectPath) },
    })
  },

  getOwnProfile() {
    return getSupabase().from('profiles').select('id, full_name, phone, avatar_url, created_at, updated_at').maybeSingle()
  },

  isCurrentUserAdmin() {
    return getSupabase().rpc('current_user_is_admin')
  },

  signOut() {
    return getSupabase().auth.signOut()
  },
}
