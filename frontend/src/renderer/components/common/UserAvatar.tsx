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

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8080/api'
const API_ORIGIN = API_BASE.replace(/\/api$/, '')

function resolveAvatarSrc(url: string): string {
  if (url.startsWith('http')) return url
  // Already a proxy path like /api/files/...
  if (url.startsWith('/api/')) return `${API_ORIGIN}${url}`
  // Raw object key like avatars/uuid.ext — route through file proxy
  return `${API_ORIGIN}/api/files/${url}`
}

export default function UserAvatar({ avatarUrl, username, size = 'md', className = '' }: UserAvatarProps) {
  const initial = username?.charAt(0).toUpperCase() ?? '?'

  if (avatarUrl) {
    const src = resolveAvatarSrc(avatarUrl)
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
