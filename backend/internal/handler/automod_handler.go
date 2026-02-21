package handler

import (
	"encoding/json"
	"errors"

	"github.com/gofiber/fiber/v3"
	"github.com/google/uuid"

	"github.com/M-McCallum/thicket/internal/auth"
	"github.com/M-McCallum/thicket/internal/models"
	"github.com/M-McCallum/thicket/internal/service"
)

type AutoModHandler struct {
	automodSvc *service.AutoModService
}

func NewAutoModHandler(as *service.AutoModService) *AutoModHandler {
	return &AutoModHandler{automodSvc: as}
}

func (h *AutoModHandler) ListRules(c fiber.Ctx) error {
	serverID, err := uuid.Parse(c.Params("id"))
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid server ID"})
	}

	userID := auth.GetUserID(c)
	rules, err := h.automodSvc.ListRules(c.Context(), serverID, userID)
	if err != nil {
		return handleAutoModError(c, err)
	}

	return c.JSON(rules)
}

func (h *AutoModHandler) CreateRule(c fiber.Ctx) error {
	serverID, err := uuid.Parse(c.Params("id"))
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid server ID"})
	}

	var body struct {
		Name           string          `json:"name"`
		Type           string          `json:"type"`
		TriggerData    json.RawMessage `json:"trigger_data"`
		Action         string          `json:"action"`
		ActionMetadata json.RawMessage `json:"action_metadata"`
		Enabled        *bool           `json:"enabled"`
		ExemptRoles    []string        `json:"exempt_roles"`
		ExemptChannels []string        `json:"exempt_channels"`
	}
	if err := c.Bind().JSON(&body); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid request body"})
	}

	if body.Name == "" || body.Type == "" || body.Action == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "name, type, and action are required"})
	}

	enabled := true
	if body.Enabled != nil {
		enabled = *body.Enabled
	}

	exemptRoles := parseUUIDs(body.ExemptRoles)
	exemptChannels := parseUUIDs(body.ExemptChannels)

	userID := auth.GetUserID(c)
	rule, err := h.automodSvc.CreateRule(c.Context(), serverID, userID, models.CreateAutoModRuleParams{
		Name:           body.Name,
		Type:           body.Type,
		TriggerData:    body.TriggerData,
		Action:         body.Action,
		ActionMetadata: body.ActionMetadata,
		Enabled:        enabled,
		ExemptRoles:    exemptRoles,
		ExemptChannels: exemptChannels,
	})
	if err != nil {
		return handleAutoModError(c, err)
	}

	return c.Status(fiber.StatusCreated).JSON(rule)
}

func (h *AutoModHandler) UpdateRule(c fiber.Ctx) error {
	serverID, err := uuid.Parse(c.Params("id"))
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid server ID"})
	}

	ruleID, err := uuid.Parse(c.Params("ruleId"))
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid rule ID"})
	}

	var body struct {
		Name           *string         `json:"name"`
		TriggerData    json.RawMessage `json:"trigger_data"`
		Action         *string         `json:"action"`
		ActionMetadata json.RawMessage `json:"action_metadata"`
		Enabled        *bool           `json:"enabled"`
		ExemptRoles    *[]string       `json:"exempt_roles"`
		ExemptChannels *[]string       `json:"exempt_channels"`
	}
	if err := c.Bind().JSON(&body); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid request body"})
	}

	params := models.UpdateAutoModRuleParams{
		Name:           body.Name,
		TriggerData:    body.TriggerData,
		Action:         body.Action,
		ActionMetadata: body.ActionMetadata,
		Enabled:        body.Enabled,
	}

	if body.ExemptRoles != nil {
		params.ExemptRoles = parseUUIDs(*body.ExemptRoles)
	}
	if body.ExemptChannels != nil {
		params.ExemptChannels = parseUUIDs(*body.ExemptChannels)
	}

	userID := auth.GetUserID(c)
	rule, err := h.automodSvc.UpdateRule(c.Context(), serverID, ruleID, userID, params)
	if err != nil {
		return handleAutoModError(c, err)
	}

	return c.JSON(rule)
}

func (h *AutoModHandler) DeleteRule(c fiber.Ctx) error {
	serverID, err := uuid.Parse(c.Params("id"))
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid server ID"})
	}

	ruleID, err := uuid.Parse(c.Params("ruleId"))
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid rule ID"})
	}

	userID := auth.GetUserID(c)
	if err := h.automodSvc.DeleteRule(c.Context(), serverID, ruleID, userID); err != nil {
		return handleAutoModError(c, err)
	}

	return c.JSON(fiber.Map{"message": "rule deleted"})
}

func parseUUIDs(strs []string) []uuid.UUID {
	ids := make([]uuid.UUID, 0, len(strs))
	for _, s := range strs {
		if id, err := uuid.Parse(s); err == nil {
			ids = append(ids, id)
		}
	}
	return ids
}

func handleAutoModError(c fiber.Ctx, err error) error {
	switch {
	case errors.Is(err, service.ErrAutoModRuleNotFound):
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": err.Error()})
	case errors.Is(err, service.ErrInvalidRuleType):
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": err.Error()})
	case errors.Is(err, service.ErrInvalidRegexPattern):
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": err.Error()})
	case errors.Is(err, service.ErrInsufficientRole):
		return c.Status(fiber.StatusForbidden).JSON(fiber.Map{"error": err.Error()})
	case errors.Is(err, service.ErrNotMember):
		return c.Status(fiber.StatusForbidden).JSON(fiber.Map{"error": err.Error()})
	default:
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "internal server error"})
	}
}
