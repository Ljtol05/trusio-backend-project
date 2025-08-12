
import { PrismaClient } from '@prisma/client';

const db = new PrismaClient();

async function main() {
  console.log('🌱 Starting seed...');

  // Create or get user
  const user = await db.user.upsert({
    where: { id: 1 },
    update: {},
    create: {
      id: 1,
      email: 'demo@example.com',
      name: 'Demo User',
    },
  });

  console.log('👤 Created user');

  // Create envelopes with cents-based amounts
  const envelopeData = [
    { name: 'Groceries', balanceCents: 50000, color: 'green', icon: 'cart', order: 1 }, // $500
    { name: 'Dining', balanceCents: 25000, color: 'orange', icon: 'utensils', order: 2 }, // $250
    { name: 'Gas', balanceCents: 15000, color: 'blue', icon: 'fuel', order: 3 }, // $150
    { name: 'Bills', balanceCents: 120000, color: 'red', icon: 'receipt', order: 4 }, // $1200
    { name: 'Buffer', balanceCents: 10000, color: 'gray', icon: 'shield', order: 5 }, // $100
    { name: 'Misc', balanceCents: 5000, color: 'purple', icon: 'dots', order: 6 }, // $50
  ];

  const envelopes = [];
  for (const envData of envelopeData) {
    const envelope = await db.envelope.upsert({
      where: {
        userId_name: {
          userId: user.id,
          name: envData.name,
        },
      },
      update: {
        balanceCents: envData.balanceCents,
        color: envData.color,
        icon: envData.icon,
        order: envData.order,
      },
      create: {
        ...envData,
        userId: user.id,
      },
    });
    envelopes.push(envelope);
  }

  console.log('💰 Created envelopes');

  // Create routing rules
  const groceriesEnvelope = envelopes.find(e => e.name === 'Groceries');
  const diningEnvelope = envelopes.find(e => e.name === 'Dining');
  const gasEnvelope = envelopes.find(e => e.name === 'Gas');

  const rules = [
    {
      priority: 1,
      mcc: '5411', // Grocery stores
      envelopeId: groceriesEnvelope!.id,
    },
    {
      priority: 2,
      mcc: '5814', // Restaurants
      envelopeId: diningEnvelope!.id,
    },
    {
      priority: 3,
      mcc: '5541', // Gas stations
      envelopeId: gasEnvelope!.id,
    },
    {
      priority: 4,
      merchant: 'starbucks',
      envelopeId: diningEnvelope!.id,
    },
    {
      priority: 5,
      merchant: 'kroger',
      envelopeId: groceriesEnvelope!.id,
    },
  ];

  for (const ruleData of rules) {
    await db.rule.create({
      data: {
        ...ruleData,
        userId: user.id,
      },
    });
  }

  console.log('📋 Created routing rules');

  // Create routing config
  await db.routingConfig.upsert({
    where: { userId: user.id },
    update: {
      spendMode: 'SMART_AUTO',
      useGeneralPool: true,
      bufferCents: 2000, // $20
      confidence: 75,
    },
    create: {
      userId: user.id,
      spendMode: 'SMART_AUTO',
      useGeneralPool: true,
      bufferCents: 2000,
      confidence: 75,
    },
  });

  console.log('⚙️ Created routing config');

  // Create sample transactions
  const transactions = [
    {
      amountCents: -4567, // -$45.67
      merchant: 'Kroger',
      mcc: '5411',
      envelopeId: groceriesEnvelope!.id,
      status: 'SETTLED',
      reason: 'MCC Match',
    },
    {
      amountCents: -1250, // -$12.50
      merchant: 'Starbucks',
      mcc: '5814',
      envelopeId: diningEnvelope!.id,
      status: 'SETTLED',
      reason: 'Merchant Match',
    },
    {
      amountCents: -3895, // -$38.95
      merchant: 'Shell',
      mcc: '5541',
      envelopeId: gasEnvelope!.id,
      status: 'SETTLED',
      reason: 'MCC Match',
    },
  ];

  for (const txnData of transactions) {
    await db.transaction.create({
      data: {
        ...txnData,
        userId: user.id,
      },
    });
  }

  console.log('💳 Created sample transactions');

  // Create sample cards
  await db.card.create({
    data: {
      last4: '1234',
      label: 'Main Card',
      inWallet: true,
      userId: user.id,
    },
  });

  console.log('🎴 Created sample cards');

  console.log('✅ Seed completed successfully!');
}

main()
  .catch((e) => {
    console.error('❌ Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await db.$disconnect();
  });
