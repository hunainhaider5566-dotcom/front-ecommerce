import { useEffect, useRef, useState, type ChangeEvent, type ClipboardEvent, type FormEvent, type KeyboardEvent, type ReactNode } from 'react'
import { AlertCircle, ArrowLeft, ArrowRight, CheckCircle2, Eye, EyeOff, Info, KeyRound, LockKeyhole, LogOut, Mail, ShieldCheck } from 'lucide-react'
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { useI18n } from '../i18n/LocaleContext'
import { authService } from '../services/auth/authService'
import { clearRememberedAccountSuspension, rememberAccountSuspension } from '../services/auth/accountAccessNotice'
import { LoadingState } from '../components/common/States'
type AuthStatus = 'ready' | 'loading' | 'success' | 'error'
type FieldErrors = Record<string, string>

const emailPattern = /^\S+@\S+\.\S+$/
const PENDING_SIGNUP_EMAIL_KEY = 'jtbazar_pending_signup_email'

function getPendingSignupEmail() {
  try { return window.sessionStorage.getItem(PENDING_SIGNUP_EMAIL_KEY) ?? '' }
  catch { return '' }
}

function clearPendingSignupEmail() {
  try { window.sessionStorage.removeItem(PENDING_SIGNUP_EMAIL_KEY) }
  catch { /* session storage may be unavailable */ }
}
const emptyCredentials = { email: '', password: '' }
const emptyRegistration = { name: '', email: '', password: '', confirmation: '', terms: false }

function describeError(error: unknown) {
  if (error instanceof Error) return error.message
  return 'The authentication request could not be completed. Please try again.'
}

function friendlyAuthError(error: unknown) {
  const message = describeError(error)
  if (/already registered|already exists|user_already_exists|email_exists/i.test(message)) {
    return 'An account with this email already exists. Please sign in instead or continue with Google.'
  }
  return message
}

function isSuspendedAccountError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false
  const authError = error as { code?: unknown; message?: unknown }
  return authError.code === 'user_banned' || (typeof authError.message === 'string' && /\b(user|account) (is|has been) (banned|suspended)\b/i.test(authError.message))
}

function throwIfAuthError<T extends { error: { message: string } | null }>(response: T) {
  if (response.error) throw response.error
  return response
}

function getSafeAuthRedirect(search: string, state: unknown) {
  const queryTarget = new URLSearchParams(search).get('redirect')
  const stateTarget = state && typeof state === 'object' && 'from' in state && typeof state.from === 'string' ? state.from : null
  const target = queryTarget || stateTarget
  return target && target.startsWith('/') && !target.startsWith('//') && !target.startsWith('/login') ? target : '/account'
}

function AuthStatusMessage({ status, message }: { status: AuthStatus; message: string }) {
  const { t } = useI18n()
  if (status === 'loading') return <p className="auth-status auth-status--loading" role="status" aria-live="polite"><Info size={17} aria-hidden="true" />{t('Connecting securely…')}</p>
  if (status === 'success') return <p className="auth-status auth-status--success" role="status" aria-live="polite"><CheckCircle2 size={17} aria-hidden="true" />{t(message)}</p>
  if (status === 'error') return <p className="auth-status auth-status--error" role="alert"><AlertCircle size={17} aria-hidden="true" />{t(message)}</p>
  return null
}

function GoogleIcon({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" className="google-icon">
      <path
        fill="#4285F4"
        d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.8-2.4 3.66v3.05h3.88c2.27-2.09 3.665-5.17 3.665-9.15Z"
      />
      <path
        fill="#34A853"
        d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.1-6.72-4.93H1.26v3.15C3.27 21.36 7.35 24 12 24Z"
      />
      <path
        fill="#FBBC05"
        d="M5.28 14.27c-.25-.72-.38-1.49-.38-2.27s.13-1.55.38-2.27V6.58H1.26C.46 8.16 0 9.94 0 12s.46 3.84 1.26 5.42l4.02-3.15Z"
      />
      <path
        fill="#EA4335"
        d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.35 0 3.27 2.64 1.26 6.58l4.02 3.15c.95-2.83 3.6-4.98 6.72-4.98Z"
      />
    </svg>
  )
}

function AuthLayout({ eyebrow, title, intro, children }: { eyebrow: string; title: string; intro: string; children: ReactNode }) {
  const { t } = useI18n()
  const { configured } = useAuth()
  return <section className="auth-page"><div className="auth-page__inner"><header className="auth-page__heading"><span className="auth-eyebrow">{t(eyebrow)}</span><h1>{t(title)}</h1><p>{t(intro)}</p></header>{!configured && <div className="auth-preview-notice" role="note"><Info size={18} aria-hidden="true" /><strong>{t('Account access is temporarily unavailable. Please try again later.')}</strong></div>}{children}</div></section>
}

function FieldError({ id, message }: { id: string; message?: string }) {
  const { t } = useI18n()
  return message ? <p className="auth-field__error" id={id} role="alert">{t(message)}</p> : null
}

function AuthField({ label, name, type = 'text', value, onChange, error, autoComplete, required = true, help, readOnly = false, children }: { label: string; name: string; type?: string; value: string; onChange?: (event: ChangeEvent<HTMLInputElement>) => void; error?: string; autoComplete?: string; required?: boolean; help?: string; readOnly?: boolean; children?: ReactNode }) {
  const { t } = useI18n()
  const errorId = `${name}-error`
  const helpId = `${name}-help`
  return <div className="auth-field"><label htmlFor={name}>{t(label)} <span className="auth-field__meta">{t(required ? 'Required' : 'Optional')}</span></label><div className="auth-field__control"><input id={name} name={name} type={type} value={value} onChange={onChange} readOnly={readOnly} autoComplete={autoComplete} required={required} aria-invalid={Boolean(error)} aria-describedby={error ? errorId : help ? helpId : undefined} />{children}</div>{help && !error ? <p className="auth-field__help" id={helpId}>{t(help)}</p> : null}<FieldError id={errorId} message={error} /></div>
}

function PasswordField({ name, label, value, onChange, error, autoComplete }: { name: string; label: string; value: string; onChange: (event: ChangeEvent<HTMLInputElement>) => void; error?: string; autoComplete?: string }) {
  const { t } = useI18n()
  const [visible, setVisible] = useState(false)
  return <AuthField label={label} name={name} type={visible ? 'text' : 'password'} value={value} onChange={onChange} error={error} autoComplete={autoComplete}><button type="button" className="auth-password-toggle" onClick={() => setVisible((current) => !current)} aria-label={t(visible ? 'Hide password' : 'Show password')}><span aria-hidden="true">{visible ? <EyeOff size={16} /> : <Eye size={16} />}</span><span>{t(visible ? 'Hide' : 'Show')}</span></button></AuthField>
}

function ProviderButton({ onClick, disabled }: { onClick: () => void; disabled: boolean }) {
  const { t } = useI18n()
  return <button className="auth-provider-button" type="button" onClick={onClick} disabled={disabled}><span className="auth-provider-button__mark" aria-hidden="true"><GoogleIcon size={19} /></span><span>{t('Continue with Google')}</span></button>
}

function Divider() {
  const { t } = useI18n()
  return <div className="auth-divider" role="separator"><span>{t('or')}</span></div>
}

function AuthLinks({ mode }: { mode: 'login' | 'register' }) {
  const { t } = useI18n()
  return <div className="auth-links">{mode === 'login' ? <><span>{t('No account?')}</span><Link to="/register" className="auth-link">{t('Register instead')}<ArrowRight size={15} aria-hidden="true" /></Link></> : <><span>{t('Already have an account?')}</span><Link to="/login" className="auth-link">{t('Sign in instead')}<ArrowRight size={15} aria-hidden="true" /></Link></>}</div>
}

export function LoginPage() {
  const { t } = useI18n()
  const { user, loading: authLoading } = useAuth()
  const location = useLocation()
  const navigate = useNavigate()
  const redirectTarget = getSafeAuthRedirect(location.search, location.state)
  const [form, setForm] = useState(emptyCredentials)
  const [errors, setErrors] = useState<FieldErrors>({})
  const [status, setStatus] = useState<AuthStatus>('ready')
  const [message, setMessage] = useState('')
  const update = (event: ChangeEvent<HTMLInputElement>) => { const { name, value } = event.target; setForm((current) => ({ ...current, [name]: value })); setErrors((current) => ({ ...current, [name]: '' })) }
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const next: FieldErrors = {}
    if (!form.email.trim()) next.email = 'Email is required.'
    else if (!emailPattern.test(form.email)) next.email = 'Enter a valid email address.'
    if (!form.password) next.password = 'Password is required.'
    setErrors(next)
    if (Object.keys(next).length) return
    clearRememberedAccountSuspension()
    setStatus('loading'); setMessage('')
    try {
      const response = throwIfAuthError(await authService.signInWithPassword(form.email.trim(), form.password))
      if (!response.data.session) {
        setStatus('success'); setMessage('Email verification may be required. Check your inbox or request another verification email.')
        return
      }
      clearRememberedAccountSuspension()
      navigate(redirectTarget, { replace: true })
    } catch (error) {
      const suspended = isSuspendedAccountError(error)
      if (suspended) {
        rememberAccountSuspension()
        navigate('/account?access=suspended', { replace: true })
        return
      }
      setStatus('error'); setMessage(describeError(error))
    }
  }
  const google = async () => {
    clearRememberedAccountSuspension()
    setStatus('loading'); setMessage('')
    try { throwIfAuthError(await authService.signInWithGoogle(redirectTarget)); clearRememberedAccountSuspension(); setStatus('success'); setMessage('Redirecting to Google sign-in…') }
    catch (error) { const suspended = isSuspendedAccountError(error); if (suspended) { rememberAccountSuspension(); navigate('/account?access=suspended', { replace: true }); return } setStatus('error'); setMessage(describeError(error)) }
  }
  if (authLoading) return <LoadingState label="Checking your account…" />
  if (user) return <Navigate to={redirectTarget} replace />
  return <AuthLayout eyebrow="Authentication" title="Sign in to your account" intro="Sign in securely to manage your orders, wishlist, and account preferences."><form className="auth-form" onSubmit={submit} noValidate aria-busy={status === 'loading'}><AuthStatusMessage status={status} message={message} /><ProviderButton onClick={google} disabled={status === 'loading'} /><Divider /><AuthField label="Email" name="email" type="email" value={form.email} onChange={update} error={errors.email} autoComplete="email" /><PasswordField label="Password" name="password" value={form.password} onChange={update} error={errors.password} autoComplete="current-password" /><button className="auth-submit" type="submit" disabled={status === 'loading'}>{status === 'loading' ? t('Signing in…') : t('Log in')}<ArrowRight size={16} aria-hidden="true" /></button><Link className="auth-link auth-form__forgot" to="/forgot-password">{t('Forgot password?')}</Link><Link className="auth-link auth-form__forgot" to="/verify-email">{t('Resend verification email')}</Link></form><AuthLinks mode="login" /></AuthLayout>
}

export function RegisterPage() {
  const { t } = useI18n()
  const navigate = useNavigate()
  const [form, setForm] = useState(emptyRegistration)
  const [errors, setErrors] = useState<FieldErrors>({})
  const [status, setStatus] = useState<AuthStatus>('ready')
  const [message, setMessage] = useState('')
  const update = (event: ChangeEvent<HTMLInputElement>) => { const { name, value } = event.target; setForm((current) => ({ ...current, [name]: value })); setErrors((current) => ({ ...current, [name]: '' })) }
  const google = async () => {
    setStatus('loading'); setMessage('')
    try { throwIfAuthError(await authService.signInWithGoogle()); setStatus('success'); setMessage('Redirecting to Google sign-in…') }
    catch (error) { setStatus('error'); setMessage(friendlyAuthError(error)) }
  }
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const next: FieldErrors = {}
    if (!form.name.trim()) next.name = 'Full name is required.'
    if (!form.email.trim()) next.email = 'Email is required.'
    else if (!emailPattern.test(form.email)) next.email = 'Enter a valid email address.'
    if (!form.password) next.password = 'Password is required.'
    else if (form.password.length < 8) next.password = 'Password must be at least 8 characters.'
    if (!form.confirmation) next.confirmation = 'Password confirmation is required.'
    else if (form.password !== form.confirmation) next.confirmation = 'Passwords do not match.'
    if (!form.terms) next.terms = 'Please accept the terms to create an account.'
    setErrors(next)
    if (Object.keys(next).length) return
    setStatus('loading'); setMessage('')
    try {
      const response = throwIfAuthError(await authService.signUp(form.email.trim(), form.password, form.name.trim()))
      if (response.data.user?.identities?.length === 0) {
        setStatus('error')
        setMessage('An account with this email already exists. Please sign in instead or continue with Google.')
        return
      }
      if (response.data.session) {
        clearPendingSignupEmail()
        navigate('/account')
      } else {
        try { window.sessionStorage.setItem(PENDING_SIGNUP_EMAIL_KEY, form.email.trim()) } catch { /* route state remains available */ }
        navigate('/verify-email', { state: { email: form.email.trim() } })
      }
    } catch (error) {
      setStatus('error'); setMessage(friendlyAuthError(error))
    }
  }
  return <AuthLayout eyebrow="Authentication" title="Create your account" intro="Create your Paperloom account to save your favorites and enjoy seamless shopping."><form className="auth-form" onSubmit={submit} noValidate aria-busy={status === 'loading'}><AuthStatusMessage status={status} message={message} /><ProviderButton onClick={google} disabled={status === 'loading'} /><Divider /><AuthField label="Full name" name="name" value={form.name} onChange={update} error={errors.name} autoComplete="name" /><AuthField label="Email" name="email" type="email" value={form.email} onChange={update} error={errors.email} autoComplete="email" /><PasswordField label="Password" name="password" value={form.password} onChange={update} error={errors.password} autoComplete="new-password" /><PasswordField label="Confirm password" name="confirmation" value={form.confirmation} onChange={update} error={errors.confirmation} autoComplete="new-password" /><div className="auth-terms"><label className="auth-checkbox auth-checkbox--terms"><input type="checkbox" name="terms" checked={form.terms} onChange={(event) => { setForm((current) => ({ ...current, terms: event.target.checked })); setErrors((current) => ({ ...current, terms: '' })) }} aria-invalid={Boolean(errors.terms)} aria-describedby={errors.terms ? 'terms-error' : undefined} /> <span>{t('I agree to the terms')}</span></label><Link className="auth-link auth-terms-link" to="/privacy">{t('Read privacy notes')}</Link></div><FieldError id="terms-error" message={errors.terms} /><button className="auth-submit" type="submit" disabled={status === 'loading'}>{status === 'loading' ? t('Creating account…') : t('Create account')}<ArrowRight size={16} aria-hidden="true" /></button></form><AuthLinks mode="register" /></AuthLayout>
}

export function ForgotPasswordPage() {
  const { t } = useI18n()
  const [email, setEmail] = useState('')
  const [error, setError] = useState('')
  const [status, setStatus] = useState<AuthStatus>('ready')
  const [message, setMessage] = useState('')
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!email.trim()) { setError('Email is required.'); return }
    if (!emailPattern.test(email)) { setError('Enter a valid email address.'); return }
    setError(''); setStatus('loading'); setMessage('')
    try {
      throwIfAuthError(await authService.sendPasswordRecovery(email.trim()))
      setStatus('success'); setMessage('If an eligible account uses that email, a password recovery link has been sent.')
    } catch (cause) { setStatus('error'); setMessage(describeError(cause)) }
  }
  return <AuthLayout eyebrow="Password recovery" title="Forgot your password?" intro="Request a secure recovery link to reset your account password."><form className="auth-form" onSubmit={submit} noValidate aria-busy={status === 'loading'}><AuthStatusMessage status={status} message={message} /><AuthField label="Email address" name="recovery-email" type="email" value={email} onChange={(event) => { setEmail(event.target.value); setError('') }} error={error} autoComplete="email" help="A recovery link will be sent if the email is associated with an account." /><button className="auth-submit" type="submit" disabled={status === 'loading'}>{status === 'loading' ? t('Requesting recovery…') : t('Send recovery link')}<Mail size={16} aria-hidden="true" /></button><Link className="auth-link auth-form__back" to="/login"><ArrowLeft size={15} aria-hidden="true" />{t('Back to sign in')}</Link></form></AuthLayout>
}

export function VerifyEmailPage() {
  const { t } = useI18n()
  const location = useLocation()
  const { user, loading: authLoading } = useAuth()
  const navigate = useNavigate()
  const stateEmail = (location.state as { email?: string } | null)?.email ?? ''
  const email = stateEmail || getPendingSignupEmail() || user?.email || ''
  const [error, setError] = useState('')
  const [status, setStatus] = useState<AuthStatus>('ready')
  const [message, setMessage] = useState('')
  const [checkingVerification, setCheckingVerification] = useState(true)
  const [resendCooldown, setResendCooldown] = useState(0)

  useEffect(() => {
    if (resendCooldown <= 0) return
    const timer = window.setTimeout(() => setResendCooldown((value) => Math.max(0, value - 1)), 1000)
    return () => window.clearTimeout(timer)
  }, [resendCooldown])

  useEffect(() => {
    let active = true
    if (authLoading) return () => { active = false }
    if (!user) { setCheckingVerification(false); return () => { active = false } }
    setCheckingVerification(true)
    void authService.getCurrentUser().then(({ data, error: userError }) => {
      if (!active) return
      if (userError) {
        setStatus('error')
        setMessage('We could not confirm your email status. Please sign in again and retry.')
        setCheckingVerification(false)
        return
      }
      if (data.user?.email_confirmed_at) {
        navigate('/account', { replace: true })
        return
      }
      setCheckingVerification(false)
    }).catch(() => {
      if (!active) return
      setStatus('error')
      setMessage('We could not confirm your email status. Please sign in again and retry.')
      setCheckingVerification(false)
    })
    return () => { active = false }
  }, [authLoading, user?.id, navigate])
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (resendCooldown > 0) return
    if (!email.trim()) { setError('Your registered email address could not be found. Please return to registration and try again.'); return }
    if (!emailPattern.test(email)) { setError('The registered email address is invalid. Please return to registration and try again.'); return }
    setError(''); setStatus('loading'); setMessage('')
    try {
      throwIfAuthError(await authService.resendSignupVerification(email.trim()))
      setResendCooldown(60)
      setStatus('success'); setMessage('A new verification email has been requested. If it does not arrive, wait 60 seconds and try again.')
    } catch (cause) { setStatus('error'); setMessage(describeError(cause)) }
  }
  const requestOtp = async () => {
    if (status === 'loading') return
    if (!emailPattern.test(email)) { setError('Your registered email address could not be found. Please return to registration and try again.'); return }
    if (resendCooldown > 0) {
      navigate('/verify-otp', { state: { email } })
      return
    }
    setStatus('loading'); setMessage('')
    try {
      throwIfAuthError(await authService.resendSignupVerification(email.trim()))
      setResendCooldown(60)
      navigate('/verify-otp', { state: { email } })
    } catch (cause) {
      setStatus('error')
      const detail = describeError(cause)
      setMessage(/rate limit|too many requests|after \d+ seconds/i.test(detail)
        ? 'A verification code was recently requested. Please check your inbox and wait before trying again.'
        : detail)
    }
  }
  if (authLoading || checkingVerification) return <section className="account-page"><div className="account-page__inner"><h1>{t('Checking email verification')}</h1><p role="status">{t('Please wait while we securely check your account status…')}</p></div></section>
  return <AuthLayout eyebrow="Verification email" title="Verify your email address" intro="Resend a verification email or enter your six-digit code to verify your account."><form className="auth-form" onSubmit={submit} noValidate aria-busy={status === 'loading'}><AuthStatusMessage status={status} message={message} /><div className="auth-explainer"><Mail size={20} aria-hidden="true" /><div><h2>{t('Check your inbox')}</h2><p>{t('Please check your spam or junk folder if you do not see the email in your inbox.')}</p></div></div><AuthField label="Email" name="verification-email" type="email" value={email} readOnly error={error} autoComplete="email" /><button className="auth-submit" type="submit" disabled={status === 'loading' || resendCooldown > 0}>{status === 'loading' ? t('Requesting verification…') : resendCooldown > 0 ? t(`Resend available in ${resendCooldown}s`) : t('Resend verification email')}<Mail size={16} aria-hidden="true" /></button><Link className="auth-link auth-form__back" to="/login"><ArrowLeft size={15} aria-hidden="true" />{t('Back to sign in')}</Link></form><div className="auth-secondary-action"><Link className="auth-link" to="/verify-otp" state={{ email }} onClick={(event) => { event.preventDefault(); void requestOtp() }} aria-disabled={status === 'loading'}>{t('Enter a verification code')}<ArrowRight size={15} aria-hidden="true" /></Link></div></AuthLayout>
}

function OtpInputs({ code, setCode, error }: { code: string[]; setCode: (code: string[]) => void; error?: string }) {
  const { t } = useI18n()
  const refs = useRef<Array<HTMLInputElement | null>>([])
  const moveFocus = (index: number) => refs.current[Math.min(Math.max(index, 0), 5)]?.focus()
  const updateDigit = (index: number, value: string) => { const digits = value.replace(/\D/g, '').slice(-1); const next = [...code]; next[index] = digits; setCode(next); if (digits) moveFocus(index + 1) }
  const onPaste = (event: ClipboardEvent<HTMLInputElement>) => { event.preventDefault(); const digits = event.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6); if (!digits) return; const next = [...code]; digits.split('').forEach((digit, offset) => { next[offset] = digit }); setCode(next); moveFocus(digits.length - 1) }
  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>, index: number) => { if (event.key === 'Backspace' && !code[index] && index > 0) { const next = [...code]; next[index - 1] = ''; setCode(next); moveFocus(index - 1) } if (event.key === 'ArrowLeft' && index > 0) moveFocus(index - 1); if (event.key === 'ArrowRight' && index < 5) moveFocus(index + 1) }
  const errorId = 'otp-error'
  return <fieldset className="auth-otp" aria-describedby={error ? errorId : 'otp-help'}><legend>{t('Verification code')}</legend><div className="auth-otp__inputs">{code.map((digit, index) => <input key={index} ref={(element) => { refs.current[index] = element }} className="auth-otp__input" aria-label={`${t('Code')} ${index + 1} ${t('of')} 6`} type="text" inputMode="numeric" pattern="[0-9]*" maxLength={1} autoComplete={index === 0 ? 'one-time-code' : 'off'} autoFocus={index === 0} value={digit} onChange={(event) => updateDigit(index, event.target.value)} onPaste={onPaste} onKeyDown={(event) => onKeyDown(event, index)} aria-invalid={Boolean(error)} />)}</div><p className="auth-field__help" id="otp-help">{t('Enter the six-digit code sent to your email.')}</p><FieldError id={errorId} message={error} /></fieldset>
}

export function VerifyOtpPage() {
  const { t } = useI18n()
  const location = useLocation()
  const navigate = useNavigate()
  const { user, loading: authLoading } = useAuth()
  const stateEmail = (location.state as { email?: string } | null)?.email ?? ''
  const email = stateEmail || getPendingSignupEmail() || user?.email || ''

  useEffect(() => {
    let active = true
    if (authLoading) return () => { active = false }
    if (!email) { navigate('/register', { replace: true }); return () => { active = false } }
    if (!user) return () => { active = false }
    void authService.getCurrentUser().then(({ data, error }) => {
      if (active && !error && data.user?.email_confirmed_at) navigate('/account', { replace: true })
    }).catch(() => undefined)
    return () => { active = false }
  }, [authLoading, user?.id, email, navigate])
  const [code, setCode] = useState(['', '', '', '', '', ''])
  const [error, setError] = useState('')
  const [status, setStatus] = useState<AuthStatus>('ready')
  const [message, setMessage] = useState('')
  const [resendCooldown, setResendCooldown] = useState(0)
  useEffect(() => {
    if (resendCooldown <= 0) return
    const timer = window.setTimeout(() => setResendCooldown((value) => Math.max(0, value - 1)), 1000)
    return () => window.clearTimeout(timer)
  }, [resendCooldown])
  const resendCode = async () => {
    if (!emailPattern.test(email) || resendCooldown > 0 || status === 'loading') return
    setStatus('loading'); setMessage('')
    try {
      throwIfAuthError(await authService.resendSignupVerification(email.trim()))
      setResendCooldown(60)
      setStatus('success')
      setMessage('A new verification code email has been requested. Check your inbox and spam folder.')
    } catch (cause) {
      setStatus('error')
      const detail = describeError(cause)
      setMessage(/rate limit|too many requests|after \d+ seconds/i.test(detail)
        ? 'Email provider cooldown is active. Please wait a minute before requesting another code.'
        : detail)
    }
  }
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const value = code.join('')
    if (!emailPattern.test(email)) { setError('Enter a valid email address.'); return }
    if (value.length !== 6) { setError('Enter a six-digit code.'); return }
    setError(''); setStatus('loading'); setMessage('')
    try {
      throwIfAuthError(await authService.verifySignupOtp(email.trim(), value))
      clearPendingSignupEmail()
      navigate('/account')
    } catch (cause) { setStatus('error'); setMessage(describeError(cause)); setCode(['', '', '', '', '', '']) }
  }
  return <AuthLayout eyebrow="Verification email" title="Verify your email" intro="Verify your email address using the one-time code sent to your inbox."><form className="auth-form" onSubmit={submit} noValidate aria-busy={status === 'loading'}><AuthStatusMessage status={status} message={message} /><AuthField label="Email" name="otp-email" type="email" value={email} readOnly error={error && !emailPattern.test(email) ? error : undefined} autoComplete="email" /><OtpInputs code={code} setCode={(next) => { setCode(next); setError('') }} error={error && emailPattern.test(email) ? error : undefined} /><button className="auth-submit" type="submit" disabled={status === 'loading'}>{status === 'loading' ? t('Verifying…') : t('Verify code')}<ShieldCheck size={16} aria-hidden="true" /></button><button className="auth-provider-button" type="button" onClick={resendCode} disabled={status === 'loading' || resendCooldown > 0 || !emailPattern.test(email)}>{resendCooldown > 0 ? t(`Resend available in ${resendCooldown}s`) : t('Resend OTP code')}<Mail size={16} aria-hidden="true" /></button><Link className="auth-link auth-form__back" to="/verify-email" state={{ email }}><ArrowLeft size={15} aria-hidden="true" />{t('Back to verification email')}</Link></form></AuthLayout>
}

export function ResetPasswordPage() {
  const { t } = useI18n()
  const { user, loading } = useAuth()
  const [form, setForm] = useState({ password: '', confirmation: '' })
  const [errors, setErrors] = useState<FieldErrors>({})
  const [status, setStatus] = useState<AuthStatus>('ready')
  const [message, setMessage] = useState('')
  const update = (event: ChangeEvent<HTMLInputElement>) => { const { name, value } = event.target; setForm((current) => ({ ...current, [name]: value })); setErrors((current) => ({ ...current, [name]: '' })) }
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const next: FieldErrors = {}
    if (!form.password) next.password = 'New password is required.'
    else if (form.password.length < 8) next.password = 'Password must be at least 8 characters.'
    if (!form.confirmation) next.confirmation = 'Password confirmation is required.'
    else if (form.password !== form.confirmation) next.confirmation = 'Passwords do not match.'
    setErrors(next)
    if (Object.keys(next).length) return
    if (!user) { setStatus('error'); setMessage('Open the password reset link sent to your email before submitting a new password.'); return }
    setStatus('loading'); setMessage('')
    try { throwIfAuthError(await authService.updatePassword(form.password)); setStatus('success'); setMessage('Your password was updated successfully.'); setForm({ password: '', confirmation: '' }) }
    catch (cause) { setStatus('error'); setMessage(describeError(cause)) }
  }
  return <AuthLayout eyebrow="Password reset" title="Reset your password" intro="Set a new secure password for your account."><form className="auth-form" onSubmit={submit} noValidate aria-busy={status === 'loading'}><AuthStatusMessage status={status} message={message} /><div className="auth-explainer"><LockKeyhole size={20} aria-hidden="true" /><div><h2>{t('Secure password update')}</h2><p>{t(loading ? 'Verifying the recovery session…' : user ? 'Recovery session is active.' : 'No active recovery session found.')}</p></div></div><PasswordField label="New password" name="password" value={form.password} onChange={update} error={errors.password} autoComplete="new-password" /><PasswordField label="Confirm password" name="confirmation" value={form.confirmation} onChange={update} error={errors.confirmation} autoComplete="new-password" /><button className="auth-submit" type="submit" disabled={status === 'loading' || loading || !user}>{status === 'loading' ? t('Updating password…') : t('Reset password')}<KeyRound size={16} aria-hidden="true" /></button><Link className="auth-link auth-form__back" to="/forgot-password"><ArrowLeft size={15} aria-hidden="true" />{t('Request another recovery link')}</Link></form></AuthLayout>
}

export function AuthCallbackPage() {
  const { t } = useI18n()
  const location = useLocation()
  const navigate = useNavigate()
  const [status, setStatus] = useState<AuthStatus>('loading')
  const [message, setMessage] = useState('Completing your secure sign-in…')
  const completionRef = useRef<Promise<string> | null>(null)

  useEffect(() => {
    let active = true
    if (!completionRef.current) {
      completionRef.current = (async () => {
        const params = new URLSearchParams(location.search)
        const providerError = params.get('error_description') || params.get('error')
        if (providerError) throw new Error(providerError.replace(/\+/g, ' '))

        const code = params.get('code')
        if (!code) throw new Error('This verification link is invalid or has expired. Please request a new link.')

        const response = throwIfAuthError(await authService.exchangeCodeForSession(code))
        if (!response.data.session) throw new Error('Your account session could not be created. Please sign in again.')
        return getSafeAuthRedirect('', { from: params.get('next') })
      })()
    }

    completionRef.current.then((next) => {
      if (active) navigate(next, { replace: true })
    }).catch((cause: unknown) => {
      if (!active) return
      setStatus('error')
      setMessage(friendlyAuthError(cause))
    })

    return () => { active = false }
  }, [location.search, navigate])

  return <AuthLayout eyebrow="Account security" title="Finishing verification" intro="Please wait while we securely confirm your account.">
    <div className="auth-form" aria-busy={status === 'loading'}>
      <AuthStatusMessage status={status} message={message} />
      {status === 'error' && <div className="auth-callback-actions">
        <Link className="auth-submit" to="/verify-email">{t('Request a new verification email')}<Mail size={16} aria-hidden="true" /></Link>
        <Link className="auth-link" to="/login">{t('Back to sign in')}<ArrowRight size={15} aria-hidden="true" /></Link>
      </div>}
    </div>
  </AuthLayout>
}

export function LogoutPage() {
  const { t } = useI18n()
  const navigate = useNavigate()
  const { user, signOut } = useAuth()
  const [status, setStatus] = useState<AuthStatus>('ready')
  const [message, setMessage] = useState('')
  const logout = async () => {
    setStatus('loading'); setMessage('')
    try { await signOut(); setStatus('success'); setMessage('You have been signed out successfully.') }
    catch (cause) { setStatus('error'); setMessage(describeError(cause)) }
  }
  return <section className="account-page account-page--logged-out"><div className="account-page__inner"><div className="account-page__icon" aria-hidden="true"><LogOut size={28} /></div><span className="auth-eyebrow">{t('Account session')}</span><h1>{t(user ? 'Sign out of this account?' : 'You are signed out.')}</h1><p>{t(user ? 'Sign out of your account on this device.' : 'You are currently signed out.')}</p><AuthStatusMessage status={status} message={message} /><div className="account-page__actions">{user ? <button className="account-page__primary" type="button" disabled={status === 'loading'} onClick={logout}>{t(status === 'loading' ? 'Signing out…' : 'Sign out')}<LogOut size={16} aria-hidden="true" /></button> : <Link className="account-page__primary" to="/login">{t('Sign in')}<ArrowRight size={16} aria-hidden="true" /></Link>}<button className="account-page__secondary" type="button" onClick={() => navigate('/')}>{t('Continue shopping')}</button></div></div></section>
}
