import { useEffect } from 'react'
import { wsService } from '@/services/ws'
import { useServerStore } from '@/stores/serverStore'
import { useMessageStore } from '@/stores/messageStore'
import { useVoiceStore } from '@/stores/voiceStore'
import type {
  ReadyData,
  PresenceData,
  MessageDeleteData,
  MessageUpdateData,
  ChannelCreateData,
  ChannelDeleteData,
  MemberJoinData,
  MemberLeaveData,
  VoiceStateData
} from '@/types/ws'

export function useWebSocketEvents() {
  useEffect(() => {
    const unsubs: (() => void)[] = []

    // READY — apply online user IDs to member statuses
    unsubs.push(
      wsService.on('READY', (data) => {
        const ready = data as ReadyData
        const { members } = useServerStore.getState()
        if (members.length > 0 && ready.online_user_ids) {
          const onlineSet = new Set(ready.online_user_ids)
          members.forEach((m) => {
            useServerStore.getState().updateMemberStatus(
              m.id,
              onlineSet.has(m.id) ? 'online' : 'offline'
            )
          })
        }
      })
    )

    // PRESENCE_UPDATE
    unsubs.push(
      wsService.on('PRESENCE_UPDATE', (data) => {
        const presence = data as PresenceData
        useServerStore.getState().updateMemberStatus(presence.user_id, presence.status)
      })
    )

    // MESSAGE_UPDATE
    unsubs.push(
      wsService.on('MESSAGE_UPDATE', (data) => {
        const msg = data as MessageUpdateData
        const { activeChannelId } = useServerStore.getState()
        if (msg.channel_id === activeChannelId) {
          useMessageStore.getState().updateMessage({
            id: msg.id,
            channel_id: msg.channel_id,
            author_id: msg.author_id,
            content: msg.content,
            created_at: msg.created_at,
            updated_at: msg.updated_at
          })
        }
      })
    )

    // MESSAGE_DELETE
    unsubs.push(
      wsService.on('MESSAGE_DELETE', (data) => {
        const msg = data as MessageDeleteData
        const { activeChannelId } = useServerStore.getState()
        if (msg.channel_id === activeChannelId) {
          useMessageStore.getState().removeMessage(msg.id)
        }
      })
    )

    // CHANNEL_CREATE
    unsubs.push(
      wsService.on('CHANNEL_CREATE', (data) => {
        const channel = data as ChannelCreateData
        const { activeServerId } = useServerStore.getState()
        if (channel.server_id === activeServerId) {
          useServerStore.getState().addChannel({
            id: channel.id,
            server_id: channel.server_id,
            name: channel.name,
            type: channel.type,
            position: channel.position,
            created_at: channel.created_at
          })
        }
      })
    )

    // CHANNEL_DELETE
    unsubs.push(
      wsService.on('CHANNEL_DELETE', (data) => {
        const channel = data as ChannelDeleteData
        const { activeServerId } = useServerStore.getState()
        if (channel.server_id === activeServerId) {
          useServerStore.getState().removeChannel(channel.id)
        }
      })
    )

    // MEMBER_JOIN
    unsubs.push(
      wsService.on('MEMBER_JOIN', (data) => {
        const member = data as MemberJoinData
        const { activeServerId } = useServerStore.getState()
        if (member.server_id === activeServerId) {
          useServerStore.getState().addMember({
            id: member.user_id,
            username: member.username,
            display_name: null,
            avatar_url: null,
            status: 'online',
            role: 'member',
            nickname: null
          })
        }
      })
    )

    // MEMBER_LEAVE
    unsubs.push(
      wsService.on('MEMBER_LEAVE', (data) => {
        const member = data as MemberLeaveData
        const { activeServerId } = useServerStore.getState()
        if (member.server_id === activeServerId) {
          useServerStore.getState().removeMember(member.user_id)
        }
      })
    )

    // VOICE_STATE_UPDATE
    unsubs.push(
      wsService.on('VOICE_STATE_UPDATE', (data) => {
        const state = data as VoiceStateData
        const voiceStore = useVoiceStore.getState()
        if (state.joined) {
          voiceStore.addParticipant({
            userId: state.user_id,
            username: state.username,
            muted: state.muted,
            deafened: state.deafened
          })
        } else {
          voiceStore.removeParticipant(state.user_id)
        }
      })
    )

    return () => {
      unsubs.forEach((unsub) => unsub())
    }
  }, [])
}
