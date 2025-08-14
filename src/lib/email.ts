import { env } from '../config/env.js';
import { logger } from './logger.js';

export async function sendVerificationEmail(email: string, code: string): Promise<void> {
  // In development: log to console for easy testing
  if (process.env.NODE_ENV === 'development') {
    console.log(`\n🔐 VERIFICATION for ${email}: ${code}\n`);
    return;
  }

  // In production: integrate with actual email service
  // Example with Nodemailer (install: npm install nodemailer)
  // const nodemailer = require('nodemailer');
  // const transporter = nodemailer.createTransporter({...});
  // await transporter.sendMail({
  //   to: email,
  //   subject: 'Email Verification',
  //   text: `Your verification code is: ${code}`
  // });
  
  console.log(`Email verification would be sent to ${email} with code ${code}`);
}