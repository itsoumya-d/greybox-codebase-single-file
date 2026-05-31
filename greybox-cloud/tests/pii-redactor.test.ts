// Proprietary and confidential. Copyright (c) 2026 Greybox Studio.

import assert from 'node:assert/strict';
import test from 'node:test';
import { classifyPii, classifyPiiText, redactPii, redactPiiText } from '../src/safety/piiRedactor.js';

const emailCases = [
  'designer@example.com',
  'qa+mobile@play.example.co.uk',
  'UPPER.CASE@EXAMPLE.ORG',
  'art-bible.owner@greybox.studio',
  'build.pipeline@subdomain.greybox.ai',
  'founder@studio-games.dev',
  'level_designer+nightly@prototype.gg',
  'alerts@ops.greybox.studio',
  'first.last@indie-team.io',
  'narrative.writer@game-lab.edu',
  'producer+milestone@publisher.co',
  'support@greybox.cloud',
  'sre.oncall@infra.example.net',
  'contractor_42@outsourcer.in',
  'billing-contact@enterprise.example',
  'legal.review@studio.example',
  'playtest.recruiting@research.example',
  'steam-next-fest@launch.example',
  'console-submissions@porting.example',
  'privacy@tenant.example',
  'data-protection.officer@tenant.example',
  'artist@characters.example',
  'economy-designer@liveops.example',
  'ugc-moderation@market.example',
  'security.audit@enterprise.example',
];

const phoneCases = [
  '+1 (415) 555-0100',
  '415-555-0101',
  '(212) 555 0183',
  '+44 20 7946 0958',
  '+91 98765 43210',
  '+61 2 9374 4000',
  '+81 3-1234-5678',
  '+49 30 901820',
  '+33 1 42 68 53 00',
  '+34 91 123 45 67',
  '+39 06 698 9351',
  '+55 11 91234-5678',
  '+52 55 1234 5678',
  '+27 11 555 0100',
  '+82 2 1234 5678',
  '+65 6123 4567',
  '+64 9 555 0100',
  '+353 1 234 5678',
  '+31 20 123 4567',
  '+46 8 123 456 78',
  '+47 22 12 34 56',
  '+41 44 668 18 00',
  '+971 4 123 4567',
  '+972 3 123 4567',
  '+90 212 555 0123',
];

const ipCases = [
  '8.8.8.8',
  '1.1.1.1',
  '10.24.1.5',
  '172.16.42.8',
  '192.168.1.25',
  '127.0.0.1',
  '0.0.0.0',
  '255.255.255.255',
  '203.0.113.42',
  '198.51.100.7',
  '192.0.2.11',
  '100.64.0.10',
  '169.254.10.20',
  '2001:db8::1',
  '2001:4860:4860::8888',
  'fe80::1',
  'fd12:3456:789a:1::1',
  '::1',
  '::',
  '2606:4700:4700::1111',
  '2a00:1450:4009:81f::200e',
  '2001:0db8:85a3:0000:0000:8a2e:0370:7334',
  'ff02::1',
  '2001:db8:3333:4444:5555:6666:7777:8888',
  'fe80::1ff:fe23:4567:890a%en0',
];

const cardCases = [
  '4111 1111 1111 1111',
  '4012888888881881',
  '4000-0000-0000-0002',
  '4000 0000 0000 9995',
  '4242-4242-4242-4242',
  '5555 5555 5555 4444',
  '5105-1051-0510-5100',
  '2223 0031 2200 3222',
  '5200 8282 8282 8210',
  '3782 822463 10005',
  '371449635398431',
  '3434 343434 34343',
  '6011 1111 1111 1117',
  '6011000990139424',
  '6440-0000-0000-0005',
  '3530 1113 3330 0000',
  '3566002020360505',
  '30569309025904',
  '3852 000002 3237',
  '6200 0000 0000 0005',
  '6759649826438453',
  '5019 7170 1010 3742',
  '6331101999990016',
  '2222420000001113',
  '4000056655665556',
];

test('redacts 100 mixed PII cases without leaking originals', () => {
  const cases = [
    ...emailCases.map((value) => ({ value, marker: '[REDACTED_EMAIL]' })),
    ...phoneCases.map((value) => ({ value, marker: '[REDACTED_PHONE]' })),
    ...ipCases.map((value) => ({ value, marker: '[REDACTED_IP]' })),
    ...cardCases.map((value) => ({ value, marker: '[REDACTED_CARD]' })),
  ];

  assert.equal(cases.length, 100);
  for (const { value, marker } of cases) {
    const redacted = redactPiiText(`Contact ${value} before shipping the build.`);
    assert.doesNotMatch(redacted, new RegExp(value.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&'), 'u'));
    assert.match(redacted, new RegExp(marker.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&'), 'u'));
  }
});

test('redacts nested inference logs recursively', () => {
  const log = {
    tenantId: 'tenant_studio',
    messages: [
      {
        role: 'user',
        content: 'Email qa+mobile@play.example.co.uk and call +91 98765 43210 from 2001:db8::1.',
      },
    ],
    billing: {
      card: '4111 1111 1111 1111',
      providerError: 'Stripe rejected pi_live_secret for acct_live_secret with sk_live_cloud_secret and whsec_cloud_secret',
    },
  };

  const redacted = redactPii(log);
  const serialized = JSON.stringify(redacted);
  assert.ok(!serialized.includes('qa+mobile@play.example.co.uk'));
  assert.ok(!serialized.includes('+91 98765 43210'));
  assert.ok(!serialized.includes('2001:db8::1'));
  assert.ok(!serialized.includes('4111 1111 1111 1111'));
  assert.ok(!serialized.includes('pi_live_secret'));
  assert.ok(!serialized.includes('acct_live_secret'));
  assert.ok(!serialized.includes('sk_live_cloud_secret'));
  assert.ok(!serialized.includes('whsec_cloud_secret'));
  assert.ok(serialized.includes('[REDACTED_EMAIL]'));
  assert.ok(serialized.includes('[REDACTED_PHONE]'));
  assert.ok(serialized.includes('[REDACTED_IP]'));
  assert.ok(serialized.includes('[REDACTED_CARD]'));
  assert.ok(serialized.includes('[REDACTED_SECRET]'));
  assert.ok(serialized.includes('[REDACTED_STRIPE_ID]'));
});

test('redacts operational provider secrets without classifying them as PII', () => {
  const text = [
    'Provider error for owner@example.com:',
    'Bearer sk_test_provider_secret',
    'Bearer north-star-admin-0123456789abcdef',
    'Bearer eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ0ZW5hbnQifQ.signedtoken123456',
    'sk-proj-abcdefghijklmnopqrstuvwxyz123456',
    'sk-ant-api03-abcdefghijklmnopqrstuvwxyz123456',
    'sk-or-v1-abcdefghijklmnopqrstuvwxyz123456',
    'AKIA1234567890ABCDEF',
    'ASIA1234567890ABCDEF',
    'price_live_model',
    'whsec_provider_secret',
    'gbx_pro_customerSecret123456.',
  ].join(' ');
  const redacted = redactPiiText(text);
  assert.doesNotMatch(
    redacted,
    /sk_test_provider_secret|north-star-admin-0123456789abcdef|eyJhbGciOiJIUzI1NiJ9|sk-proj-|sk-ant-api03-|sk-or-v1-|AKIA1234567890ABCDEF|ASIA1234567890ABCDEF|price_live_model|whsec_provider_secret|gbx_pro_customerSecret123456/u,
  );
  assert.match(redacted, /\[REDACTED_EMAIL\]/u);
  assert.match(redacted, /\[REDACTED_SECRET\]/u);
  assert.match(redacted, /\[REDACTED_STRIPE_ID\]/u);

  const classification = classifyPiiText(text);
  assert.deepEqual(classification.types, ['email']);
  assert.deepEqual(classification.counts, { email: 1, phone: 0, ip: 0, card: 0 });
});

test('classifies PII by type without returning raw values', () => {
  const text = 'Email qa+mobile@play.example.co.uk, call +91 98765 43210, connect from 2001:db8::1, and verify 4111 1111 1111 1111.';
  const classification = classifyPiiText(text);

  assert.equal(classification.redacted, true);
  assert.deepEqual(classification.types, ['email', 'phone', 'ip', 'card']);
  assert.deepEqual(classification.counts, { email: 1, phone: 1, ip: 1, card: 1 });
  assert.equal(JSON.stringify(classification).includes('qa+mobile'), false);
});

test('classifies nested PII in object keys and values', () => {
  const classification = classifyPii({
    'owner@example.com': 'call +1 (415) 555-0100',
    nested: ['2001:db8::1', '4111 1111 1111 1111'],
  });

  assert.deepEqual(classification.types, ['email', 'phone', 'ip', 'card']);
  assert.deepEqual(classification.counts, { email: 1, phone: 1, ip: 1, card: 1 });
});

test('redacts PII embedded in log object keys as well as values', () => {
  const log = {
    'qa+mobile@play.example.co.uk': 'email key',
    'phone +1 (415) 555-0100': 'phone key',
    'ip 2001:db8::1': 'ip key',
    'card 4111 1111 1111 1111': 'card key',
    nested: {
      'owner designer@example.com': 'nested key',
    },
  };

  const redacted = redactPii(log) as Record<string, unknown>;
  const serialized = JSON.stringify(redacted);
  assert.ok(!serialized.includes('qa+mobile@play.example.co.uk'));
  assert.ok(!serialized.includes('+1 (415) 555-0100'));
  assert.ok(!serialized.includes('2001:db8::1'));
  assert.ok(!serialized.includes('4111 1111 1111 1111'));
  assert.ok(!serialized.includes('designer@example.com'));
  assert.ok(Object.keys(redacted).some((key) => key.includes('[REDACTED_EMAIL]')));
  assert.ok(Object.keys(redacted).some((key) => key.includes('[REDACTED_PHONE]')));
  assert.ok(Object.keys(redacted).some((key) => key.includes('[REDACTED_IP]')));
  assert.ok(Object.keys(redacted).some((key) => key.includes('[REDACTED_CARD]')));
});

test('keeps common gameplay identifiers that only look numeric', () => {
  const source = [
    'wave id 12345678',
    'invalid ip 999.999.999.999',
    'non-luhn card-shaped seed 4111 1111 1111 1112',
    'build hash 1234567890123456',
    'frame time 10:30:45',
  ].join(' | ');

  assert.equal(redactPiiText(source), source);
});
