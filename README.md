
# Envelope Budgeting Backend

A TypeScript/Express backend for envelope-style budgeting with smart transaction routing, **AI-powered multi-agent coaching**, and real-time updates.

## Features

- 📊 Envelope-based budgeting with real-time balance tracking
- 🧠 Smart transaction routing with configurable rules
- 🤖 **AI-powered multi-agent financial coaching** (with OpenAI Agents SDK)
- 🔄 **Intelligent agent handoffs** between financial specialists
- 💳 Virtual card management for category spending
- 📡 Server-sent events for real-time UI updates
- 🔄 Transaction import and auto-categorization
- 📋 Flexible routing rules with priority ordering
- 💬 **Conversation history and session management**
- 🛠️ **Direct tool execution** for financial analysis

## Getting Started

### Prerequisites

- Node.js 18+
- npm
- OpenAI API Key (for AI features)

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
# Required for AI features
OPENAI_API_KEY="your-openai-api-key-here"
OPENAI_PROJECT_ID="proj_..."
OPENAI_ORG_ID="org_..."
OPENAI_AGENTS_TRACING_ENABLED="true"
OPENAI_AGENTS_API_TYPE="chat_completions"
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

For production deployment on Replit, update your `.env`:

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

### 🤖 AI & Agent Endpoints

#### Chat & Conversations
- **`POST /api/ai/chat`** - Main chat endpoint for agent interactions
  - Supports automatic agent routing or manual agent selection
  - Maintains conversation history and context
  - Includes financial data context automatically

- **`GET /api/ai/sessions/:sessionId/history`** - Get conversation history
  - Retrieves paginated conversation history
  - Supports offset/limit pagination

#### Agent Management
- **`GET /api/ai/agents`** - List available agents and their capabilities
  - Returns all specialist agents (financial_advisor, budget_coach, etc.)
  - Shows agent availability and tool counts

- **`POST /api/ai/handoff`** - Agent-to-agent handoffs
  - Seamlessly transfer conversations between specialist agents
  - Maintains context and conversation flow

#### Tool Execution
- **`POST /api/ai/tools/execute`** - Direct tool execution
  - Execute specific financial analysis tools directly
  - Bypass agent conversation for programmatic access

- **`GET /api/ai/tools`** - List available tools by category
  - Browse all financial analysis tools
  - Filter by category (budget, transaction, analysis, etc.)

#### System Monitoring
- **`GET /api/ai/status`** - System health and metrics
  - Agent system status and performance metrics
  - Tool execution statistics

- **`GET /api/agents/health`** - Detailed health check
- **`GET /api/agents/metrics`** - Performance metrics

#### Enhanced Existing Endpoints
- **`POST /api/envelopes/suggestions`** - AI-powered envelope suggestions
- **`POST /api/envelopes/:id/optimize`** - Envelope optimization advice
- **`POST /api/transactions/categorize`** - AI transaction categorization
- **`GET /api/transactions/analysis`** - Spending pattern analysis
- **`POST /api/transfers/optimize`** - Transfer optimization advice

### Traditional Endpoints

#### Envelopes
- `GET /api/envelopes` - List all envelopes with balances
- `POST /api/envelopes` - Create envelope `{name, startingBalanceCents}`
- `PATCH /api/envelopes/:id` - Update envelope
- `DELETE /api/envelopes/:id` - Delete envelope

#### Transfers
- `POST /api/transfers` - Move money between envelopes `{fromId?, toId?, amountCents, note?}`

#### Transactions
- `GET /api/transactions?month=YYYY-MM&envelopeId=&merchant=` - Get transactions with filtering
- `POST /api/transactions/import` - Import and auto-route transactions

#### Rules
- `GET /api/rules` - Get routing rules
- `POST /api/rules` - Create routing rule
- `PATCH /api/rules/:id` - Update rule
- `DELETE /api/rules/:id` - Delete rule
- `POST /api/rules/reorder` - Reorder rules by priority

#### Cards
- `GET /api/cards` - Get virtual cards
- `POST /api/cards` - Create category card
- `POST /api/cards/:id/wallet` - Add/remove from wallet `{inWallet: boolean}`

#### Routing
- `GET /api/routing/config` - Get routing configuration
- `PATCH /api/routing/config` - Update routing settings
- `POST /api/routing/preview` - Preview routing decision `{merchant, mcc?, amountCents, location?}`
- `POST /api/routing/commit` - Commit transaction to envelope

#### Events
- `GET /api/events` - Server-sent events for real-time balance updates

## 🤖 AI Agent Usage Examples

### Chat with Financial Advisor
```bash
curl -X POST http://localhost:5000/api/ai/chat \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <your-jwt-token>" \
  -d '{
    "message": "Help me create a budget for $4000 monthly income",
    "agentName": "financial_advisor",
    "sessionId": "session_123",
    "context": {
      "includeHistory": true,
      "maxHistory": 10,
      "includeFinancialData": true
    }
  }'
```

### Get AI Envelope Suggestions
```bash
curl -X POST http://localhost:5000/api/envelopes/suggestions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <your-jwt-token>" \
  -d '{
    "budget": 4000,
    "goals": ["Save for emergency", "Pay off debt"],
    "preferences": "Conservative approach with 20% savings"
  }'
```

### Execute Financial Analysis Tool
```bash
curl -X POST http://localhost:5000/api/ai/tools/execute \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <your-jwt-token>" \
  -d '{
    "toolName": "analyze_spending_patterns",
    "parameters": {
      "period": "last_3_months",
      "categories": ["food", "transportation"]
    },
    "agentContext": {
      "sessionId": "session_123"
    }
  }'
```

### Agent Handoff Example
```bash
curl -X POST http://localhost:5000/api/ai/handoff \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <your-jwt-token>" \
  -d '{
    "fromAgent": "financial_advisor",
    "toAgent": "budget_coach",
    "message": "I need help optimizing my monthly budget",
    "reason": "User needs detailed budgeting guidance",
    "priority": "high"
  }'
```

### List Available Agents
```bash
curl -X GET http://localhost:5000/api/ai/agents \
  -H "Authorization: Bearer <your-jwt-token>"
```

### Get Conversation History
```bash
curl -X GET "http://localhost:5000/api/ai/sessions/session_123/history?limit=20&offset=0" \
  -H "Authorization: Bearer <your-jwt-token>"
```

### Categorize Transactions with AI
```bash
curl -X POST http://localhost:5000/api/transactions/categorize \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <your-jwt-token>" \
  -d '{
    "transactions": [
      {
        "merchant": "Whole Foods",
        "amount": -85.43,
        "description": "Grocery shopping"
      },
      {
        "merchant": "Shell Gas Station", 
        "amount": -45.20,
        "description": "Fuel"
      }
    ]
  }'
```

### Get AI System Status
```bash
curl -X GET http://localhost:5000/api/ai/status \
  -H "Authorization: Bearer <your-jwt-token>"
```

## Traditional Usage Examples

### Create an envelope
```bash
curl -X POST http://localhost:5000/api/envelopes \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <your-jwt-token>" \
  -d '{"name": "Coffee", "startingBalanceCents": 5000}'
```

### Transfer money between envelopes
```bash
curl -X POST http://localhost:5000/api/transfers \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <your-jwt-token>" \
  -d '{"fromId": 1, "toId": 2, "amountCents": 2500, "note": "Moving coffee money"}'
```

### Import transactions
```bash
curl -X POST http://localhost:5000/api/transactions/import \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <your-jwt-token>" \
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

## 🤖 Multi-Agent System Architecture

### Available Agents

1. **Financial Advisor** (`financial_advisor`)
   - General financial guidance and planning
   - Goal setting and achievement strategies
   - Default agent for routing

2. **Budget Coach** (`budget_coach`)
   - Budgeting strategies and envelope optimization
   - Spending habit analysis and recommendations
   - Envelope creation and management advice

3. **Transaction Analyst** (`transaction_analyst`)
   - Transaction categorization and analysis
   - Spending pattern identification
   - Fraud detection and unusual spending alerts

4. **Insight Generator** (`insight_generator`)
   - Financial insights and trend analysis
   - Predictive analytics and forecasting
   - Custom report generation

### Agent Capabilities

Each agent has access to specialized tools:
- **Budget Tools**: Envelope management, allocation optimization
- **Transaction Tools**: Categorization, analysis, pattern detection
- **Analysis Tools**: Spending trends, goal tracking, forecasting
- **Insight Tools**: Custom reports, recommendations, alerts

### Conversation Flow

1. **Smart Routing**: Messages are automatically routed to the most appropriate agent
2. **Context Preservation**: Financial data and conversation history maintained
3. **Seamless Handoffs**: Agents can transfer conversations when needed
4. **Tool Integration**: Direct access to all financial analysis tools

## Database Schema

- **User** - Basic user info (stub for MVP)
- **Envelope** - Budget categories with balances
- **Transaction** - Spending records with routing info
- **Transfer** - Money movement between envelopes
- **Rule** - Smart routing rules (MCC, merchant, location)
- **Card** - Virtual cards linked to envelopes
- **RoutingConfig** - User spending mode preferences
- **Conversation** - AI conversation history and sessions
- **Goal** - Financial goals and targets

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

### Core Features
- **Smart Routing**: Transactions are automatically routed to envelopes based on MCC codes, merchant names, and location rules
- **Real-time Updates**: Server-sent events push balance changes to connected clients
- **Type Safety**: Full TypeScript with Zod validation for all API inputs
- **Database**: Prisma ORM with SQLite (dev) and PostgreSQL (prod) support

### 🤖 AI Features
- **Multi-Agent System**: Specialized agents for different financial tasks
- **OpenAI Agents SDK**: Production-ready agent orchestration
- **Conversation Management**: Session-based chat history and context
- **Tool Integration**: Direct access to financial analysis tools
- **Smart Handoffs**: Seamless agent-to-agent transfers
- **Financial Context**: Automatic inclusion of user financial data

### Authentication
All AI and financial endpoints require JWT authentication. Include your token in the Authorization header:
```
Authorization: Bearer <your-jwt-token>
```

### Rate Limiting
AI endpoints have built-in rate limiting and timeout protection to ensure system stability.

### Error Handling
All endpoints return standardized error responses with proper HTTP status codes and descriptive error messages.

---

## Links & Resources

- [OpenAI Agents SDK Documentation](https://openai.github.io/openai-agents-js/)
- [Prisma Documentation](https://www.prisma.io/docs)
- [Express.js Documentation](https://expressjs.com/)
- [Zod Validation Library](https://zod.dev/)
- [Replit Hosting](https://replit.com/)

Built with ❤️ using TypeScript, Express, Prisma, and OpenAI Agents SDK.
