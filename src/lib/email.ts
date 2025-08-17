
import { Resend } from 'resend';
import { render } from '@react-email/render';
import { env } from '../config/env.js';
import { logger } from './logger.js';
import { VerificationEmail } from '../emails/VerificationEmail.js';

// Initialize Resend
const resend = env.RESEND_API_KEY ? new Resend(env.RESEND_API_KEY) : null;

export async function sendVerificationEmail(email: string, code: string): Promise<void> {
  logger.debug({ 
    hasApiKey: !!env.RESEND_API_KEY, 
    email 
  }, 'Sending verification email via Resend');

  // Require Resend API key - no fallbacks
  if (!env.RESEND_API_KEY || !resend) {
    const error = 'RESEND_API_KEY is required for email verification';
    logger.error({ email }, error);
    throw new Error(error);
  }

  try {
    // Render the React email component
    const reactEmail = VerificationEmail({ code });
    
    // Send using Resend with React component
    const result = await resend.emails.send({
      from: env.MAIL_FROM || 'OwlLocate Security <noreply@owllocate.it>',
      to: [email],
      subject: 'Complete your account verification',
      react: reactEmail,
    });

    if (result.error) {
      throw new Error(result.error.message || 'Resend API error');
    }

    logger.info({ email, messageId: result.data?.id }, 'Verification email sent successfully via Resend');
  } catch (error: any) {
    logger.error({ 
      error: error.message || error, 
      email, 
      stack: error.stack 
    }, 'Failed to send verification email via Resend');
    
    throw new Error(`Failed to send verification email: ${error.message || 'Unknown error'}`);
  }
}
