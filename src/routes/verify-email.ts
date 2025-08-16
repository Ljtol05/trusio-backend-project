
import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { db } from '../lib/db.js';
import { env } from '../config/env.js';
import { sendVerificationEmail } from '../lib/email.js';
import { logger } from '../lib/logger.js';

const router = Router();

const SendSchema = z.object({ email: z.string().email() });
const CheckSchema = z.object({ email: z.string().email(), code: z.string().length(6) });

// For demo use a Map; replace with Prisma model (e.g. VerificationCode table) in production
const codes = new Map<string, { hash: string; exp: number }>();

router.post('/api/send-verification-code', async (req, res) => {
  try {
    const { email } = SendSchema.parse(req.body);
    const code = Math.floor(100000 + Math.random() * 900000).toString();
    const hash = await bcrypt.hash(code, 10);
    const ttl = Number(env.VERIFICATION_CODE_TTL ?? 10 * 60 * 1000); // 10 minutes default
    
    // Delete existing codes for this email
    await db.verificationCode.deleteMany({ where: { email } });
    
    // Store new code in database
    await db.verificationCode.create({
      data: {
        email,
        codeHash: hash,
        expiresAt: new Date(Date.now() + ttl),
      },
    });

    await sendVerificationEmail(email, code);
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'email_send_failed' });
  }
});

router.post('/api/check-verification-code', async (req, res) => {
  try {
    const { email, code } = CheckSchema.parse(req.body);
    
    const rec = await db.verificationCode.findUnique({ where: { email } });
    if (!rec || Date.now() > rec.expiresAt.getTime()) {
      return res.status(400).json({ error: 'expired_or_missing' });
    }
    
    const ok = await bcrypt.compare(code, rec.codeHash);
    if (!ok) return res.status(400).json({ error: 'invalid_code' });
    
    // Delete the used code
    await db.verificationCode.delete({ where: { email } });
    
    // Mark email verified in DB here
    res.json({ ok: true, verifiedEmail: email });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'verification_failed' });
  }
});

export default router;
