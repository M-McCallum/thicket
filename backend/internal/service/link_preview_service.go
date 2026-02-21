package service

import (
	"context"
	"errors"
	"io"
	"net"
	"net/http"
	"net/url"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
	"golang.org/x/net/html"

	"github.com/M-McCallum/thicket/internal/models"
)

var ErrSSRFBlocked = errors.New("URL blocked: private or internal address")

type LinkPreviewService struct {
	queries *models.Queries
	client  *http.Client
}

func NewLinkPreviewService(q *models.Queries) *LinkPreviewService {
	return &LinkPreviewService{
		queries: q,
		client: &http.Client{
			Timeout: 5 * time.Second,
			CheckRedirect: func(req *http.Request, via []*http.Request) error {
				if len(via) >= 3 {
					return errors.New("too many redirects")
				}
				return nil
			},
		},
	}
}

func (s *LinkPreviewService) FetchPreview(ctx context.Context, rawURL string) (*models.LinkPreview, error) {
	// Validate URL
	parsed, err := url.Parse(rawURL)
	if err != nil {
		return nil, errors.New("invalid URL")
	}
	if parsed.Scheme != "http" && parsed.Scheme != "https" {
		return nil, errors.New("only HTTP/HTTPS URLs supported")
	}

	// SSRF protection
	if isPrivateHost(parsed.Hostname()) {
		return nil, ErrSSRFBlocked
	}

	// Check DB cache (24h TTL)
	cached, err := s.queries.GetLinkPreview(ctx, rawURL)
	if err == nil && !models.IsLinkPreviewStale(cached, 24*time.Hour) {
		return &cached, nil
	}

	// Fetch the page
	req, err := http.NewRequestWithContext(ctx, "GET", rawURL, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("User-Agent", "Thicket/1.0 (link preview bot)")

	resp, err := s.client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode >= 400 {
		return nil, errors.New("failed to fetch URL")
	}

	// Only parse HTML
	contentType := resp.Header.Get("Content-Type")
	if !strings.Contains(contentType, "text/html") {
		return nil, errors.New("not an HTML page")
	}

	// Limit read to 1MB
	limited := io.LimitReader(resp.Body, 1024*1024)
	og := parseOpenGraph(limited)

	lp, err := s.queries.UpsertLinkPreview(ctx, rawURL, og.Title, og.Description, og.Image, og.SiteName)
	if err != nil {
		// If upsert fails but we have cached, return cached
		if !errors.Is(err, pgx.ErrNoRows) && cached.URL != "" {
			return &cached, nil
		}
		return nil, err
	}

	return &lp, nil
}

type ogMeta struct {
	Title       *string
	Description *string
	Image       *string
	SiteName    *string
}

func parseOpenGraph(r io.Reader) ogMeta {
	var og ogMeta
	z := html.NewTokenizer(r)

	for {
		tt := z.Next()
		if tt == html.ErrorToken {
			break
		}
		if tt == html.StartTagToken || tt == html.SelfClosingTagToken {
			tn, hasAttr := z.TagName()
			if string(tn) != "meta" || !hasAttr {
				// Stop after </head>
				if string(tn) == "body" {
					break
				}
				continue
			}

			var property, content string
			for {
				key, val, more := z.TagAttr()
				k := string(key)
				v := string(val)
				if k == "property" || k == "name" {
					property = v
				}
				if k == "content" {
					content = v
				}
				if !more {
					break
				}
			}

			if content == "" {
				continue
			}

			switch property {
			case "og:title":
				og.Title = &content
			case "og:description":
				og.Description = &content
			case "og:image":
				og.Image = &content
			case "og:site_name":
				og.SiteName = &content
			}
		}
	}

	return og
}

func isPrivateHost(host string) bool {
	// Block common private/internal hostnames
	lower := strings.ToLower(host)
	if lower == "localhost" || lower == "127.0.0.1" || lower == "::1" || lower == "0.0.0.0" {
		return true
	}
	if strings.HasSuffix(lower, ".local") || strings.HasSuffix(lower, ".internal") {
		return true
	}

	ip := net.ParseIP(host)
	if ip == nil {
		return false
	}

	privateRanges := []struct {
		network string
	}{
		{"10.0.0.0/8"},
		{"172.16.0.0/12"},
		{"192.168.0.0/16"},
		{"169.254.0.0/16"},
		{"fc00::/7"},
		{"fe80::/10"},
	}

	for _, r := range privateRanges {
		_, cidr, _ := net.ParseCIDR(r.network)
		if cidr.Contains(ip) {
			return true
		}
	}

	return false
}
