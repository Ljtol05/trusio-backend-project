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

// POST /api/plaid/enhance-transactions - Re-process existing transactions with enhanced categorization
router.post('/enhance-transactions', auth, async (req, res) => {
  try {
    const userId = req.user!.id;

    logger.info({ userId }, 'Starting transaction enhancement process');

    // Get existing transactions
    const existingTransactions = await db.transaction.findMany({
      where: { userId },
      select: { 
        id: true, 
        merchant: true, 
        amountCents: true, 
        category: true,
        mcc: true,
        description: true 
      }
    });

    let enhancedCount = 0;

    for (const transaction of existingTransactions) {
      const mockPlaidTransaction = {
        merchant_name: transaction.merchant,
        name: transaction.description,
        amount: transaction.amountCents / 100,
        category: transaction.category ? [transaction.category] : null
      };

      const enhancedCategory = await enhanceTransactionCategory(mockPlaidTransaction);
      const inferredMCC = inferMCCFromMerchant(transaction.merchant);

      if (enhancedCategory.wasEnhanced || (inferredMCC && !transaction.mcc)) {
        await db.transaction.update({
          where: { id: transaction.id },
          data: {
            category: enhancedCategory.primary,
            subcategory: enhancedCategory.secondary,
            mcc: inferredMCC || transaction.mcc,
            metadata: JSON.stringify({
              enhancedAt: new Date(),
              enhancedCategory,
              inferredMCC,
              wasAutoEnhanced: true
            })
          }
        });
        enhancedCount++;
      }
    }

    res.json({
      ok: true,
      message: 'Transaction enhancement completed',
      statistics: {
        totalTransactions: existingTransactions.length,
        enhancedTransactions: enhancedCount,
        enhancementRate: `${Math.round((enhancedCount / existingTransactions.length) * 100)}%`
      }
    });

  } catch (error) {
    logger.error({ error, userId: req.user?.id }, 'Failed to enhance transactions');
    res.status(500).json({
      ok: false,
      error: 'Failed to enhance transaction data',
      code: 'ENHANCEMENT_ERROR'
    });
  }
});


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
    logger.info({ userId }, 'Starting enhanced 90-day transaction sync with intelligence');

    // Get last 90 days of transactions
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - 90);

    let allTransactions: any[] = [];
    let offset = 0;
    let hasMore = true;

    // Fetch all transactions with pagination
    while (hasMore) {
      const transactionsResponse = await plaidClient.transactionsGet({
        access_token: accessToken,
        start_date: startDate.toISOString().split('T')[0],
        end_date: endDate.toISOString().split('T')[0],
        count: 500,
        offset,
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
    }, 'Fetched all available transactions');

    // Enhanced transaction processing
    let processedCount = 0;
    let enhancedCount = 0;

    for (const transaction of allTransactions) {
      // Enhanced categorization
      const enhancedCategory = await enhanceTransactionCategory(transaction);
      const inferredMCC = inferMCCFromMerchant(transaction.merchant_name || transaction.name);

      await db.transaction.upsert({
        where: { 
          plaidTransactionId: transaction.transaction_id 
        },
        create: {
          userId,
          plaidTransactionId: transaction.transaction_id,
          accountId: transaction.account_id,
          amountCents: Math.round(transaction.amount * 100),
          merchant: transaction.merchant_name || transaction.name || 'Unknown',
          description: transaction.name,
          category: enhancedCategory.primary || transaction.category?.[0] || 'Other',
          subcategory: enhancedCategory.secondary || transaction.category?.[1] || null,
          mcc: inferredMCC || extractMCCFromTransaction(transaction),
          location: transaction.location?.city ? 
            `${transaction.location.city}, ${transaction.location.region}` : null,
          pending: transaction.pending,
          metadata: JSON.stringify({
            originalCategory: transaction.category,
            enhancedCategory,
            inferredMCC,
            locationData: transaction.location,
            transactionType: transaction.transaction_type,
            paymentChannel: transaction.payment_channel
          }),
          createdAt: new Date(transaction.date),
          authorizedAt: new Date(transaction.authorized_date || transaction.date),
        },
        update: {
          pending: transaction.pending,
          metadata: JSON.stringify({
            originalCategory: transaction.category,
            enhancedCategory,
            inferredMCC,
            locationData: transaction.location,
            transactionType: transaction.transaction_type,
            paymentChannel: transaction.payment_channel,
            lastUpdated: new Date()
          }),
        }
      });

      processedCount++;
      if (enhancedCategory.wasEnhanced) enhancedCount++;
    }

    // Mark transaction data as ready and store summary
    await db.user.update({
      where: { id: userId },
      data: { 
        transactionDataReady: true,
        plaidSyncMetadata: JSON.stringify({
          lastSyncAt: new Date(),
          totalTransactions: processedCount,
          enhancedTransactions: enhancedCount,
          syncVersion: '2.0',
          dateRange: {
            start: startDate.toISOString().split('T')[0],
            end: endDate.toISOString().split('T')[0]
          }
        })
      }
    });

    logger.info({
      userId,
      transactionCount: processedCount,
      enhancedCount,
      enhancementRate: `${Math.round((enhancedCount / processedCount) * 100)}%`,
      dateRange: `${startDate.toISOString().split('T')[0]} to ${endDate.toISOString().split('T')[0]}`,
      syncDuration: '120 days',
      readyForVoiceKYC: true
    }, 'Enhanced 120-day transaction sync completed for voice KYC onboarding');

  } catch (error) {
    logger.error({ error, userId }, 'Enhanced transaction sync failed');
    // Don't throw - let user proceed with manual budget setup
  }
}

// Enhanced categorization helper
async function enhanceTransactionCategory(transaction: any): Promise<{
  primary: string;
  secondary: string | null;
  wasEnhanced: boolean;
}> {
  const merchantName = (transaction.merchant_name || transaction.name || '').toLowerCase();
  const amount = Math.abs(transaction.amount);

  // If Plaid already provided good categories, use them
  if (transaction.category && transaction.category.length > 0 && transaction.category[0] !== 'Other') {
    return {
      primary: transaction.category[0],
      secondary: transaction.category[1] || null,
      wasEnhanced: false
    };
  }

  // Enhanced categorization logic
  const categoryMappings = [
    { keywords: ['grocery', 'market', 'walmart', 'target', 'safeway'], primary: 'Groceries', secondary: 'Food' },
    { keywords: ['gas', 'fuel', 'shell', 'chevron', 'exxon', 'bp'], primary: 'Gas', secondary: 'Transportation' },
    { keywords: ['mcdonald', 'starbucks', 'subway', 'taco bell', 'burger'], primary: 'Fast Food', secondary: 'Dining' },
    { keywords: ['restaurant', 'cafe', 'bistro', 'grill', 'pizza'], primary: 'Dining', secondary: 'Food' },
    { keywords: ['airline', 'southwest', 'delta', 'american airlines'], primary: 'Travel', secondary: 'Airlines' },
    { keywords: ['verizon', 'at&t', 'comcast', 'internet', 'phone'], primary: 'Bills', secondary: 'Utilities' },
    { keywords: ['uber', 'lyft', 'taxi'], primary: 'Transportation', secondary: 'Rideshare' },
    { keywords: ['amazon', 'ebay', 'online'], primary: 'Shopping', secondary: 'Online' },
    { keywords: ['pharmacy', 'cvs', 'walgreens', 'medical'], primary: 'Healthcare', secondary: 'Pharmacy' }
  ];

  for (const mapping of categoryMappings) {
    if (mapping.keywords.some(keyword => merchantName.includes(keyword))) {
      return {
        primary: mapping.primary,
        secondary: mapping.secondary,
        wasEnhanced: true
      };
    }
  }

  // Amount-based categorization
  if (amount > 1000) {
    return { primary: 'Large Purchase', secondary: 'Miscellaneous', wasEnhanced: true };
  }

  return { primary: 'Other', secondary: null, wasEnhanced: false };
}

// Extract MCC helper functions
function inferMCCFromMerchant(merchantName: string): string | null {
  if (!merchantName) return null;

  const merchantLower = merchantName.toLowerCase();
  const mccMappings: { [key: string]: string } = {
    'walmart': '5411', 'target': '5411', 'safeway': '5411',
    'shell': '5541', 'chevron': '5541', 'exxon': '5541',
    'mcdonald': '5814', 'starbucks': '5814', 'subway': '5814',
    'southwest': '4511', 'delta': '4511', 'american airlines': '4511',
    'verizon': '4814', 'at&t': '4814', 'comcast': '4814',
    'uber': '4121', 'lyft': '4121',
    'amazon': '5999', 'ebay': '5999'
  };

  for (const [merchant, mcc] of Object.entries(mccMappings)) {
    if (merchantLower.includes(merchant)) {
      return mcc;
    }
  }
  return null;
}

function extractMCCFromTransaction(transaction: any): string | null {
  // Plaid sometimes provides MCC in different fields
  return transaction.merchant_entity_id || 
         transaction.payment_meta?.ppd_id || 
         null;
}

export default router;