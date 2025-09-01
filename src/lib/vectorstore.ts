
import { PrismaClient } from '@prisma/client';
import { OpenAIEmbeddings } from 'openai';

const prisma = new PrismaClient();
const embeddings = new OpenAIEmbeddings({
  openAIApiKey: process.env.OPENAI_API_KEY,
  modelName: process.env.EMBEDDINGS_MODEL || 'text-embedding-ada-002',
});

export interface EmbeddingData {
  content: string;
  docType: string;
  metadata?: Record<string, any>;
}

export class SupabaseVectorStore {
  /**
   * Upsert an embedding into the database
   */
  static async upsertEmbedding(
    userId: number,
    data: EmbeddingData
  ): Promise<string> {
    try {
      // Generate embedding vector
      const vector = await embeddings.embedQuery(data.content);

      // Check if embedding already exists
      const existing = await prisma.embedding.findFirst({
        where: {
          ownerId: userId,
          docType: data.docType,
          content: data.content,
        },
      });

      if (existing) {
        // Update existing embedding
        await prisma.embedding.update({
          where: { id: existing.id },
          data: {
            embedding: vector as any, // Type assertion for pgvector
            metadata: data.metadata,
            updatedAt: new Date(),
          },
        });
        return existing.id;
      } else {
        // Create new embedding
        const result = await prisma.embedding.create({
          data: {
            ownerId: userId,
            docType: data.docType,
            content: data.content,
            embedding: vector as any, // Type assertion for pgvector
            metadata: data.metadata,
          },
        });
        return result.id;
      }
    } catch (error) {
      console.error('Error upserting embedding:', error);
      throw new Error('Failed to upsert embedding');
    }
  }

  /**
   * Perform semantic search across user's embeddings
   */
  static async semanticSearch(
    userId: number,
    query: string,
    docType?: string,
    limit: number = 5
  ): Promise<Array<{ content: string; metadata?: Record<string, any>; similarity: number }>> {
    try {
      // Generate query embedding
      const queryVector = await embeddings.embedQuery(query);

      // Build where clause
      const whereClause: any = { ownerId: userId };
      if (docType) {
        whereClause.docType = docType;
      }

      // Perform similarity search using pgvector
      const results = await prisma.$queryRaw`
        SELECT
          content,
          metadata,
          embedding <=> ${queryVector}::vector as similarity
        FROM embeddings
        WHERE owner_id = ${userId}
        ${docType ? prisma.$queryRaw`AND doc_type = ${docType}` : prisma.$queryRaw``}
        ORDER BY similarity ASC
        LIMIT ${limit}
      `;

      return results as Array<{ content: string; metadata?: Record<string, any>; similarity: number }>;
    } catch (error) {
      console.error('Error performing semantic search:', error);
      throw new Error('Failed to perform semantic search');
    }
  }

  /**
   * Get embeddings by document type for a user
   */
  static async getEmbeddingsByType(
    userId: number,
    docType: string,
    limit: number = 100
  ): Promise<Array<{ id: string; content: string; metadata?: Record<string, any> }>> {
    try {
      const results = await prisma.embedding.findMany({
        where: {
          ownerId: userId,
          docType: docType,
        },
        select: {
          id: true,
          content: true,
          metadata: true,
        },
        orderBy: {
          createdAt: 'desc',
        },
        take: limit,
      });

      return results;
    } catch (error) {
      console.error('Error getting embeddings by type:', error);
      throw new Error('Failed to get embeddings by type');
    }
  }

  /**
   * Delete embeddings by document type for a user
   */
  static async deleteEmbeddingsByType(
    userId: number,
    docType: string
  ): Promise<number> {
    try {
      const result = await prisma.embedding.deleteMany({
        where: {
          ownerId: userId,
          docType: docType,
        },
      });

      return result.count;
    } catch (error) {
      console.error('Error deleting embeddings by type:', error);
      throw new Error('Failed to delete embeddings by type');
    }
  }
}

// Export convenience functions
export const upsertEmbedding = SupabaseVectorStore.upsertEmbedding;
export const semanticSearch = SupabaseVectorStore.semanticSearch;
export const getEmbeddingsByType = SupabaseVectorStore.getEmbeddingsByType;
export const deleteEmbeddingsByType = SupabaseVectorStore.deleteEmbeddingsByType;
