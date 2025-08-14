
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
  name: z.string().min(1, 'Name is required').optional(),
  firstName: z.string().min(1, 'First name is required').optional(),
  lastName: z.string().min(1, 'Last name is required').optional(),
  email: z.string().email('Invalid email'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
}).refine(
  (data) => data.name || (data.firstName && data.lastName),
  {
    message: "Either 'name' or both 'firstName' and 'lastName' are required",
    path: ["name"]
  }
);

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

const startPhoneVerificationSchema = z.object({
  phone: z.string().regex(/^\+?[\d\s\-\(\)]+$/, 'Invalid phone number format'),
});

const verifyPhoneSchema = z.object({
  phone: z.string().regex(/^\+?[\d\s\-\(\)]+$/, 'Invalid phone number format'),
  code: z.string().length(6, 'Verification code must be 6 digits'),
});

const resendPhoneCodeSchema = z.object({
  phone: z.string().regex(/^\+?[\d\s\-\(\)]+$/, 'Invalid phone number format'),
});

// Generate 6-digit verification code
function generateVerificationCode(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

// Generate JWT token
function generateToken(userId: number): string {
  return jwt.sign({ userId }, env.JWT_SECRET, { expiresIn: '7d' });
}

// Send phone verification SMS
async function sendPhoneVerificationSMS(phone: string, code: string): Promise<void> {
  // Always try to send real SMS if Twilio is configured
  if (process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN && process.env.TWILIO_PHONE_NUMBER) {
    try {

    const twilio = require('twilio');
    const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
    
    await client.messages.create({
      body: `Your verification code is: ${code}. This code will expire in 10 minutes.`,
      from: process.env.TWILIO_PHONE_NUMBER,
      to: phone
    });

    logger.info({ phone }, 'SMS verification sent successfully');
      return;
    } catch (error) {
      logger.error({ error, phone }, 'Failed to send SMS verification');
      // Fallback to console in case of error
      console.log(`\n📱 FALLBACK SMS VERIFICATION for ${phone}: ${code}\n`);
      return;
    }
  }

  // Development mode fallback when no Twilio configured
  console.log(`\n📱 DEV SMS VERIFICATION for ${phone}: ${code}\n`);
}

// POST /api/auth/register
router.post('/register', async (req, res) => {
  try {
    const { name, firstName, lastName, email, password } = registerSchema.parse(req.body);

    // Combine firstName and lastName if provided, otherwise use name
    const fullName = name || `${firstName} ${lastName}`.trim();

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
        name: fullName,
        email,
        password: hashedPassword,
        emailVerified: false,
        verificationCode,
      },
    });

    // Send verification email
    await sendVerificationEmail(email, verificationCode);

    logger.info({ email }, 'User registered, verification email sent');
    res.status(201).json({ 
      message: 'Verification email sent.',
      user: {
        email,
        name: fullName,
        emailVerified: false,
        phoneVerified: false,
        kycApproved: false
      }
    });
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
    logger.debug({ body: req.body }, 'Verify email request received');
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

    // Generate auth token for authenticated API access
    const token = generateToken(user.id);

    logger.info({ userId: user.id, email }, 'Email verified successfully');
    res.json({ 
      message: 'Email verified. Please verify your phone number.',
      token,
      nextStep: 'phone',
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        phone: user.phone,
        emailVerified: true,
        phoneVerified: user.phoneVerified,
        kycApproved: user.kycApproved,
      }
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      logger.error({ zodErrors: error.errors, requestBody: req.body }, 'Validation failed for verify-email');
      return res.status(400).json({ error: error.errors[0].message, details: error.errors });
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

    // Generate token for authenticated API access even if verification incomplete
    const token = generateToken(user.id);

    // Progressive verification - check what step user needs to complete
    if (!user.emailVerified) {
      return res.status(200).json({ 
        message: 'Please verify your email first.',
        token,
        verificationStep: 'email',
        nextStep: 'email',
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          phone: user.phone,
          emailVerified: user.emailVerified,
          phoneVerified: user.phoneVerified,
          kycApproved: user.kycApproved,
        }
      });
    }
    
    if (!user.phoneVerified) {
      return res.status(200).json({ 
        message: 'Please verify your phone number.',
        token,
        verificationStep: 'phone',
        nextStep: 'phone',
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          phone: user.phone,
          emailVerified: user.emailVerified,
          phoneVerified: user.phoneVerified,
          kycApproved: user.kycApproved,
        }
      });
    }

    if (!user.kycApproved) {
      return res.status(200).json({ 
        message: 'Please complete KYC verification.',
        token,
        verificationStep: 'kyc',
        nextStep: 'kyc',
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          phone: user.phone,
          emailVerified: user.emailVerified,
          phoneVerified: user.phoneVerified,
          kycApproved: user.kycApproved,
        }
      });
    }

    // User is fully verified
    logger.info({ userId: user.id, email }, 'User logged in successfully');
    res.json({
      token,
      message: 'Login successful',
      verificationStep: 'complete',
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        phone: user.phone,
        emailVerified: user.emailVerified,
        phoneVerified: user.phoneVerified,
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
    logger.warn({ url: req.url }, 'No token provided');
    return res.status(401).json({ error: 'Access token required' });
  }

  try {
    const decoded = jwt.verify(token, env.JWT_SECRET) as { userId: number };
    const user = await db.user.findUnique({ where: { id: decoded.userId } });
    
    if (!user) {
      logger.warn({ userId: decoded.userId }, 'User not found for token');
      return res.status(401).json({ error: 'Invalid token' });
    }

    req.user = user;
    next();
  } catch (error) {
    logger.error({ error: error.message }, 'Token verification failed');
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
      phone: req.user.phone,
      emailVerified: req.user.emailVerified,
      phoneVerified: req.user.phoneVerified,
      kycApproved: req.user.kycApproved,
    }
  });
});

// POST /api/auth/start-phone-verification
router.post('/start-phone-verification', authenticateToken, async (req: any, res) => {
  try {
    const { phone } = startPhoneVerificationSchema.parse(req.body);

    // Check if phone is already verified by another user
    const existingUser = await db.user.findFirst({ 
      where: { 
        phone,
        phoneVerified: true,
        id: { not: req.user.id }
      }
    });
    
    if (existingUser) {
      return res.status(400).json({ error: 'Phone number already verified by another user' });
    }

    // Generate verification code
    const verificationCode = generateVerificationCode();

    // Update user with phone and verification code
    await db.user.update({
      where: { id: req.user.id },
      data: {
        phone,
        phoneVerified: false,
        phoneVerificationCode: verificationCode,
      },
    });

    // Send SMS verification
    await sendPhoneVerificationSMS(phone, verificationCode);

    logger.info({ userId: req.user.id, phone }, 'Phone verification SMS sent');
    res.json({ message: 'Phone verification code sent.' });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors[0].message });
    }
    logger.error(error, 'Start phone verification error');
    res.status(500).json({ error: 'Failed to start phone verification' });
  }
});

// POST /api/auth/verify-phone
router.post('/verify-phone', authenticateToken, async (req: any, res) => {
  try {
    const { phone, code } = verifyPhoneSchema.parse(req.body);

    // Find user
    const user = await db.user.findUnique({ where: { id: req.user.id } });
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Check if phone matches
    if (user.phone !== phone) {
      return res.status(400).json({ error: 'Phone number does not match' });
    }

    // Check if already verified
    if (user.phoneVerified) {
      return res.status(400).json({ error: 'Phone already verified' });
    }

    // Check verification code
    if (user.phoneVerificationCode !== code) {
      return res.status(400).json({ error: 'Invalid verification code' });
    }

    // Update user
    const updatedUser = await db.user.update({
      where: { id: user.id },
      data: {
        phoneVerified: true,
        phoneVerificationCode: null,
      },
    });

    logger.info({ userId: user.id, phone }, 'Phone verified successfully');
    res.json({ 
      message: 'Phone verified. Please complete KYC verification.',
      nextStep: 'kyc',
      user: {
        id: updatedUser.id,
        email: updatedUser.email,
        name: updatedUser.name,
        phone: updatedUser.phone,
        emailVerified: updatedUser.emailVerified,
        phoneVerified: updatedUser.phoneVerified,
        kycApproved: updatedUser.kycApproved,
      }
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors[0].message });
    }
    logger.error(error, 'Phone verification error');
    res.status(500).json({ error: 'Phone verification failed' });
  }
});

// POST /api/auth/resend-phone-code
router.post('/resend-phone-code', authenticateToken, async (req: any, res) => {
  try {
    const { phone } = resendPhoneCodeSchema.parse(req.body);

    // Find user
    const user = await db.user.findUnique({ where: { id: req.user.id } });
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Check if phone matches
    if (user.phone !== phone) {
      return res.status(400).json({ error: 'Phone number does not match' });
    }

    // Check if already verified
    if (user.phoneVerified) {
      return res.status(400).json({ error: 'Phone already verified' });
    }

    // Generate new verification code
    const verificationCode = generateVerificationCode();

    // Update user with new code
    await db.user.update({
      where: { id: user.id },
      data: { phoneVerificationCode: verificationCode },
    });

    // Send SMS verification
    await sendPhoneVerificationSMS(phone, verificationCode);

    logger.info({ userId: req.user.id, phone }, 'Phone verification code resent');
    res.json({ message: 'Phone verification code resent.' });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors[0].message });
    }
    logger.error(error, 'Resend phone code error');
    res.status(500).json({ error: 'Failed to resend phone verification code' });
  }
});

export default router;
