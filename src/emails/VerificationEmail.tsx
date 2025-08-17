
import React from 'react';
import { Html, Head, Body, Container, Text } from '@react-email/components';

interface VerificationEmailProps {
  code: string;
}

export const VerificationEmail = ({ code }: VerificationEmailProps) => (
  <Html lang="en">
    <Head />
    <Body style={{ fontFamily: 'sans-serif', backgroundColor: '#f7fafc', padding: '30px' }}>
      <Container style={{ maxWidth: '600px', margin: '0 auto', backgroundColor: '#fff', padding: '20px', borderRadius: '8px' }}>
        <Text style={{ margin: '10px 0' }}>Use the code below to verify your email address. This code expires in 5 minutes.</Text>
        <Text style={{ fontSize: '32px', fontWeight: 'bold', letterSpacing: '4px', textAlign: 'center', backgroundColor: '#6b7280', marginTop: '20px', padding: '20px', color: '#fff' }}>{code}</Text>
        <Text style={{ fontSize: '12px', color: '#6b7280', marginTop: '20px', textAlign: 'center' }}>If you didn't request this verification, please ignore this email.</Text>
      </Container>
    </Body>
  </Html>
);
