import { useEffect } from 'react'
import { wsService } from '@/services/ws'
import { useServerStore } from '@/stores/serverStore'
import { useMessageStore } from '@/stores/messageStore'
import { useVoiceStore } from '@/stores/voiceStore'
import { useFriendStore } from '@/stores/friendStore'
import { useDMCallStore } from '@/stores/dmCallStore'
import { useAuthStore } from '@/stores/authStore'
import type {
  ReadyData,
  PresenceData,
  MessageDeleteData,
  MessageUpdateData,
  ChannelCreateData,
  ChannelDeleteData,
  MemberJoinData,
  MemberLeaveData,
  VoiceStateData,
  UserProfileUpdateData,
  FriendRequestCreateData,
  FriendRequestAcceptData,
  FriendRemoveData,
  DMCallRingData,
  DMCallAcceptData,
  DMCallEndData,
  ServerUpdateData,
  MemberUpdateData,
  CategoryCreateData,
  CategoryUpdateData,
  CategoryDeleteData,
  MessagePinData,
  MessageUnpinData,
  ReactionAddData,
  ReactionRemoveData
} from '@/types/ws'

export function useWebSocketEvents() {
  useEffect(() => {
    const unsubs: (() => void)[] = []

    // READY — store online user IDs (applied immediately if members are loaded,
    // otherwise applied when members arrive in setActiveServer)
    unsubs.push(
      wsService.on('READY', (data) => {
        const ready = data as ReadyData
        if (ready.online_user_ids) {
          useServerStore.getState().setOnlineUserIds(ready.online_user_ids)
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
            topic: channel.topic || '',
            category_id: channel.category_id,
            created_at: channel.created_at
          })
        }
      })
    )

    // CHANNEL_UPDATE
    unsubs.push(
      wsService.on('CHANNEL_UPDATE', (data) => {
        const channel = data as ChannelCreateData
        const { activeServerId } = useServerStore.getState()
        if (channel.server_id === activeServerId) {
          useServerStore.getState().updateChannel({
            id: channel.id,
            server_id: channel.server_id,
            name: channel.name,
            type: channel.type,
            position: channel.position,
            topic: channel.topic || '',
            category_id: channel.category_id,
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

    // USER_PROFILE_UPDATE
    unsubs.push(
      wsService.on('USER_PROFILE_UPDATE', (data) => {
        const profile = data as UserProfileUpdateData
        useServerStore.getState().updateMemberProfile(profile.id, {
          username: profile.username,
          display_name: profile.display_name,
          avatar_url: profile.avatar_url,
          status: profile.status
        })
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
            deafened: state.deafened,
            cameraEnabled: false,
            screenShareEnabled: false,
            videoTrack: null,
            screenTrack: null
          })
        } else {
          voiceStore.removeParticipant(state.user_id)
        }
      })
    )

    // FRIEND_REQUEST_CREATE
    unsubs.push(
      wsService.on('FRIEND_REQUEST_CREATE', (data) => {
        const req = data as FriendRequestCreateData
        useFriendStore.getState().addFriendRequest({
          id: req.id,
          requester_id: req.requester_id,
          addressee_id: req.addressee_id,
          status: req.status as 'pending' | 'accepted' | 'declined' | 'blocked',
          username: req.username,
          display_name: null,
          avatar_url: null,
          user_status: 'online',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })
      })
    )

    // FRIEND_REQUEST_ACCEPT
    unsubs.push(
      wsService.on('FRIEND_REQUEST_ACCEPT', (data) => {
        const accept = data as FriendRequestAcceptData
        useFriendStore.getState().movePendingToFriends(accept.id, {
          id: accept.id,
          requester_id: '',
          addressee_id: '',
          status: 'accepted' as const,
          username: accept.username,
          display_name: null,
          avatar_url: null,
          user_status: 'online',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })
      })
    )

    // FRIEND_REMOVE
    unsubs.push(
      wsService.on('FRIEND_REMOVE', (data) => {
        const remove = data as FriendRemoveData
        useFriendStore.getState().removeFriendById(remove.user_id)
      })
    )

    // SERVER_UPDATE
    unsubs.push(
      wsService.on('SERVER_UPDATE', (data) => {
        const server = data as ServerUpdateData
        useServerStore.getState().updateServer({
          id: server.id,
          name: server.name,
          icon_url: server.icon_url,
          owner_id: server.owner_id,
          invite_code: server.invite_code,
          created_at: server.created_at
        })
      })
    )

    // MEMBER_UPDATE (nickname changes)
    unsubs.push(
      wsService.on('MEMBER_UPDATE', (data) => {
        const update = data as MemberUpdateData
        const { activeServerId } = useServerStore.getState()
        if (update.server_id === activeServerId) {
          useServerStore.getState().updateMemberNickname(update.user_id, update.nickname)
        }
      })
    )

    // CATEGORY_CREATE
    unsubs.push(
      wsService.on('CATEGORY_CREATE', (data) => {
        const cat = data as CategoryCreateData
        const { activeServerId } = useServerStore.getState()
        if (cat.server_id === activeServerId) {
          useServerStore.getState().addCategory(cat)
        }
      })
    )

    // CATEGORY_UPDATE
    unsubs.push(
      wsService.on('CATEGORY_UPDATE', (data) => {
        const cat = data as CategoryUpdateData
        const { activeServerId } = useServerStore.getState()
        if (cat.server_id === activeServerId) {
          useServerStore.getState().updateCategory(cat)
        }
      })
    )

    // CATEGORY_DELETE
    unsubs.push(
      wsService.on('CATEGORY_DELETE', (data) => {
        const cat = data as CategoryDeleteData
        const { activeServerId } = useServerStore.getState()
        if (cat.server_id === activeServerId) {
          useServerStore.getState().removeCategory(cat.id)
        }
      })
    )

    // MESSAGE_PIN
    unsubs.push(
      wsService.on('MESSAGE_PIN', (_data) => {
        const pin = _data as MessagePinData
        const { activeChannelId } = useServerStore.getState()
        if (pin.channel_id === activeChannelId) {
          const { showPinnedPanel, fetchPinnedMessages } = useMessageStore.getState()
          if (showPinnedPanel) fetchPinnedMessages(pin.channel_id)
        }
      })
    )

    // MESSAGE_UNPIN
    unsubs.push(
      wsService.on('MESSAGE_UNPIN', (_data) => {
        const unpin = _data as MessageUnpinData
        const { activeChannelId } = useServerStore.getState()
        if (unpin.channel_id === activeChannelId) {
          const { showPinnedPanel, fetchPinnedMessages } = useMessageStore.getState()
          if (showPinnedPanel) fetchPinnedMessages(unpin.channel_id)
        }
      })
    )

    // REACTION_ADD
    unsubs.push(
      wsService.on('REACTION_ADD', (data) => {
        const reaction = data as ReactionAddData
        const { activeChannelId } = useServerStore.getState()
        if (reaction.channel_id === activeChannelId) {
          const isMe = reaction.user_id === useAuthStore.getState().user?.id
          useMessageStore.getState().addReaction(reaction.message_id, reaction.emoji, isMe)
        }
      })
    )

    // REACTION_REMOVE
    unsubs.push(
      wsService.on('REACTION_REMOVE', (data) => {
        const reaction = data as ReactionRemoveData
        const { activeChannelId } = useServerStore.getState()
        if (reaction.channel_id === activeChannelId) {
          const isMe = reaction.user_id === useAuthStore.getState().user?.id
          useMessageStore.getState().removeReaction(reaction.message_id, reaction.emoji, isMe)
        }
      })
    )

    // DM_CALL_RING
    unsubs.push(
      wsService.on('DM_CALL_RING', (data) => {
        const ring = data as DMCallRingData
        useDMCallStore.getState().setIncomingCall({
          conversationId: ring.conversation_id,
          callerId: ring.caller_id,
          callerUsername: ring.caller_username
        })
      })
    )

    // DM_CALL_ACCEPT (someone accepted)
    unsubs.push(
      wsService.on('DM_CALL_ACCEPT', (_data) => {
        // Call was accepted — no action needed, LiveKit handles the connection
      })
    )

    // DM_CALL_END
    unsubs.push(
      wsService.on('DM_CALL_END', (data) => {
        const end = data as DMCallEndData
        const callStore = useDMCallStore.getState()
        if (callStore.activeConversationId === end.conversation_id) {
          callStore.endCall()
        }
        if (callStore.incomingCall?.conversationId === end.conversation_id) {
          callStore.setIncomingCall(null)
        }
      })
    )

    return () => {
      unsubs.forEach((unsub) => unsub())
    }
  }, [])
}
