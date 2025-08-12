
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  // single stub user
  const user = await prisma.user.upsert({
    where: { email: 'demo@envelopes.app' },
    update: {},
    create: { email: 'demo@envelopes.app' },
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
      update: { balanceCents: n.balanceCents, icon: n.icon, color: n.color, order: n.order },
      create: { userId: user.id, name: n.name, balanceCents: n.balanceCents, icon: n.icon, color: n.color, order: n.order },
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
      
      // Fast Food
      { userId: user.id, priority: 3, mcc: '5814', envelopeId: envelopes.find(e => e.name==='Fast Food')!.id }, // Fast Food (Starbucks, McDonald's)
      { userId: user.id, priority: 4, mcc: '5812', envelopeId: envelopes.find(e => e.name==='Fast Food')!.id }, // Eating places
      
      // Dining (sit-down restaurants)
      { userId: user.id, priority: 5, mcc: '5813', envelopeId: envelopes.find(e => e.name==='Dining')!.id }, // Drinking places (bars)
      { userId: user.id, priority: 6, merchant: 'Chipotle', envelopeId: envelopes.find(e => e.name==='Dining')!.id },
      
      // Gas
      { userId: user.id, priority: 7, mcc: '5541', envelopeId: envelopes.find(e => e.name==='Gas')!.id }, // Service stations
      { userId: user.id, priority: 8, mcc: '5542', envelopeId: envelopes.find(e => e.name==='Gas')!.id }, // Automated fuel dispensers
      
      // Bills/Utilities
      { userId: user.id, priority: 9, mcc: '4900', envelopeId: envelopes.find(e => e.name==='Bills')!.id }, // Utilities
      { userId: user.id, priority: 10, mcc: '4814', envelopeId: envelopes.find(e => e.name==='Bills')!.id }, // Telecom
    ]
  });

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
