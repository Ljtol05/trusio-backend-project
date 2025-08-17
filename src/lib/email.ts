import { Resend } from 'resend';
import { render } from '@react-email/render';
import { env } from '../config/env.js';
import { logger } from './logger.js';
import { VerificationEmail } from '../emails/VerificationEmail.js';

// Initialize Resend
const resend = env.RESEND_API_KEY ? new Resend(env.RESEND_API_KEY) : null;

export async function sendVerificationEmail(to: string, code: string, type: 'email_verification' | 'password_reset' = 'email_verification'): Promise<void> {
  logger.debug({ 
    hasApiKey: !!env.RESEND_API_KEY, 
    email: to,
    type
  }, 'Sending verification email via Resend');

  // Require Resend API key - no fallbacks
  if (!env.RESEND_API_KEY || !resend) {
    const error = 'RESEND_API_KEY is required for email verification';
    logger.error({ email: to }, error);
    throw new Error(error);
  }

  try {
    const isPasswordReset = type === 'password_reset';
    // Render the React email component
    const reactEmail = VerificationEmail({ 
      verificationCode: code,
      isPasswordReset,
    });

    // Send using Resend with React component
    const result = await resend.emails.send({
      from: env.MAIL_FROM || 'OwlLocate Security <noreply@owllocate.it>',
      to: [to],
      subject: isPasswordReset ? 'Reset your password' : 'Verify your email address',
      react: reactEmail,
    });

    if (result.error) {
      throw new Error(result.error.message || 'Resend API error');
    }

    logger.info({ email: to, messageId: result.data?.id, type }, 'Verification email sent successfully via Resend');
  } catch (error: any) {
    logger.error({ 
      error: error.message || error, 
      email: to, 
      stack: error.stack 
    }, 'Failed to send verification email via Resend');

    throw new Error(`Failed to send verification email: ${error.message || 'Unknown error'}`);
  }
}