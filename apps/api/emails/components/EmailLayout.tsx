import {
  Body,
  Container,
  Head,
  Hr,
  Html,
  Link,
  Preview,
  Section,
  Text,
} from '@react-email/components';
import * as React from 'react';

const bodyStyle: React.CSSProperties = {
  backgroundColor: '#f8fafc',
  color: '#0f172a',
  fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
  padding: '32px 0',
};

const containerStyle: React.CSSProperties = {
  backgroundColor: '#ffffff',
  borderRadius: '20px',
  boxShadow: '0 18px 40px rgba(15, 23, 42, 0.08)',
  margin: '0 auto',
  maxWidth: '520px',
  padding: '32px',
};

const headingStyle: React.CSSProperties = {
  fontSize: '22px',
  fontWeight: 700,
  margin: '0 0 12px',
};

const footerStyle: React.CSSProperties = {
  fontSize: '12px',
  color: '#94a3b8',
  marginTop: '16px',
};

type EmailLayoutProps = {
  previewText: string;
  heading: string;
  children: React.ReactNode;
};

export const EmailLayout = ({ previewText, heading, children }: EmailLayoutProps) => (
  <Html>
    <Head />
    <Preview>{previewText}</Preview>
    <Body style={bodyStyle}>
      <Container style={containerStyle}>
        <Section>
          <Text style={headingStyle}>{heading}</Text>
          {children}
        </Section>
        <Hr style={{ borderColor: '#e2e8f0', margin: '24px 0' }} />
        <Text style={footerStyle}>
          Sent by <Link href="https://example.com">UGC Studio</Link>
        </Text>
      </Container>
    </Body>
  </Html>
);

export default EmailLayout;
