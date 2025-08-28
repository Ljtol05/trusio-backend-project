# Envelope Budgeting Backend

A TypeScript/Express backend for envelope-style budgeting with smart transaction routing, **AI-powered multi-agent coaching**, and real-time updates. **Focused on individual consumers and content creators** with future business expansion capabilities.

## Required API Keys & Services

### Currently Implemented
- **OpenAI API** (for AI agents and financial coaching)
  - `OPENAI_API_KEY` - Main API key
  - `OPENAI_PROJECT_ID` - Project identifier
  - `OPENAI_ORG_ID` - Organization identifier
- **Resend API** (for email verification)
  - `RESEND_API_KEY` - Email delivery service
- **Plaid API** (for bank integration and transaction analysis)
  - `PLAID_CLIENT_ID` - Sandbox/Development
  - `PLAID_SECRET` - Sandbox/Development  
  - `PLAID_ENV` - sandbox/development/production
  - `PLAID_PRODUCTS` - transactions,auth,identity,assets
- **Twilio** (optional - for SMS verification)
  - `TWILIO_ACCOUNT_SID`
  - `TWILIO_AUTH_TOKEN`
  - `TWILIO_PHONE_NUMBER`

### Future Production Requirements
- **Banking-as-a-Service Provider** (for virtual accounts with routing numbers)
  - `BAAS_API_KEY` - Synapse, Unit, or Treasury Prime
  - `BAAS_PROGRAM_ID` - Program identifier
  - `BAAS_ENVIRONMENT` - sandbox/production
- **Tax Data API** (for real-time tax calculations)
  - `TAXJAR_API_KEY` or `AVALARA_API_KEY`
- **MCC Database Access** (for enhanced merchant category codes)
  - `VISA_MCC_API_KEY` or `MASTERCARD_MCC_API_KEY`
- **Credit Score API** (for financial health insights)
  - `EXPERIAN_API_KEY` or `TRANSUNION_API_KEY` or `EQUIFAX_API_KEY`
- **Market Data API** (for investment tracking features)
  - `YAHOO_FINANCE_API_KEY` or `ALPHA_VANTAGE_API_KEY`
- **Booking APIs** (for travel and dining category enhancements)
  - `AMADEUS_API_KEY` (travel)
  - `OPENTABLE_API_KEY` (restaurants)

### Global AI Brain Configuration
- **Pinecone** (for RAG vector database - budgeting playbooks, IRS codes)
  - `PINECONE_API_KEY`
  - `PINECONE_ENVIRONMENT`
  - `PINECONE_INDEX_NAME`
- **Alternative Vector Stores**
  - `WEAVIATE_URL` and `WEAVIATE_API_KEY` (alternative)
  - `CHROMA_API_KEY` (alternative)

### Payment Processing (Future)
- **Stripe** (for subscription management)
  - `STRIPE_SECRET_KEY`
  - `STRIPE_WEBHOOK_SECRET`
  - `STRIPE_PRICE_ID_PREMIUM`

## Features

### Core Individual Consumer & Content Creator Features
- 📊 **10 Smart Envelopes** with real-time balance tracking and AI optimization
- 🤖 **AI-Powered Multi-Agent Financial Coaching** specialized for consumers and creators
- 💳 **4 Virtual Cards Max** - Apple Wallet & Google Pay integration ready
- 🎯 **AI Transaction Routing** using MCC codes with multiple suggestion options
- ⛪ **Automatic Tithe Envelope** - 10% auto-allocation from income deposits
- 💰 **Content Creator Income Tracking** - Multiple revenue streams support
- 🔄 **Smart Transaction Splitting** - Choose from AI suggestions or manual split
- 📱 **Real-time Pending Transaction Management** - Choose envelope before settlement
- 🎨 **Creator-Specific Categories** - Equipment, software, sponsorships, platform earnings
- 📈 **Financial Growth Insights** - Tailored for irregular creator income

### AI & Intelligence Features
- 🧠 **Multi-Agent System** with specialized financial coaching agents
- 🔄 **Intelligent Agent Handoffs** between budget coach, transaction analyst, insight generator
- 🎯 **MCC-Based Smart Routing** with fallback options and user choice
- 💬 **Conversational Financial Guidance** with session management
- 📊 **Pattern Recognition** for spending habits and income optimization
- 🛠️ **Direct Tool Execution** for financial analysis and envelope management

### Technical Infrastructure
- 📡 Server-sent events for real-time UI updates
- 🔄 Plaid integration with "Static Money" simulation (pre-BaaS)
- 📋 Flexible routing rules with priority ordering
- 🎯 Basic tax categorization and compliance tracking
- 🏦 **BaaS-Ready Architecture** - Plug-and-play for future virtual account integration

## Implementation Plan - Individual Consumers & Content Creators Focus

### Phase 1: Core Consumer Features (Current Focus)
**Tasks 1-8: Foundation & AI Integration**
1. **Global AI Brain Setup** - RAG system with budgeting playbooks, IRS codes, and financial tips
2. **Enhanced Onboarding Agent** - Specialized for consumers and content creators
3. **Smart Envelope System** - 10 envelopes including automatic Tithe envelope
4. **AI Transaction Routing** - MCC-based with multiple suggestion options
5. **Content Creator Specialization** - Revenue stream tracking, equipment categorization
6. **Plaid Integration Enhancement** - Static money simulation with transaction pending management
7. **Virtual Card Management** - 4-card limit with wallet integration preparation
8. **Basic Tax Categorization** - Foundation for compliance tracking

### Phase 2: Advanced Consumer Intelligence (Tasks 9-12)
9. **Spending Pattern AI** - Learn user habits and optimize suggestions
10. **Income Optimization for Creators** - Track platforms, sponsorships, irregular income
11. **Smart Split Transactions** - AI suggestions with manual override options
12. **Financial Health Dashboard** - Consumer-focused insights and recommendations

### Future Business Features (Separate Implementation)
- **Business Expense Tracking & Tax Optimization**
- **Quarterly Tax Estimator for Business Owners** 
- **Revenue Diversification for Small Business**
- **Equipment Depreciation Tracking**
- **Client Payment Optimization**
- **Business Emergency Fund Management**

### Pre-Production Requirements Checklist
- [ ] Plaid Production Keys (when ready for live bank data)
- [ ] Banking-as-a-Service Provider Partnership (Synapse/Unit/Treasury Prime)
- [ ] Tax API Integration (TaxJar/Avalara)
- [ ] MCC Database Access (Visa/Mastercard)
- [ ] Stripe Integration (freemium to premium)
- [ ] Vector Database Setup (Pinecone for Global AI Brain)
- [ ] Apple Wallet & Google Pay Certification

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

## 🤖 Multi-Agent System Architecture

### Core Financial Agents

The system includes four specialized agents:
- **Financial Advisor Agent** - General financial guidance and coordination
- **Budget Coach Agent** - Envelope budgeting and fund allocation
- **Transaction Analyst Agent** - Spending analysis and categorization
- **Insight Generator Agent** - Trend analysis and personalized recommendations

### Agent Chat & Communication

#### Main Chat Interface
- **`POST /api/ai/chat`** - Primary agent interaction endpoint
  ```json
  {
    "message": "How should I allocate my budget this month?",
    "agentName": "budget_coach", // optional: financial_advisor, budget_coach, transaction_analyst, insight_generator
    "sessionId": "session_123", // optional: for conversation continuity
    "context": {
      "includeHistory": true,
      "maxHistory": 10,
      "includeFinancialData": true
    }
  }
  ```
  - Automatically routes to appropriate agent based on message content
  - Maintains conversation history and context
  - Returns personalized responses with financial insights

#### Agent Information & Discovery
- **`GET /api/ai/agents`** - List all available agents
  - Returns agent capabilities, availability status, and tool counts
  - Shows default agent and agent display names

- **`GET /api/ai/status`** - Comprehensive system status
  - Agent initialization status and metrics
  - Tool registry status and execution history
  - Overall system health indicators

### Agent Handoffs & Routing

#### Manual Agent Handoffs
- **`POST /api/ai/handoff`** - Execute agent-to-agent handoff
  ```json
  {
    "fromAgent": "budget_coach",
    "toAgent": "insight_generator",
    "message": "I need insights on my spending patterns",
    "reason": "User needs detailed analysis",
    "priority": "medium", // low, medium, high
    "context": {}, // additional context data
    "preserveHistory": true
  }
  ```
  - Preserves conversation context across agent transitions
  - Tracks escalation levels and handoff success rates

#### Intelligent Auto-Routing
- **`POST /api/ai/handoff/auto-route`** - Get routing recommendations
  ```json
  {
    "message": "I want to analyze my spending trends",
    "currentAgent": "financial_advisor",
    "sessionId": "session_123"
  }
  ```
  - Uses AI to determine optimal agent for user query
  - Provides confidence scores and reasoning

#### Handoff Management & Analytics
- **`GET /api/ai/handoff/history/:userId?`** - Get handoff history
  - View user's handoff history with success rates and patterns
  - Access restricted to user's own data unless admin

- **`GET /api/ai/handoff/statistics`** - Handoff system statistics
  - Global or user-specific handoff metrics
  - Success rates, escalation rates, common routes

- **`GET /api/ai/handoff/active`** - View active handoffs
  - Shows currently in-progress handoffs for user

- **`GET /api/ai/handoff/health`** - Handoff system health check
  - Monitors for stuck or failed handoffs
  - System performance indicators

### Tool Execution System

#### Direct Tool Execution
- **`POST /api/ai/tools/execute`** - Execute specific financial tools
  ```json
  {
    "toolName": "create_envelope",
    "parameters": {
      "name": "Groceries",
      "targetAmount": 500,
      "category": "necessities"
    },
    "agentContext": {
      "agentName": "budget_coach",
      "sessionId": "session_123"
    }
  }
  ```
  - Direct access to 25+ financial analysis and management tools
  - Bypasses conversation for programmatic access

#### Tool Discovery & Management
- **`GET /api/ai/tools`** - List all available tools
  - Filter by category: budget, transaction, analysis, envelope, memory, handoff
  - Shows tool descriptions, risk levels, and execution metrics
  - Query parameter: `?category=budget` to filter by category

### Memory & Personalization System

#### User Memory Management
- **`POST /api/ai/memory/store`** - Store user preferences and insights
  ```json
  {
    "type": "preference", // or "insight"
    "key": "budgeting_style",
    "value": "aggressive_saver",
    "category": "general",
    "confidence": 0.9
  }
  ```
  - Stores user preferences for personalized experiences
  - Learns from user behavior patterns

- **`GET /api/ai/memory/profile`** - Get user memory profile
  - Returns comprehensive user profile with preferences
  - Includes interaction history and current focus areas
  - Query parameter: `?includeHistory=true` for detailed history

#### Goal Tracking & Progress
- **`GET /api/ai/goals/tracking`** - Track financial goal progress
  - Automated goal progress monitoring
  - Generates personalized recommendations
  - Query parameters: `?goalId=123&recommendations=true`

### Contextual Recommendations

#### Smart Recommendations
- **`GET /api/ai/recommendations`** - Get personalized recommendations
  - Context-aware financial advice based on user behavior
  - Query parameters: `?focus=budgeting&limit=5`
  - Adapts to user's current financial situation and goals

### Conversation History

#### Session Management
- **`GET /api/ai/sessions/:sessionId/history`** - Get conversation history
  - Retrieve full conversation history for a session
  - Pagination support: `?limit=20&offset=0`
  - Includes agent names and interaction metadata

### Enhanced Existing Endpoints

The AI system enhances existing endpoints with intelligent features:

#### Smart Envelope Management
- **`POST /api/envelopes/suggestions`** - AI-powered envelope creation suggestions
- **`POST /api/envelopes/:id/optimize`** - Intelligent envelope optimization advice

#### Intelligent Transaction Processing
- **`POST /api/transactions/categorize`** - AI-powered transaction categorization
- **`GET /api/transactions/analysis`** - Advanced spending pattern analysis

#### Optimized Transfers
- **`POST /api/transfers/optimize`** - AI-driven transfer optimization recommendations

### Required Environment Variables

Add these environment variables to your `.env` file for full AI functionality:

```env
# OpenAI Configuration (Required)
OPENAI_API_KEY="sk-..."
OPENAI_PROJECT_ID="proj_..."
OPENAI_ORG_ID="org-..."

# OpenAI Agents SDK Configuration
OPENAI_AGENTS_TRACING_ENABLED="true"
OPENAI_AGENTS_API_TYPE="chat_completions"

# AI Model Configuration (Optional - defaults provided)
OPENAI_MODEL_AGENTIC="gpt-4o"
OPENAI_MODEL_PRIMARY="gpt-4o-mini"
OPENAI_MODEL_ANALYSIS="gpt-4o-mini"
OPENAI_MODEL_BUDGET="gpt-4o-mini"

# Agent System Configuration
AGENT_MAX_TOKENS="4096"
AGENT_TEMPERATURE="0.1"
AGENT_EXECUTION_TIMEOUT="30000"
```

### Frontend Integration Examples

#### Basic Agent Chat
```typescript
const response = await fetch('/api/ai/chat', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    message: "Help me create a budget for groceries",
    sessionId: "user_session_" + Date.now()
  })
});
const { response: aiResponse, agentName } = await response.json();
```

#### Tool Execution
```typescript
const toolResult = await fetch('/api/ai/tools/execute', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    toolName: "analyze_spending_patterns",
    parameters: { category: "entertainment", timeframe: "3_months" }
  })
});
```

#### Get Recommendations
```typescript
const recommendations = await fetch('/api/ai/recommendations?focus=budgeting&limit=3');
const { recommendations: tips } = await recommendations.json();
```

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