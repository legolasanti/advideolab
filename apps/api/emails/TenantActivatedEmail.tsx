import { Button, Column, Row, Section, Text } from '@react-email/components';
import * as React from 'react';
import EmailLayout from './components/EmailLayout';

type TenantActivatedEmailProps = {
  companyName: string;
  planName: string;
  planMonthlyVideos: number;
  planPriceUsd: number;
  nextBillingDateLabel?: string;
  dashboardUrl: string;
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
  color: '#0f172a',
  margin: 0,
  fontWeight: 600,
};

const TenantActivatedEmail = ({
  companyName,
  planName,
  planMonthlyVideos,
  planPriceUsd,
  nextBillingDateLabel,
  dashboardUrl,
}: TenantActivatedEmailProps) => (
  <EmailLayout previewText="Your UGC Studio workspace is now live." heading="Your workspace is now active">
    <Text style={{ fontSize: '15px', color: '#0f172a' }}>
      {companyName} is now unlocked. You can start uploading briefs and generating videos immediately.
    </Text>
    <Section style={{ margin: '20px 0' }}>
      <Row>
        <Column>
          <Text style={labelStyle}>Plan</Text>
          <Text style={valueStyle}>
            {planName} – {planMonthlyVideos} videos/mo
          </Text>
        </Column>
        <Column>
          <Text style={labelStyle}>Price</Text>
          <Text style={valueStyle}>${planPriceUsd}/mo</Text>
        </Column>
      </Row>
      {nextBillingDateLabel && (
        <Row>
          <Column>
            <Text style={labelStyle}>Next billing</Text>
            <Text style={valueStyle}>{nextBillingDateLabel}</Text>
          </Column>
        </Row>
      )}
    </Section>
    <Button
      href={dashboardUrl}
      style={{
        backgroundColor: '#0f172a',
        borderRadius: '999px',
        color: '#ffffff',
        fontSize: '14px',
        padding: '10px 24px',
        textDecoration: 'none',
      }}
    >
      Launch UGC Studio
    </Button>
  </EmailLayout>
);

export default TenantActivatedEmail;
