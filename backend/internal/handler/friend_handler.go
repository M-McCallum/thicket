package handler

import (
	"errors"

	"github.com/gofiber/fiber/v3"
	"github.com/google/uuid"

	"github.com/M-McCallum/thicket/internal/auth"
	"github.com/M-McCallum/thicket/internal/service"
	"github.com/M-McCallum/thicket/internal/ws"
)

type FriendHandler struct {
	friendService *service.FriendService
	hub           *ws.Hub
}

func NewFriendHandler(fs *service.FriendService, hub *ws.Hub) *FriendHandler {
	return &FriendHandler{friendService: fs, hub: hub}
}

func (h *FriendHandler) SendRequest(c fiber.Ctx) error {
	var body struct {
		Username string `json:"username"`
	}
	if err := c.Bind().JSON(&body); err != nil || body.Username == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "username is required"})
	}

	userID := auth.GetUserID(c)
	friendship, err := h.friendService.SendRequest(c.Context(), userID, body.Username)
	if err != nil {
		return handleFriendError(c, err)
	}

	// Notify addressee via WS
	event, _ := ws.NewEvent(ws.EventFriendRequestCreate, fiber.Map{
		"id":           friendship.ID,
		"requester_id": friendship.RequesterID,
		"addressee_id": friendship.AddresseeID,
		"status":       friendship.Status,
		"username":     auth.GetUsername(c),
	})
	if event != nil {
		h.hub.SendToUser(friendship.AddresseeID, event)
	}

	return c.Status(fiber.StatusCreated).JSON(friendship)
}

func (h *FriendHandler) AcceptRequest(c fiber.Ctx) error {
	friendshipID, err := uuid.Parse(c.Params("id"))
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid friendship ID"})
	}

	userID := auth.GetUserID(c)
	if err := h.friendService.AcceptRequest(c.Context(), friendshipID, userID); err != nil {
		return handleFriendError(c, err)
	}

	// Notify requester
	event, _ := ws.NewEvent(ws.EventFriendRequestAccept, fiber.Map{
		"id":      friendshipID,
		"user_id": userID,
		"username": auth.GetUsername(c),
	})
	if event != nil {
		// We need to get the requester ID to notify them
		friends, _ := h.friendService.GetFriends(c.Context(), userID)
		for _, f := range friends {
			if f.ID == friendshipID {
				otherID := f.RequesterID
				if otherID == userID {
					otherID = f.AddresseeID
				}
				h.hub.SendToUser(otherID, event)
				break
			}
		}
	}

	return c.JSON(fiber.Map{"message": "accepted"})
}

func (h *FriendHandler) DeclineRequest(c fiber.Ctx) error {
	friendshipID, err := uuid.Parse(c.Params("id"))
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid friendship ID"})
	}

	userID := auth.GetUserID(c)
	if err := h.friendService.DeclineRequest(c.Context(), friendshipID, userID); err != nil {
		return handleFriendError(c, err)
	}

	return c.JSON(fiber.Map{"message": "declined"})
}

func (h *FriendHandler) RemoveFriend(c fiber.Ctx) error {
	friendshipID, err := uuid.Parse(c.Params("id"))
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid friendship ID"})
	}

	userID := auth.GetUserID(c)
	if err := h.friendService.RemoveFriend(c.Context(), friendshipID, userID); err != nil {
		return handleFriendError(c, err)
	}

	// Broadcast removal
	event, _ := ws.NewEvent(ws.EventFriendRemove, fiber.Map{
		"id":      friendshipID,
		"user_id": userID,
	})
	if event != nil {
		// Send to the current user at least
		h.hub.SendToUser(userID, event)
	}

	return c.JSON(fiber.Map{"message": "removed"})
}

func (h *FriendHandler) BlockUser(c fiber.Ctx) error {
	blockedID, err := uuid.Parse(c.Params("id"))
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid user ID"})
	}

	userID := auth.GetUserID(c)
	if err := h.friendService.BlockUser(c.Context(), userID, blockedID); err != nil {
		return handleFriendError(c, err)
	}

	return c.JSON(fiber.Map{"message": "blocked"})
}

func (h *FriendHandler) UnblockUser(c fiber.Ctx) error {
	blockedID, err := uuid.Parse(c.Params("id"))
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid user ID"})
	}

	userID := auth.GetUserID(c)
	if err := h.friendService.UnblockUser(c.Context(), userID, blockedID); err != nil {
		return handleFriendError(c, err)
	}

	return c.JSON(fiber.Map{"message": "unblocked"})
}

func (h *FriendHandler) GetFriends(c fiber.Ctx) error {
	userID := auth.GetUserID(c)
	friends, err := h.friendService.GetFriends(c.Context(), userID)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "failed to get friends"})
	}
	return c.JSON(friends)
}

func (h *FriendHandler) GetPendingRequests(c fiber.Ctx) error {
	userID := auth.GetUserID(c)
	requests, err := h.friendService.GetPendingRequests(c.Context(), userID)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "failed to get pending requests"})
	}
	return c.JSON(requests)
}

func (h *FriendHandler) GetBlockedUsers(c fiber.Ctx) error {
	userID := auth.GetUserID(c)
	blockedIDs, err := h.friendService.GetBlockedUserIDs(c.Context(), userID)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "failed to get blocked users"})
	}
	// Return as string array for frontend consumption
	ids := make([]string, len(blockedIDs))
	for i, id := range blockedIDs {
		ids[i] = id.String()
	}
	return c.JSON(ids)
}

func handleFriendError(c fiber.Ctx, err error) error {
	switch {
	case errors.Is(err, service.ErrFriendshipNotFound):
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": err.Error()})
	case errors.Is(err, service.ErrAlreadyFriends):
		return c.Status(fiber.StatusConflict).JSON(fiber.Map{"error": err.Error()})
	case errors.Is(err, service.ErrCannotFriendSelf):
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": err.Error()})
	case errors.Is(err, service.ErrUserBlocked):
		return c.Status(fiber.StatusForbidden).JSON(fiber.Map{"error": err.Error()})
	case errors.Is(err, service.ErrUserNotFound):
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": err.Error()})
	case errors.Is(err, service.ErrNotPending):
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": err.Error()})
	default:
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "internal server error"})
	}
}
