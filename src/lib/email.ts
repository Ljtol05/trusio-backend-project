
import { env } from '../config/env.js';
import { logger } from './logger.js';
import nodemailer from 'nodemailer';

// Create email transporter for production
const createTransporter = () => {
  if (process.env.NODE_ENV === 'production' || process.env.SMTP_HOST) {
    return nodemailer.createTransporter({
      host: process.env.SMTP_HOST || 'smtp.gmail.com',
      port: parseInt(process.env.SMTP_PORT || '587'),
      secure: false, // true for 465, false for other ports
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    });
  }
  return null;
};

export async function sendVerificationEmail(email: string, code: string): Promise<void> {
  // In development: log to console for easy testing
  if (process.env.NODE_ENV === 'development' && !process.env.SMTP_HOST) {
    console.log(`\n🔐 VERIFICATION for ${email}: ${code}\n`);
    return;
  }

  // Production or forced email mode
  try {
    const transporter = createTransporter();
    
    if (!transporter) {
      console.log(`Email verification would be sent to ${email} with code ${code}`);
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
    logger.info({ email }, 'Verification email sent successfully');
  } catch (error) {
    logger.error({ error, email }, 'Failed to send verification email');
    // Fallback to console in case of error
    console.log(`\n🔐 FALLBACK VERIFICATION for ${email}: ${code}\n`);
  }
}
