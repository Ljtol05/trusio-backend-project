
import { logger } from './logger.js';
import { db } from './db.js';
import crypto from 'crypto';

export interface UserSession {
  userId: string;
  sessionId: string;
  sessionType: 'onboarding' | 'coaching' | 'analysis' | 'goal_tracking';
  isActive: boolean;
  encryptedData: string;
  metadata: any;
  createdAt: Date;
  updatedAt: Date;
  expiresAt: Date;
}

class UserSessionManager {
  private readonly encryptionKey: Buffer;
  private activeSessions: Map<string, UserSession> = new Map();

  constructor() {
    this.encryptionKey = Buffer.from(process.env.SESSION_ENCRYPTION_KEY || crypto.randomBytes(32));
  }

  private encrypt(data: any): string {
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipherGCM('aes-256-gcm', this.encryptionKey);
    
    let encrypted = cipher.update(JSON.stringify(data), 'utf8', 'hex');
    encrypted += cipher.final('hex');
    
    const authTag = cipher.getAuthTag();
    return iv.toString('hex') + ':' + authTag.toString('hex') + ':' + encrypted;
  }

  private decrypt(encryptedData: string): any {
    const parts = encryptedData.split(':');
    const iv = Buffer.from(parts[0], 'hex');
    const authTag = Buffer.from(parts[1], 'hex');
    const encrypted = parts[2];
    
    const decipher = crypto.createDecipherGCM('aes-256-gcm', this.encryptionKey);
    decipher.setAuthTag(authTag);
    
    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    
    return JSON.parse(decrypted);
  }

  async createSession(
    userId: string, 
    sessionType: UserSession['sessionType'],
    initialData: any,
    durationHours: number = 24
  ): Promise<UserSession> {
    try {
      const sessionId = `${sessionType}_${userId}_${Date.now()}_${crypto.randomUUID()}`;
      const expiresAt = new Date();
      expiresAt.setHours(expiresAt.getHours() + durationHours);

      const session: UserSession = {
        userId,
        sessionId,
        sessionType,
        isActive: true,
        encryptedData: this.encrypt(initialData),
        metadata: {
          userAgent: initialData.userAgent,
          ipAddress: initialData.ipAddress,
          createdBy: 'system'
        },
        createdAt: new Date(),
        updatedAt: new Date(),
        expiresAt
      };

      // Store in memory for quick access
      this.activeSessions.set(sessionId, session);

      // Store in database for persistence
      await this.persistSession(session);

      logger.info({ userId, sessionId, sessionType }, 'User session created');
      return session;

    } catch (error) {
      logger.error({ error, userId }, 'Failed to create user session');
      throw error;
    }
  }

  async getSession(sessionId: string): Promise<UserSession | null> {
    try {
      // Check memory first
      let session = this.activeSessions.get(sessionId);
      
      if (!session) {
        // Load from database
        session = await this.loadSession(sessionId);
        if (session) {
          this.activeSessions.set(sessionId, session);
        }
      }

      // Check if session is expired
      if (session && session.expiresAt < new Date()) {
        await this.expireSession(sessionId);
        return null;
      }

      return session;

    } catch (error) {
      logger.error({ error, sessionId }, 'Failed to get user session');
      return null;
    }
  }

  async updateSession(sessionId: string, data: any): Promise<void> {
    try {
      const session = await this.getSession(sessionId);
      if (!session) {
        throw new Error('Session not found');
      }

      // Merge with existing data
      const currentData = this.decrypt(session.encryptedData);
      const mergedData = { ...currentData, ...data, updatedAt: new Date() };

      session.encryptedData = this.encrypt(mergedData);
      session.updatedAt = new Date();

      // Update in memory and database
      this.activeSessions.set(sessionId, session);
      await this.persistSession(session);

      logger.debug({ sessionId }, 'Session updated');

    } catch (error) {
      logger.error({ error, sessionId }, 'Failed to update session');
      throw error;
    }
  }

  async getSessionData(sessionId: string): Promise<any> {
    const session = await this.getSession(sessionId);
    if (!session) {
      return null;
    }
    return this.decrypt(session.encryptedData);
  }

  async expireSession(sessionId: string): Promise<void> {
    try {
      const session = this.activeSessions.get(sessionId);
      if (session) {
        session.isActive = false;
        await this.persistSession(session);
      }

      this.activeSessions.delete(sessionId);
      logger.info({ sessionId }, 'Session expired');

    } catch (error) {
      logger.error({ error, sessionId }, 'Failed to expire session');
    }
  }

  async getUserActiveSessions(userId: string): Promise<UserSession[]> {
    try {
      return Array.from(this.activeSessions.values())
        .filter(session => session.userId === userId && session.isActive);

    } catch (error) {
      logger.error({ error, userId }, 'Failed to get user active sessions');
      return [];
    }
  }

  private async persistSession(session: UserSession): Promise<void> {
    // Implementation would store in database
    // For now, we'll use the userMemory table as a temporary solution
    try {
      await db.userMemory.upsert({
        where: {
          userId_type: {
            userId: session.userId,
            type: `session_${session.sessionId}`
          }
        },
        update: {
          content: session.encryptedData,
          metadata: JSON.stringify({
            sessionType: session.sessionType,
            isActive: session.isActive,
            updatedAt: session.updatedAt,
            expiresAt: session.expiresAt
          })
        },
        create: {
          userId: session.userId,
          type: `session_${session.sessionId}`,
          content: session.encryptedData,
          metadata: JSON.stringify({
            sessionType: session.sessionType,
            isActive: session.isActive,
            createdAt: session.createdAt,
            updatedAt: session.updatedAt,
            expiresAt: session.expiresAt
          })
        }
      });

    } catch (error) {
      logger.error({ error, sessionId: session.sessionId }, 'Failed to persist session');
    }
  }

  private async loadSession(sessionId: string): Promise<UserSession | null> {
    // Implementation would load from database
    return null;
  }

  // Cleanup expired sessions
  async cleanupExpiredSessions(): Promise<number> {
    let cleanedCount = 0;
    const now = new Date();

    for (const [sessionId, session] of this.activeSessions.entries()) {
      if (session.expiresAt < now) {
        await this.expireSession(sessionId);
        cleanedCount++;
      }
    }

    logger.info({ cleanedCount }, 'Cleaned up expired sessions');
    return cleanedCount;
  }
}

export const userSessionManager = new UserSessionManager();

// Cleanup expired sessions every hour
setInterval(() => {
  userSessionManager.cleanupExpiredSessions().catch(error => {
    logger.error({ error }, 'Failed to cleanup expired sessions');
  });
}, 60 * 60 * 1000); // 1 hour
