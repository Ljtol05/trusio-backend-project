import { env } from '../config/env.js';
import { logger } from './logger.js';
import nodemailer from 'nodemailer';

// Create email transporter for production
const createTransporter = () => {
  if (!process.env.SMTP_HOST || !process.env.SMTP_USER || !process.env.SMTP_PASS) {
    return null;
  }

  try {
    return nodemailer.createTransporter({
      host: process.env.SMTP_HOST,
      port: parseInt(process.env.SMTP_PORT || '587'),
      secure: process.env.SMTP_PORT === '465', // true for 465, false for other ports
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
      // Add timeout and connection settings
      connectionTimeout: 10000, // 10 seconds
      greetingTimeout: 5000, // 5 seconds
      socketTimeout: 10000, // 10 seconds
    });
  } catch (error) {
    logger.error({ error }, 'Failed to create email transporter');
    return null;
  }
};

export async function sendVerificationEmail(email: string, code: string): Promise<void> {
  // In development: log to console for easy testing unless SMTP is explicitly configured
  if (process.env.NODE_ENV === 'development' && !process.env.SMTP_HOST) {
    console.log(`\n🔐 DEV VERIFICATION for ${email}: ${code}\n`);
    return;
  }

  // Check if we have minimum SMTP configuration
  if (!process.env.SMTP_HOST || !process.env.SMTP_USER || !process.env.SMTP_PASS) {
    console.log(`\n🔐 FALLBACK VERIFICATION for ${email}: ${code}\n`);
    logger.warn({ email }, 'SMTP not configured, using console fallback');
    return;
  }

  // Production or forced email mode with proper SMTP config
  try {
    const transporter = createTransporter();

    if (!transporter) {
      console.log(`\n🔐 NO TRANSPORTER VERIFICATION for ${email}: ${code}\n`);
      return;
    }

    const mailOptions = {
      from: process.env.SMTP_FROM || process.env.SMTP_USER,
      to: email,
      subject: 'Email Verification - Your App Name',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2>Email Verification</h2>
          <p>Your verification code is:</p>
          <h1 style="background: #f0f0f0; padding: 20px; text-align: center; letter-spacing: 5px; color: #333;">
            ${code}
          </h1>
          <p>This code will expire in 10 minutes.</p>
          <p>If you didn't request this verification, please ignore this email.</p>
        </div>
      `,
      text: `Your verification code is: ${code}. This code will expire in 10 minutes.`,
    };

    await transporter.sendMail(mailOptions);
    logger.info({ email }, 'Verification email sent successfully via SMTP');
    return;
  } catch (error) {
    logger.error({ error: error.message || error, email }, 'Failed to send verification email via SMTP');
    // Fallback to console in case of error
    console.log(`\n🔐 SMTP ERROR FALLBACK for ${email}: ${code}\n`);
    console.log(`SMTP Error: ${error.message || 'Unknown error'}`);
    return;
  }
}