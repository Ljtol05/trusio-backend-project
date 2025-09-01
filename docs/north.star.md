# North Star Cheatsheet (Agentic Budgeting App)

## Core Mission (1-liner)
Build a production-ready, agentic budgeting/finance backend that securely onboards users, ingests transactions, learns a financial DNA profile, and delivers budgeting + coaching via chat/voice—starting with Plaid; later extending to BaaS sub-accounts and virtual cards.

## Platform Decisions
- **Primary DB**: Supabase Postgres (managed).
- **Vector Store**: Supabase pgvector / Supabase Vector (embeddings per-tenant).
- **Email**: Resend (integrated with Supabase email flows).
- **Phone/2FA**: Twilio Verify (integrated with Supabase auth flow).
- **LLM/Embeddings**: OpenAI.

## Five Vision Anchors
- Secure onboarding (Resend + Twilio + KYC)
- Multi-agent orchestration with tool handoffs
- DNA-driven budgeting (personalized envelopes)
- Scalable to Premium (BaaS sub-accounts + virtual cards)
- Global Brain (RAG): IRS docs, playbooks, user DNA

## Golden Flows
A) Onboarding (happy path)
1. Register (email+password) → Resend verify (via Supabase)
2. Phone verify (Twilio) → optional 2FA enabled in Supabase
3. KYC wizard (Plaid now; BaaS later) → status=approved
4. Link bank (Plaid) → pull 120 days of transactions
5. Voice/Chat 12-Q onboarding → seed DNA → first budget

B) Daily Loop
1. Plaid sync → new transactions
2. Classification Agent → categories (LLM + rules + fuzzy)
3. Budget Planner Agent → update envelopes
4. Coaching Agent → insights & nudges
5. RAG via Supabase Vector → personalized guidance

## Data Model (Prisma – key records)
User, Session, Institution, Account, Transaction, Category,
Envelope, EnvelopeAllocation, Budget, Goal, KycRecord,
Verification, RagDoc (embeddingRef), AgentRun, WebhookEvent,
AuditLog, Subscription

## Required ENV (keywords only)
PORT, NODE_ENV, JWT_SECRET, CORS_ORIGIN
DATABASE_URL (Supabase conn string)
SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY
RESEND_API_KEY, EMAIL_FROM
TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_VERIFY_SID
PLAID_CLIENT_ID, PLAID_SECRET, PLAID_ENV
OPENAI_API_KEY, EMBEDDINGS_MODEL

## Security & Compliance Guardrails
- Use Supabase RLS where appropriate; keep service-role usage server-side only.
- Never log raw provider tokens or PII; encrypt secrets at rest.
- Idempotent webhooks; per-tenant vector namespaces.

## “Definition of Done”
- Aligned to ≥1 Vision Anchor (“Supports vision via [anchor]”)
- Tests updated; API contract documented
- Telemetry added; security pass (PII, RLS, authz)
- Clear migration notes and rollback plan