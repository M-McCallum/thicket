package storage

import (
	"context"
	"io"

	"github.com/minio/minio-go/v7"
)

type ObjectStorage interface {
	Upload(ctx context.Context, objectKey, contentType string, reader io.Reader, size int64) error
	GetObject(ctx context.Context, objectKey string) (*minio.Object, error)
	GetPresignedURL(ctx context.Context, objectKey string) (string, error)
	Delete(ctx context.Context, objectKey string) error
	StatObject(ctx context.Context, objectKey string) (minio.ObjectInfo, error)
	NewMultipartUpload(ctx context.Context, objectKey, contentType string) (string, error)
	PresignedUploadPartURL(ctx context.Context, objectKey, uploadID string, partNumber int) (string, error)
	CompleteMultipartUpload(ctx context.Context, objectKey, uploadID string, parts []minio.CompletePart) error
	AbortMultipartUpload(ctx context.Context, objectKey, uploadID string) error
}
