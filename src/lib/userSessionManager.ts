import { logger } from './logger.js';
import { db } from './db.js';
import crypto from 'crypto';

export interface UserSession {
  userId: string;
  sessionId: string;
  sessionType: 'voice_onboarding' | 'text_coaching' | 'goal_tracking';
  isActive: boolean;
  createdAt: Date;
  lastActivity: Date;
  endedAt?: Date;
  contextData: string;
  personalAIActive: boolean;
  conversationHistory: any[];
  currentGoals: any[];
  achievements: any[];
}

export class UserSessionManager {
  private static instance: UserSessionManager;
  private userSessions: Map<string, UserSession> = new Map();
  private sessionTimeouts: Map<string, NodeJS.Timeout> = new Map();
  private readonly encryptionKey: Buffer;

  private constructor() {
    this.encryptionKey = Buffer.from(process.env.SESSION_ENCRYPTION_KEY || crypto.randomBytes(32));
  }

  static getInstance(): UserSessionManager {
    if (!UserSessionManager.instance) {
      UserSessionManager.instance = new UserSessionManager();
    }
    return UserSessionManager.instance;
  }

  async createSession(
    userId: string, 
    sessionType: 'voice_onboarding' | 'text_coaching' | 'goal_tracking',
    initialData?: any
  ): Promise<UserSession> {
    const sessionId = `${sessionType}_${userId}_${Date.now()}`;

    const session: UserSession = {
      sessionId,
      userId,
      sessionType,
      isActive: true,
      createdAt: new Date(),
      lastActivity: new Date(),
      contextData: this.encryptContextData(initialData || {}),
      personalAIActive: sessionType === 'voice_onboarding',
      conversationHistory: [],
      currentGoals: [],
      achievements: []
    };

    this.userSessions.set(sessionId, session);
    this.setSessionTimeout(sessionId);

    logger.info({ userId, sessionId, sessionType }, 'User session created');
    return session;
  }

  async getSession(sessionId: string): Promise<UserSession | null> {
    const session = this.userSessions.get(sessionId);
    if (session && session.isActive) {
      this.updateLastActivity(sessionId);
      return session;
    }
    return null;
  }

  async updateSession(sessionId: string, updates: Partial<UserSession>): Promise<void> {
    const session = this.userSessions.get(sessionId);
    if (session) {
      Object.assign(session, updates);
      session.lastActivity = new Date();
      this.userSessions.set(sessionId, session);
      this.setSessionTimeout(sessionId);
    }
  }

  async endSession(sessionId: string): Promise<void> {
    const session = this.userSessions.get(sessionId);
    if (session) {
      session.isActive = false;
      session.endedAt = new Date();

      // Clear timeout
      const timeout = this.sessionTimeouts.get(sessionId);
      if (timeout) {
        clearTimeout(timeout);
        this.sessionTimeouts.delete(sessionId);
      }

      logger.info({ 
        sessionId, 
        userId: session.userId, 
        duration: Date.now() - session.createdAt.getTime() 
      }, 'User session ended');
    }
  }

  async getUserActiveSessions(userId: string): Promise<UserSession[]> {
    return Array.from(this.userSessions.values())
      .filter(session => session.userId === userId && session.isActive);
  }

  private updateLastActivity(sessionId: string): void {
    const session = this.userSessions.get(sessionId);
    if (session) {
      session.lastActivity = new Date();
      this.setSessionTimeout(sessionId);
    }
  }

  private setSessionTimeout(sessionId: string): void {
    // Clear existing timeout
    const existingTimeout = this.sessionTimeouts.get(sessionId);
    if (existingTimeout) {
      clearTimeout(existingTimeout);
    }

    // Set new timeout (30 minutes of inactivity)
    const timeout = setTimeout(() => {
      this.endSession(sessionId);
    }, 30 * 60 * 1000);

    this.sessionTimeouts.set(sessionId, timeout);
  }

  private encryptContextData(data: any): string {
    try {
      const iv = crypto.randomBytes(16);
      const cipher = crypto.createCipherGCM('aes-256-gcm', this.encryptionKey);

      let encrypted = cipher.update(JSON.stringify(data), 'utf8', 'hex');
      encrypted += cipher.final('hex');

      const authTag = cipher.getAuthTag();
      return iv.toString('hex') + ':' + authTag.toString('hex') + ':' + encrypted;
    } catch (error) {
      logger.error({ error }, 'Failed to encrypt context data');
      return JSON.stringify(data); // Fallback to unencrypted
    }
  }

  private decryptContextData(encryptedData: string): any {
    try {
      const parts = encryptedData.split(':');
      if (parts.length !== 3) {
        // Fallback for unencrypted data
        return JSON.parse(encryptedData);
      }

      const iv = Buffer.from(parts[0], 'hex');
      const authTag = Buffer.from(parts[1], 'hex');
      const encrypted = parts[2];

      const decipher = crypto.createDecipherGCM('aes-256-gcm', this.encryptionKey);
      decipher.setAuthTag(authTag);

      let decrypted = decipher.update(encrypted, 'hex', 'utf8');
      decrypted += decipher.final('utf8');

      return JSON.parse(decrypted);
    } catch (error) {
      logger.error({ error }, 'Failed to decrypt context data');
      return {};
    }
  }

  // Cleanup old sessions (call periodically)
  async cleanupOldSessions(): Promise<void> {
    const now = Date.now();
    const maxAge = 24 * 60 * 60 * 1000; // 24 hours

    for (const [sessionId, session] of this.userSessions.entries()) {
      const age = now - session.createdAt.getTime();
      if (age > maxAge || (!session.isActive && session.endedAt && (now - session.endedAt.getTime()) > 60 * 60 * 1000)) {
        this.userSessions.delete(sessionId);
        this.sessionTimeouts.delete(sessionId);
      }
    }
  }
}

export const userSessionManager = UserSessionManager.getInstance();

// Cleanup expired sessions every hour
setInterval(() => {
  userSessionManager.cleanupOldSessions().catch(error => {
    logger.error({ error }, 'Failed to cleanup old sessions');
  });
}, 60 * 60 * 1000); // 1 hour