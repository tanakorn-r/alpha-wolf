package cache

import (
	"sync"
	"time"
)

type item struct {
	expiresAt time.Time
	value     any
}

type Cache struct {
	mu    sync.RWMutex
	items map[string]item
}

func New() *Cache {
	return &Cache{items: map[string]item{}}
}

func (c *Cache) Get(key string) (any, bool) {
	now := time.Now()
	c.mu.RLock()
	value, ok := c.items[key]
	c.mu.RUnlock()
	if !ok {
		return nil, false
	}
	if !value.expiresAt.After(now) {
		c.mu.Lock()
		delete(c.items, key)
		c.mu.Unlock()
		return nil, false
	}
	return value.value, true
}

func (c *Cache) Set(key string, value any, ttl time.Duration) {
	if ttl <= 0 {
		ttl = time.Second
	}
	c.mu.Lock()
	c.items[key] = item{
		expiresAt: time.Now().Add(ttl),
		value:     value,
	}
	c.mu.Unlock()
}
