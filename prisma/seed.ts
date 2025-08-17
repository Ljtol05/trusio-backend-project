
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  // single stub user
  const user = await prisma.user.upsert({
    where: { email: 'demo@envelopes.app' },
    update: {},
    create: { 
      name: 'Demo User',
      email: 'demo@envelopes.app',
      password: 'demo123' // Simple demo password
    },
  });

  const names = [
    { name: 'Groceries', balanceCents: 42012, icon: 'cart', color: 'green', order: 1 },
    { name: 'Dining',    balanceCents:  8650, icon: 'utensils', color: 'amber', order: 2 },
    { name: 'Fast Food', balanceCents:  5500, icon: 'burger', color: 'orange', order: 3 },
    { name: 'Gas',       balanceCents: 11000, icon: 'fuel', color: 'teal', order: 4 },
    { name: 'Bills',     balanceCents:124500, icon: 'receipt', color: 'blue', order: 5 },
    { name: 'Misc',      balanceCents:  7500, icon: 'dots', color: 'gray', order: 6 },
    { name: 'Buffer',    balanceCents: 30000, icon: 'shield', color: 'slate', order: 7 },
  ];

  const envelopes = [];
  for (const n of names) {
    const env = await prisma.envelope.upsert({
      where: { userId_name: { userId: user.id, name: n.name } },
      update: { balanceCents: n.balanceCents, icon: n.icon, color: n.color, order: n.order, isActive: true },
      create: { userId: user.id, name: n.name, balanceCents: n.balanceCents, icon: n.icon, color: n.color, order: n.order, isActive: true },
    });
    envelopes.push(env);
  }

  // create 1:1 category virtual cards for a few envelopes
  for (const env of envelopes.slice(0, 4)) {
    await prisma.card.create({
      data: {
        userId: user.id,
        last4: String(4000 + Math.floor(Math.random() * 5000)).slice(-4),
        envelopeId: env.id,
        label: `${env.name} Card`,
        inWallet: true,
      },
    });
  }

  // Comprehensive routing rules for common spending categories
  await prisma.rule.createMany({
    data: [
      // Groceries
      { userId: user.id, priority: 1, mcc: '5411', envelopeId: envelopes.find(e => e.name==='Groceries')!.id }, // Grocery stores
      { userId: user.id, priority: 2, mcc: '5499', envelopeId: envelopes.find(e => e.name==='Groceries')!.id }, // Misc food stores
      { userId: user.id, priority: 3, merchant: 'Walmart', envelopeId: envelopes.find(e => e.name==='Groceries')!.id },
      { userId: user.id, priority: 4, merchant: 'Target', envelopeId: envelopes.find(e => e.name==='Groceries')!.id },
      { userId: user.id, priority: 5, merchant: 'Safeway', envelopeId: envelopes.find(e => e.name==='Groceries')!.id },
      
      // Fast Food
      { userId: user.id, priority: 6, mcc: '5814', envelopeId: envelopes.find(e => e.name==='Fast Food')!.id }, // Fast Food (Starbucks, McDonald's)
      { userId: user.id, priority: 7, mcc: '5812', envelopeId: envelopes.find(e => e.name==='Fast Food')!.id }, // Eating places
      { userId: user.id, priority: 8, merchant: 'McDonald\'s', envelopeId: envelopes.find(e => e.name==='Fast Food')!.id },
      { userId: user.id, priority: 9, merchant: 'Starbucks', envelopeId: envelopes.find(e => e.name==='Fast Food')!.id },
      { userId: user.id, priority: 10, merchant: 'Subway', envelopeId: envelopes.find(e => e.name==='Fast Food')!.id },
      { userId: user.id, priority: 11, merchant: 'Taco Bell', envelopeId: envelopes.find(e => e.name==='Fast Food')!.id },
      
      // Dining (sit-down restaurants)
      { userId: user.id, priority: 12, mcc: '5813', envelopeId: envelopes.find(e => e.name==='Dining')!.id }, // Drinking places (bars)
      { userId: user.id, priority: 13, merchant: 'Chipotle', envelopeId: envelopes.find(e => e.name==='Dining')!.id },
      { userId: user.id, priority: 14, merchant: 'Olive Garden', envelopeId: envelopes.find(e => e.name==='Dining')!.id },
      { userId: user.id, priority: 15, merchant: 'Applebee\'s', envelopeId: envelopes.find(e => e.name==='Dining')!.id },
      
      // Gas
      { userId: user.id, priority: 16, mcc: '5541', envelopeId: envelopes.find(e => e.name==='Gas')!.id }, // Service stations
      { userId: user.id, priority: 17, mcc: '5542', envelopeId: envelopes.find(e => e.name==='Gas')!.id }, // Automated fuel dispensers
      { userId: user.id, priority: 18, merchant: 'Shell', envelopeId: envelopes.find(e => e.name==='Gas')!.id },
      { userId: user.id, priority: 19, merchant: 'Chevron', envelopeId: envelopes.find(e => e.name==='Gas')!.id },
      { userId: user.id, priority: 20, merchant: 'BP', envelopeId: envelopes.find(e => e.name==='Gas')!.id },
      
      // Bills/Utilities
      { userId: user.id, priority: 21, mcc: '4900', envelopeId: envelopes.find(e => e.name==='Bills')!.id }, // Utilities
      { userId: user.id, priority: 22, mcc: '4814', envelopeId: envelopes.find(e => e.name==='Bills')!.id }, // Telecom
      { userId: user.id, priority: 23, merchant: 'Verizon', envelopeId: envelopes.find(e => e.name==='Bills')!.id },
      { userId: user.id, priority: 24, merchant: 'Comcast', envelopeId: envelopes.find(e => e.name==='Bills')!.id },
      { userId: user.id, priority: 25, merchant: 'PG&E', envelopeId: envelopes.find(e => e.name==='Bills')!.id },
    ]
  });

  // Add sample transactions for AI training
  const sampleTransactions = [
    // Recent grocery purchases
    { merchant: 'Safeway #123', mcc: '5411', amountCents: -8750, location: 'San Francisco, CA', envelopeId: envelopes.find(e => e.name==='Groceries')!.id, postedAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000) },
    { merchant: 'Walmart Supercenter', mcc: '5411', amountCents: -12450, location: 'San Jose, CA', envelopeId: envelopes.find(e => e.name==='Groceries')!.id, postedAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000) },
    { merchant: 'Target Store', mcc: '5411', amountCents: -6890, location: 'Oakland, CA', envelopeId: envelopes.find(e => e.name==='Groceries')!.id, postedAt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) },
    
    // Fast food transactions
    { merchant: 'McDonald\'s #4567', mcc: '5814', amountCents: -1290, location: 'San Francisco, CA', envelopeId: envelopes.find(e => e.name==='Fast Food')!.id, postedAt: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000) },
    { merchant: 'Starbucks Coffee', mcc: '5814', amountCents: -545, location: 'Palo Alto, CA', envelopeId: envelopes.find(e => e.name==='Fast Food')!.id, postedAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000) },
    { merchant: 'Subway Sandwiches', mcc: '5814', amountCents: -890, location: 'San Francisco, CA', envelopeId: envelopes.find(e => e.name==='Fast Food')!.id, postedAt: new Date(Date.now() - 4 * 24 * 60 * 60 * 1000) },
    
    // Dining out
    { merchant: 'Olive Garden Restaurant', mcc: '5812', amountCents: -4750, location: 'San Mateo, CA', envelopeId: envelopes.find(e => e.name==='Dining')!.id, postedAt: new Date(Date.now() - 6 * 24 * 60 * 60 * 1000) },
    { merchant: 'Chipotle Mexican Grill', mcc: '5812', amountCents: -1345, location: 'Mountain View, CA', envelopeId: envelopes.find(e => e.name==='Dining')!.id, postedAt: new Date(Date.now() - 8 * 24 * 60 * 60 * 1000) },
    
    // Gas purchases
    { merchant: 'Shell Gas Station', mcc: '5541', amountCents: -4560, location: 'San Francisco, CA', envelopeId: envelopes.find(e => e.name==='Gas')!.id, postedAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000) },
    { merchant: 'Chevron Station', mcc: '5541', amountCents: -5290, location: 'San Jose, CA', envelopeId: envelopes.find(e => e.name==='Gas')!.id, postedAt: new Date(Date.now() - 9 * 24 * 60 * 60 * 1000) },
    
    // Bills and utilities
    { merchant: 'Verizon Wireless', mcc: '4814', amountCents: -8900, location: 'Online', envelopeId: envelopes.find(e => e.name==='Bills')!.id, postedAt: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000) },
    { merchant: 'PG&E Electric', mcc: '4900', amountCents: -15600, location: 'Online', envelopeId: envelopes.find(e => e.name==='Bills')!.id, postedAt: new Date(Date.now() - 15 * 24 * 60 * 60 * 1000) },
    { merchant: 'Comcast Cable', mcc: '4814', amountCents: -12900, location: 'Online', envelopeId: envelopes.find(e => e.name==='Bills')!.id, postedAt: new Date(Date.now() - 20 * 24 * 60 * 60 * 1000) },
    
    // Miscellaneous spending
    { merchant: 'Amazon.com', mcc: '5999', amountCents: -2890, location: 'Online', envelopeId: envelopes.find(e => e.name==='Misc')!.id, postedAt: new Date(Date.now() - 12 * 24 * 60 * 60 * 1000) },
    { merchant: 'CVS Pharmacy', mcc: '5912', amountCents: -1745, location: 'San Francisco, CA', envelopeId: envelopes.find(e => e.name==='Misc')!.id, postedAt: new Date(Date.now() - 14 * 24 * 60 * 60 * 1000) },
    
    // Some pending transactions for testing approval workflow
    { merchant: 'Whole Foods Market', mcc: '5411', amountCents: -9850, location: 'Palo Alto, CA', envelopeId: null, postedAt: null, status: 'PENDING' },
    { merchant: 'In-N-Out Burger', mcc: '5814', amountCents: -1650, location: 'San Francisco, CA', envelopeId: null, postedAt: null, status: 'PENDING' },
  ];

  for (const txn of sampleTransactions) {
    await prisma.transaction.create({
      data: {
        userId: user.id,
        merchant: txn.merchant,
        mcc: txn.mcc,
        amountCents: txn.amountCents,
        location: txn.location,
        envelopeId: txn.envelopeId,
        status: txn.status || 'SETTLED',
        postedAt: txn.postedAt,
        authorizedAt: txn.postedAt,
        createdAt: txn.postedAt || new Date(),
      },
    });
  }

  // Add sample transfers for AI context
  const sampleTransfers = [
    {
      fromId: envelopes.find(e => e.name === 'Buffer')!.id,
      toId: envelopes.find(e => e.name === 'Groceries')!.id,
      amountCents: 5000,
      note: 'Emergency grocery top-up for unexpected guests',
      createdAt: new Date(Date.now() - 11 * 24 * 60 * 60 * 1000),
    },
    {
      fromId: envelopes.find(e => e.name === 'Dining')!.id,
      toId: envelopes.find(e => e.name === 'Gas')!.id,
      amountCents: 2500,
      note: 'Moved funds due to higher gas prices this month',
      createdAt: new Date(Date.now() - 18 * 24 * 60 * 60 * 1000),
    },
    {
      fromId: null, // Income
      toId: envelopes.find(e => e.name === 'Bills')!.id,
      amountCents: 50000,
      note: 'Monthly budget allocation',
      createdAt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
    },
  ];

  for (const transfer of sampleTransfers) {
    await prisma.transfer.create({
      data: {
        userId: user.id,
        fromId: transfer.fromId,
        toId: transfer.toId,
        amountCents: transfer.amountCents,
        note: transfer.note,
        createdAt: transfer.createdAt,
      },
    });
  }

  // routing config defaults
  await prisma.routingConfig.upsert({
    where: { userId: user.id },
    update: {},
    create: { userId: user.id, spendMode: 'SMART_AUTO', useGeneralPool: true, bufferCents: 2000, confidence: 75 },
  });

  console.log('Seed complete.');
}

main()
  .catch(e => { console.error(e); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); });
