import { useEffect, useState, type ChangeEvent, type FormEvent } from 'react'
import { Camera, ShieldCheck, UserRound } from 'lucide-react'
import { UserAvatar } from '../common/UserAvatar'
import { useAuth } from '../../contexts/AuthContext'
import { useI18n } from '../../i18n/LocaleContext'
import { useToast } from '../../contexts/ToastContext'
import { saveMyProfile } from '../../services/account/profileService'
import { isValidPakistaniMobile } from '../../utils/contactValidation'

export function CustomerProfilePanel() {
  const { t } = useI18n()
  const { user, profile, avatarUrl, displayName, refreshProfile } = useAuth()
  const { push } = useToast()
  const [fullName, setFullName] = useState('')
  const [phone, setPhone] = useState('')
  const [photo, setPhoto] = useState<File | null>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  useEffect(() => { setFullName(profile?.full_name ?? displayName ?? ''); setPhone(profile?.phone ?? '') }, [profile?.full_name, profile?.phone, displayName])
  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview) }, [preview])
  function choosePhoto(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0] ?? null
    if (!file) return
    setPhoto(file)
    setPreview(URL.createObjectURL(file))
  }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!user) return
    if (phone.trim() && !isValidPakistaniMobile(phone)) { push(t('Enter exactly 03001234567 or +923001234567.'), 'error'); return }
    setSaving(true)
    try {
      await saveMyProfile({ fullName, phone, avatarFile: photo })
      await refreshProfile()
      setPhoto(null)
      setPreview(null)
      push(t('Your profile has been updated.'), 'success')
    } catch (cause) {
      push(cause instanceof Error ? cause.message : t('Your profile could not be updated.'), 'error')
    } finally { setSaving(false) }
  }
  return <section className="account-panel customer-profile-panel" aria-labelledby="customer-profile-title">
    <div className="account-panel__heading"><div><h2 id="customer-profile-title">{t('Personal profile')}</h2><p>{t('Update your name, phone number and profile photo.')}</p></div><span className="customer-profile-panel__privacy"><ShieldCheck size={15} /> {t('Private account')}</span></div>
    <form className="customer-profile-form" onSubmit={submit}>
      <div className="customer-profile-photo"><div className="customer-profile-photo__avatar">{preview || avatarUrl ? <UserAvatar avatarUrl={preview || avatarUrl} name={fullName || user?.email} size={54} /> : <UserRound size={34} />}</div>
        <div className="customer-profile-photo__copy"><strong>{t('Profile photo')}</strong><span>{t('JPG, PNG or WebP · up to 5 MB')}</span><label className="button button--outline customer-profile-photo__button"><Camera size={15} /> {t('Choose photo')}<input type="file" accept="image/jpeg,image/png,image/webp" onChange={choosePhoto} /></label></div>
      </div>
      <div className="form-grid">
        <div className="form-field"><label htmlFor="customer-profile-name">{t('Full name')} <span>*</span></label><input id="customer-profile-name" autoComplete="name" maxLength={120} value={fullName} onChange={event => setFullName(event.target.value)} required /></div>
        <div className="form-field"><label htmlFor="customer-profile-email">{t('Email address')}</label><input id="customer-profile-email" value={user?.email ?? ''} readOnly disabled /><p className="form-help">{t('Email changes are managed through account security.')}</p></div>
        <div className="form-field"><label htmlFor="customer-profile-phone">{t('Phone number')}</label><input id="customer-profile-phone" type="tel" autoComplete="tel" maxLength={13} pattern="(03[0-9]{9}|\+923[0-9]{9})" placeholder="03001234567 or +923001234567" value={phone} onChange={event => setPhone(event.target.value)} /></div>
      </div>
      <div className="customer-profile-form__footer"><p>{t('Your profile and personal details are visible only to your signed-in account.')}</p><button className="button button--dark" type="submit" disabled={saving}>{saving ? t('Saving…') : t('Save changes')}</button></div>
    </form>
  </section>
}
