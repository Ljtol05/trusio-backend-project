
import React from 'react';
import { Html, Head, Body, Container, Text, Heading, Hr, Section } from '@react-email/components';

interface VerificationEmailProps {
  code: string;
}

export const VerificationEmail = ({ code }: VerificationEmailProps) => (
  <Html lang="en">
    <Head>
      <title>Verify Your Account - OwlLocate</title>
    </Head>
    <Body style={{ 
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
      backgroundColor: '#f8fafc', 
      margin: '0',
      padding: '40px 20px'
    }}>
      <Container style={{ 
        maxWidth: '580px', 
        margin: '0 auto', 
        backgroundColor: '#ffffff', 
        borderRadius: '12px',
        border: '1px solid #e2e8f0',
        overflow: 'hidden'
      }}>
        <Section style={{ backgroundColor: '#1e293b', padding: '32px 40px', textAlign: 'center' }}>
          <img 
            src="https://owl-light-logo.png" 
            alt="OwlLocate" 
            width="60" 
            height="60" 
            style={{ 
              margin: '0 auto 16px auto',
              display: 'block'
            }} 
          />
          <Heading style={{ 
            color: '#ffffff', 
            fontSize: '24px', 
            fontWeight: '600', 
            margin: '0',
            letterSpacing: '-0.025em'
          }}>
            OwlLocate
          </Heading>
        </Section>
        
        <Section style={{ padding: '40px' }}>
          <Heading style={{ 
            fontSize: '20px', 
            fontWeight: '600', 
            color: '#1e293b', 
            margin: '0 0 16px 0',
            lineHeight: '1.4'
          }}>
            Verify your email address
          </Heading>
          
          <Text style={{ 
            fontSize: '16px', 
            lineHeight: '1.6', 
            color: '#475569', 
            margin: '0 0 32px 0' 
          }}>
            Thank you for signing up with OwlLocate. To complete your account setup and ensure the security of your account, please verify your email address using the verification code below.
          </Text>
          
          <Section style={{ 
            textAlign: 'center', 
            margin: '32px 0',
            padding: '24px',
            backgroundColor: '#f8fafc',
            borderRadius: '8px',
            border: '2px dashed #cbd5e1'
          }}>
            <Text style={{ 
              fontSize: '14px', 
              color: '#64748b', 
              margin: '0 0 8px 0',
              fontWeight: '500',
              textTransform: 'uppercase',
              letterSpacing: '0.1em'
            }}>
              Verification Code
            </Text>
            <Text style={{ 
              fontSize: '32px', 
              fontWeight: '700', 
              letterSpacing: '8px', 
              color: '#1e293b',
              margin: '0',
              fontFamily: 'Monaco, "Courier New", monospace'
            }}>
              {code}
            </Text>
          </Section>
          
          <Text style={{ 
            fontSize: '14px', 
            lineHeight: '1.5', 
            color: '#64748b', 
            margin: '24px 0 0 0' 
          }}>
            This verification code will expire in <strong>10 minutes</strong> for your security. If you didn't create an account with OwlLocate, you can safely ignore this email.
          </Text>
        </Section>
        
        <Hr style={{ margin: '0', borderColor: '#e2e8f0' }} />
        
        <Section style={{ padding: '24px 40px', backgroundColor: '#f8fafc' }}>
          <Text style={{ 
            fontSize: '12px', 
            color: '#64748b', 
            margin: '0',
            textAlign: 'center',
            lineHeight: '1.4'
          }}>
            This email was sent to verify your account with OwlLocate.<br />
            If you have any questions, please contact our support team.
          </Text>
        </Section>
      </Container>
    </Body>
  </Html>
);
