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
	client *minio.Client
	bucket string
}

func NewClient(endpoint, accessKey, secretKey, bucket string, useSSL bool) (*Client, error) {
	mc, err := minio.New(endpoint, &minio.Options{
		Creds:  credentials.NewStaticV4(accessKey, secretKey, ""),
		Secure: useSSL,
	})
	if err != nil {
		return nil, fmt.Errorf("minio client: %w", err)
	}
	return &Client{client: mc, bucket: bucket}, nil
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
	u, err := c.client.PresignedGetObject(ctx, c.bucket, objectKey, time.Hour, url.Values{})
	if err != nil {
		return "", err
	}
	return u.String(), nil
}

func (c *Client) GetObject(ctx context.Context, objectKey string) (*minio.Object, error) {
	return c.client.GetObject(ctx, c.bucket, objectKey, minio.GetObjectOptions{})
}
