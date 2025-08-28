import { Configuration, PlaidApi, PlaidEnvironments, Products, CountryCode } from 'plaid';
import { writeFileSync } from 'fs';
import pino from 'pino';

// Simple logger for the script
const logger = pino({
  level: 'info',
  transport: {
    target: 'pino-pretty',
    options: {
      colorize: true,
      translateTime: 'HH:MM:ss',
      ignore: 'pid,hostname',
    },
  },
});

// Load environment variables
const PLAID_CLIENT_ID = process.env.PLAID_CLIENT_ID;
const PLAID_SECRET = process.env.PLAID_SECRET;
const PLAID_ENV = process.env.PLAID_ENV || 'sandbox';

if (!PLAID_CLIENT_ID || !PLAID_SECRET) {
  console.error('❌ Missing required environment variables: PLAID_CLIENT_ID and PLAID_SECRET');
  process.exit(1);
}

// Initialize Plaid client
const plaidClient = new PlaidApi(new Configuration({
  basePath: PLAID_ENV === 'production' ? PlaidEnvironments.production : PlaidEnvironments.sandbox,
  baseOptions: {
    headers: {
      'PLAID_CLIENT_ID': PLAID_CLIENT_ID,
      'PLAID_SECRET': PLAID_SECRET,
    },
  },
}));

async function createSandboxPublicToken() {
  try {
    console.log('🏦 Creating sandbox public token for custom_konglogic_user...');

    const request = {

// Enhanced transaction processing functions
function inferMCCFromMerchant(merchantName: string): string | null {
  if (!merchantName) return null;

  const merchantLower = merchantName.toLowerCase();
  const mccMappings: Record<string, string> = {
    'walmart': '5411', 
    'target': '5411', 
    'safeway': '5411',
    'shell': '5541', 
    'chevron': '5541', 
    'exxon': '5541',
    'mcdonald': '5814', 
    'starbucks': '5814', 
    'subway': '5814',
    'southwest': '4511', 
    'delta': '4511', 
    'american airlines': '4511',
    'verizon': '4814', 
    'at&t': '4814', 
    'comcast': '4814',
    'uber': '4121', 
    'lyft': '4121',
    'amazon': '5999', 
    'ebay': '5999'
  };

  for (const [merchant, mcc] of Object.entries(mccMappings)) {
    if (merchantLower.includes(merchant)) {
      return mcc;
    }
  }
  return null;
}

function inferCategoryFromTransaction(transaction: any): string[] {
  const merchantName = (transaction.merchant_name || transaction.name || '').toLowerCase();
  const amount = Math.abs(transaction.amount);

  // Category inference based on merchant patterns and amount
  if (merchantName.includes('grocery') || merchantName.includes('market') || 
      ['walmart', 'target', 'safeway', 'kroger'].some(store => merchantName.includes(store))) {
    return ['Food and Drink', 'Groceries'];
  }

  if (merchantName.includes('gas') || merchantName.includes('fuel') ||
      ['shell', 'chevron', 'exxon', 'bp'].some(gas => merchantName.includes(gas))) {
    return ['Transportation', 'Gas'];
  }

  if (['mcdonald', 'starbucks', 'subway', 'taco bell'].some(food => merchantName.includes(food))) {
    return ['Food and Drink', 'Fast Food'];
  }

  if (['southwest', 'american airlines', 'delta', 'united'].some(airline => merchantName.includes(airline))) {
    return ['Travel', 'Airlines'];
  }

  if (['verizon', 'at&t', 'comcast'].some(telecom => merchantName.includes(telecom))) {
    return ['Bills', 'Telecommunications'];
  }

  if (['uber', 'lyft'].some(ride => merchantName.includes(ride))) {
    return ['Transportation', 'Rideshare'];
  }

  if (amount > 1000) {
    return ['Transfer', 'Large Purchase'];
  }

  return ['Other', 'Miscellaneous'];
}

function analyzeTransactionLocation(transaction: any): any {
  const location = transaction.location;
  return {
    hasLocation: !!(location && (location.city || location.region)),
    city: location?.city || null,
    region: location?.region || null,
    isOnline: !location || (!location.city && !location.region),
    storeNumber: location?.store_number || null
  };
}

function generateTransactionInsights(transaction: any): any {
  const amount = Math.abs(transaction.amount);
  const isWeekend = new Date(transaction.date).getDay() % 6 === 0;

  return {
    isLargeTransaction: amount > 500,
    isSmallTransaction: amount < 10,
    isWeekendSpending: isWeekend,
    isPendingTransaction: transaction.pending,
    hasRichMerchantData: !!(transaction.merchant_name && transaction.location?.city),
    spendingPattern: amount > 100 ? 'high' : amount > 50 ? 'medium' : 'low'
  };
}


      institution_id: 'ins_109508', // First Platypus Bank
      initial_products: [Products.Transactions, Products.Auth, Products.Identity],
      options: {
        override_username: 'custom_konglogic_user',
        override_password: 'pass_good',
      },
    };

    const response = await plaidClient.sandboxPublicTokenCreate(request);
    console.log('✅ Public token created successfully');

    return response.data.public_token;
  } catch (error: any) {
    console.error('❌ Failed to create sandbox public token:', error.message);
    if (error.response?.data) {
      console.error('Plaid Error Details:', JSON.stringify(error.response.data, null, 2));
    }
    throw error;
  }
}

async function exchangePublicToken(publicToken: string) {
  try {
    console.log('🔄 Exchanging public token for access token...');

    const response = await plaidClient.itemPublicTokenExchange({
      public_token: publicToken,
    });

    console.log('✅ Access token received successfully');
    console.log('📋 Item ID:', response.data.item_id);

    return {
      accessToken: response.data.access_token,
      itemId: response.data.item_id,
    };
  } catch (error: any) {
    console.error('❌ Failed to exchange public token:', error.message);
    if (error.response?.data) {
      console.error('Plaid Error Details:', JSON.stringify(error.response.data, null, 2));
    }
    throw error;
  }
}

async function getAccountsInfo(accessToken: string) {
  try {
    console.log('📊 Fetching account information...');

    const response = await plaidClient.accountsGet({
      access_token: accessToken,
    });

    console.log(`✅ Found ${response.data.accounts.length} accounts:`);
    response.data.accounts.forEach((account, index) => {
      console.log(`   ${index + 1}. ${account.name} (${account.type}/${account.subtype}) - ${account.mask || 'N/A'}`);
      console.log(`      Balance: $${account.balances.current || 0}`);
    });

    return response.data.accounts;
  } catch (error: any) {
    console.error('❌ Failed to fetch accounts:', error.message);
    if (error.response?.data) {
      console.error('Plaid Error Details:', JSON.stringify(error.response.data, null, 2));
    }
    throw error;
  }
}

async function getTransactions(accessToken: string) {
  try {
    console.log('💳 Fetching last 120 days of transaction data...');

    // Calculate date range (120 days)
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - 120);

    console.log(`📅 Date range: ${startDate.toISOString().split('T')[0]} to ${endDate.toISOString().split('T')[0]}`);

    // Wait for transactions to be ready (Plaid sandbox needs time to initialize)
    console.log('⏳ Waiting for transactions data to be ready...');
    await new Promise(resolve => setTimeout(resolve, 5000)); // Wait 5 seconds

    let allTransactions: any[] = [];
    let offset = 0;
    const count = 500; // Max per request
    let hasMore = true;
    let retryCount = 0;
    const maxRetries = 3;

    while (hasMore) {
      const requestParams: any = {
        access_token: accessToken,
        start_date: startDate.toISOString().split('T')[0],
        end_date: endDate.toISOString().split('T')[0],
      };

      // Only add offset if it's greater than 0
      if (offset > 0) {
        requestParams.offset = offset;
      }

      // Only add count if we want to limit results
      if (count < 500) {
        requestParams.count = count;
      }

      try {
        const response = await plaidClient.transactionsGet(requestParams);

        const transactions = response.data.transactions;
        const totalTransactions = response.data.total_transactions;

        // Enhance transactions with additional data
        const enhancedTransactions = transactions.map(transaction => ({
          ...transaction,
          // Add MCC code inference if missing
          inferredMCC: inferMCCFromMerchant(transaction.merchant_name || transaction.name),
          // Add spending category if missing
          inferredCategory: inferCategoryFromTransaction(transaction),
          // Add location analysis
          locationAnalysis: analyzeTransactionLocation(transaction),
          // Add transaction insights
          insights: generateTransactionInsights(transaction)
        }));

        allTransactions = allTransactions.concat(enhancedTransactions);

        console.log(`📥 Fetched ${transactions.length} transactions (offset: ${offset}, total available: ${totalTransactions})`);

        // Check if we have more transactions
        hasMore = allTransactions.length < totalTransactions && transactions.length > 0;
        offset += transactions.length;
        retryCount = 0; // Reset retry count on success

        // Prevent infinite loop
        if (offset > 10000) {
          console.warn('⚠️ Reached maximum offset limit, stopping fetch');
          break;
        }
      } catch (error: any) {
        if (error.response?.data?.error_code === 'PRODUCT_NOT_READY' && retryCount < maxRetries) {
          retryCount++;
          console.log(`⏳ Product not ready, retrying in ${retryCount * 2} seconds... (attempt ${retryCount}/${maxRetries})`);
          await new Promise(resolve => setTimeout(resolve, retryCount * 2000));
          continue; // Retry the same request
        }
        throw error; // Re-throw if not a retryable error or max retries exceeded
      }
    }

    console.log(`✅ Total transactions fetched: ${allTransactions.length}`);

    // Log transaction summary
    const summary = generateTransactionSummary(allTransactions);
    console.log('\n📈 Transaction Summary:');
    console.log(`   Total Transactions: ${summary.total}`);
    console.log(`   Total Spent: $${summary.totalSpent.toFixed(2)}`);
    console.log(`   Total Income: $${summary.totalIncome.toFixed(2)}`);
    console.log(`   Net: $${summary.net.toFixed(2)}`);
    console.log(`   Categories: ${Object.keys(summary.categories).length}`);
    console.log('\n🏷️ Top Categories:');
    Object.entries(summary.categories)
      .sort(([,a], [,b]) => Math.abs(b as number) - Math.abs(a as number))
      .slice(0, 5)
      .forEach(([category, amount]) => {
        console.log(`   ${category}: $${Math.abs(amount as number).toFixed(2)}`);
      });

    return allTransactions;
  } catch (error: any) {
    console.error('❌ Failed to fetch transactions:', error.message);
    if (error.response?.data) {
      console.error('Plaid Error Details:', JSON.stringify(error.response.data, null, 2));
    }
    throw error;
  }
}

function generateTransactionSummary(transactions: any[]) {
  let totalSpent = 0;
  let totalIncome = 0;
  const categories: { [key: string]: number } = {};
  const merchants: { [key: string]: number } = {};
  const mccCodes: { [key: string]: number } = {};
  const insights = {
    largeTransactions: 0,
    weekendSpending: 0,
    onlineTransactions: 0,
    hasLocationData: 0,
    avgTransactionSize: 0,
    uniqueMerchants: 0
  };

  transactions.forEach(transaction => {
    const amount = transaction.amount;
    const absAmount = Math.abs(amount);

    if (amount > 0) {
      totalSpent += amount; // Positive amounts are debits (expenses)
    } else {
      totalIncome += absAmount; // Negative amounts are credits (income)
    }

    // Track by inferred category (enhanced)
    const category = transaction.inferredCategory?.[0] || transaction.category?.[0] || 'Other';
    categories[category] = (categories[category] || 0) + absAmount;

    // Track by merchant
    const merchant = transaction.merchant_name || transaction.name || 'Unknown';
    merchants[merchant] = (merchants[merchant] || 0) + absAmount;

    // Track by MCC
    const mcc = transaction.inferredMCC || 'Unknown';
    mccCodes[mcc] = (mccCodes[mcc] || 0) + absAmount;

    // Collect insights
    if (transaction.insights?.isLargeTransaction) insights.largeTransactions++;
    if (transaction.insights?.isWeekendSpending) insights.weekendSpending++;
    if (transaction.locationAnalysis?.isOnline) insights.onlineTransactions++;
    if (transaction.locationAnalysis?.hasLocation) insights.hasLocationData++;
  });

  insights.avgTransactionSize = totalSpent / transactions.length;
  insights.uniqueMerchants = Object.keys(merchants).length;

  return {
    total: transactions.length,
    totalSpent,
    totalIncome,
    net: totalIncome - totalSpent,
    categories,
    merchants,
    mccCodes,
    insights,
    topMerchants: Object.entries(merchants)
      .sort(([,a], [,b]) => (b as number) - (a as number))
      .slice(0, 10),
    topMCCs: Object.entries(mccCodes)
      .sort(([,a], [,b]) => (b as number) - (a as number))
      .slice(0, 10)
  };
}

async function saveTransactionsToFile(transactions: any[], accessToken: string) {
  try {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `plaid-transactions-${timestamp}.json`;

    const data = {
      metadata: {
        fetchedAt: new Date().toISOString(),
        totalTransactions: transactions.length,
        dateRange: {
          start: new Date(Date.now() - 120 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
          end: new Date().toISOString().split('T')[0],
        },
        summary: generateTransactionSummary(transactions),
      },
      transactions: transactions.map(transaction => ({
        transaction_id: transaction.transaction_id,
        account_id: transaction.account_id,
        amount: transaction.amount,
        date: transaction.date,
        name: transaction.name,
        merchant_name: transaction.merchant_name,
        category: transaction.category,
        account_owner: transaction.account_owner,
        location: transaction.location,
        payment_meta: transaction.payment_meta,
        pending: transaction.pending,
        transaction_type: transaction.transaction_type,
        unofficial_currency_code: transaction.unofficial_currency_code,
        iso_currency_code: transaction.iso_currency_code,
      })),
    };

    writeFileSync(filename, JSON.stringify(data, null, 2));
    console.log(`💾 Transaction data saved to: ${filename}`);

    return filename;
  } catch (error: any) {
    console.error('❌ Failed to save transactions to file:', error.message);
    throw error;
  }
}

async function main() {
  try {
    console.log('🚀 Starting Plaid Sandbox Test Script\n');
    console.log('📋 Configuration:');
    console.log(`   Client ID: ${PLAID_CLIENT_ID}`);
    console.log(`   Environment: ${PLAID_ENV}`);
    console.log(`   Target User: custom_konglogic_user`);
    console.log('');

    // Step 1: Create public token
    const publicToken = await createSandboxPublicToken();
    console.log('');

    // Step 2: Exchange for access token
    const { accessToken, itemId } = await exchangePublicToken(publicToken);
    console.log('');

    // Step 3: Get account information
    const accounts = await getAccountsInfo(accessToken);
    console.log('');

    // Step 4: Fetch transactions
    const transactions = await getTransactions(accessToken);
    console.log('');

    // Step 5: Save to file
    const filename = await saveTransactionsToFile(transactions, accessToken);

    console.log('\n🎉 Plaid Sandbox Test Completed Successfully!');
    console.log(`📁 Data saved to: ${filename}`);
    console.log(`🔑 Access Token: ${accessToken.substring(0, 20)}...`);
    console.log(`📊 Item ID: ${itemId}`);

    // Log the data for analysis use
    logger.info({
      plaidTest: {
        success: true,
        accessToken: accessToken.substring(0, 20) + '...',
        itemId,
        accountCount: accounts.length,
        transactionCount: transactions.length,
        filename,
        timestamp: new Date().toISOString(),
      }
    }, 'Plaid sandbox test completed successfully');

  } catch (error: any) {
    console.error('\n💥 Script failed:', error.message);
    logger.error({ error: error.message, stack: error.stack }, 'Plaid sandbox test failed');
    process.exit(1);
  }
}

// Run the script
main().catch((error) => {
  console.error('Unhandled error:', error);
  process.exit(1);
});