package store

import (
	"database/sql"
	"strings"
	"time"

	"alpha-wolf/apps/go-api/internal/types"
)

type PortfolioStore struct {
	db *sql.DB
}

func NewPortfolioStore(db *sql.DB) *PortfolioStore {
	return &PortfolioStore{db: db}
}

func (s *PortfolioStore) ListHoldings() ([]types.Holding, error) {
	rows, err := s.db.Query(`SELECT id, symbol, shares, average_cost, strategy, monthly_dca, created_at FROM holdings ORDER BY symbol`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	holdings := []types.Holding{}
	for rows.Next() {
		var item types.Holding
		if err := rows.Scan(&item.ID, &item.Symbol, &item.Shares, &item.AverageCost, &item.Strategy, &item.MonthlyDca, &item.CreatedAt); err != nil {
			return nil, err
		}
		holdings = append(holdings, item)
	}
	return holdings, rows.Err()
}

func (s *PortfolioStore) UpsertHolding(input types.HoldingInput) (types.Holding, error) {
	symbol := strings.ToUpper(strings.TrimSpace(input.Symbol))
	createdAt := time.Now().UTC().Format(time.RFC3339)
	_, err := s.db.Exec(`
		INSERT INTO holdings(symbol, shares, average_cost, strategy, monthly_dca, created_at)
		VALUES(?, ?, ?, ?, ?, ?)
		ON CONFLICT(symbol) DO UPDATE SET
			shares=excluded.shares,
			average_cost=excluded.average_cost,
			strategy=excluded.strategy,
			monthly_dca=excluded.monthly_dca
	`, symbol, input.Shares, input.AverageCost, input.Strategy, input.MonthlyDca, createdAt)
	if err != nil {
		return types.Holding{}, err
	}
	return s.GetHolding(symbol)
}

func (s *PortfolioStore) GetHolding(symbol string) (types.Holding, error) {
	var item types.Holding
	err := s.db.QueryRow(`
		SELECT id, symbol, shares, average_cost, strategy, monthly_dca, created_at
		FROM holdings WHERE symbol = ?
	`, strings.ToUpper(strings.TrimSpace(symbol))).Scan(&item.ID, &item.Symbol, &item.Shares, &item.AverageCost, &item.Strategy, &item.MonthlyDca, &item.CreatedAt)
	return item, err
}

func (s *PortfolioStore) DeleteHolding(symbol string) error {
	_, err := s.db.Exec(`DELETE FROM holdings WHERE symbol = ?`, strings.ToUpper(strings.TrimSpace(symbol)))
	return err
}

func (s *PortfolioStore) ListOrders() ([]types.DcaOrder, error) {
	rows, err := s.db.Query(`SELECT id, symbol, amount, scheduled_for, strategy, status, executed_price, shares, created_at FROM dca_orders ORDER BY scheduled_for, id`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	orders := []types.DcaOrder{}
	for rows.Next() {
		var item types.DcaOrder
		if err := rows.Scan(&item.ID, &item.Symbol, &item.Amount, &item.ScheduledFor, &item.Strategy, &item.Status, &item.ExecutedPrice, &item.Shares, &item.CreatedAt); err != nil {
			return nil, err
		}
		orders = append(orders, item)
	}
	return orders, rows.Err()
}

func (s *PortfolioStore) CreateOrder(input types.DcaOrderInput) (types.DcaOrder, error) {
	createdAt := time.Now().UTC().Format(time.RFC3339)
	result, err := s.db.Exec(`
		INSERT INTO dca_orders(symbol, amount, scheduled_for, strategy, status, created_at)
		VALUES(?, ?, ?, ?, ?, ?)
	`, strings.ToUpper(strings.TrimSpace(input.Symbol)), input.Amount, input.ScheduledFor, input.Strategy, input.Status, createdAt)
	if err != nil {
		return types.DcaOrder{}, err
	}
	id, err := result.LastInsertId()
	if err != nil {
		return types.DcaOrder{}, err
	}
	return s.GetOrder(int(id))
}

func (s *PortfolioStore) GetOrder(id int) (types.DcaOrder, error) {
	var item types.DcaOrder
	err := s.db.QueryRow(`
		SELECT id, symbol, amount, scheduled_for, strategy, status, executed_price, shares, created_at
		FROM dca_orders WHERE id = ?
	`, id).Scan(&item.ID, &item.Symbol, &item.Amount, &item.ScheduledFor, &item.Strategy, &item.Status, &item.ExecutedPrice, &item.Shares, &item.CreatedAt)
	return item, err
}

func (s *PortfolioStore) UpdateOrderAmount(id int, amount float64) (types.DcaOrder, error) {
	_, err := s.db.Exec(`UPDATE dca_orders SET amount = ? WHERE id = ?`, amount, id)
	if err != nil {
		return types.DcaOrder{}, err
	}
	return s.GetOrder(id)
}

func (s *PortfolioStore) DeleteOrder(id int) error {
	_, err := s.db.Exec(`DELETE FROM dca_orders WHERE id = ?`, id)
	return err
}
