
import { Router } from 'express';
import { z } from 'zod';
import { logger } from '../lib/logger.js';
import { auth } from '../services/auth.js';
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

// POST /api/plaid/create-link-token - Create Plaid Link token for post-KYC integration
router.post('/create-link-token', auth, async (req, res) => {
  try {
    const userId = req.user!.id;
    
    logger.info({ userId }, 'Creating Plaid Link token for post-KYC integration');

    // Verify user has completed KYC
    const user = await db.user.findUnique({
      where: { id: userId },
      select: { 
        id: true, 
        email: true, 
        firstName: true, 
        lastName: true,
        kycCompleted: true, 
        plaidConnected: true 
      }
    });

    if (!user || !user.kycCompleted) {
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
        client_user_id: userId,
        email_address: user.email,
        legal_name: `${user.firstName} ${user.lastName}`,
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

// POST /api/plaid/exchange-token - Exchange public token and start transaction sync
router.post('/exchange-token', auth, async (req, res) => {
  try {
    const userId = req.user!.id;
    const { publicToken } = ExchangeTokenSchema.parse(req.body);

    logger.info({ userId }, 'Exchanging Plaid public token');

    // Exchange public token for access token
    const response = await plaidClient.itemPublicTokenExchange({
      public_token: publicToken,
    });

    const { access_token, item_id } = response.data;

    // Get account information
    const accountsResponse = await plaidClient.accountsGet({
      access_token,
    });

    const accounts = accountsResponse.data.accounts;
    
    // Get identity information for verification
    const identityResponse = await plaidClient.identityGet({
      access_token,
    });

    // Store encrypted access token and update user status
    await db.user.update({
      where: { id: userId },
      data: {
        plaidConnected: true,
        plaidAccessToken: access_token, // In production, encrypt this
        plaidItemId: item_id,
      }
    });

    // Start background transaction sync for last 90 days
    await startTransactionSync(userId, access_token);

    res.json({
      ok: true,
      message: 'Bank accounts connected successfully',
      accounts: accounts.map(account => ({
        id: account.account_id,
        name: account.name,
        type: account.type,
        subtype: account.subtype,
        mask: account.mask,
      })),
      nextStep: 'transaction_analysis',
      estimatedAnalysisTime: '2-3 minutes',
    });

  } catch (error: any) {
    logger.error({ error, userId: req.user?.id }, 'Failed to exchange Plaid token');
    res.status(500).json({
      ok: false,
      error: 'Failed to connect bank accounts',
      code: 'TOKEN_EXCHANGE_ERROR'
    });
  }
});

// GET /api/plaid/status - Check Plaid connection and transaction sync status
router.get('/status', auth, async (req, res) => {
  try {
    const userId = req.user!.id;

    const user = await db.user.findUnique({
      where: { id: userId },
      select: { 
        plaidConnected: true, 
        transactionDataReady: true,
        plaidItemId: true,
      }
    });

    if (!user) {
      return res.status(404).json({
        ok: false,
        error: 'User not found',
        code: 'USER_NOT_FOUND'
      });
    }

    // Check transaction count if connected
    let transactionCount = 0;
    let oldestTransaction = null;
    let newestTransaction = null;

    if (user.plaidConnected) {
      const transactions = await db.transaction.findMany({
        where: { userId },
        select: { createdAt: true },
        orderBy: { createdAt: 'desc' },
      });

      transactionCount = transactions.length;
      if (transactions.length > 0) {
        newestTransaction = transactions[0].createdAt;
        oldestTransaction = transactions[transactions.length - 1].createdAt;
      }
    }

    res.json({
      ok: true,
      plaidConnected: user.plaidConnected || false,
      transactionDataReady: user.transactionDataReady || false,
      transactionCount,
      dataRange: transactionCount > 0 ? {
        oldest: oldestTransaction,
        newest: newestTransaction,
        days: Math.ceil((Date.now() - new Date(oldestTransaction!).getTime()) / (1000 * 60 * 60 * 24))
      } : null,
      readyForOnboarding: user.plaidConnected && user.transactionDataReady,
    });

  } catch (error) {
    logger.error({ error, userId: req.user?.id }, 'Failed to check Plaid status');
    res.status(500).json({
      ok: false,
      error: 'Failed to check connection status',
      code: 'STATUS_CHECK_ERROR'
    });
  }
});

// Helper function to start transaction sync
async function startTransactionSync(userId: string, accessToken: string) {
  try {
    logger.info({ userId }, 'Starting 90-day transaction sync');

    // Get last 90 days of transactions
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - 90);

    const transactionsResponse = await plaidClient.transactionsGet({
      access_token: accessToken,
      start_date: startDate.toISOString().split('T')[0],
      end_date: endDate.toISOString().split('T')[0],
      count: 500,
    });

    const transactions = transactionsResponse.data.transactions;

    // Store transactions in database
    for (const transaction of transactions) {
      await db.transaction.upsert({
        where: { 
          plaidTransactionId: transaction.transaction_id 
        },
        create: {
          userId,
          plaidTransactionId: transaction.transaction_id,
          accountId: transaction.account_id,
          amountCents: Math.round(transaction.amount * 100), // Plaid amount is positive for debits
          merchant: transaction.merchant_name || transaction.name || 'Unknown',
          description: transaction.name,
          category: transaction.category?.[0] || 'Other',
          subcategory: transaction.category?.[1] || null,
          mcc: transaction.merchant_name ? undefined : null,
          pending: transaction.pending,
          createdAt: new Date(transaction.date),
        },
        update: {
          pending: transaction.pending,
        }
      });
    }

    // Mark transaction data as ready
    await db.user.update({
      where: { id: userId },
      data: { transactionDataReady: true }
    });

    logger.info({ 
      userId, 
      transactionCount: transactions.length,
      dateRange: `${startDate.toISOString().split('T')[0]} to ${endDate.toISOString().split('T')[0]}`
    }, 'Transaction sync completed');

  } catch (error) {
    logger.error({ error, userId }, 'Transaction sync failed');
    // Don't throw - let user proceed with manual budget setup
  }
}

export default router;
