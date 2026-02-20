package handler

import (
	"fmt"
	"time"

	"github.com/gofiber/fiber/v3"
	"github.com/google/uuid"
	"github.com/livekit/protocol/auth"

	authPkg "github.com/M-McCallum/thicket/internal/auth"
	"github.com/M-McCallum/thicket/internal/service"
)

type LiveKitHandler struct {
	serverService *service.ServerService
	dmService     *service.DMService
	apiKey        string
	apiSecret     string
}

func NewLiveKitHandler(ss *service.ServerService, ds *service.DMService, apiKey, apiSecret string) *LiveKitHandler {
	return &LiveKitHandler{
		serverService: ss,
		dmService:     ds,
		apiKey:        apiKey,
		apiSecret:     apiSecret,
	}
}

func (h *LiveKitHandler) GetVoiceToken(c fiber.Ctx) error {
	serverID, err := uuid.Parse(c.Params("serverId"))
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid server ID"})
	}

	channelID, err := uuid.Parse(c.Params("channelId"))
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid channel ID"})
	}

	userID := authPkg.GetUserID(c)
	username := authPkg.GetUsername(c)

	// Verify server membership
	if _, err := h.serverService.GetServer(c.Context(), serverID, userID); err != nil {
		return c.Status(fiber.StatusForbidden).JSON(fiber.Map{"error": "not a member of this server"})
	}

	roomName := fmt.Sprintf("server:%s:voice:%s", serverID, channelID)

	at := auth.NewAccessToken(h.apiKey, h.apiSecret)
	grant := &auth.VideoGrant{
		RoomJoin: true,
		Room:     roomName,
	}
	at.AddGrant(grant).
		SetIdentity(userID.String()).
		SetName(username).
		SetValidFor(time.Hour)

	token, err := at.ToJWT()
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "failed to generate token"})
	}

	return c.JSON(fiber.Map{
		"token": token,
		"room":  roomName,
	})
}

func (h *LiveKitHandler) GetDMVoiceToken(c fiber.Ctx) error {
	conversationID, err := uuid.Parse(c.Params("id"))
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid conversation ID"})
	}

	userID := authPkg.GetUserID(c)
	username := authPkg.GetUsername(c)

	// Verify user is DM participant
	participantIDs, err := h.dmService.GetParticipantIDs(c.Context(), conversationID)
	if err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "conversation not found"})
	}

	isParticipant := false
	for _, pid := range participantIDs {
		if pid == userID {
			isParticipant = true
			break
		}
	}
	if !isParticipant {
		return c.Status(fiber.StatusForbidden).JSON(fiber.Map{"error": "not a participant"})
	}

	roomName := fmt.Sprintf("dm:%s", conversationID)

	at := auth.NewAccessToken(h.apiKey, h.apiSecret)
	grant := &auth.VideoGrant{
		RoomJoin: true,
		Room:     roomName,
	}
	at.AddGrant(grant).
		SetIdentity(userID.String()).
		SetName(username).
		SetValidFor(time.Hour)

	token, err := at.ToJWT()
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "failed to generate token"})
	}

	return c.JSON(fiber.Map{
		"token": token,
		"room":  roomName,
	})
}
