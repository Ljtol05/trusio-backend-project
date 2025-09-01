import { Router } from 'express';
import { z } from 'zod';
import { logger } from '../lib/logger.js';
import { authenticateToken } from '../services/auth.js';
import { db } from '../lib/db.js';
import { Configuration, PlaidApi, PlaidEnvironments, Products, CountryCode } from 'plaid';

const router = Router();

// Initialize Plaid client
const plaidClient = new PlaidApi(new Configuration({
  basePath: process.env.PLAID_ENV === 'production' ? PlaidEnvironments.production : PlaidEnvironments.sandbox,
  baseOptions: {
    headers: {
      'PLAID-CLIENT-ID': process.env.PLAID_CLIENT_ID,
      'PLAID-SECRET': process.env.PLAID_SECRET,
    },
  },
}));

// Validation schemas
const LinkTokenRequestSchema = z.object({
  userId: z.string().optional(),
});

const ExchangeTokenSchema = z.object({
  publicToken: z.string().min(1),
});

const TransactionSyncSchema = z.object({
  days: z.number().min(1).max(365).default(120),
});

// Extend Express Request to include user
declare global {
  namespace Express {
    interface Request {
      user?: {
        id: number;
        email: string;
        name: string;
      };
    }
  }
}

// POST /api/plaid/link-token - Create Plaid Link token for post-KYC integration
router.post('/link-token', authenticateToken, async (req, res) => {
  try {
    const userId = req.user!.id;

    logger.info({ userId }, 'Creating Plaid Link token for post-KYC integration');

    // Verify user has completed KYC
    const user = await db.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        name: true,
        kycApproved: true,
        plaidConnected: true
      }
    });

    if (!user || !user.kycApproved) {
      return res.status(400).json({
        ok: false,
        error: 'KYC must be completed before connecting bank accounts',
        code: 'KYC_REQUIRED'
      });
    }

    if (user.plaidConnected) {
      return res.status(400).json({
        ok: false,
        error: 'Bank accounts already connected',
        code: 'ALREADY_CONNECTED'
      });
    }

    // Create link token for financial coaching and budgeting
    const linkTokenRequest = {
      user: {
        client_user_id: userId.toString(),
        email_address: user.email,
        legal_name: user.name,
      },
      client_name: 'Envelope Budgeting App',
      products: [Products.Transactions, Products.Auth, Products.Identity],
      country_codes: [CountryCode.Us],
      language: 'en',
      required_if_supported_products: [Products.Transactions],
      optional_products: [Products.Assets],
      redirect_uri: process.env.PLAID_REDIRECT_URI,
      webhook: process.env.PLAID_WEBHOOK_URL,
    };

    const response = await plaidClient.linkTokenCreate(linkTokenRequest);

    res.json({
      ok: true,
      linkToken: response.data.link_token,
      expiration: response.data.expiration,
      message: 'Connect your bank accounts to begin transaction analysis',
      purpose: 'Financial coaching and personalized budgeting',
    });

  } catch (error: any) {
    logger.error({ error, userId: req.user?.id }, 'Failed to create Plaid Link token');
    res.status(500).json({
      ok: false,
      error: 'Failed to create bank connection token',
      code: 'LINK_TOKEN_ERROR'
    });
  }
});

// POST /api/plaid/exchange - Exchange public token and start transaction sync
router.post('/exchange', authenticateToken, async (req, res) => {
  try {
    const userId = req.user!.id;
    const { publicToken } = ExchangeTokenSchema.parse(req.body);

    logger.info({ userId }, 'Exchanging Plaid public token');

    // Exchange public token for access token
    const exchangeResponse = await plaidClient.itemPublicTokenExchange({
      public_token: publicToken
    });

    const accessToken = exchangeResponse.data.access_token;
    const itemId = exchangeResponse.data.item_id;

    // Get account information
    const accountsResponse = await plaidClient.accountsGet({
      access_token: accessToken
    });

    // Store access token and item ID
    await db.user.update({
      where: { id: userId },
      data: {
        plaidConnected: true,
        plaidAccessToken: accessToken, // In production, encrypt this
        plaidItemId: itemId,
        plaidSyncMetadata: {
          connectedAt: new Date().toISOString(),
          accountCount: accountsResponse.data.accounts.length,
          accounts: accountsResponse.data.accounts.map(acc => ({
            id: acc.account_id,
            name: acc.name,
            type: acc.type,
            subtype: acc.subtype,
            mask: acc.mask
          }))
        }
      }
    });

    // Start background transaction sync for last 120 days
    await startTransactionSync(userId, accessToken);

    logger.info({ userId, itemId }, 'Plaid token exchanged successfully');
    res.json({
      ok: true,
      message: 'Bank account connected successfully. Transaction sync started.',
      accounts: accountsResponse.data.accounts,
      nextStep: 'transaction_sync'
    });

  } catch (error: any) {
    logger.error({ error, userId: req.user?.id }, 'Failed to exchange Plaid token');
    res.status(500).json({
      ok: false,
      error: 'Failed to connect bank account',
      code: 'EXCHANGE_ERROR'
    });
  }
});

// POST /api/plaid/sync - Manual transaction sync trigger
router.post('/sync', authenticateToken, async (req, res) => {
  try {
    const userId = req.user!.id;
    const { days } = TransactionSyncSchema.parse(req.body);

    const user = await db.user.findUnique({
      where: { id: userId },
      select: { plaidAccessToken: true, plaidConnected: true }
    });

    if (!user?.plaidConnected || !user.plaidAccessToken) {
      return res.status(400).json({
        ok: false,
        error: 'Bank account not connected',
        code: 'NOT_CONNECTED'
      });
    }

    // Start transaction sync
    await startTransactionSync(userId, user.plaidAccessToken, days);

    res.json({
      ok: true,
      message: `Transaction sync started for last ${days} days`,
      syncDays: days
    });

  } catch (error: any) {
    logger.error({ error, userId: req.user?.id }, 'Failed to start transaction sync');
    res.status(500).json({
      ok: false,
      error: 'Failed to start transaction sync',
      code: 'SYNC_ERROR'
    });
  }
});

// POST /api/plaid/webhook - Handle Plaid webhooks
router.post('/webhook', async (req, res) => {
  try {
    const { webhook_type, webhook_code, item_id, new_transactions } = req.body;

    logger.info({ webhook_type, webhook_code, item_id }, 'Plaid webhook received');

    if (webhook_type === 'TRANSACTIONS' && webhook_code === 'DEFAULT_UPDATE') {
      // Handle new transactions
      const user = await db.user.findFirst({
        where: { plaidItemId: item_id }
      });

      if (user && user.plaidAccessToken) {
        // Sync new transactions
        await syncNewTransactions(user.id, user.plaidAccessToken, new_transactions);
      }
    }

    res.json({ ok: true });
  } catch (error: any) {
    logger.error({ error }, 'Error processing Plaid webhook');
    res.status(500).json({ error: 'Webhook processing failed' });
  }
});

// GET /api/plaid/status - Check Plaid connection and transaction sync status
router.get('/status', authenticateToken, async (req, res) => {
  try {
    const userId = req.user!.id;

    const user = await db.user.findUnique({
      where: { id: userId },
      select: {
        plaidConnected: true,
        plaidItemId: true,
        transactionDataReady: true,
        plaidSyncMetadata: true
      }
    });

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({
      ok: true,
      plaidConnected: user.plaidConnected,
      transactionDataReady: user.transactionDataReady,
      syncMetadata: user.plaidSyncMetadata,
      nextStep: user.transactionDataReady ? 'voice_onboarding' : 'transaction_sync'
    });

  } catch (error: any) {
    logger.error({ error, userId: req.user?.id }, 'Failed to check Plaid status');
    res.status(500).json({ error: 'Failed to check status' });
  }
});

// Helper function to start transaction sync
async function startTransactionSync(userId: number, accessToken: string, days: number = 120) {
  try {
    logger.info({ userId, days }, 'Starting transaction sync');

    // Calculate date range
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    let allTransactions: any[] = [];
    let offset = 0;
    let hasMore = true;

    // Fetch all transactions with pagination
    while (hasMore) {
      const transactionsResponse = await plaidClient.transactionsGet({
        access_token: accessToken,
        start_date: startDate.toISOString().split('T')[0],
        end_date: endDate.toISOString().split('T')[0],
        options: {
          count: 500,
          offset,
        }
      });

      const transactions = transactionsResponse.data.transactions;
      allTransactions = allTransactions.concat(transactions);

      hasMore = allTransactions.length < transactionsResponse.data.total_transactions;
      offset = allTransactions.length;

      // Prevent infinite loop
      if (offset > 2000) break;
    }

    logger.info({
      userId,
      totalFetched: allTransactions.length,
      dateRange: `${startDate.toISOString().split('T')[0]} to ${endDate.toISOString().split('T')[0]}`
    }, 'Fetched transactions from Plaid');

    // Process and store transactions
    let processedCount = 0;
    let newCount = 0;

    for (const transaction of allTransactions) {
      try {
        // Check if transaction already exists
        const existing = await db.transaction.findUnique({
          where: { plaidTransactionId: transaction.transaction_id }
        });

        if (!existing) {
          // Create new transaction
          await db.transaction.create({
            data: {
              userId,
              plaidTransactionId: transaction.transaction_id,
              accountId: transaction.account_id,
              amountCents: Math.round(transaction.amount * 100),
              merchant: transaction.merchant_name || transaction.name || 'Unknown',
              reason: transaction.name,
              mcc: extractMCCFromTransaction(transaction),
              location: transaction.location?.city ?
                `${transaction.location.city}, ${transaction.location.region}` : null,
              pending: transaction.pending,
              status: transaction.pending ? 'PENDING' : 'SETTLED',
              authorizedAt: transaction.authorized_date ? new Date(transaction.authorized_date) : null,
              postedAt: new Date(transaction.date),
              externalId: transaction.transaction_id,
            }
          });
          newCount++;
        } else {
          // Update existing transaction
          await db.transaction.update({
            where: { id: existing.id },
            data: {
              pending: transaction.pending,
              status: transaction.pending ? 'PENDING' : 'SETTLED',
              updatedAt: new Date()
            }
          });
        }

        processedCount++;
      } catch (error) {
        logger.error({ error, transactionId: transaction.transaction_id }, 'Failed to process transaction');
      }
    }

    // Mark transaction data as ready
    await db.user.update({
      where: { id: userId },
      data: {
        transactionDataReady: true,
        plaidSyncMetadata: {
          lastSync: new Date().toISOString(),
          totalTransactions: processedCount,
          newTransactions: newCount,
          syncDays: days,
          syncCompleted: true
        }
      }
    });

    logger.info({
      userId,
      processed: processedCount,
      new: newCount
    }, 'Transaction sync completed successfully');

  } catch (error) {
    logger.error({ error, userId }, 'Transaction sync failed');
    throw error;
  }
}

// Helper function to sync new transactions from webhook
async function syncNewTransactions(userId: number, accessToken: string, newTransactionCount: number) {
  try {
    logger.info({ userId, newTransactionCount }, 'Syncing new transactions from webhook');

    // Get recent transactions
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - 7); // Last 7 days

    const response = await plaidClient.transactionsGet({
      access_token: accessToken,
      start_date: startDate.toISOString().split('T')[0],
      end_date: endDate.toISOString().split('T')[0],
      options: {
        count: newTransactionCount + 10, // Get a few extra to be safe
      }
    });

    const transactions = response.data.transactions;
    let newCount = 0;

    for (const transaction of transactions) {
      try {
        const existing = await db.transaction.findUnique({
          where: { plaidTransactionId: transaction.transaction_id }
        });

        if (!existing) {
          await db.transaction.create({
            data: {
              userId,
              plaidTransactionId: transaction.transaction_id,
              accountId: transaction.account_id,
              amountCents: Math.round(transaction.amount * 100),
              merchant: transaction.merchant_name || transaction.name || 'Unknown',
              reason: transaction.name,
              mcc: extractMCCFromTransaction(transaction),
              location: transaction.location?.city ?
                `${transaction.location.city}, ${transaction.location.region}` : null,
              pending: transaction.pending,
              status: transaction.pending ? 'PENDING' : 'SETTLED',
              authorizedAt: transaction.authorized_date ? new Date(transaction.authorized_date) : null,
              postedAt: new Date(transaction.date),
              externalId: transaction.transaction_id,
            }
          });
          newCount++;
        }
      } catch (error) {
        logger.error({ error, transactionId: transaction.transaction_id }, 'Failed to sync new transaction');
      }
    }

    logger.info({ userId, newCount }, 'New transactions synced from webhook');

  } catch (error) {
    logger.error({ error, userId }, 'Failed to sync new transactions');
  }
}

// Helper function to extract MCC from transaction
function extractMCCFromTransaction(transaction: any): string | null {
  // Try to extract MCC from various sources
  if (transaction.category && transaction.category.length > 0) {
    // Map common Plaid categories to MCC codes
    const categoryToMCC: Record<string, string> = {
      'Food and Drink': '5814', // Fast food restaurants
      'Shopping': '5311', // Department stores
      'Transportation': '5541', // Service stations
      'Travel': '4511', // Airline tickets
      'Bills and Utilities': '4900', // Utilities
      'Entertainment': '7832', // Motion picture theaters
      'Health and Fitness': '8011', // Doctors
      'Professional Services': '8099', // Health practitioners
      'Education': '8220', // Colleges and universities
      'Personal Care': '7230', // Beauty shops
    };

    const primaryCategory = transaction.category[0];
    return categoryToMCC[primaryCategory] || null;
  }

  return null;
}

export default router;
