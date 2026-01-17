import { Button, Section, Text, Column, Row } from '@react-email/components';
import * as React from 'react';
import EmailLayout from './components/EmailLayout';

type CustomerPendingEmailProps = {
  companyName: string;
  adminEmail: string;
  planName: string;
  planPriceUsd: number;
  planMonthlyVideos: number;
  dashboardUrl: string;
  nextSteps?: string[];
};

const defaultSteps = [
  'Our team reviews your workspace request to ensure prompt activation.',
  'We will confirm your billing preference and requested plan limits.',
  'You will receive another email as soon as the workspace is live.',
];

const labelStyle: React.CSSProperties = {
  color: '#475569',
  fontSize: '13px',
  marginBottom: '2px',
  textTransform: 'uppercase',
  letterSpacing: '0.08em',
};

const valueStyle: React.CSSProperties = {
  fontSize: '15px',
  fontWeight: 600,
  color: '#0f172a',
  margin: 0,
};

const listStyle: React.CSSProperties = {
  color: '#0f172a',
  paddingLeft: '20px',
  lineHeight: '1.6',
  marginBottom: '20px',
};

const CustomerPendingEmail = ({
  companyName,
  adminEmail,
  planName,
  planPriceUsd,
  planMonthlyVideos,
  dashboardUrl,
  nextSteps = defaultSteps,
}: CustomerPendingEmailProps) => (
  <EmailLayout
    previewText="Your workspace request is in review. Here is what happens next."
    heading="Welcome — your workspace is pending approval"
  >
    <Text style={{ fontSize: '15px', color: '#0f172a' }}>
      Hey {adminEmail},
      <br />
      Thanks for creating <strong>{companyName}</strong>. You requested the <strong>{planName}</strong> plan (
      {planMonthlyVideos} videos/mo, ${planPriceUsd}/mo).
    </Text>
    <Section style={{ margin: '20px 0' }}>
      <Row>
        <Column>
          <Text style={labelStyle}>Requested plan</Text>
          <Text style={valueStyle}>{planName}</Text>
        </Column>
        <Column>
          <Text style={labelStyle}>Quota</Text>
          <Text style={valueStyle}>{planMonthlyVideos} videos / month</Text>
        </Column>
      </Row>
    </Section>
    <Text style={{ fontSize: '15px', color: '#0f172a', fontWeight: 600, marginBottom: '8px' }}>
      What to expect next
    </Text>
    <ul style={listStyle}>
      {nextSteps.map((step) => (
        <li key={step}>{step}</li>
      ))}
    </ul>
    <Text style={{ fontSize: '14px', color: '#475569', marginBottom: '20px' }}>
      You can log back in anytime to prepare briefs while we finish activation.
    </Text>
    <Button
      href={dashboardUrl}
      style={{
        backgroundColor: '#2563eb',
        borderRadius: '999px',
        color: '#ffffff',
        fontSize: '14px',
        padding: '10px 20px',
        textDecoration: 'none',
      }}
    >
      Open dashboard
    </Button>
  </EmailLayout>
);

export default CustomerPendingEmail;
