#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="$ROOT_DIR/apps/api/.env"
STRIPE_LOG="$(mktemp -t alpha-wolf-stripe.XXXXXX)"
STRIPE_PID=""
API_PID=""
WEB_PID=""

cleanup() {
  for pid in "$WEB_PID" "$API_PID" "$STRIPE_PID"; do
    if [[ -n "$pid" ]]; then
      kill "$pid" 2>/dev/null || true
    fi
  done
  rm -f "$STRIPE_LOG"
}
trap cleanup EXIT INT TERM

if ! command -v stripe >/dev/null 2>&1; then
  echo "Stripe CLI is required. Install it with: brew install stripe/stripe-cli/stripe" >&2
  exit 1
fi
if [[ ! -f "$ENV_FILE" ]]; then
  echo "Missing $ENV_FILE" >&2
  exit 1
fi

set -a
# shellcheck disable=SC1090
source "$ENV_FILE"
set +a

if [[ "${STRIPE_SECRET_KEY:-}" != sk_test_* && "${STRIPE_SECRET_KEY:-}" != rk_test_* ]]; then
  echo "STRIPE_SECRET_KEY must be a Stripe test-mode key for npm run dev:stripe." >&2
  exit 1
fi

STRIPE_WEBHOOK_SECRET="$(stripe listen --api-key "$STRIPE_SECRET_KEY" --print-secret --skip-update)"
if [[ "$STRIPE_WEBHOOK_SECRET" != whsec_* ]]; then
  echo "Stripe CLI did not return a valid webhook signing secret." >&2
  exit 1
fi
export STRIPE_WEBHOOK_SECRET

stripe listen \
  --api-key "$STRIPE_SECRET_KEY" \
  --events checkout.session.completed,checkout.session.async_payment_succeeded \
  --forward-to http://127.0.0.1:8000/api/auth/stripe/webhook \
  --skip-update >"$STRIPE_LOG" 2>&1 &
STRIPE_PID=$!

echo "Stripe sandbox forwarding is ready (signing secret kept in memory)."

(
  cd "$ROOT_DIR/apps/api"
  python3 -m uvicorn main:app --reload --env-file .env --host 127.0.0.1 --port 8000
) &
API_PID=$!

(
  cd "$ROOT_DIR"
  npm run dev:web
) &
WEB_PID=$!

echo "Alpha Wolf is starting at http://localhost:4200"
echo "Use Stripe test card 4242 4242 4242 4242 with any future expiry and CVC."

wait "$API_PID"
