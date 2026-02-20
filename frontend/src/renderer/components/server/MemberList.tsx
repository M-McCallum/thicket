import { useServerStore } from '../../stores/serverStore'

const statusColors: Record<string, string> = {
  online: 'bg-sol-green',
  idle: 'bg-sol-amber',
  dnd: 'bg-sol-coral',
  offline: 'bg-sol-text-muted'
}

export default function MemberList(): JSX.Element {
  const { members } = useServerStore()

  const onlineMembers = members.filter((m) => m.status !== 'offline')
  const offlineMembers = members.filter((m) => m.status === 'offline')

  return (
    <div className="w-60 bg-sol-bg-secondary border-l border-sol-bg-elevated flex flex-col">
      <div className="flex-1 overflow-y-auto py-2">
        {/* Online */}
        {onlineMembers.length > 0 && (
          <div className="mb-2">
            <div className="px-3 py-1 text-xs font-mono text-sol-text-muted uppercase tracking-wider">
              Online — {onlineMembers.length}
            </div>
            {onlineMembers.map((member) => (
              <MemberItem key={member.id} member={member} />
            ))}
          </div>
        )}

        {/* Offline */}
        {offlineMembers.length > 0 && (
          <div>
            <div className="px-3 py-1 text-xs font-mono text-sol-text-muted uppercase tracking-wider">
              Offline — {offlineMembers.length}
            </div>
            {offlineMembers.map((member) => (
              <MemberItem key={member.id} member={member} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function MemberItem({ member }: { member: { id: string; username: string; display_name: string | null; status: string; role: string } }): JSX.Element {
  const roleColors: Record<string, string> = {
    owner: 'text-sol-amber',
    admin: 'text-sol-rose',
    member: 'text-sol-text-primary'
  }

  return (
    <div className="flex items-center gap-2 px-3 py-1.5 hover:bg-sol-bg-elevated/50 transition-colors cursor-pointer rounded-lg">
      <div className="relative">
        <div className="w-8 h-8 rounded-full bg-sol-bg-elevated flex items-center justify-center text-sm font-medium">
          {(member.display_name ?? member.username).charAt(0).toUpperCase()}
        </div>
        <div
          className={`absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-sol-bg-secondary ${statusColors[member.status] ?? statusColors.offline}`}
        />
      </div>
      <span className={`text-sm truncate ${roleColors[member.role] ?? roleColors.member}`}>
        {member.display_name ?? member.username}
      </span>
    </div>
  )
}
