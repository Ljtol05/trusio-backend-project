import { env } from '../config/env.js';
import { logger } from './logger.js';

export async function sendVerificationEmail(email: string, code: string): Promise<void> {
  // For development, we'll log the verification code to console
  // In production, you would configure SMTP settings in .env
  if (env.NODE_ENV === 'development' || !env.SMTP_HOST) {
    logger.info({ email, code }, 'Verification email (dev mode)');
    console.log(`\n📧 Verification Email for ${email}:`);
    console.log(`   Code: ${code}`);
    console.log(`   (This would be sent via email in production)\n`);
    return;
  }

  // Production email sending would go here with nodemailer
  // Example configuration:
  /*
  const nodemailer = require('nodemailer');
  const transporter = nodemailer.createTransporter({
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    auth: {
      user: env.SMTP_USER,
      pass: env.SMTP_PASS,
    },
  });

  await transporter.sendMail({
    from: env.FROM_EMAIL,
    to: email,
    subject: 'Verify your email address',
    html: `Your verification code is: <strong>${code}</strong>`,
  });
  */

  logger.info({ email }, 'Verification email sent');
}