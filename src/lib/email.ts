
import { Resend } from 'resend';
import { render } from '@react-email/render';
import { env } from '../config/env.js';
import { logger } from './logger.js';
import { VerificationEmail } from '../emails/VerificationEmail.js';

// Initialize Resend
const resend = env.RESEND_API_KEY ? new Resend(env.RESEND_API_KEY) : null;

export async function sendVerificationEmail(email: string, code: string): Promise<void> {
  // Log the API key status for debugging
  logger.debug({ 
    hasApiKey: !!env.RESEND_API_KEY, 
    apiKeyPrefix: env.RESEND_API_KEY ? env.RESEND_API_KEY.substring(0, 5) + '...' : 'none',
    email 
  }, 'Attempting to send verification email');

  // Development mode fallback when no Resend API key configured
  if (env.NODE_ENV === 'development' && !env.RESEND_API_KEY) {
    console.log(`\n🔐 DEV VERIFICATION for ${email}: ${code}\n`);
    return;
  }

  // Check if we have Resend API key
  if (!env.RESEND_API_KEY || !resend) {
    console.log(`\n🔐 FALLBACK VERIFICATION for ${email}: ${code}\n`);
    logger.warn({ email, hasApiKey: !!env.RESEND_API_KEY }, 'RESEND_API_KEY not configured, using console fallback');
    return;
  }

  try {
    // Render the React email component
    const reactEmail = VerificationEmail({ code });
    
    // Send using Resend with React component
    const result = await resend.emails.send({
      from: env.MAIL_FROM || 'Verify <verify@owllocate.it.com>',
      to: [email],
      subject: 'Your verification code',
      react: reactEmail,
    });

    if (result.error) {
      throw new Error(result.error.message || 'Resend API error');
    }

    logger.info({ email, messageId: result.data?.id }, 'Verification email sent successfully via Resend');
    return;
  } catch (error: any) {
    logger.error({ 
      error: error.message || error, 
      email, 
      stack: error.stack 
    }, 'Failed to send verification email via Resend');
    
    // Fallback to console in case of error
    console.log(`\n🔐 RESEND ERROR FALLBACK for ${email}: ${code}\n`);
    console.log(`Resend Error: ${error.message || 'Unknown error'}`);
    return;
  }
}
