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
  created_at: string
}

export interface Channel {
  id: string
  server_id: string
  name: string
  type: 'text' | 'voice'
  position: number
  created_at: string
}

export interface Message {
  id: string
  channel_id: string
  author_id: string
  content: string
  created_at: string
  updated_at: string
  author_username?: string
  author_display_name?: string | null
  author_avatar_url?: string | null
}

export interface ServerMember {
  id: string
  username: string
  display_name: string | null
  avatar_url: string | null
  status: string
  role: 'owner' | 'admin' | 'member'
  nickname: string | null
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
  created_at: string
  updated_at: string
  author_username?: string
  author_display_name?: string | null
  author_avatar_url?: string | null
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
