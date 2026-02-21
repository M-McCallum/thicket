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
	offset := c.Query("offset", "0")

	params := url.Values{
		"api_key": {h.apiKey},
		"q":       {q},
		"limit":   {limit},
		"offset":  {offset},
		"rating":  {"pg-13"},
	}

	return h.proxyGiphy(c, "https://api.giphy.com/v1/gifs/search?"+params.Encode())
}

func (h *GifHandler) Trending(c fiber.Ctx) error {
	limit := c.Query("limit", "20")
	offset := c.Query("offset", "0")

	params := url.Values{
		"api_key": {h.apiKey},
		"limit":   {limit},
		"offset":  {offset},
		"rating":  {"pg-13"},
	}

	return h.proxyGiphy(c, "https://api.giphy.com/v1/gifs/trending?"+params.Encode())
}

func (h *GifHandler) proxyGiphy(c fiber.Ctx, giphyURL string) error {
	resp, err := http.Get(giphyURL)
	if err != nil {
		return c.Status(fiber.StatusBadGateway).JSON(fiber.Map{"error": "failed to fetch GIFs"})
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "failed to read response"})
	}

	if resp.StatusCode != 200 {
		return c.Status(fiber.StatusBadGateway).JSON(fiber.Map{"error": fmt.Sprintf("GIPHY API error: %d", resp.StatusCode)})
	}

	var result json.RawMessage
	if err := json.Unmarshal(body, &result); err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "invalid GIPHY response"})
	}

	c.Set("Content-Type", "application/json")
	return c.Send(body)
}
