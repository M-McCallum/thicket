package handler

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"

	"github.com/gofiber/fiber/v3"
)

type GifHandler struct {
	apiKey string
}

func NewGifHandler(apiKey string) *GifHandler {
	return &GifHandler{apiKey: apiKey}
}

func (h *GifHandler) Search(c fiber.Ctx) error {
	q := c.Query("q")
	if q == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "query required"})
	}

	limit := c.Query("limit", "20")
	pos := c.Query("pos", "")

	params := url.Values{
		"key":        {h.apiKey},
		"q":          {q},
		"limit":      {limit},
		"media_filter": {"tinygif,gif"},
		"contentfilter": {"medium"},
	}
	if pos != "" {
		params.Set("pos", pos)
	}

	return h.proxyTenor(c, "https://tenor.googleapis.com/v2/search?"+params.Encode())
}

func (h *GifHandler) Trending(c fiber.Ctx) error {
	limit := c.Query("limit", "20")
	pos := c.Query("pos", "")

	params := url.Values{
		"key":        {h.apiKey},
		"limit":      {limit},
		"media_filter": {"tinygif,gif"},
		"contentfilter": {"medium"},
	}
	if pos != "" {
		params.Set("pos", pos)
	}

	return h.proxyTenor(c, "https://tenor.googleapis.com/v2/featured?"+params.Encode())
}

func (h *GifHandler) proxyTenor(c fiber.Ctx, tenorURL string) error {
	resp, err := http.Get(tenorURL)
	if err != nil {
		return c.Status(fiber.StatusBadGateway).JSON(fiber.Map{"error": "failed to fetch GIFs"})
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "failed to read response"})
	}

	if resp.StatusCode != 200 {
		return c.Status(fiber.StatusBadGateway).JSON(fiber.Map{"error": fmt.Sprintf("Tenor API error: %d", resp.StatusCode)})
	}

	var result json.RawMessage
	if err := json.Unmarshal(body, &result); err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "invalid Tenor response"})
	}

	c.Set("Content-Type", "application/json")
	return c.Send(body)
}
