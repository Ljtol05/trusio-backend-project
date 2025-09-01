# 📌 Core Mission

This project is an Agentic Budgeting & Financial App built around multi-agent AI. The system must handle authentication, KYC, transaction ingestion, budget creation, and financial coaching through chat and voice agents.

The backend orchestrates various AI agents and third-party tools into a seamless, secure flow that builds a personal financial DNA profile for each user.

---

## 🛡 Authentication & Security Flow

1. **Account Creation**
   - User registers with email and password.
   - Email verification via Resend.
   - Phone verification via Twilio.
2. **Two-Factor Option**
   - Twilio phone verification can be enabled as ongoing 2FA.
3. **KYC Wizard**
   - Choice between:
     - Plaid KYC
     - BaaS Partnership KYC validation
   - Once complete, user is eligible for premium sub-accounts and virtual cards.
4. **Bank Connection**
   - User connects bank via Plaid.
   - 120 days of transaction history pulled.
   - AI begins classifying and building spending DNA.

---

## 🏗 Backend Architecture Vision

- **Multi-Agent Core (with tool handoffs):**
  - Orchestrator Agent → delegates tasks
  - Auth Agent → manages Resend, Twilio, Plaid/BaaS integrations
  - Classification Agent → parses and classifies transactions (AI, regex, fuzzy match)
  - Budget Planner Agent → allocates income into envelopes
  - Coaching/Chat Agent → financial coaching (chat and voice)
  - Knowledge/RAG Agent → connects to playbooks, IRS docs, financial education, past user DNA
- **Storage:**
  - Postgres (Supabase) is used for all structured data, with Twilio and Resend integrations already implemented for phone and email verification.
  - Supabase Vector (pgvector) is used for vector storage, powering embeddings and user DNA queries.
- **Security:**
  - Full encryption at rest and in transit
  - Tokenized API sessions

---

## 🎤 Voice Agent Onboarding (12 Questions)

The voice agent (or optional chat fallback) builds the user’s financial DNA profile.

**Script (exact wording with branching logic):**

1. **Identity & Work**
   - “Can you tell me how you earn income? Salary, hourly, self-employed, or content creation?”
   - Branch: If content creator → flag for tax playbooks and IRS references.
2. **Pay Frequency**
   - “How often do you usually get paid? Weekly, biweekly, or monthly?”
3. **Income Range**
   - “On average, how much do you receive per paycheck?”
4. **Housing**
   - “What’s your monthly rent or mortgage?”
5. **Utilities & Essentials**
   - “What do you normally spend on utilities, internet, and phone service each month?”
6. **Transportation**
   - “Do you own a car or use public transportation? About how much do you spend on this?”
7. **Insurance & Subscriptions**
   - “Do you have health, auto, or renter’s insurance? Any recurring subscriptions?”
8. **Food & Groceries**
   - “On average, how much do you spend on groceries and eating out each month?”
9. **Debt**
   - “Do you have any loans or credit cards you’re paying off?”
10. **Savings & Investments**
    - “Do you already have savings or investments? If so, what kind?”
11. **Goals**
    - “What are your short-term financial goals? (Example: save for apartment, travel, debt payoff)”
    - “What about long-term goals? (Example: home, retirement, business investment)”
12. **Lifestyle & Priorities**
    - “What do you like to budget for beyond essentials? (Example: date nights, pets, hobbies, giving)”

---

## 💰 Budgeting & Envelopes

- **Free Tier**
  - 10 static envelopes auto-created from onboarding
  - 30 AI chats per month
  - Ability to revise budgets via chat after onboarding
- **Premium Tier**
  - Unlimited envelopes
  - Linked BaaS main account and subaccounts
  - 4 envelopes can be converted into virtual debit cards (Apple Pay/Google Pay compatible)
  - Unlimited AI coaching (voice and chat)
  - Access to IRS docs, tax coaching, booster playbooks (debt snowball, travel savings, emergency fund)

---

## 🧬 DNA Profile & Global Brain

Each user’s data forms a DNA profile:
- Income type and frequency
- Spending habits (AI classified)
- Debt, savings, investment patterns
- Lifestyle and priorities
- Goals (short-term and long-term)

The Global Brain (RAG layer):
- Stores IRS documentation, budgeting strategies, playbooks
- Enriches coaching with personalized insights
- Ensures every chat/voice session is context-aware per user

---

## 🚀 Scaling Roadmap

1. **Phase 1:** Authentication, Plaid, static budgets
2. **Phase 2:** Voice onboarding, DNA profile
3. **Phase 3:** Premium tier, subaccounts, virtual cards
4. **Phase 4:** Expansion into KongLogic ecosystem with broader SaaS tools

---

## ⚡ Cursor Development Rule

Every backend feature must align with:

1. Secure onboarding (Resend, Twilio, KYC)
2. Multi-agent orchestration with tool handoffs
3. Personalized DNA-driven budgeting
4. Scalability into premium BaaS and virtual cards
5. Integration into Global Brain RAG layer for coaching