package models

import (
	"context"
	"time"

	"github.com/google/uuid"
)

func (q *Queries) GetLinkPreview(ctx context.Context, url string) (LinkPreview, error) {
	var lp LinkPreview
	err := q.db.QueryRow(ctx,
		`SELECT id, url, title, description, image_url, site_name, fetched_at
		FROM link_previews WHERE url = $1`, url,
	).Scan(&lp.ID, &lp.URL, &lp.Title, &lp.Description, &lp.ImageURL, &lp.SiteName, &lp.FetchedAt)
	return lp, err
}

func (q *Queries) UpsertLinkPreview(ctx context.Context, url string, title, description, imageURL, siteName *string) (LinkPreview, error) {
	var lp LinkPreview
	err := q.db.QueryRow(ctx,
		`INSERT INTO link_previews (url, title, description, image_url, site_name)
		VALUES ($1, $2, $3, $4, $5)
		ON CONFLICT (url) DO UPDATE SET
			title = $2, description = $3, image_url = $4, site_name = $5, fetched_at = NOW()
		RETURNING id, url, title, description, image_url, site_name, fetched_at`,
		url, title, description, imageURL, siteName,
	).Scan(&lp.ID, &lp.URL, &lp.Title, &lp.Description, &lp.ImageURL, &lp.SiteName, &lp.FetchedAt)
	return lp, err
}

// GetLinkPreviewByID fetches by primary key.
func (q *Queries) GetLinkPreviewByID(ctx context.Context, id uuid.UUID) (LinkPreview, error) {
	var lp LinkPreview
	err := q.db.QueryRow(ctx,
		`SELECT id, url, title, description, image_url, site_name, fetched_at
		FROM link_previews WHERE id = $1`, id,
	).Scan(&lp.ID, &lp.URL, &lp.Title, &lp.Description, &lp.ImageURL, &lp.SiteName, &lp.FetchedAt)
	return lp, err
}

// IsLinkPreviewStale checks whether the cached preview is older than maxAge.
func IsLinkPreviewStale(lp LinkPreview, maxAge time.Duration) bool {
	return time.Since(lp.FetchedAt) > maxAge
}
