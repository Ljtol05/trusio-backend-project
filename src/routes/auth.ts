
import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import { db } from '../lib/db.js';
import { env } from '../config/env.js';
import { sendVerificationEmail } from '../lib/email.js';
import { logger } from '../lib/logger.js';

const router = Router();

// Validation schemas
const registerSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  email: z.string().email('Invalid email'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
});

const loginSchema = z.object({
  email: z.string().email('Invalid email'),
  password: z.string().min(1, 'Password is required'),
});

const verifyEmailSchema = z.object({
  email: z.string().email('Invalid email'),
  code: z.string().length(6, 'Verification code must be 6 digits'),
});

const resendVerificationSchema = z.object({
  email: z.string().email('Invalid email'),
});

// Generate 6-digit verification code
function generateVerificationCode(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

// Generate JWT token
function generateToken(userId: number): string {
  return jwt.sign({ userId }, env.JWT_SECRET, { expiresIn: '7d' });
}

// POST /api/auth/register
router.post('/register', async (req, res) => {
  try {
    const { name, email, password } = registerSchema.parse(req.body);

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
    await db.user.create({
      data: {
        name,
        email,
        password: hashedPassword,
        emailVerified: false,
        verificationCode,
      },
    });

    // Send verification email
    await sendVerificationEmail(email, verificationCode);

    logger.info({ email }, 'User registered, verification email sent');
    res.status(201).json({ message: 'Verification email sent.' });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors[0].message });
    }
    logger.error(error, 'Registration error');
    res.status(500).json({ error: 'Registration failed' });
  }
});

// POST /api/auth/verify-email
router.post('/verify-email', async (req, res) => {
  try {
    const { email, code } = verifyEmailSchema.parse(req.body);

    // Find user
    const user = await db.user.findUnique({ where: { email } });
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Check if already verified
    if (user.emailVerified) {
      return res.status(400).json({ error: 'Email already verified' });
    }

    // Check verification code
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
        email: user.email,
        name: user.name,
        emailVerified: true,
        kycApproved: user.kycApproved,
      }
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors[0].message });
    }
    logger.error(error, 'Email verification error');
    res.status(500).json({ error: 'Email verification failed' });
  }
});

// POST /api/auth/resend-verification
router.post('/resend-verification', async (req, res) => {
  try {
    const { email } = resendVerificationSchema.parse(req.body);

    // Find user
    const user = await db.user.findUnique({ where: { email } });
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Check if already verified
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

    logger.info({ email }, 'Verification email resent');
    res.json({ message: 'Verification email resent.' });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors[0].message });
    }
    logger.error(error, 'Resend verification error');
    res.status(500).json({ error: 'Failed to resend verification email' });
  }
});

// POST /api/auth/login
router.post('/login', async (req, res) => {
  try {
    const { email, password } = loginSchema.parse(req.body);

    // Find user
    const user = await db.user.findUnique({ where: { email } });
    if (!user || !user.password) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Check password
    const validPassword = await bcrypt.compare(password, user.password);
    if (!validPassword) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Check if email is verified
    if (!user.emailVerified) {
      return res.status(403).json({ message: 'Please verify your email.' });
    }

    // Check if KYC is approved
    if (!user.kycApproved) {
      return res.status(403).json({ message: 'Please complete KYC.' });
    }

    // Generate token
    const token = generateToken(user.id);

    logger.info({ userId: user.id, email }, 'User logged in');
    res.json({
      token,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        emailVerified: user.emailVerified,
        kycApproved: user.kycApproved,
      }
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors[0].message });
    }
    logger.error(error, 'Login error');
    res.status(500).json({ error: 'Login failed' });
  }
});

// Middleware to verify JWT token
export const authenticateToken = async (req: any, res: any, next: any) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Access token required' });
  }

  try {
    const decoded = jwt.verify(token, env.JWT_SECRET) as { userId: number };
    const user = await db.user.findUnique({ where: { id: decoded.userId } });
    
    if (!user) {
      return res.status(401).json({ error: 'Invalid token' });
    }

    req.user = user;
    next();
  } catch (error) {
    return res.status(403).json({ error: 'Invalid or expired token' });
  }
};

// GET /api/auth/me
router.get('/me', authenticateToken, async (req: any, res) => {
  res.json({
    user: {
      id: req.user.id,
      email: req.user.email,
      name: req.user.name,
      emailVerified: req.user.emailVerified,
      kycApproved: req.user.kycApproved,
    }
  });
});

export default router;
