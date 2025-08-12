
# Envelope Budgeting Backend

A TypeScript/Express backend for envelope-style budgeting with smart transaction routing, AI coaching, and real-time updates.

## Features

- 📊 Envelope-based budgeting with real-time balance tracking
- 🧠 Smart transaction routing with configurable rules
- 🤖 AI-powered financial coaching (with OpenAI integration)
- 💳 Virtual card management for category spending
- 📡 Server-sent events for real-time UI updates
- 🔄 Transaction import and auto-categorization
- 📋 Flexible routing rules with priority ordering

## Getting Started

### Prerequisites

- Node.js 18+
- npm

### Local Development (SQLite)

1. **Clone and install dependencies**:
```bash
npm install
```

2. **Set up environment variables**:
```bash
cp .env.example .env
```

Edit `.env`:
```env
DATABASE_URL="file:./dev.db"
PRISMA_DB_PROVIDER="sqlite"
OPENAI_API_KEY="your-openai-api-key-here" # Optional for AI features
PORT=5000
```

3. **Initialize database**:
```bash
npm run prisma:generate
npm run prisma:migrate -- --name init
npm run prisma:seed
```

4. **Start development server**:
```bash
npm run dev
```

Server runs on `http://localhost:5000`

### Production (PostgreSQL)

For production deployment, update your `.env`:

```env
DATABASE_URL="postgresql://user:password@host:port/dbname"
PRISMA_DB_PROVIDER="postgresql"
OPENAI_API_KEY="your-openai-api-key"
```

Then run migrations:
```bash
npm run prisma:migrate -- --name production
npm run prisma:seed
npm run build
npm run start
```

## API Endpoints

### Health & Auth
- `GET /healthz` - Health check
- `GET /api/auth/me` - Get current user (stub)

### Envelopes
- `GET /api/envelopes` - List all envelopes with balances
- `POST /api/envelopes` - Create envelope `{name, startingBalanceCents}`
- `PATCH /api/envelopes/:id` - Update envelope
- `DELETE /api/envelopes/:id` - Delete envelope

### Transfers
- `POST /api/transfers` - Move money between envelopes `{fromId?, toId?, amountCents, note?}`

### Transactions
- `GET /api/transactions?month=YYYY-MM&envelopeId=&merchant=` - Get transactions with filtering
- `POST /api/transactions/import` - Import and auto-route transactions

### Rules
- `GET /api/rules` - Get routing rules
- `POST /api/rules` - Create routing rule
- `PATCH /api/rules/:id` - Update rule
- `DELETE /api/rules/:id` - Delete rule
- `POST /api/rules/reorder` - Reorder rules by priority

### Cards
- `GET /api/cards` - Get virtual cards
- `POST /api/cards` - Create category card
- `POST /api/cards/:id/wallet` - Add/remove from wallet `{inWallet: boolean}`

### Routing
- `GET /api/routing/config` - Get routing configuration
- `PATCH /api/routing/config` - Update routing settings
- `POST /api/routing/preview` - Preview routing decision `{merchant, mcc?, amountCents, location?}`
- `POST /api/routing/commit` - Commit transaction to envelope

### AI (requires OPENAI_API_KEY)
- `POST /api/ai/coach` - Get budget coaching `{goal?, constraints?, months?}`
- `POST /api/ai/explain-route` - Explain routing decision

### Events
- `GET /api/events` - Server-sent events for real-time balance updates

## Example Requests

### Create an envelope
```bash
curl -X POST http://localhost:5000/api/envelopes \
  -H "Content-Type: application/json" \
  -d '{"name": "Coffee", "startingBalanceCents": 5000}'
```

### Transfer money between envelopes
```bash
curl -X POST http://localhost:5000/api/transfers \
  -H "Content-Type: application/json" \
  -d '{"fromId": 1, "toId": 2, "amountCents": 2500, "note": "Moving coffee money"}'
```

### Import transactions
```bash
curl -X POST http://localhost:5000/api/transactions/import \
  -H "Content-Type: application/json" \
  -d '{
    "transactions": [
      {
        "merchant": "Starbucks",
        "mcc": "5814",
        "amountCents": -450,
        "postedAt": "2024-01-15T10:30:00Z",
        "location": "Seattle, WA"
      }
    ]
  }'
```

### Create routing rule
```bash
curl -X POST http://localhost:5000/api/rules \
  -H "Content-Type: application/json" \
  -d '{
    "priority": 1,
    "mcc": "5411",
    "envelopeId": 1
  }'
```

### Get AI coaching
```bash
curl -X POST http://localhost:5000/api/ai/coach \
  -H "Content-Type: application/json" \
  -d '{
    "goal": "Save $500 per month",
    "constraints": ["No dining out cuts"],
    "months": 6
  }'
```

## Database Schema

- **User** - Basic user info (stub for MVP)
- **Envelope** - Budget categories with balances
- **Transaction** - Spending records with routing info
- **Transfer** - Money movement between envelopes
- **Rule** - Smart routing rules (MCC, merchant, location)
- **Card** - Virtual cards linked to envelopes
- **RoutingConfig** - User spending mode preferences

## Scripts

- `npm run dev` - Development server with hot reload
- `npm run build` - Build for production
- `npm run start` - Start production server
- `npm run prisma:generate` - Generate Prisma client
- `npm run prisma:migrate` - Run database migrations
- `npm run prisma:seed` - Seed with demo data
- `npm run prisma:studio` - Open Prisma Studio GUI

## Webhook Integration

The `/api/webhooks` endpoint is prepared for future integration with:
- **Plaid** - Bank transaction webhooks
- **Card Issuer** - Real-time transaction notifications

Webhook events will automatically trigger balance updates and SSE broadcasts.

## Architecture Notes

- **Smart Routing**: Transactions are automatically routed to envelopes based on MCC codes, merchant names, and location rules
- **Real-time Updates**: Server-sent events push balance changes to connected clients
- **AI Integration**: OpenAI provides budget coaching and routing explanations
- **Type Safety**: Full TypeScript with Zod validation for all API inputs
- **Database**: Prisma ORM with SQLite (dev) and PostgreSQL (prod) support
