
import { Configuration, PlaidApi, PlaidEnvironments, Products, CountryCode } from 'plaid';
import { writeFileSync } from 'fs';
import { logger } from '../src/lib/logger.js';

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
      'PLAID-CLIENT-ID': PLAID_CLIENT_ID,
      'PLAID-SECRET': PLAID_SECRET,
    },
  },
}));

async function createSandboxPublicToken() {
  try {
    console.log('🏦 Creating sandbox public token for custom_konglogic_user...');
    
    const request = {
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
    
    let allTransactions: any[] = [];
    let offset = 0;
    const count = 500; // Max per request
    let hasMore = true;
    
    while (hasMore) {
      const response = await plaidClient.transactionsGet({
        access_token: accessToken,
        start_date: startDate.toISOString().split('T')[0],
        end_date: endDate.toISOString().split('T')[0],
        offset,
        count,
      });
      
      const transactions = response.data.transactions;
      allTransactions = allTransactions.concat(transactions);
      
      console.log(`📥 Fetched ${transactions.length} transactions (offset: ${offset})`);
      
      // Check if we have more transactions
      hasMore = transactions.length === count;
      offset += count;
      
      // Prevent infinite loop
      if (offset > 10000) {
        console.warn('⚠️ Reached maximum offset limit, stopping fetch');
        break;
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
  
  transactions.forEach(transaction => {
    const amount = transaction.amount;
    
    if (amount > 0) {
      totalSpent += amount; // Positive amounts are debits (expenses)
    } else {
      totalIncome += Math.abs(amount); // Negative amounts are credits (income)
    }
    
    // Track by category
    const category = transaction.category?.[0] || 'Other';
    categories[category] = (categories[category] || 0) + Math.abs(amount);
  });
  
  return {
    total: transactions.length,
    totalSpent,
    totalIncome,
    net: totalIncome - totalSpent,
    categories,
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
if (require.main === module) {
  main().catch((error) => {
    console.error('Unhandled error:', error);
    process.exit(1);
  });
}

export default main;
