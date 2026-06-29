package main

import (
	"log"

	"alpha-wolf/apps/go-api/internal/config"
	apphttp "alpha-wolf/apps/go-api/internal/http"
	"alpha-wolf/apps/go-api/internal/store"
)

func main() {
	cfg := config.Load()
	db, err := store.Open(cfg)
	if err != nil {
		log.Fatal(err)
	}
	defer db.Close()

	router := apphttp.NewRouter(cfg, db)

	log.Printf("alpha-wolf go api listening on %s", cfg.ListenAddress())
	if err := router.Run(cfg.ListenAddress()); err != nil {
		log.Fatal(err)
	}
}
