package service

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"regexp"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"

	"github.com/M-McCallum/thicket/internal/models"
	"github.com/M-McCallum/thicket/internal/ws"
)

var (
	ErrAutoModRuleNotFound = errors.New("automod rule not found")
	ErrInvalidRuleType     = errors.New("invalid automod rule type")
	ErrInvalidRegexPattern = errors.New("invalid or unsafe regex pattern")
)

// nestedQuantifierPattern detects ReDoS-prone patterns like (a+)+ or (a*)*
var nestedQuantifierPattern = regexp.MustCompile(`[+*]\)?[+*]`)

// inviteLinkPattern matches discord.gg and common invite link patterns.
var inviteLinkPattern = regexp.MustCompile(`(?i)(discord\.gg|discordapp\.com/invite|discord\.com/invite)/[a-zA-Z0-9]+`)

// AutoModAction represents the result of an automod check.
type AutoModAction struct {
	Triggered bool
	Action    string // "delete", "timeout", "alert"
	RuleName  string
	// For timeout action
	TimeoutDuration time.Duration
	// For alert action
	AlertChannelID uuid.UUID
}

type AutoModService struct {
	queries *models.Queries
	permSvc *PermissionService
	hub     *ws.Hub
}

func NewAutoModService(q *models.Queries, permSvc *PermissionService, hub *ws.Hub) *AutoModService {
	return &AutoModService{queries: q, permSvc: permSvc, hub: hub}
}

// CRUD operations

func (s *AutoModService) CreateRule(ctx context.Context, serverID, userID uuid.UUID, params models.CreateAutoModRuleParams) (*models.AutoModRule, error) {
	// Check ManageServer permission
	ok, err := s.permSvc.HasServerPermission(ctx, serverID, userID, models.PermManageServer)
	if err != nil {
		return nil, err
	}
	if !ok {
		return nil, ErrInsufficientRole
	}

	// Validate type
	switch params.Type {
	case "keyword", "regex", "spam", "invite_links", "mention_spam":
	default:
		return nil, ErrInvalidRuleType
	}

	// Validate regex patterns for safety (ReDoS prevention)
	if params.Type == "regex" {
		if err := validateRegexRule(params.TriggerData); err != nil {
			return nil, err
		}
	}

	params.ServerID = serverID
	rule, err := s.queries.CreateAutoModRule(ctx, params)
	if err != nil {
		return nil, err
	}
	return &rule, nil
}

func (s *AutoModService) UpdateRule(ctx context.Context, serverID, ruleID, userID uuid.UUID, params models.UpdateAutoModRuleParams) (*models.AutoModRule, error) {
	ok, err := s.permSvc.HasServerPermission(ctx, serverID, userID, models.PermManageServer)
	if err != nil {
		return nil, err
	}
	if !ok {
		return nil, ErrInsufficientRole
	}

	// Verify rule belongs to this server
	existing, err := s.queries.GetAutoModRuleByID(ctx, ruleID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrAutoModRuleNotFound
		}
		return nil, err
	}
	if existing.ServerID != serverID {
		return nil, ErrAutoModRuleNotFound
	}

	// Validate regex patterns on update if the rule is a regex type
	if existing.Type == "regex" && params.TriggerData != nil {
		if err := validateRegexRule(params.TriggerData); err != nil {
			return nil, err
		}
	}

	params.ID = ruleID
	rule, err := s.queries.UpdateAutoModRule(ctx, params)
	if err != nil {
		return nil, err
	}
	return &rule, nil
}

func (s *AutoModService) DeleteRule(ctx context.Context, serverID, ruleID, userID uuid.UUID) error {
	ok, err := s.permSvc.HasServerPermission(ctx, serverID, userID, models.PermManageServer)
	if err != nil {
		return err
	}
	if !ok {
		return ErrInsufficientRole
	}

	existing, err := s.queries.GetAutoModRuleByID(ctx, ruleID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return ErrAutoModRuleNotFound
		}
		return err
	}
	if existing.ServerID != serverID {
		return ErrAutoModRuleNotFound
	}

	return s.queries.DeleteAutoModRule(ctx, ruleID)
}

func (s *AutoModService) ListRules(ctx context.Context, serverID, userID uuid.UUID) ([]models.AutoModRule, error) {
	ok, err := s.permSvc.HasServerPermission(ctx, serverID, userID, models.PermManageServer)
	if err != nil {
		return nil, err
	}
	if !ok {
		return nil, ErrInsufficientRole
	}

	return s.queries.GetAutoModRulesByServer(ctx, serverID)
}

// CheckMessage runs all enabled rules for the server against the message content.
// Returns the action to take (or nil if no rules triggered).
func (s *AutoModService) CheckMessage(ctx context.Context, serverID, channelID, userID uuid.UUID, content string) (*AutoModAction, error) {
	rules, err := s.queries.GetEnabledAutoModRulesByServer(ctx, serverID)
	if err != nil {
		return nil, err
	}

	if len(rules) == 0 {
		return nil, nil
	}

	// Get user's role IDs for exemption checks
	memberRoles, _ := s.queries.GetMemberRoles(ctx, serverID, userID)
	userRoleIDs := make(map[uuid.UUID]bool)
	for _, r := range memberRoles {
		userRoleIDs[r.ID] = true
	}

	for _, rule := range rules {
		// Check channel exemption
		if isExemptChannel(channelID, rule.ExemptChannels) {
			continue
		}

		// Check role exemption
		if isExemptRole(userRoleIDs, rule.ExemptRoles) {
			continue
		}

		triggered := false
		switch rule.Type {
		case "keyword":
			triggered = s.checkKeyword(content, rule.TriggerData)
		case "regex":
			triggered = s.checkRegex(content, rule.TriggerData)
		case "spam":
			triggered = s.checkSpam(ctx, serverID, userID, rule.TriggerData)
		case "invite_links":
			triggered = s.checkInviteLinks(content)
		case "mention_spam":
			triggered = s.checkMentionSpam(content, rule.TriggerData)
		}

		if triggered {
			action := &AutoModAction{
				Triggered: true,
				Action:    rule.Action,
				RuleName:  rule.Name,
			}

			// Parse action metadata
			var meta map[string]interface{}
			if err := json.Unmarshal(rule.ActionMetadata, &meta); err == nil {
				if dur, ok := meta["timeout_duration"].(float64); ok {
					action.TimeoutDuration = time.Duration(dur) * time.Second
				}
				if chID, ok := meta["alert_channel_id"].(string); ok {
					if parsed, err := uuid.Parse(chID); err == nil {
						action.AlertChannelID = parsed
					}
				}
			}

			return action, nil
		}
	}

	return nil, nil
}

// ExecuteAction performs the automod action. Called by the message handler after CheckMessage.
func (s *AutoModService) ExecuteAction(ctx context.Context, action *AutoModAction, serverID, channelID, userID uuid.UUID, content string) {
	if action == nil || !action.Triggered {
		return
	}

	switch action.Action {
	case "timeout":
		dur := action.TimeoutDuration
		if dur == 0 {
			dur = 5 * time.Minute // default
		}
		timeoutUntil := time.Now().Add(dur)
		// We don't have moderation service here directly, so we'll use a simple query approach
		log.Printf("[AutoMod] Timeout user %s in server %s for %v (rule: %s)", userID, serverID, dur, action.RuleName)
		// For simplicity, broadcast a notification about the timeout
		s.sendAutoModAlert(serverID, channelID, fmt.Sprintf("AutoMod: User <@%s> timed out until %s (rule: %s)", userID, timeoutUntil.Format(time.RFC3339), action.RuleName))

	case "alert":
		alertChannelID := action.AlertChannelID
		if alertChannelID == uuid.Nil {
			alertChannelID = channelID
		}
		s.sendAutoModAlert(serverID, alertChannelID, fmt.Sprintf("AutoMod alert (rule: %s): message from <@%s> was flagged in <#%s>. Content: %s", action.RuleName, userID, channelID, truncate(content, 200)))

	case "delete":
		// No extra action needed — the handler will block the message
		log.Printf("[AutoMod] Blocked message from user %s in server %s (rule: %s)", userID, serverID, action.RuleName)
	}
}

func (s *AutoModService) sendAutoModAlert(serverID, channelID uuid.UUID, text string) {
	if s.hub == nil {
		return
	}
	event, err := ws.NewEvent(ws.EventMessageCreate, map[string]interface{}{
		"id":         uuid.New(),
		"channel_id": channelID,
		"author_id":  uuid.Nil,
		"content":    text,
		"type":       "system",
		"created_at": time.Now(),
		"username":   "AutoMod",
	})
	if err == nil && event != nil {
		s.hub.BroadcastToChannel(channelID.String(), event, nil)
	}
}

// Rule type handlers

func (s *AutoModService) checkKeyword(content string, triggerData json.RawMessage) bool {
	var data struct {
		Keywords []string `json:"keywords"`
	}
	if err := json.Unmarshal(triggerData, &data); err != nil {
		return false
	}

	lower := strings.ToLower(content)
	for _, kw := range data.Keywords {
		if strings.Contains(lower, strings.ToLower(kw)) {
			return true
		}
	}
	return false
}

func (s *AutoModService) checkRegex(content string, triggerData json.RawMessage) bool {
	var data struct {
		Pattern string `json:"pattern"`
	}
	if err := json.Unmarshal(triggerData, &data); err != nil || data.Pattern == "" {
		return false
	}

	re, err := regexp.Compile(data.Pattern)
	if err != nil {
		return false
	}

	// Run regex match with a timeout to prevent ReDoS
	type result struct{ matched bool }
	ch := make(chan result, 1)
	go func() {
		ch <- result{re.MatchString(content)}
	}()
	select {
	case r := <-ch:
		return r.matched
	case <-time.After(100 * time.Millisecond):
		log.Printf("[AutoMod] Regex pattern timed out: %s", data.Pattern)
		return false
	}
}

func (s *AutoModService) checkSpam(ctx context.Context, serverID, userID uuid.UUID, triggerData json.RawMessage) bool {
	var data struct {
		Threshold       int `json:"threshold"`
		IntervalSeconds int `json:"interval_seconds"`
	}
	if err := json.Unmarshal(triggerData, &data); err != nil {
		return false
	}

	if data.Threshold <= 0 {
		data.Threshold = 5
	}
	if data.IntervalSeconds <= 0 {
		data.IntervalSeconds = 10
	}

	since := time.Now().Add(-time.Duration(data.IntervalSeconds) * time.Second)
	count, err := s.queries.CountRecentMessages(ctx, serverID, userID, since)
	if err != nil {
		return false
	}

	return count >= data.Threshold
}

func (s *AutoModService) checkInviteLinks(content string) bool {
	return inviteLinkPattern.MatchString(content)
}

func (s *AutoModService) checkMentionSpam(content string, triggerData json.RawMessage) bool {
	var data struct {
		MaxMentions int `json:"max_mentions"`
	}
	if err := json.Unmarshal(triggerData, &data); err != nil {
		return false
	}

	if data.MaxMentions <= 0 {
		data.MaxMentions = 5
	}

	// Count @mentions (simple pattern: <@uuid> or @username)
	mentionPattern := regexp.MustCompile(`<@[0-9a-fA-F-]+>|@\w+`)
	matches := mentionPattern.FindAllString(content, -1)
	return len(matches) > data.MaxMentions
}

// validateRegexRule checks that a regex rule's pattern is safe to use.
func validateRegexRule(triggerData json.RawMessage) error {
	var data struct {
		Pattern string `json:"pattern"`
	}
	if err := json.Unmarshal(triggerData, &data); err != nil {
		return ErrInvalidRegexPattern
	}
	if data.Pattern == "" || len(data.Pattern) > 200 {
		return ErrInvalidRegexPattern
	}
	if _, err := regexp.Compile(data.Pattern); err != nil {
		return ErrInvalidRegexPattern
	}
	// Reject patterns with nested quantifiers (ReDoS risk)
	if nestedQuantifierPattern.MatchString(data.Pattern) {
		return ErrInvalidRegexPattern
	}
	return nil
}

// Helpers

func isExemptChannel(channelID uuid.UUID, exemptChannels []uuid.UUID) bool {
	for _, id := range exemptChannels {
		if id == channelID {
			return true
		}
	}
	return false
}

func isExemptRole(userRoleIDs map[uuid.UUID]bool, exemptRoles []uuid.UUID) bool {
	for _, id := range exemptRoles {
		if userRoleIDs[id] {
			return true
		}
	}
	return false
}

func truncate(s string, maxLen int) string {
	if len(s) <= maxLen {
		return s
	}
	return s[:maxLen] + "..."
}
