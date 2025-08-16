
import { Resend } from 'resend';
import { render } from '@react-email/render';
import { env } from '../config/env.js';
import { logger } from './logger.js';
import { VerificationEmail } from '../emails/VerificationEmail.js';

// Initialize Resend
const resend = env.RESEND_API_KEY ? new Resend(env.RESEND_API_KEY) : null;

export async function sendVerificationEmail(email: string, code: string): Promise<void> {
  // Development mode fallback when no Resend API key configured
  if (env.NODE_ENV === 'development' && !env.RESEND_API_KEY) {
    console.log(`\n🔐 DEV VERIFICATION for ${email}: ${code}\n`);
    return;
  }

  // Check if we have Resend API key
  if (!env.RESEND_API_KEY || !resend) {
    console.log(`\n🔐 FALLBACK VERIFICATION for ${email}: ${code}\n`);
    logger.warn({ email }, 'RESEND_API_KEY not configured, using console fallback');
    return;
  }

  try {
    // Render the React email component
    const reactEmail = VerificationEmail({ code });
    
    // Send using Resend with React component
    await resend.emails.send({
      from: env.MAIL_FROM || 'Verify <verify@owllocate.it.com>',
      to: [email],
      subject: 'Your verification code',
      react: reactEmail,
    });

    logger.info({ email }, 'Verification email sent successfully via Resend');
    return;
  } catch (error: any) {
    logger.error({ error: error.message || error, email }, 'Failed to send verification email via Resend');
    // Fallback to console in case of error
    console.log(`\n🔐 RESEND ERROR FALLBACK for ${email}: ${code}\n`);
    console.log(`Resend Error: ${error.message || 'Unknown error'}`);
    return;
  }
}
