package handler

import (
	"errors"
	"log"
	"time"

	"github.com/gofiber/fiber/v3"
	"github.com/google/uuid"

	"github.com/M-McCallum/thicket/internal/auth"
	"github.com/M-McCallum/thicket/internal/models"
	"github.com/M-McCallum/thicket/internal/service"
	"github.com/M-McCallum/thicket/internal/ws"
)

type EventHandler struct {
	eventSvc  *service.EventService
	serverSvc *service.ServerService
	hub       *ws.Hub
}

func NewEventHandler(es *service.EventService, ss *service.ServerService, hub *ws.Hub) *EventHandler {
	return &EventHandler{eventSvc: es, serverSvc: ss, hub: hub}
}

func (h *EventHandler) CreateEvent(c fiber.Ctx) error {
	serverID, err := uuid.Parse(c.Params("id"))
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid server ID"})
	}

	var body struct {
		Name             string  `json:"name"`
		Description      string  `json:"description"`
		LocationType     string  `json:"location_type"`
		ChannelID        *string `json:"channel_id"`
		ExternalLocation string  `json:"external_location"`
		StartTime        string  `json:"start_time"`
		EndTime          *string `json:"end_time"`
		ImageURL         *string `json:"image_url"`
	}
	if err := c.Bind().JSON(&body); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid request body"})
	}

	startTime, err := time.Parse(time.RFC3339, body.StartTime)
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid start_time format (use RFC3339)"})
	}

	var endTime *time.Time
	if body.EndTime != nil && *body.EndTime != "" {
		t, err := time.Parse(time.RFC3339, *body.EndTime)
		if err != nil {
			return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid end_time format (use RFC3339)"})
		}
		endTime = &t
	}

	var channelID *uuid.UUID
	if body.ChannelID != nil && *body.ChannelID != "" {
		id, err := uuid.Parse(*body.ChannelID)
		if err != nil {
			return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid channel_id"})
		}
		channelID = &id
	}

	userID := auth.GetUserID(c)
	event, err := h.eventSvc.CreateEvent(c.Context(), serverID, userID, body.Name, body.Description, body.LocationType, channelID, body.ExternalLocation, startTime, endTime, body.ImageURL)
	if err != nil {
		return handleEventError(c, err)
	}

	h.broadcastToServer(c, serverID, ws.EventEventCreate, event)
	return c.Status(fiber.StatusCreated).JSON(event)
}

func (h *EventHandler) GetServerEvents(c fiber.Ctx) error {
	serverID, err := uuid.Parse(c.Params("id"))
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid server ID"})
	}

	userID := auth.GetUserID(c)
	events, err := h.eventSvc.GetServerEvents(c.Context(), serverID, userID)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "failed to get events"})
	}

	return c.JSON(events)
}

func (h *EventHandler) GetEvent(c fiber.Ctx) error {
	eventID, err := uuid.Parse(c.Params("eventId"))
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid event ID"})
	}

	userID := auth.GetUserID(c)
	event, err := h.eventSvc.GetEvent(c.Context(), eventID, userID)
	if err != nil {
		return handleEventError(c, err)
	}

	return c.JSON(event)
}

func (h *EventHandler) UpdateEvent(c fiber.Ctx) error {
	serverID, err := uuid.Parse(c.Params("id"))
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid server ID"})
	}

	eventID, err := uuid.Parse(c.Params("eventId"))
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid event ID"})
	}

	var body struct {
		Name             *string `json:"name"`
		Description      *string `json:"description"`
		LocationType     *string `json:"location_type"`
		ChannelID        *string `json:"channel_id"`
		ExternalLocation *string `json:"external_location"`
		StartTime        *string `json:"start_time"`
		EndTime          *string `json:"end_time"`
		Status           *string `json:"status"`
	}
	if err := c.Bind().JSON(&body); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid request body"})
	}

	arg := models.UpdateEventParams{}

	arg.Name = body.Name
	arg.Description = body.Description
	arg.LocationType = body.LocationType
	arg.ExternalLocation = body.ExternalLocation
	arg.Status = body.Status

	if body.ChannelID != nil {
		id, err := uuid.Parse(*body.ChannelID)
		if err != nil {
			return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid channel_id"})
		}
		arg.ChannelID = &id
	}

	if body.StartTime != nil {
		t, err := time.Parse(time.RFC3339, *body.StartTime)
		if err != nil {
			return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid start_time format"})
		}
		arg.StartTime = &t
	}

	if body.EndTime != nil {
		t, err := time.Parse(time.RFC3339, *body.EndTime)
		if err != nil {
			return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid end_time format"})
		}
		arg.EndTime = &t
	}

	userID := auth.GetUserID(c)
	event, err := h.eventSvc.UpdateEvent(c.Context(), eventID, userID, arg)
	if err != nil {
		return handleEventError(c, err)
	}

	h.broadcastToServer(c, serverID, ws.EventEventUpdate, event)
	return c.JSON(event)
}

func (h *EventHandler) DeleteEvent(c fiber.Ctx) error {
	serverID, err := uuid.Parse(c.Params("id"))
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid server ID"})
	}

	eventID, err := uuid.Parse(c.Params("eventId"))
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid event ID"})
	}

	userID := auth.GetUserID(c)
	if err := h.eventSvc.DeleteEvent(c.Context(), eventID, userID); err != nil {
		return handleEventError(c, err)
	}

	h.broadcastToServer(c, serverID, ws.EventEventDelete, fiber.Map{
		"id":        eventID,
		"server_id": serverID,
	})
	return c.JSON(fiber.Map{"message": "event deleted"})
}

func (h *EventHandler) RSVP(c fiber.Ctx) error {
	serverID, err := uuid.Parse(c.Params("id"))
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid server ID"})
	}

	eventID, err := uuid.Parse(c.Params("eventId"))
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid event ID"})
	}

	var body struct {
		Status string `json:"status"`
	}
	if err := c.Bind().JSON(&body); err != nil || body.Status == "" {
		body.Status = "interested"
	}

	userID := auth.GetUserID(c)
	if err := h.eventSvc.RSVP(c.Context(), eventID, userID, body.Status); err != nil {
		return handleEventError(c, err)
	}

	h.broadcastToServer(c, serverID, ws.EventEventUpdate, fiber.Map{
		"id":        eventID,
		"server_id": serverID,
		"rsvp":      true,
	})
	return c.JSON(fiber.Map{"message": "rsvp recorded"})
}

func (h *EventHandler) RemoveRSVP(c fiber.Ctx) error {
	serverID, err := uuid.Parse(c.Params("id"))
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid server ID"})
	}

	eventID, err := uuid.Parse(c.Params("eventId"))
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid event ID"})
	}

	userID := auth.GetUserID(c)
	if err := h.eventSvc.RemoveRSVP(c.Context(), eventID, userID); err != nil {
		return handleEventError(c, err)
	}

	h.broadcastToServer(c, serverID, ws.EventEventUpdate, fiber.Map{
		"id":        eventID,
		"server_id": serverID,
		"rsvp":      true,
	})
	return c.JSON(fiber.Map{"message": "rsvp removed"})
}

func (h *EventHandler) broadcastToServer(c fiber.Ctx, serverID uuid.UUID, eventType string, data any) {
	memberIDs, err := h.serverSvc.GetServerMemberUserIDs(c.Context(), serverID)
	if err != nil {
		log.Printf("Failed to get member IDs for %s broadcast: %v", eventType, err)
		return
	}
	event, err := ws.NewEvent(eventType, data)
	if err != nil {
		log.Printf("Failed to create %s event: %v", eventType, err)
		return
	}
	ws.BroadcastToServerMembers(h.hub, memberIDs, event, nil)
}

func handleEventError(c fiber.Ctx, err error) error {
	switch {
	case errors.Is(err, service.ErrEventNotFound):
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": err.Error()})
	case errors.Is(err, service.ErrInvalidEventName):
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": err.Error()})
	case errors.Is(err, service.ErrInvalidStartTime):
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": err.Error()})
	case errors.Is(err, service.ErrInvalidLocationType):
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": err.Error()})
	case errors.Is(err, service.ErrInsufficientRole):
		return c.Status(fiber.StatusForbidden).JSON(fiber.Map{"error": err.Error()})
	case errors.Is(err, service.ErrNotMember):
		return c.Status(fiber.StatusForbidden).JSON(fiber.Map{"error": err.Error()})
	default:
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "internal server error"})
	}
}
