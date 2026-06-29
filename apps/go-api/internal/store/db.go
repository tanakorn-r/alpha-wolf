package store

import (
	"database/sql"
	"os"
	"path/filepath"
	"runtime"

	_ "modernc.org/sqlite"

	"alpha-wolf/apps/go-api/internal/config"
)

func Open(cfg config.Config) (*sql.DB, error) {
	dbPath := cfg.DBPath
	if dbPath == "" {
		dbPath = defaultDBPath()
	}
	if err := os.MkdirAll(filepath.Dir(dbPath), 0o755); err != nil {
		return nil, err
	}

	db, err := sql.Open("sqlite", dbPath)
	if err != nil {
		return nil, err
	}

	if _, err := db.Exec(`PRAGMA journal_mode=WAL;`); err != nil {
		_ = db.Close()
		return nil, err
	}
	if err := migrate(db); err != nil {
		_ = db.Close()
		return nil, err
	}
	return db, nil
}

func defaultDBPath() string {
	_, currentFile, _, ok := runtime.Caller(0)
	if !ok {
		return filepath.Join("data", "alpha_wolf.sqlite3")
	}
	goDataPath := filepath.Join(filepath.Dir(currentFile), "..", "..", "data", "alpha_wolf.sqlite3")
	legacyPath := filepath.Join(filepath.Dir(currentFile), "..", "..", "..", "api", "data", "alpha_wolf.sqlite3")
	if _, err := os.Stat(legacyPath); err == nil {
		return legacyPath
	}
	return goDataPath
}

func migrate(db *sql.DB) error {
	statements := []string{
		`CREATE TABLE IF NOT EXISTS holdings (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			symbol TEXT NOT NULL UNIQUE,
			shares REAL NOT NULL,
			average_cost REAL NOT NULL,
			strategy TEXT NOT NULL,
			monthly_dca REAL NOT NULL DEFAULT 0,
			created_at TEXT NOT NULL
		);`,
		`CREATE TABLE IF NOT EXISTS dca_orders (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			symbol TEXT NOT NULL,
			amount REAL NOT NULL,
			scheduled_for TEXT NOT NULL,
			strategy TEXT NOT NULL,
			status TEXT NOT NULL,
			executed_price REAL,
			shares REAL,
			created_at TEXT NOT NULL
		);`,
	}
	for _, statement := range statements {
		if _, err := db.Exec(statement); err != nil {
			return err
		}
	}
	return nil
}
