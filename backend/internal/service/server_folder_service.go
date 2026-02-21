package service

import (
	"context"
	"errors"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"

	"github.com/M-McCallum/thicket/internal/models"
)

var (
	ErrFolderNotFound = errors.New("folder not found")
	ErrFolderForbidden = errors.New("you do not own this folder")
	ErrFolderNameRequired = errors.New("folder name is required")
)

type ServerFolderService struct {
	queries *models.Queries
}

func NewServerFolderService(q *models.Queries) *ServerFolderService {
	return &ServerFolderService{queries: q}
}

func (s *ServerFolderService) CreateFolder(ctx context.Context, userID uuid.UUID, name, color string) (*models.ServerFolder, error) {
	if name == "" {
		return nil, ErrFolderNameRequired
	}
	f, err := s.queries.CreateServerFolder(ctx, userID, name, color)
	if err != nil {
		return nil, err
	}
	return &f, nil
}

func (s *ServerFolderService) GetUserFolders(ctx context.Context, userID uuid.UUID) ([]models.ServerFolder, error) {
	return s.queries.GetUserServerFolders(ctx, userID)
}

func (s *ServerFolderService) UpdateFolder(ctx context.Context, folderID, userID uuid.UUID, name *string, color *string, position *int) (*models.ServerFolder, error) {
	// Fetch current folder to merge partial updates
	current, err := s.queries.GetServerFolder(ctx, folderID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrFolderNotFound
		}
		return nil, err
	}
	if current.UserID != userID {
		return nil, ErrFolderForbidden
	}

	newName := current.Name
	if name != nil {
		newName = *name
	}
	newColor := current.Color
	if color != nil {
		newColor = *color
	}
	newPosition := current.Position
	if position != nil {
		newPosition = *position
	}

	if newName == "" {
		return nil, ErrFolderNameRequired
	}

	f, err := s.queries.UpdateServerFolder(ctx, folderID, userID, newName, newColor, newPosition)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrFolderNotFound
		}
		return nil, err
	}
	return &f, nil
}

func (s *ServerFolderService) DeleteFolder(ctx context.Context, folderID, userID uuid.UUID) error {
	affected, err := s.queries.DeleteServerFolder(ctx, folderID, userID)
	if err != nil {
		return err
	}
	if affected == 0 {
		return ErrFolderNotFound
	}
	return nil
}

func (s *ServerFolderService) AddServerToFolder(ctx context.Context, folderID, serverID, userID uuid.UUID) error {
	// Verify ownership
	folder, err := s.queries.GetServerFolder(ctx, folderID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return ErrFolderNotFound
		}
		return err
	}
	if folder.UserID != userID {
		return ErrFolderForbidden
	}
	return s.queries.AddServerToFolder(ctx, folderID, serverID)
}

func (s *ServerFolderService) RemoveServerFromFolder(ctx context.Context, folderID, serverID, userID uuid.UUID) error {
	// Verify ownership
	folder, err := s.queries.GetServerFolder(ctx, folderID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return ErrFolderNotFound
		}
		return err
	}
	if folder.UserID != userID {
		return ErrFolderForbidden
	}
	return s.queries.RemoveServerFromFolder(ctx, folderID, serverID)
}
