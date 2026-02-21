import { useEffect } from 'react'
import { wsService } from '@/services/ws'
import { useServerStore } from '@/stores/serverStore'
import { useMessageStore } from '@/stores/messageStore'
import { useVoiceStore } from '@/stores/voiceStore'
import { useFriendStore } from '@/stores/friendStore'
import { useDMCallStore } from '@/stores/dmCallStore'
import { useAuthStore } from '@/stores/authStore'
import { usePermissionStore } from '@/stores/permissionStore'
import { useStageStore } from '@/stores/stageStore'
import { useNotificationStore } from '@/stores/notificationStore'
import { useDMStore } from '@/stores/dmStore'
import { useThreadStore } from '@/stores/threadStore'
import type {
  ReadyData,
  PresenceData,
  MessageCreateData,
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
  ReactionRemoveData,
  RoleCreateData,
  RoleUpdateData,
  RoleDeleteData,
  MemberRoleUpdateData,
  MentionCreateData,
  DMMessageCreateData,
  DMParticipantAddData,
  DMParticipantRemoveData,
  DMConversationUpdateData,
  DMMessageUpdateData,
  DMMessageDeleteData,
  DMReactionAddData,
  DMReactionRemoveData,
  DMMessagePinData,
  DMMessageUnpinData,
  NotificationData,
  ThreadCreateData,
  ThreadUpdateData,
  ThreadMessageCreateData,
  PollVoteData,
  StageStartData,
  StageEndData,
  StageSpeakerAddData,
  StageSpeakerRemoveData,
  StageHandRaiseData,
  StageHandLowerData
} from '@/types/ws'

/** Fire a browser notification if permission is granted and the window/channel is not active. */
function fireBrowserNotification(title: string, body: string, channelId?: string) {
  if (typeof Notification === 'undefined') return
  if (Notification.permission !== 'granted') return

  // Don't notify if user is focused on the same channel
  const { activeChannelId } = useServerStore.getState()
  if (document.hasFocus() && channelId && channelId === activeChannelId) return

  new Notification(title, { body, icon: '/favicon.ico' })
}

export function useWebSocketEvents() {
  useEffect(() => {
    const unsubs: (() => void)[] = []

    // READY — store online user IDs + load unread counts
    unsubs.push(
      wsService.on('READY', (data) => {
        const ready = data as ReadyData
        if (ready.online_user_ids) {
          useServerStore.getState().setOnlineUserIds(ready.online_user_ids)
        }
        // Load unread counts from API
        useNotificationStore.getState().init()
      })
    )

    // MESSAGE_CREATE — central handler for unread tracking
    unsubs.push(
      wsService.on('MESSAGE_CREATE', (data) => {
        const msg = data as MessageCreateData
        const { activeChannelId, activeServerId } = useServerStore.getState()
        const currentUserId = useAuthStore.getState().user?.id
        // If it's not the active channel and not our own message, check prefs
        if (msg.channel_id !== activeChannelId && msg.author_id !== currentUserId) {
          const setting = useNotificationStore.getState().getEffectiveSetting(msg.channel_id, activeServerId)
          if (setting !== 'none') {
            useNotificationStore.getState().incrementUnread(msg.channel_id)
          }
        }
      })
    )

    // DM_MESSAGE_CREATE — central handler for DM unread tracking
    unsubs.push(
      wsService.on('DM_MESSAGE_CREATE', (data) => {
        const msg = data as DMMessageCreateData
        const currentUserId = useAuthStore.getState().user?.id
        if (msg.author_id !== currentUserId) {
          useNotificationStore.getState().incrementDMUnread(msg.conversation_id)
        }
      })
    )

    // MENTION_CREATE — increment mention count + browser notification (respects prefs)
    unsubs.push(
      wsService.on('MENTION_CREATE', (data) => {
        const mention = data as MentionCreateData
        const { activeServerId } = useServerStore.getState()
        const setting = useNotificationStore.getState().getEffectiveSetting(mention.channel_id, activeServerId)
        if (setting === 'none') return
        useNotificationStore.getState().incrementMention(mention.channel_id)
        // Browser notification
        if (Notification.permission === 'granted') {
          new Notification(`@${mention.username} mentioned you`, {
            body: mention.content.slice(0, 100),
            tag: mention.message_id
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
            topic: channel.topic || '',
            category_id: channel.category_id,
            slow_mode_interval: channel.slow_mode_interval ?? 0,
            voice_status: channel.voice_status || '',
            is_announcement: channel.is_announcement ?? false,
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
            slow_mode_interval: channel.slow_mode_interval ?? 0,
            voice_status: channel.voice_status || '',
            is_announcement: channel.is_announcement ?? false,
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
          welcome_message: server.welcome_message,
          welcome_channels: server.welcome_channels ?? [],
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

    // ROLE_CREATE
    unsubs.push(
      wsService.on('ROLE_CREATE', (data) => {
        const role = data as RoleCreateData
        const { activeServerId } = useServerStore.getState()
        if (role.server_id === activeServerId) {
          usePermissionStore.getState().addRole(role)
        }
      })
    )

    // ROLE_UPDATE
    unsubs.push(
      wsService.on('ROLE_UPDATE', (data) => {
        const role = data as RoleUpdateData
        const { activeServerId } = useServerStore.getState()
        if (role.server_id === activeServerId) {
          usePermissionStore.getState().updateRole(role)
        }
      })
    )

    // ROLE_DELETE
    unsubs.push(
      wsService.on('ROLE_DELETE', (data) => {
        const role = data as RoleDeleteData
        const { activeServerId } = useServerStore.getState()
        if (role.server_id === activeServerId) {
          usePermissionStore.getState().removeRole(role.id)
        }
      })
    )

    // MEMBER_ROLE_UPDATE
    unsubs.push(
      wsService.on('MEMBER_ROLE_UPDATE', (data) => {
        const update = data as MemberRoleUpdateData
        const { activeServerId } = useServerStore.getState()
        if (update.server_id === activeServerId) {
          if (update.action === 'assign') {
            usePermissionStore.getState().addMemberRole(update.user_id, update.role_id)
          } else {
            usePermissionStore.getState().removeMemberRole(update.user_id, update.role_id)
          }
        }
      })
    )

    // THREAD_CREATE
    unsubs.push(
      wsService.on('THREAD_CREATE', (data) => {
        const thread = data as ThreadCreateData
        const { activeChannelId } = useServerStore.getState()
        if (thread.channel_id === activeChannelId) {
          useThreadStore.getState().addThread(thread)
        }
      })
    )

    // THREAD_UPDATE
    unsubs.push(
      wsService.on('THREAD_UPDATE', (data) => {
        const thread = data as ThreadUpdateData
        const { activeChannelId } = useServerStore.getState()
        if (thread.channel_id === activeChannelId) {
          useThreadStore.getState().updateThread(thread)
        }
      })
    )

    // THREAD_MESSAGE_CREATE
    unsubs.push(
      wsService.on('THREAD_MESSAGE_CREATE', (data) => {
        const msg = data as ThreadMessageCreateData
        const { activeChannelId } = useServerStore.getState()
        if (msg.channel_id === activeChannelId) {
          useThreadStore.getState().addThreadMessage({
            id: msg.id,
            thread_id: msg.thread_id,
            author_id: msg.author_id,
            content: msg.content,
            reply_to_id: msg.reply_to_id,
            created_at: msg.created_at,
            updated_at: msg.updated_at,
            author_username: msg.author_username,
            author_display_name: msg.author_display_name,
            author_avatar_url: msg.author_avatar_url
          })
          // Update the thread's message_count in the threadsByMessage map
          const threadsByMessage = useThreadStore.getState().threadsByMessage
          for (const [parentMsgId, thread] of Object.entries(threadsByMessage)) {
            if (thread.id === msg.thread_id) {
              useThreadStore.getState().updateThreadMessageCount(msg.thread_id, parentMsgId, msg.message_count)
              break
            }
          }
        }
      })
    )

    // POLL_VOTE
    unsubs.push(
      wsService.on('POLL_VOTE', (data) => {
        const poll = data as PollVoteData
        if (poll.message_id) {
          useMessageStore.getState().updateMessagePoll(poll.message_id, poll)
        }
      })
    )

    // STAGE_START
    unsubs.push(
      wsService.on('STAGE_START', (data) => {
        const d = data as StageStartData
        useStageStore.getState().handleStageStart(d.instance)
      })
    )

    // STAGE_END
    unsubs.push(
      wsService.on('STAGE_END', (data) => {
        const d = data as StageEndData
        useStageStore.getState().handleStageEnd(d.channel_id)
      })
    )

    // STAGE_SPEAKER_ADD
    unsubs.push(
      wsService.on('STAGE_SPEAKER_ADD', (data) => {
        const d = data as StageSpeakerAddData
        useStageStore.getState().handleSpeakerAdd(d.channel_id, d.user_id, d.invited)
      })
    )

    // STAGE_SPEAKER_REMOVE
    unsubs.push(
      wsService.on('STAGE_SPEAKER_REMOVE', (data) => {
        const d = data as StageSpeakerRemoveData
        useStageStore.getState().handleSpeakerRemove(d.channel_id, d.user_id)
      })
    )

    // STAGE_HAND_RAISE
    unsubs.push(
      wsService.on('STAGE_HAND_RAISE', (data) => {
        const d = data as StageHandRaiseData
        useStageStore.getState().handleHandRaise(d.channel_id, d.user_id)
      })
    )

    // STAGE_HAND_LOWER
    unsubs.push(
      wsService.on('STAGE_HAND_LOWER', (data) => {
        const d = data as StageHandLowerData
        useStageStore.getState().handleHandLower(d.channel_id, d.user_id)
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

    // DM_PARTICIPANT_ADD
    unsubs.push(
      wsService.on('DM_PARTICIPANT_ADD', (data) => {
        const add = data as DMParticipantAddData
        // Re-fetch conversations to get updated participant list
        useDMStore.getState().fetchConversations()
        void add
      })
    )

    // DM_PARTICIPANT_REMOVE
    unsubs.push(
      wsService.on('DM_PARTICIPANT_REMOVE', (data) => {
        const remove = data as DMParticipantRemoveData
        useDMStore.getState().removeConversationParticipant(remove.conversation_id, remove.user_id)
      })
    )

    // DM_CONVERSATION_UPDATE
    unsubs.push(
      wsService.on('DM_CONVERSATION_UPDATE', (data) => {
        const update = data as DMConversationUpdateData
        useDMStore.getState().updateConversation(update.conversation_id, {
          name: update.name || null
        })
      })
    )

    // DM_MESSAGE_UPDATE
    unsubs.push(
      wsService.on('DM_MESSAGE_UPDATE', (data) => {
        const msg = data as DMMessageUpdateData
        const { activeConversationId } = useDMStore.getState()
        if (msg.conversation_id === activeConversationId) {
          useDMStore.getState().updateMessage({
            id: msg.id,
            content: msg.content,
            updated_at: msg.updated_at
          })
        }
      })
    )

    // DM_MESSAGE_DELETE
    unsubs.push(
      wsService.on('DM_MESSAGE_DELETE', (data) => {
        const msg = data as DMMessageDeleteData
        const { activeConversationId } = useDMStore.getState()
        if (msg.conversation_id === activeConversationId) {
          useDMStore.getState().removeMessage(msg.id)
        }
      })
    )

    // DM_REACTION_ADD
    unsubs.push(
      wsService.on('DM_REACTION_ADD', (data) => {
        const reaction = data as DMReactionAddData
        const { activeConversationId } = useDMStore.getState()
        if (reaction.conversation_id === activeConversationId) {
          const isMe = reaction.user_id === useAuthStore.getState().user?.id
          useDMStore.getState().addReaction(reaction.message_id, reaction.emoji, isMe)
        }
      })
    )

    // DM_REACTION_REMOVE
    unsubs.push(
      wsService.on('DM_REACTION_REMOVE', (data) => {
        const reaction = data as DMReactionRemoveData
        const { activeConversationId } = useDMStore.getState()
        if (reaction.conversation_id === activeConversationId) {
          const isMe = reaction.user_id === useAuthStore.getState().user?.id
          useDMStore.getState().removeReaction(reaction.message_id, reaction.emoji, isMe)
        }
      })
    )

    // DM_MESSAGE_PIN
    unsubs.push(
      wsService.on('DM_MESSAGE_PIN', (data) => {
        const pin = data as DMMessagePinData
        const { activeConversationId, showPinnedPanel, fetchPinnedMessages } = useDMStore.getState()
        if (pin.conversation_id === activeConversationId && showPinnedPanel) {
          fetchPinnedMessages(pin.conversation_id)
        }
      })
    )

    // DM_MESSAGE_UNPIN
    unsubs.push(
      wsService.on('DM_MESSAGE_UNPIN', (data) => {
        const unpin = data as DMMessageUnpinData
        const { activeConversationId, showPinnedPanel, fetchPinnedMessages } = useDMStore.getState()
        if (unpin.conversation_id === activeConversationId && showPinnedPanel) {
          fetchPinnedMessages(unpin.conversation_id)
        }
      })
    )

    // NOTIFICATION -- server-side notification based on user prefs
    unsubs.push(
      wsService.on('NOTIFICATION', (data) => {
        const notif = data as NotificationData
        fireBrowserNotification(
          notif.username,
          notif.content.length > 100 ? notif.content.slice(0, 100) + '...' : notif.content,
          notif.channel_id
        )
      })
    )

    return () => {
      unsubs.forEach((unsub) => unsub())
    }
  }, [])
}
