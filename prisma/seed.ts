
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
    { name: 'Gas',       balanceCents: 11000, icon: 'fuel', color: 'teal', order: 3 },
    { name: 'Bills',     balanceCents:124500, icon: 'receipt', color: 'blue', order: 4 },
    { name: 'Buffer',    balanceCents: 30000, icon: 'shield', color: 'slate', order: 5 },
    { name: 'Misc',      balanceCents:  7500, icon: 'dots', color: 'gray', order: 6 },
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

  // a couple of rules for demo
  await prisma.rule.createMany({
    data: [
      { userId: user.id, priority: 1, mcc: '5411', envelopeId: envelopes.find(e => e.name==='Groceries')!.id }, // Grocery stores
      { userId: user.id, priority: 2, merchant: 'Chipotle', envelopeId: envelopes.find(e => e.name==='Dining')!.id },
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
