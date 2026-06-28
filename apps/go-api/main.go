package main

import (
	"log"

	"alpha-wolf/apps/go-api/internal/config"
	apphttp "alpha-wolf/apps/go-api/internal/http"
)

func main() {
	cfg := config.Load()
	router := apphttp.NewRouter(cfg)

	log.Printf("alpha-wolf go api listening on %s", cfg.ListenAddress())
	if err := router.Run(cfg.ListenAddress()); err != nil {
		log.Fatal(err)
	}
}
