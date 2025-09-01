import { API_BASE_URL } from '../config/api';

export const authService = {
  async register(email: string, password: string) {
    const response = await fetch(`${API_BASE_URL}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    return response.json();
  },

  async login(email: string, password: string) {
    const response = await fetch(`${API_BASE_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    return response.json();
  },

  async healthCheck() {
    const response = await fetch(`${API_BASE_URL}/healthz`);
    return response.json();
  },
};

import * as jwt from 'jsonwebtoken';
import { Request, Response, NextFunction } from 'express';
import { db } from '../lib/db.js';
import { env } from '../config/env.js';

export interface AuthenticatedRequest extends Request {
  user?: {
    id: number;
    email: string;
    name: string;
  };
}

export const authenticateToken = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

  if (!token) {
    return res.status(401).json({ error: 'Access token required' });
  }

  try {
    const decoded = jwt.verify(token, env.JWT_SECRET) as { userId: string };

          const user = await db.user.findUnique({
        where: { id: parseInt(decoded.userId) },
        select: { id: true, email: true, name: true }
      });

    if (!user) {
      return res.status(403).json({ error: 'Invalid token' });
    }

    req.user = user;
    next();
  } catch (error) {
    return res.status(403).json({ error: 'Invalid token' });
  }
};

// Export auth as an alias for authenticateToken to match import expectations
export const auth = authenticateToken;
