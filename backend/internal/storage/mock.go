package storage

import (
	"bytes"
	"context"
	"fmt"
	"io"
	"sync"

	"github.com/minio/minio-go/v7"
)

type MockStorage struct {
	mu              sync.Mutex
	Objects         map[string][]byte
	Uploads         map[string]string // uploadID → objectKey
	UploadErr       error
	StatSize        int64
	StatErr         error
	CompleteErr     error
	AbortCalled     bool
	AbortCalledWith string
	nextUploadID    int
}

func NewMockStorage() *MockStorage {
	return &MockStorage{
		Objects: make(map[string][]byte),
		Uploads: make(map[string]string),
	}
}

func (m *MockStorage) Upload(_ context.Context, objectKey, _ string, reader io.Reader, _ int64) error {
	if m.UploadErr != nil {
		return m.UploadErr
	}
	data, err := io.ReadAll(reader)
	if err != nil {
		return err
	}
	m.mu.Lock()
	m.Objects[objectKey] = data
	m.mu.Unlock()
	return nil
}

func (m *MockStorage) GetObject(_ context.Context, objectKey string) (*minio.Object, error) {
	// MockStorage can't return a real *minio.Object; tests that need GetObject
	// should use a different approach. This satisfies the interface.
	return nil, fmt.Errorf("mock: GetObject not implemented, use GetObjectData instead")
}

func (m *MockStorage) GetObjectData(objectKey string) ([]byte, bool) {
	m.mu.Lock()
	defer m.mu.Unlock()
	data, ok := m.Objects[objectKey]
	return data, ok
}

func (m *MockStorage) GetPresignedURL(_ context.Context, objectKey string) (string, error) {
	return fmt.Sprintf("https://mock-minio/presigned/%s", objectKey), nil
}

func (m *MockStorage) Delete(_ context.Context, objectKey string) error {
	m.mu.Lock()
	delete(m.Objects, objectKey)
	m.mu.Unlock()
	return nil
}

func (m *MockStorage) StatObject(_ context.Context, objectKey string) (minio.ObjectInfo, error) {
	if m.StatErr != nil {
		return minio.ObjectInfo{}, m.StatErr
	}
	return minio.ObjectInfo{
		Key:  objectKey,
		Size: m.StatSize,
	}, nil
}

func (m *MockStorage) NewMultipartUpload(_ context.Context, objectKey, _ string) (string, error) {
	if m.UploadErr != nil {
		return "", m.UploadErr
	}
	m.mu.Lock()
	m.nextUploadID++
	uploadID := fmt.Sprintf("mock-upload-%d", m.nextUploadID)
	m.Uploads[uploadID] = objectKey
	m.mu.Unlock()
	return uploadID, nil
}

func (m *MockStorage) PresignedUploadPartURL(_ context.Context, objectKey, uploadID string, partNumber int) (string, error) {
	return fmt.Sprintf("https://mock-minio/%s?partNumber=%d&uploadId=%s", objectKey, partNumber, uploadID), nil
}

func (m *MockStorage) CompleteMultipartUpload(_ context.Context, objectKey, uploadID string, _ []minio.CompletePart) error {
	if m.CompleteErr != nil {
		return m.CompleteErr
	}
	m.mu.Lock()
	// Simulate the completed object existing
	if _, ok := m.Objects[objectKey]; !ok {
		m.Objects[objectKey] = []byte{}
	}
	m.mu.Unlock()
	return nil
}

func (m *MockStorage) AbortMultipartUpload(_ context.Context, objectKey, uploadID string) error {
	m.mu.Lock()
	m.AbortCalled = true
	m.AbortCalledWith = uploadID
	m.mu.Unlock()
	return nil
}

// Compile-time interface check
var _ ObjectStorage = (*MockStorage)(nil)
var _ ObjectStorage = (*Client)(nil)

// ignore unused import
var _ = bytes.NewReader
