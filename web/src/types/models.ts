export interface User {
  id: string
  username: string
  email: string
  avatar_url: string | null
  display_name: string | null
  status: 'online' | 'idle' | 'dnd' | 'offline'
  bio: string
  pronouns: string
  custom_status_text: string
  custom_status_emoji: string
  custom_status_expires_at: string | null
  created_at: string
}

export interface Server {
  id: string
  name: string
  icon_url: string | null
  owner_id: string
  invite_code: string
  is_public?: boolean
  description?: string
  created_at: string
}

export interface ServerInvite {
  id: string
  server_id: string
  creator_id: string
  code: string
  max_uses: number | null
  uses: number
  expires_at: string | null
  created_at: string
}

export interface PublicServer {
  id: string
  name: string
  icon_url: string | null
  description: string
  member_count: number
  is_public: boolean
}

export interface Channel {
  id: string
  server_id: string
  name: string
  type: 'text' | 'voice'
  position: number
  topic: string
  category_id: string | null
  created_at: string
}

export interface ChannelCategory {
  id: string
  server_id: string
  name: string
  position: number
  created_at: string
}

export interface Attachment {
  id: string
  filename: string
  original_filename: string
  content_type: string
  size: number
  width?: number
  height?: number
  url: string
  is_external: boolean
}

export interface ReplySnippet {
  id: string
  author_id: string
  author_username: string
  content: string
}

export interface ReactionCount {
  emoji: string
  count: number
  me: boolean
}

export interface Message {
  id: string
  channel_id: string
  author_id: string
  content: string
  type?: 'text' | 'sticker'
  reply_to_id?: string | null
  reply_to?: ReplySnippet | null
  reactions?: ReactionCount[]
  created_at: string
  updated_at: string
  author_username?: string
  author_display_name?: string | null
  author_avatar_url?: string | null
  attachments?: Attachment[]
}

export interface ServerMember {
  id: string
  username: string
  display_name: string | null
  avatar_url: string | null
  status: string
  role: 'owner' | 'admin' | 'member'
  nickname: string | null
  roles?: Role[]
}

export interface DMConversation {
  id: string
  is_group: boolean
  name: string | null
  created_at: string
}

export interface DMMessage {
  id: string
  conversation_id: string
  author_id: string
  content: string
  type?: 'text' | 'sticker'
  created_at: string
  updated_at: string
  author_username?: string
  author_display_name?: string | null
  author_avatar_url?: string | null
  attachments?: Attachment[]
}

export interface DMParticipant {
  id: string
  username: string
  display_name: string | null
  avatar_url: string | null
  status: string
}

export interface DMConversationWithParticipants extends DMConversation {
  participants: DMParticipant[]
}

export interface CustomEmoji {
  id: string
  server_id: string
  name: string
  url: string
  creator_id: string
  created_at: string
}

export interface StickerPack {
  id: string
  name: string
  description?: string
  server_id?: string
  creator_id: string
  created_at: string
}

export interface Sticker {
  id: string
  pack_id: string
  name: string
  url: string
  created_at: string
}

export interface Friendship {
  id: string
  requester_id: string
  addressee_id: string
  status: 'pending' | 'accepted' | 'declined' | 'blocked'
  username: string
  display_name: string | null
  avatar_url: string | null
  user_status: string
  created_at: string
  updated_at: string
}

export interface ServerPreview {
  name: string
  member_count: number
  icon_url: string | null
}

export interface Role {
  id: string
  server_id: string
  name: string
  color: string | null
  position: number
  permissions: string // int64 serialized as string
  hoist: boolean
  created_at: string
}

export interface ChannelPermissionOverride {
  id: string
  channel_id: string
  role_id: string
  allow: string // int64 serialized as string
  deny: string // int64 serialized as string
}

export interface MemberWithRoles extends ServerMember {
  roles: Role[]
}

export interface MessageEdit {
  id: string
  message_id: string
  content: string
  edited_at: string
}

export interface LinkPreview {
  id: string
  url: string
  title: string | null
  description: string | null
  image_url: string | null
  site_name: string | null
  fetched_at: string
}
