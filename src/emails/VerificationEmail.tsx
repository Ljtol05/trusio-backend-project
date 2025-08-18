import React from 'react';
import { Html, Head, Body, Container, Text, Heading, Hr, Section } from '@react-email/components';

interface VerificationEmailProps {
  verificationCode: string;
  isPasswordReset?: boolean;
}

export const VerificationEmail = ({ verificationCode, isPasswordReset = false }: VerificationEmailProps) => {
  const title = isPasswordReset ? 'Password Reset Request' : 'Email Verification Required';
  const subtitle = isPasswordReset 
    ? 'We received a request to reset your password. Please use the verification code below to proceed:' 
    : 'Thank you for creating your account. Please use the verification code below to confirm your email address:';

  return (
    <Html lang="en">
      <Head>
        <title>{title} - Owllocate Financial Services</title>
      </Head>
      <Body style={{ 
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
        backgroundColor: '#ffffff', 
        margin: '0',
        padding: '20px',
        color: '#333333'
      }}>
        <Container style={{ 
          maxWidth: '600px', 
          margin: '0 auto', 
          backgroundColor: '#ffffff', 
          border: '1px solid #e1e5e9',
          borderRadius: '8px'
        }}>
          <Section style={{ 
            backgroundColor: '#f8f9fa', 
            padding: '24px', 
            textAlign: 'center',
            borderBottom: '1px solid #e1e5e9'
          }}>
            <div style={{
              width: '48px',
              height: '48px',
              borderRadius: '50%',
              backgroundColor: '#2563eb',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              marginBottom: '12px'
            }}>
              <span style={{
                color: 'white',
                fontSize: '24px',
                fontWeight: 'bold'
              }}>🦉</span>
            </div>
            <Heading style={{ 
              color: '#1a1a1a', 
              fontSize: '20px', 
              fontWeight: '600', 
              margin: '0',
              letterSpacing: '-0.01em'
            }}>
              Owllocate Financial Services
            </Heading>
          </Section>

          <Section style={{ padding: '32px 24px' }}>
            <Heading style={{ 
              fontSize: '18px', 
              fontWeight: '600', 
              color: '#1a1a1a', 
              margin: '0 0 16px 0',
              lineHeight: '1.3'
            }}>
              {title}
            </Heading>

            <Text style={{ 
              fontSize: '15px', 
              lineHeight: '1.5', 
              color: '#4a4a4a', 
              margin: '0 0 24px 0' 
            }}>
              {subtitle}
            </Text>

            <Section style={{ 
              textAlign: 'center', 
              margin: '24px 0',
              padding: '20px',
              backgroundColor: '#f8f9fa',
              borderRadius: '6px',
              border: '1px solid #e1e5e9'
            }}>
              <Text style={{ 
                fontSize: '12px', 
                color: '#6c757d', 
                margin: '0 0 8px 0',
                fontWeight: '500',
                textTransform: 'uppercase',
                letterSpacing: '0.5px'
              }}>
                Verification Code
              </Text>
              <Text style={{ 
                fontSize: '28px', 
                fontWeight: '700', 
                letterSpacing: '4px', 
                color: '#1a1a1a',
                margin: '0',
                fontFamily: '"Courier New", Courier, monospace'
              }}>
                {verificationCode}
              </Text>
            </Section>

            {isPasswordReset ? (
              <Text style={{ 
                fontSize: '14px', 
                lineHeight: '1.4', 
                color: '#4a4a4a', 
                margin: '20px 0 0 0' 
              }}>
                This verification code is valid for 10 minutes. If you did not request a password reset, please contact our support team immediately at support@owllocate.it.
              </Text>
            ) : (
              <Text style={{ 
                fontSize: '14px', 
                lineHeight: '1.4', 
                color: '#4a4a4a', 
                margin: '20px 0 0 0' 
              }}>
                This verification code expires in 10 minutes. If you did not create an account with us, please disregard this message.
              </Text>
            )}
          </Section>

          <Hr style={{ margin: '0', borderColor: '#e1e5e9' }} />

          <Section style={{ padding: '20px 24px', backgroundColor: '#f8f9fa' }}>
            <Text style={{ 
              fontSize: '12px', 
              color: '#6c757d', 
              margin: '0',
              textAlign: 'center',
              lineHeight: '1.3'
            }}>
              Owllocate Financial Services<br />
              This is an automated message. Please do not reply to this email.<br />
              For assistance, contact us at support@owllocate.it
            </Text>
          </Section>
        </Container>
      </Body>
    </Html>
  );
};