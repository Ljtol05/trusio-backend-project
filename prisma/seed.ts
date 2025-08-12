
import { PrismaClient } from '@prisma/client';

const db = new PrismaClient();

async function seed() {
  console.log('🌱 Seeding database...');
  
  try {
    // Create demo user
    const user = await db.user.upsert({
      where: { id: 1 },
      update: {},
      create: {
        id: 1,
        email: 'demo@envelopes.app',
        name: 'Demo User',
      },
    });
    
    console.log('👤 Created demo user');
    
    // Create default envelopes with realistic balances
    const envelopes = [
      { name: 'Groceries', balance: 450, budgetLimit: 500, color: '#10B981' },
      { name: 'Dining', balance: 180, budgetLimit: 250, color: '#F59E0B' },
      { name: 'Gas', balance: 120, budgetLimit: 150, color: '#EF4444' },
      { name: 'Bills', balance: 1200, budgetLimit: 1200, color: '#6366F1' },
      { name: 'Buffer', balance: 500, budgetLimit: 1000, color: '#8B5CF6' },
      { name: 'Misc', balance: 75, budgetLimit: 200, color: '#6B7280' },
    ];
    
    for (const envelopeData of envelopes) {
      await db.envelope.upsert({
        where: { 
          userId_name: {
            userId: user.id,
            name: envelopeData.name,
          },
        },
        update: {
          balance: envelopeData.balance,
          budgetLimit: envelopeData.budgetLimit,
          color: envelopeData.color,
        },
        create: {
          ...envelopeData,
          userId: user.id,
        },
      });
    }
    
    console.log('💰 Created default envelopes');
    
    // Create demo cards
    const cards = [
      { name: 'Primary Card', last4: '1234', cardType: 'virtual', isDefault: true },
      { name: 'Backup Card', last4: '5678', cardType: 'physical', isDefault: false },
    ];
    
    for (const cardData of cards) {
      await db.card.upsert({
        where: {
          userId_name: {
            userId: user.id,
            name: cardData.name,
          },
        },
        update: cardData,
        create: {
          ...cardData,
          userId: user.id,
        } as any,
      });
    }
    
    console.log('💳 Created demo cards');
    
    // Get created envelopes for routing rules
    const groceriesEnvelope = await db.envelope.findFirst({
      where: { userId: user.id, name: 'Groceries' },
    });
    
    const diningEnvelope = await db.envelope.findFirst({
      where: { userId: user.id, name: 'Dining' },
    });
    
    const gasEnvelope = await db.envelope.findFirst({
      where: { userId: user.id, name: 'Gas' },
    });
    
    // Create routing rules
    const rules = [
      {
        name: 'Grocery Stores',
        priority: 1,
        conditions: {
          mcc: ['5411', '5499'], // Grocery stores
          merchantName: ['walmart', 'target', 'kroger', 'safeway'],
        },
        envelopeId: groceriesEnvelope!.id,
      },
      {
        name: 'Restaurants',
        priority: 2,
        conditions: {
          mcc: ['5812', '5814'], // Restaurants and fast food
          merchantName: ['mcdonalds', 'starbucks', 'chipotle', 'subway'],
        },
        envelopeId: diningEnvelope!.id,
      },
      {
        name: 'Gas Stations',
        priority: 3,
        conditions: {
          mcc: ['5541', '5542'], // Gas stations
          merchantName: ['shell', 'chevron', 'exxon', 'bp'],
        },
        envelopeId: gasEnvelope!.id,
      },
    ];
    
    for (const ruleData of rules) {
      await db.routingRule.upsert({
        where: {
          userId_name: {
            userId: user.id,
            name: ruleData.name,
          },
        },
        update: {
          priority: ruleData.priority,
          conditions: ruleData.conditions,
          envelopeId: ruleData.envelopeId,
        },
        create: {
          ...ruleData,
          userId: user.id,
        },
      });
    }
    
    console.log('📋 Created routing rules');
    
    // Create sample transactions
    const transactions = [
      {
        amount: -45.67,
        description: 'Weekly groceries',
        merchantName: 'Kroger',
        mcc: '5411',
        fromEnvelopeId: groceriesEnvelope!.id,
        status: 'completed',
      },
      {
        amount: -12.50,
        description: 'Coffee',
        merchantName: 'Starbucks',
        mcc: '5814',
        fromEnvelopeId: diningEnvelope!.id,
        status: 'completed',
      },
      {
        amount: -38.95,
        description: 'Gas fill-up',
        merchantName: 'Shell',
        mcc: '5541',
        fromEnvelopeId: gasEnvelope!.id,
        status: 'completed',
      },
    ];
    
    for (const transactionData of transactions) {
      await db.transaction.create({
        data: {
          ...transactionData,
          userId: user.id,
          reason: 'Auto-routed by rule',
        },
      });
    }
    
    console.log('💸 Created sample transactions');
    
    console.log('✅ Database seeded successfully!');
    
  } catch (error) {
    console.error('❌ Error seeding database:', error);
    throw error;
  } finally {
    await db.$disconnect();
  }
}

seed();
