interface UserAvatarProps {
  avatarUrl: string | null | undefined
  username: string | undefined
  size?: 'sm' | 'md' | 'lg'
  className?: string
}

const sizeClasses = {
  sm: 'w-8 h-8 text-xs',
  md: 'w-12 h-12 text-sm',
  lg: 'w-20 h-20 text-3xl'
}

const STATIC_BASE = 'http://localhost:8080'

export default function UserAvatar({ avatarUrl, username, size = 'md', className = '' }: UserAvatarProps) {
  const initial = username?.charAt(0).toUpperCase() ?? '?'

  if (avatarUrl) {
    const src = avatarUrl.startsWith('http') ? avatarUrl : `${STATIC_BASE}${avatarUrl}`
    return (
      <img
        src={src}
        alt={username}
        className={`${sizeClasses[size]} rounded-full object-cover ${className}`}
      />
    )
  }

  return (
    <div className={`${sizeClasses[size]} rounded-full bg-sol-amber/20 flex items-center justify-center ${className}`}>
      <span className="font-display font-bold text-sol-amber">{initial}</span>
    </div>
  )
}
