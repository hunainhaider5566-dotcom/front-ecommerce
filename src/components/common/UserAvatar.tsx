import { useState } from 'react'
import { UserRound } from 'lucide-react'

interface UserAvatarProps {
  avatarUrl?: string | null
  name?: string | null
  size?: number
  className?: string
}

export function UserAvatar({ avatarUrl, name, size = 19, className = '' }: UserAvatarProps) {
  const [hasError, setHasError] = useState(false)

  if (avatarUrl && !hasError) {
    return (
      <img
        src={avatarUrl}
        alt={name || 'User avatar'}
        className={`user-avatar-img ${className}`}
        referrerPolicy="no-referrer"
        onError={() => setHasError(true)}
      />
    )
  }

  if (name && name.trim()) {
    const initial = name.trim().charAt(0).toUpperCase()
    return (
      <span className={`user-avatar-initial ${className}`} aria-hidden="true">
        {initial}
      </span>
    )
  }

  return <UserRound size={size} className={className} aria-hidden="true" />
}
