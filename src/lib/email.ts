import { env } from '../config/env.js';
import { logger } from './logger.js';

export async function sendVerificationEmail(email: string, code: string): Promise<void> {
  // In development: log to console for easy testing
  if (process.env.NODE_ENV === 'development') {
    console.log(`\n🔐 VERIFICATION for ${email}: ${code}\n`);
    return;
  }

  // In production: integrate with actual email service
  // For now, just log as we don't have SMTP configured
  console.log(`Email verification would be sent to ${email} with code ${code}`);
}