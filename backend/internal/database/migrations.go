package database

import (
	"embed"
	"io/fs"
	"log"
)

//go:embed migrations/*.sql
var embeddedMigrations embed.FS

// Migrations is a flat filesystem containing only the *.sql files
// (the "migrations/" prefix is stripped so Glob("*.up.sql") works).
var Migrations fs.FS

func init() {
	var err error
	Migrations, err = fs.Sub(embeddedMigrations, "migrations")
	if err != nil {
		log.Fatalf("Failed to create migrations sub-FS: %v", err)
	}
}
