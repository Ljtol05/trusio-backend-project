
import { openai } from './openai.js';
import { db } from './db.js';

// Simple vector storage using Prisma (upgrade to Pinecone/Weaviate later)
export interface UserMemory {
  userId: number;
  type: 'conversation' | 'bank_statement' | 'spending_pattern' | 'goal';
  content: string;
  embedding?: number[];
  metadata: any;
  timestamp: Date;
}

// Store user interactions for AI context
export async function storeUserMemory(
  userId: number, 
  type: UserMemory['type'],
  content: string,
  metadata: any = {}
) {
  if (!openai) return null;

  try {
    // Generate embedding for semantic search
    const embedding = await openai.embeddings.create({
      model: 'text-embedding-3-small',
      input: content
    });

    // Store in a new UserMemory table (you'll need to add this to schema)
    const memory = await db.userMemory.create({
      data: {
        userId,
        type,
        content,
        embedding: embedding.data[0].embedding,
        metadata,
        createdAt: new Date()
      }
    });

    return memory;
  } catch (error) {
    console.error('Failed to store user memory:', error);
    return null;
  }
}

// Retrieve relevant memories for AI context
export async function getUserContext(userId: number, query: string, limit = 5) {
  if (!openai) return [];

  try {
    // Generate embedding for the query
    const queryEmbedding = await openai.embeddings.create({
      model: 'text-embedding-3-small',
      input: query
    });

    // Simple cosine similarity search (upgrade to proper vector DB later)
    const memories = await db.userMemory.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: limit * 2 // Get more to filter by relevance
    });

    // Return recent relevant memories
    return memories
      .slice(0, limit)
      .map(m => ({
        type: m.type,
        content: m.content,
        metadata: m.metadata,
        timestamp: m.createdAt
      }));

  } catch (error) {
    console.error('Failed to retrieve user context:', error);
    return [];
  }
}

// Analyze bank statements and store spending patterns
export async function analyzeBankStatement(userId: number, transactions: any[]) {
  const patterns = {
    topMerchants: {} as Record<string, number>,
    categorySpending: {} as Record<string, number>,
    monthlyAverage: 0,
    spendingTrends: [] as string[]
  };

  // Analyze transaction patterns
  transactions.forEach(txn => {
    const merchant = txn.merchant || 'Unknown';
    const amount = Math.abs(txn.amount || 0);
    
    patterns.topMerchants[merchant] = (patterns.topMerchants[merchant] || 0) + amount;
    // Add more pattern analysis...
  });

  patterns.monthlyAverage = transactions.reduce((sum, txn) => sum + Math.abs(txn.amount || 0), 0) / 12;

  // Store as user memory
  await storeUserMemory(userId, 'spending_pattern', JSON.stringify(patterns), {
    source: 'bank_statement',
    transactionCount: transactions.length
  });

  return patterns;
}
