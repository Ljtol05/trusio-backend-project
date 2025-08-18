
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

const forgotPasswordSchema = z.object({
  email: z.string().email('Invalid email'),
});

const resetPasswordSchema = z.object({
  email: z.string().email('Invalid email'),
  code: z.string().length(6, 'Reset code must be 6 digits'),
  newPassword: z.string().min(6, 'Password must be at least 6 characters'),
});

// Generate 6-digit verification code
function generateVerificationCode(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

// Generate JWT token
function generateToken(userId: number): string {
  return jwt.sign({ userId }, env.JWT_SECRET, { expiresIn: '7d' });
}

// Send phone verification using Twilio Verify API
async function sendPhoneVerificationSMS(phone: string): Promise<string | null> {
  // Log Twilio configuration status for debugging
  logger.debug({ 
    hasAccountSid: !!env.TWILIO_ACCOUNT_SID,
    hasAuthToken: !!env.TWILIO_AUTH_TOKEN,
    hasVerifyServiceSid: !!env.TWILIO_VERIFY_SERVICE_SID,
    phone 
  }, 'Attempting to send SMS verification via Twilio Verify API');

  // Always try to send real SMS if Twilio is configured
  if (env.TWILIO_ACCOUNT_SID && env.TWILIO_AUTH_TOKEN && env.TWILIO_VERIFY_SERVICE_SID) {
    try {
      // Validate Account SID format
      if (!env.TWILIO_ACCOUNT_SID.startsWith('AC')) {
        throw new Error(`Invalid Twilio Account SID format. Expected to start with 'AC', got: ${env.TWILIO_ACCOUNT_SID.substring(0, 2)}...`);
      }

      // Dynamic import for Twilio using ES modules
      const { default: twilio } = await import('twilio');
      const client = twilio(env.TWILIO_ACCOUNT_SID, env.TWILIO_AUTH_TOKEN);
      
      const verification = await client.verify.v2.services(env.TWILIO_VERIFY_SERVICE_SID)
        .verifications
        .create({ to: phone, channel: 'sms' });

      logger.info({ phone, verificationSid: verification.sid }, 'SMS verification sent successfully via Twilio Verify API');
      return verification.sid;
    } catch (error: any) {
      logger.error({ 
        error: error.message || error, 
        phone,
        twilioError: error.code || 'unknown',
        accountSidFormat: env.TWILIO_ACCOUNT_SID ? env.TWILIO_ACCOUNT_SID.substring(0, 5) : 'none'
      }, 'Failed to send SMS verification via Twilio Verify API');
      
      // Fallback to console in case of error
      const fallbackCode = generateVerificationCode();
      console.log(`\n📱 TWILIO ERROR FALLBACK for ${phone}: ${fallbackCode}\n`);
      console.log(`Twilio Error: ${error.message || 'Unknown error'}`);
      return fallbackCode;
    }
  }

  // Development mode fallback when no Twilio configured
  const fallbackCode = generateVerificationCode();
  console.log(`\n📱 DEV SMS VERIFICATION for ${phone}: ${fallbackCode}\n`);
  return fallbackCode;
}

// Verify phone code using Twilio Verify API
async function verifyPhoneCode(phone: string, code: string): Promise<boolean> {
  // Use Twilio Verify API if configured
  if (env.TWILIO_ACCOUNT_SID && env.TWILIO_AUTH_TOKEN && env.TWILIO_VERIFY_SERVICE_SID) {
    try {
      const { default: twilio } = await import('twilio');
      const client = twilio(env.TWILIO_ACCOUNT_SID, env.TWILIO_AUTH_TOKEN);
      
      const verificationCheck = await client.verify.v2.services(env.TWILIO_VERIFY_SERVICE_SID)
        .verificationChecks
        .create({ to: phone, code });

      logger.info({ phone, status: verificationCheck.status }, 'Phone verification check completed');
      return verificationCheck.status === 'approved';
    } catch (error: any) {
      logger.error({ 
        error: error.message || error, 
        phone,
        twilioError: error.code || 'unknown'
      }, 'Failed to verify phone code via Twilio Verify API');
      
      // Only allow fallback in development mode
      if (env.NODE_ENV === 'development') {
        logger.warn({ phone }, 'Using development fallback for phone verification');
        return false;
      }
      
      // In production, fail verification if Twilio fails
      return false;
    }
  }

  // Development fallback - this should not be used in production
  if (env.NODE_ENV === 'development') {
    logger.warn({ phone }, 'Using development fallback for phone verification');
    return false;
  }
  
  // Production without Twilio - should not happen
  logger.error('Phone verification attempted without Twilio configuration in production');
  return false;
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
    const codeHash = await bcrypt.hash(verificationCode, 12);
    const ttl = Number(env.VERIFICATION_CODE_TTL);

    // Create user
    await db.user.create({
      data: {
        name: fullName,
        email,
        password: hashedPassword,
        emailVerified: false,
      },
    });

    // Store verification code in VerificationCode table
    await db.verificationCode.deleteMany({ where: { email } });
    await db.verificationCode.create({
      data: {
        email,
        codeHash,
        expiresAt: new Date(Date.now() + ttl),
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
    // Clean up expired verification codes periodically
    await db.verificationCode.deleteMany({
      where: {
        expiresAt: {
          lt: new Date()
        }
      }
    });

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

    // Check verification code in VerificationCode table
    const verificationRecord = await db.verificationCode.findUnique({ where: { email } });
    if (!verificationRecord || Date.now() > verificationRecord.expiresAt.getTime()) {
      return res.status(400).json({ error: 'Verification code expired or not found' });
    }

    // Verify the code
    const isValidCode = await bcrypt.compare(code, verificationRecord.codeHash);
    if (!isValidCode) {
      return res.status(400).json({ error: 'Invalid verification code' });
    }

    // Update user and clean up verification code
    await db.user.update({
      where: { id: user.id },
      data: { emailVerified: true },
    });
    
    await db.verificationCode.delete({ where: { email } });

    // Generate auth token for authenticated API access
    const token = generateToken(user.id);

    logger.info({ userId: user.id, email }, 'Email verified successfully');
    res.json({ 
      message: 'Email verified. Please verify your phone number.',
      token,
      verificationStep: 'phone',
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
    const codeHash = await bcrypt.hash(verificationCode, 12);
    const ttl = Number(env.VERIFICATION_CODE_TTL);

    // Update verification code
    await db.verificationCode.deleteMany({ where: { email } });
    await db.verificationCode.create({
      data: {
        email,
        codeHash,
        expiresAt: new Date(Date.now() + ttl),
      },
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

    // Check email verification first - don't issue tokens for unverified emails
    if (!user.emailVerified) {
      return res.status(401).json({ 
        error: 'Email not verified. Please verify your email before logging in.',
        verificationStep: 'email',
        nextStep: 'email'
      });
    }

    // Progressive verification - check what step user needs to complete
    
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
    // Only log warnings for non-auth endpoints to reduce noise
    if (!req.url.includes('/auth/me')) {
      logger.warn({ url: req.url }, 'No token provided');
    }
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

    // Normalize phone number for consistency
    const normalizedPhone = phone.replace(/\D/g, '');
    
    // Check if phone is already verified by another user
    const existingUser = await db.user.findFirst({ 
      where: { 
        phone: {
          contains: normalizedPhone.slice(-10) // Check last 10 digits
        },
        phoneVerified: true,
        id: { not: req.user.id }
      }
    });
    
    if (existingUser) {
      return res.status(400).json({ error: 'Phone number already verified by another user' });
    }

    // Send SMS verification using Twilio Verify API
    const verificationResult = await sendPhoneVerificationSMS(phone);

    // Update user with phone (no need to store verification code with Twilio Verify API)
    await db.user.update({
      where: { id: req.user.id },
      data: {
        phone,
        phoneVerified: false,
        phoneVerificationCode: verificationResult, // Store SID or fallback code for dev
      },
    });

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

    // Verify code using Twilio Verify API or fallback
    let isValidCode = false;
    
    if (env.TWILIO_ACCOUNT_SID && env.TWILIO_AUTH_TOKEN && env.TWILIO_VERIFY_SERVICE_SID) {
      // Use Twilio Verify API
      isValidCode = await verifyPhoneCode(phone, code);
    } else {
      // Development fallback - check stored code (only in development)
      if (env.NODE_ENV === 'development' && user.phoneVerificationCode === code) {
        isValidCode = true;
      }
    }

    if (!isValidCode) {
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
      verificationStep: 'kyc',
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

    // Send SMS verification using Twilio Verify API
    const verificationResult = await sendPhoneVerificationSMS(phone);

    // Update user with new verification SID or fallback code
    await db.user.update({
      where: { id: user.id },
      data: { phoneVerificationCode: verificationResult },
    });

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

// POST /api/auth/forgot-password
router.post('/forgot-password', async (req, res) => {
  try {
    const { email } = forgotPasswordSchema.parse(req.body);

    // Find user
    const user = await db.user.findUnique({ where: { email } });
    if (!user) {
      // Don't reveal if user exists or not for security
      return res.json({ message: 'If an account with this email exists, a password reset code has been sent.' });
    }

    // Generate reset code
    const resetCode = generateVerificationCode();
    const codeHash = await bcrypt.hash(resetCode, 12);
    const ttl = Number(env.VERIFICATION_CODE_TTL);

    // Store reset code (reuse VerificationCode table)
    await db.verificationCode.deleteMany({ where: { email } });
    await db.verificationCode.create({
      data: {
        email,
        codeHash,
        expiresAt: new Date(Date.now() + ttl),
      },
    });

    // Send reset email
    await sendVerificationEmail(email, resetCode, 'password_reset');

    logger.info({ email }, 'Password reset code sent');
    res.json({ message: 'If an account with this email exists, a password reset code has been sent.' });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors[0].message });
    }
    logger.error(error, 'Forgot password error');
    res.status(500).json({ error: 'Failed to process password reset request' });
  }
});

// POST /api/auth/reset-password
router.post('/reset-password', async (req, res) => {
  try {
    const { email, code, newPassword } = resetPasswordSchema.parse(req.body);

    // Find user
    const user = await db.user.findUnique({ where: { email } });
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Clean up expired codes first
    await db.verificationCode.deleteMany({
      where: {
        expiresAt: {
          lt: new Date()
        }
      }
    });

    // Check reset code
    const verificationRecord = await db.verificationCode.findUnique({ where: { email } });
    if (!verificationRecord || Date.now() > verificationRecord.expiresAt.getTime()) {
      return res.status(400).json({ error: 'Reset code expired or not found' });
    }

    // Verify the code
    const isValidCode = await bcrypt.compare(code, verificationRecord.codeHash);
    if (!isValidCode) {
      return res.status(400).json({ error: 'Invalid reset code' });
    }

    // Update password
    const hashedPassword = await bcrypt.hash(newPassword, 12);
    await db.user.update({
      where: { id: user.id },
      data: { password: hashedPassword },
    });

    // Clean up verification code
    await db.verificationCode.delete({ where: { email } });

    logger.info({ userId: user.id, email }, 'Password reset successfully');
    res.json({ message: 'Password reset successfully. You can now log in with your new password.' });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors[0].message });
    }
    logger.error(error, 'Reset password error');
    res.status(500).json({ error: 'Failed to reset password' });
  }
});

export default router;
