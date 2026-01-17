import { Column, Row, Section, Text } from '@react-email/components';
import * as React from 'react';
import EmailLayout from './components/EmailLayout';

type OwnerNewSignupEmailProps = {
  companyName: string;
  adminEmail: string;
  planName: string;
  planMonthlyVideos: number;
  planPriceUsd: number;
  requestedAt: string;
  tenantsUrl: string;
};

const labelStyle: React.CSSProperties = {
  color: '#475569',
  fontSize: '12px',
  textTransform: 'uppercase',
  letterSpacing: '0.08em',
  marginBottom: '4px',
};

const valueStyle: React.CSSProperties = {
  fontSize: '14px',
  margin: 0,
  color: '#0f172a',
};

const OwnerNewSignupEmail = ({
  companyName,
  adminEmail,
  planName,
  planMonthlyVideos,
  planPriceUsd,
  requestedAt,
  tenantsUrl,
}: OwnerNewSignupEmailProps) => (
  <EmailLayout previewText="A new workspace just signed up." heading="New customer signup">
    <Text style={{ fontSize: '15px', color: '#0f172a' }}>
      {companyName} just created a workspace and requested the {planName} plan.
    </Text>
    <Section style={{ margin: '20px 0' }}>
      <Row>
        <Column>
          <Text style={labelStyle}>Company</Text>
          <Text style={valueStyle}>{companyName}</Text>
        </Column>
        <Column>
          <Text style={labelStyle}>Admin</Text>
          <Text style={valueStyle}>{adminEmail}</Text>
        </Column>
      </Row>
    </Section>
    <Section style={{ marginBottom: '16px' }}>
      <Row>
        <Column>
          <Text style={labelStyle}>Plan</Text>
          <Text style={valueStyle}>
            {planName} &middot; {planMonthlyVideos} videos/mo &middot; ${planPriceUsd}/mo
          </Text>
        </Column>
      </Row>
      <Row>
        <Column>
          <Text style={labelStyle}>Requested</Text>
          <Text style={valueStyle}>{requestedAt}</Text>
        </Column>
      </Row>
    </Section>
    <Text style={{ fontSize: '14px', color: '#475569' }}>
      Review the tenant and flip them live inside the console.
    </Text>
    <Text style={{ fontSize: '14px' }}>
      <a
        href={tenantsUrl}
        style={{ color: '#2563eb', textDecoration: 'none', fontWeight: 600 }}
      >
        Open owner console →
      </a>
    </Text>
  </EmailLayout>
);

export default OwnerNewSignupEmail;
