-- Add PermPinMessages (1 << 12 = 4096) to existing @everyone roles that have the old default permissions.
-- Old default: ViewChannels(1) | SendMessages(2) | AddReactions(256) | AttachFiles(512) | VoiceConnect(8192) | VoiceSpeak(16384) = 25347
-- New default adds PinMessages(4096): 25347 | 4096 = 29443
-- Only update roles that have the exact old default or have the old bits set without pin already.
UPDATE roles
SET permissions = permissions | 4096
WHERE name = '@everyone' AND position = 0 AND (permissions & 4096) = 0;
