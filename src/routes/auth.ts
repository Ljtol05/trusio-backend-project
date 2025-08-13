
import { Router } from 'express';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { db } from '../lib/db.js';
import { logger } from '../lib/logger.js';
import { sendVerificationEmail } from '../lib/email.js';
import { env } from '../config/env.js';

const router = Router();

// Validation schemas
const RegisterSchema = z.object({
  name: z.string().min(1).max(100),
  email: z.string().email(),
  password: z.string().min(8),
});

const LoginSchema = z.object({
  email: z.string().email(),
  password: z.string(),
});

const VerifyEmailSchema = z.object({
  email: z.string().email(),
  code: z.string().length(6),
});

const ResendVerificationSchema = z.object({
  email: z.string().email(),
});

// Generate JWT token
const generateToken = (userId: number) => {
  return jwt.sign({ userId }, env.JWT_SECRET || 'fallback-secret', {
    expiresIn: '7d',
  });
};

// Generate 6-digit verification code
const generateVerificationCode = () => {
  return Math.floor(100000 + Math.random() * 900000).toString();
};

// Replit Auth middleware (existing)
export const requireAuth = async (req: any, res: any, next: any) => {
  try {
    const userId = req.headers['x-replit-user-id'];
    const userName = req.headers['x-replit-user-name'];
    const userEmail = req.headers['x-replit-user-name'] + '@replit.com';

    if (!userId) {
      // Check for JWT token as fallback
      const token = req.headers.authorization?.replace('Bearer ', '');
      if (token) {
        try {
          const decoded = jwt.verify(token, env.JWT_SECRET || 'fallback-secret') as any;
          const user = await db.user.findUnique({ where: { id: decoded.userId } });
          if (user) {
            req.user = { id: user.id };
            return next();
          }
        } catch (jwtError) {
          return res.status(401).json({ error: 'Invalid token' });
        }
      }
      return res.status(401).json({ error: 'Authentication required' });
    }

    // Find or create user (Replit auth)
    let user = await db.user.findFirst({
      where: { email: userEmail },
    });

    if (!user) {
      user = await db.user.create({
        data: {
          email: userEmail,
          name: userName,
          emailVerified: true, // Replit auth users are pre-verified
          kycApproved: false,
        },
      });
      logger.info({ userId: user.id, email: userEmail }, 'Created new user');
    }

    req.user = { id: user.id };
    next();
  } catch (error) {
    logger.error(error, 'Auth middleware error');
    res.status(500).json({ error: 'Authentication failed' });
  }
};

// POST /api/auth/register
router.post('/register', async (req, res) => {
  try {
    const { name, email, password } = RegisterSchema.parse(req.body);

    // Check if user already exists
    const existingUser = await db.user.findUnique({ where: { email } });
    if (existingUser) {
      return res.status(400).json({ error: 'User already exists' });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 12);

    // Generate verification code
    const verificationCode = generateVerificationCode();

    // Create user
    const user = await db.user.create({
      data: {
        name,
        email,
        password: hashedPassword,
        emailVerified: false,
        kycApproved: false,
        verificationCode,
      },
    });

    // Send verification email
    await sendVerificationEmail(email, verificationCode);

    logger.info({ userId: user.id, email }, 'User registered successfully');
    res.status(201).json({ message: 'Verification email sent.' });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Validation failed', details: error.errors });
    }
    logger.error({ error }, 'Registration error');
    res.status(500).json({ error: 'Registration failed' });
  }
});

// POST /api/auth/verify-email
router.post('/verify-email', async (req, res) => {
  try {
    const { email, code } = VerifyEmailSchema.parse(req.body);

    const user = await db.user.findUnique({ where: { email } });
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    if (user.emailVerified) {
      return res.status(400).json({ error: 'Email already verified' });
    }

    if (user.verificationCode !== code) {
      return res.status(400).json({ error: 'Invalid verification code' });
    }

    // Update user
    await db.user.update({
      where: { id: user.id },
      data: {
        emailVerified: true,
        verificationCode: null,
      },
    });

    // Generate auth token
    const token = generateToken(user.id);

    logger.info({ userId: user.id, email }, 'Email verified successfully');
    res.json({ 
      message: 'Email verified.',
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        emailVerified: true,
        kycApproved: user.kycApproved,
      }
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Validation failed', details: error.errors });
    }
    logger.error({ error }, 'Email verification error');
    res.status(500).json({ error: 'Email verification failed' });
  }
});

// POST /api/auth/resend-verification
router.post('/resend-verification', async (req, res) => {
  try {
    const { email } = ResendVerificationSchema.parse(req.body);

    const user = await db.user.findUnique({ where: { email } });
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    if (user.emailVerified) {
      return res.status(400).json({ error: 'Email already verified' });
    }

    // Generate new verification code
    const verificationCode = generateVerificationCode();

    // Update user with new code
    await db.user.update({
      where: { id: user.id },
      data: { verificationCode },
    });

    // Send verification email
    await sendVerificationEmail(email, verificationCode);

    logger.info({ userId: user.id, email }, 'Verification code resent');
    res.json({ message: 'Verification email resent.' });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Validation failed', details: error.errors });
    }
    logger.error({ error }, 'Resend verification error');
    res.status(500).json({ error: 'Failed to resend verification' });
  }
});

// POST /api/auth/login
router.post('/login', async (req, res) => {
  try {
    const { email, password } = LoginSchema.parse(req.body);

    const user = await db.user.findUnique({ where: { email } });
    if (!user || !user.password) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Verify password
    const isValidPassword = await bcrypt.compare(password, user.password);
    if (!isValidPassword) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Check email verification
    if (!user.emailVerified) {
      return res.status(403).json({ error: 'Please verify your email.' });
    }

    // Check KYC approval
    if (!user.kycApproved) {
      return res.status(403).json({ error: 'Please complete KYC.' });
    }

    // Generate token
    const token = generateToken(user.id);

    logger.info({ userId: user.id, email }, 'User logged in successfully');
    res.json({
      message: 'Login successful',
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        emailVerified: user.emailVerified,
        kycApproved: user.kycApproved,
      }
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Validation failed', details: error.errors });
    }
    logger.error({ error }, 'Login error');
    res.status(500).json({ error: 'Login failed' });
  }
});

// GET /api/auth/me - Get current user
router.get('/me', requireAuth, async (req: any, res) => {
  try {
    const user = await db.user.findUnique({
      where: { id: req.user.id },
      select: { 
        id: true, 
        email: true, 
        name: true, 
        emailVerified: true, 
        kycApproved: true 
      },
    });

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({ user });
  } catch (error) {
    logger.error(error, 'Error fetching user');
    res.status(500).json({ error: 'Failed to fetch user' });
  }
});

export default router;
