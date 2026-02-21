package storage

import (
	"context"
	"fmt"
	"io"
	"net/url"
	"time"

	"github.com/minio/minio-go/v7"
	"github.com/minio/minio-go/v7/pkg/credentials"
)

type Client struct {
	client         *minio.Client
	core           minio.Core
	bucket         string
	publicEndpoint string // browser-reachable base URL; if empty, presigned URLs use the default minio endpoint
}

func NewClient(endpoint, accessKey, secretKey, bucket string, useSSL bool) (*Client, error) {
	mc, err := minio.New(endpoint, &minio.Options{
		Creds:  credentials.NewStaticV4(accessKey, secretKey, ""),
		Secure: useSSL,
	})
	if err != nil {
		return nil, fmt.Errorf("minio client: %w", err)
	}
	return &Client{client: mc, core: minio.Core{Client: mc}, bucket: bucket}, nil
}

// SetPublicEndpoint sets a browser-reachable base URL (e.g. "https://chat.example.com/storage")
// for rewriting presigned URLs so browsers can reach MinIO through a reverse proxy.
func (c *Client) SetPublicEndpoint(publicEndpoint string) {
	c.publicEndpoint = publicEndpoint
}

// rewritePresignedURL replaces the internal MinIO host in a presigned URL with the
// public endpoint so browsers can reach it. If no public endpoint is configured,
// the URL is returned unchanged.
func (c *Client) rewritePresignedURL(raw string) (string, error) {
	if c.publicEndpoint == "" {
		return raw, nil
	}

	parsed, err := url.Parse(raw)
	if err != nil {
		return "", fmt.Errorf("parse presigned URL: %w", err)
	}

	pub, err := url.Parse(c.publicEndpoint)
	if err != nil {
		return "", fmt.Errorf("parse public endpoint: %w", err)
	}

	parsed.Scheme = pub.Scheme
	parsed.Host = pub.Host
	parsed.Path = pub.Path + parsed.Path

	return parsed.String(), nil
}

func (c *Client) EnsureBucket(ctx context.Context) error {
	exists, err := c.client.BucketExists(ctx, c.bucket)
	if err != nil {
		return fmt.Errorf("check bucket: %w", err)
	}
	if !exists {
		if err := c.client.MakeBucket(ctx, c.bucket, minio.MakeBucketOptions{}); err != nil {
			return fmt.Errorf("create bucket: %w", err)
		}
	}
	return nil
}

func (c *Client) Upload(ctx context.Context, objectKey, contentType string, reader io.Reader, size int64) error {
	_, err := c.client.PutObject(ctx, c.bucket, objectKey, reader, size, minio.PutObjectOptions{
		ContentType: contentType,
	})
	return err
}

func (c *Client) Delete(ctx context.Context, objectKey string) error {
	return c.client.RemoveObject(ctx, c.bucket, objectKey, minio.RemoveObjectOptions{})
}

func (c *Client) GetPresignedURL(ctx context.Context, objectKey string) (string, error) {
	u, err := c.client.PresignedGetObject(ctx, c.bucket, objectKey, 15*time.Minute, url.Values{})
	if err != nil {
		return "", err
	}
	return c.rewritePresignedURL(u.String())
}

func (c *Client) GetObject(ctx context.Context, objectKey string) (*minio.Object, error) {
	return c.client.GetObject(ctx, c.bucket, objectKey, minio.GetObjectOptions{})
}

func (c *Client) StatObject(ctx context.Context, objectKey string) (minio.ObjectInfo, error) {
	return c.client.StatObject(ctx, c.bucket, objectKey, minio.StatObjectOptions{})
}

func (c *Client) NewMultipartUpload(ctx context.Context, objectKey, contentType string) (string, error) {
	uploadID, err := c.core.NewMultipartUpload(ctx, c.bucket, objectKey, minio.PutObjectOptions{
		ContentType: contentType,
	})
	return uploadID, err
}

func (c *Client) PresignedUploadPartURL(ctx context.Context, objectKey, uploadID string, partNumber int) (string, error) {
	params := url.Values{}
	params.Set("partNumber", fmt.Sprintf("%d", partNumber))
	params.Set("uploadId", uploadID)

	u, err := c.client.Presign(ctx, "PUT", c.bucket, objectKey, time.Hour, params)
	if err != nil {
		return "", err
	}
	return c.rewritePresignedURL(u.String())
}

func (c *Client) CompleteMultipartUpload(ctx context.Context, objectKey, uploadID string, parts []minio.CompletePart) error {
	_, err := c.core.CompleteMultipartUpload(ctx, c.bucket, objectKey, uploadID, parts, minio.PutObjectOptions{})
	return err
}

func (c *Client) AbortMultipartUpload(ctx context.Context, objectKey, uploadID string) error {
	return c.core.AbortMultipartUpload(ctx, c.bucket, objectKey, uploadID)
}
