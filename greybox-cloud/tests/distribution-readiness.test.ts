// Proprietary and confidential. Copyright (c) 2026 Greybox Studio.

import assert from 'node:assert/strict';
import type http from 'node:http';
import test from 'node:test';
import {
  buildDistributionReadinessReport,
  distributionMetricsFromEnv,
  formatDistributionReadinessMarkdown,
} from '../src/enterprise/distributionReadiness.js';
import {
  buildCodingAgentPartnershipReport,
  type CodingAgentPartnershipRecordInput,
} from '../src/enterprise/codingAgentPartnerships.js';
import {
  buildCommercialCreditReport,
  type CommercialGameCreditRecordInput,
} from '../src/enterprise/commercialCredits.js';
import {
  buildContentCadenceReport,
  type ContentCadenceRecordInput,
} from '../src/enterprise/contentCadence.js';
import {
  buildEducationAdoptionReport,
  type EducationInstitutionRecordInput,
} from '../src/enterprise/educationAdoption.js';
import {
  buildEnginePartnershipReport,
  type EnginePartnershipRecordInput,
} from '../src/enterprise/enginePartnerships.js';
import { createGreyboxCloudServer } from '../src/server.js';

async function withServer<T>(
  options: Parameters<typeof createGreyboxCloudServer>[0],
  run: (baseUrl: string, server: http.Server) => Promise<T>,
): Promise<T> {
  const server = createGreyboxCloudServer(options);
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const address = server.address();
  assert.ok(address && typeof address === 'object');
  try {
    return await run(`http://127.0.0.1:${address.port}`, server);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}

function readyMetrics() {
  return {
    unityAssetStoreSubmitted: true,
    unityAssetStoreLive: true,
    unrealMarketplaceSubmitted: true,
    godotAssetLibrarySubmitted: true,
    godotAssetLibraryLive: true,
    itchCreatorToolsLive: true,
    steamworksPartnerApplied: true,
    unityVerifiedSolutionApplied: true,
    unityVerifiedSolutionAchieved: true,
    epicMegaGrantApplied: true,
    epicMegaGrantLanded: true,
    godotSponsorshipActive: true,
    educationalInstitutionsActive: 7,
    organicFreeSignupsWeekly: 240,
    coMarketingAnnouncements: 1,
    codingCliPartnerships: 3,
    caseStudiesThisMonth: 2,
    creditedCommercialGames: 5,
    tutorialsThisWeek: 1,
    socialPostsThisWeek: 2,
    livestreamsThisWeek: 1,
    newslettersThisWeek: 1,
    changelogPostsThisWeek: 1,
    gdcTalksSubmitted: 1,
    jamSponsorshipsActive: 2,
  };
}

function readyEvidenceReports() {
  return {
    enginePartnershipReport: buildEnginePartnershipReport({
      now: new Date('2026-05-18T00:00:00.000Z'),
      records: readyEnginePartnerships(),
    }),
    codingAgentPartnershipReport: buildCodingAgentPartnershipReport({
      now: new Date('2026-05-18T00:00:00.000Z'),
      records: readyCodingAgentPartnerships(),
    }),
    educationAdoptionReport: buildEducationAdoptionReport({
      now: new Date('2026-05-18T00:00:00.000Z'),
      records: readyEducationInstitutions(),
    }),
    contentCadenceReport: buildContentCadenceReport({
      now: new Date('2026-05-23T00:00:00.000Z'),
      records: readyContentRecords(),
    }),
    commercialCreditReport: buildCommercialCreditReport({
      now: new Date('2026-05-18T00:00:00.000Z'),
      records: readyCommercialCredits(),
    }),
  };
}

function readyEnginePartnerships(): EnginePartnershipRecordInput[] {
  return [
    {
      partner: 'Unity',
      program: 'unity-verified-solution',
      stage: 'approved',
      submittedAt: '2026-03-01T00:00:00.000Z',
      lastActivityAt: '2026-05-01T00:00:00.000Z',
      evidence: [
        engineEvidence('application-receipt', 'a', 'https://partners.example.com/unity/application'),
        engineEvidence('approval-notice', 'b', 'https://partners.example.com/unity/verified'),
      ],
    },
    {
      partner: 'Epic',
      program: 'epic-megagrant',
      stage: 'approved',
      submittedAt: '2026-03-05T00:00:00.000Z',
      lastActivityAt: '2026-04-25T00:00:00.000Z',
      evidence: [
        engineEvidence('application-receipt', 'c', 'https://partners.example.com/epic/application'),
        engineEvidence('award-notice', 'd', 'https://partners.example.com/epic/award'),
      ],
    },
    {
      partner: 'Godot',
      program: 'godot-sponsorship',
      stage: 'active',
      submittedAt: '2026-02-15T00:00:00.000Z',
      lastActivityAt: '2026-05-05T00:00:00.000Z',
      expiresAt: '2027-02-15T00:00:00.000Z',
      evidence: [
        engineEvidence('sponsorship-invoice', 'e', 'https://partners.example.com/godot/invoice'),
        engineEvidence('payment-receipt', 'f', 'https://partners.example.com/godot/receipt'),
      ],
    },
  ];
}

function engineEvidence(
  type: NonNullable<EnginePartnershipRecordInput['evidence']>[number]['type'],
  digit: string,
  sourceUrl: string,
) {
  return {
    type,
    capturedAt: '2026-05-06T00:00:00.000Z',
    sourceHash: digit.repeat(64),
    sourceUrl,
  };
}

function readyCodingAgentPartnerships(): CodingAgentPartnershipRecordInput[] {
  return [
    codingAgentPartnership('claude-code-unity-mcp', 'Anthropic', 'live', true, true, 'announcement-url', 'https://partners.example.com/anthropic/greybox'),
    codingAgentPartnership('codex-openai-compatible', 'OpenAI', 'scheduled', false, true, 'webinar-page', 'https://partners.example.com/openai/webinar'),
    codingAgentPartnership('cursor-game-dev-expansion', 'Cursor', 'proposal', false, true, 'integration-doc', 'https://partners.example.com/cursor/integration'),
  ];
}

function codingAgentPartnership(
  campaignSlug: string,
  partner: CodingAgentPartnershipRecordInput['partner'],
  stage: CodingAgentPartnershipRecordInput['stage'],
  coMarketingPublic: boolean,
  mcpBridgeValidated: boolean,
  evidenceType: NonNullable<CodingAgentPartnershipRecordInput['evidence']>[number]['type'],
  sourceUrl: string,
): CodingAgentPartnershipRecordInput {
  return {
    campaignSlug,
    partner,
    stage,
    integrationStatus: 'validated',
    mcpBridgeValidated,
    coMarketingPublic,
    initiatedAt: '2026-03-01T00:00:00.000Z',
    lastActivityAt: '2026-05-05T00:00:00.000Z',
    ...(stage === 'announced' || stage === 'live' ? { announcedAt: '2026-05-01T00:00:00.000Z' } : {}),
    evidence: [{
      type: evidenceType,
      capturedAt: '2026-05-06T00:00:00.000Z',
      sourceHash: 'a'.repeat(64),
      sourceUrl,
    }],
  };
}

function readyEducationInstitutions(): EducationInstitutionRecordInput[] {
  return [
    educationInstitution('nova-game-school', 'Nova Game School', 'Unity', 26, 'a'),
    educationInstitution('mithila-design-institute', 'Mithila Design Institute', 'Godot', 22, 'b'),
    educationInstitution('rhein-games-academy', 'Rhein Games Academy', 'Unreal', 24, 'c'),
    educationInstitution('harbor-arts-college', 'Harbor Arts College', 'Multiple', 28, 'd'),
    educationInstitution('pacific-play-lab', 'Pacific Play Lab', 'Unity', 25, 'e'),
  ];
}

function educationInstitution(
  institutionSlug: string,
  institutionName: string,
  engineFocus: EducationInstitutionRecordInput['engineFocus'],
  activeSeats: number,
  hashDigit: string,
): EducationInstitutionRecordInput {
  return {
    institutionSlug,
    institutionName,
    programName: 'Game Design',
    courseName: 'Design-to-Engine Lab',
    region: 'US',
    status: 'active',
    engineFocus,
    termStart: '2026-01-10T00:00:00.000Z',
    termEnd: '2026-06-30T00:00:00.000Z',
    activeSeats,
    accredited: true,
    freeEducationLicense: true,
    courseworkUsesEngineExport: true,
    instructorTrainingCompleted: true,
    studentProjectsShipped: 5,
    evidence: [
      {
        type: 'syllabus',
        capturedAt: '2026-02-01T00:00:00.000Z',
        sourceHash: hashDigit.repeat(64),
        sourceUrl: `https://courses.example.edu/${institutionSlug}/syllabus`,
      },
      {
        type: 'license-ledger',
        capturedAt: '2026-02-02T00:00:00.000Z',
        sourceHash: '1'.repeat(64),
      },
      {
        type: 'project-showcase',
        capturedAt: '2026-04-20T00:00:00.000Z',
        sourceHash: '2'.repeat(64),
        sourceUrl: `https://showcase.example.edu/${institutionSlug}`,
      },
    ],
  };
}

function readyContentRecords(): ContentCadenceRecordInput[] {
  return [
    contentRecord('unity-round-trip-tutorial', 'tutorial', 'published', '2026-05-18T09:00:00.000Z', 80, 'public-url', 'https://blog.example.com/unity-round-trip'),
    contentRecord('unity-mcp-thread', 'social', 'published', '2026-05-19T12:00:00.000Z', 35, 'public-url', 'https://social.example.com/unity-mcp'),
    contentRecord('godot-goodwill-thread', 'social', 'published', '2026-05-20T12:00:00.000Z', 30, 'public-url', 'https://social.example.com/godot-goodwill'),
    contentRecord('build-in-public-live', 'livestream', 'published', '2026-05-21T18:00:00.000Z', 55, 'stream-archive', 'https://video.example.com/build-in-public'),
    contentRecord('greybox-weekly-newsletter', 'newsletter', 'published', '2026-05-22T10:00:00.000Z', 45, 'newsletter-archive', 'https://newsletter.example.com/greybox-weekly'),
    contentRecord('week-01-changelog', 'changelog', 'published', '2026-05-22T16:00:00.000Z', 20, 'public-url', 'https://changelog.example.com/week-01'),
    contentRecord('gdc-round-trip-talk', 'gdc-talk', 'submitted', '2026-05-01T00:00:00.000Z', 0, 'submission-receipt', 'https://events.example.com/gdc-round-trip'),
    contentRecord('global-game-jam-sponsor', 'jam-sponsorship', 'active', '2026-04-15T00:00:00.000Z', 0, 'sponsorship-invoice', 'https://events.example.com/global-game-jam'),
    contentRecord('gmtk-jam-sponsor', 'jam-sponsorship', 'active', '2026-04-16T00:00:00.000Z', 0, 'sponsorship-invoice', 'https://events.example.com/gmtk-jam'),
  ];
}

function contentRecord(
  contentSlug: string,
  channel: ContentCadenceRecordInput['channel'],
  status: ContentCadenceRecordInput['status'],
  publishedAt: string,
  organicSignupsAttributed: number,
  evidenceType: NonNullable<ContentCadenceRecordInput['evidence']>[number]['type'],
  sourceUrl: string,
): ContentCadenceRecordInput {
  return {
    contentSlug,
    channel,
    status,
    engineFocus: 'Unity',
    publishedAt,
    organicSignupsAttributed,
    evidence: [{
      type: evidenceType,
      capturedAt: publishedAt,
      sourceHash: 'b'.repeat(64),
      sourceUrl,
    }],
  };
}

function readyCommercialCredits(): CommercialGameCreditRecordInput[] {
  return [
    commercialCredit('ember-road', 'Ember Road', 'Aster Signal', 'Unity', 'Steam', 'case-study'),
    commercialCredit('orbit-miners', 'Orbit Miners', 'Latch Labs', 'Unreal', 'Epic Games Store', 'credits-page'),
    commercialCredit('tiny-keepers', 'Tiny Keepers', 'North Tile', 'Godot', 'itch.io', 'credits-screenshot'),
    commercialCredit('hex-runner', 'Hex Runner', 'Mossline', 'Unity', 'App Store', 'customer-approval'),
    commercialCredit('night-market', 'Night Market', 'Pixel Grove', 'Unreal', 'Google Play', 'credits-page'),
  ];
}

function commercialCredit(
  gameSlug: string,
  title: string,
  studioName: string,
  engine: CommercialGameCreditRecordInput['engine'],
  store: CommercialGameCreditRecordInput['store'],
  creditEvidence: NonNullable<CommercialGameCreditRecordInput['evidence']>[number]['type'],
): CommercialGameCreditRecordInput {
  return {
    gameSlug,
    title,
    studioName,
    engine,
    store,
    shippedAt: '2026-04-15T00:00:00.000Z',
    commercialRelease: true,
    greyboxCredited: true,
    humanDesignerCredited: true,
    generatorMetaTag: true,
    evidence: [
      {
        type: 'store-page',
        capturedAt: '2026-04-16T00:00:00.000Z',
        sourceHash: 'c'.repeat(64),
        sourceUrl: `https://store.example.com/${gameSlug}`,
      },
      {
        type: creditEvidence,
        capturedAt: '2026-04-17T00:00:00.000Z',
        sourceHash: 'd'.repeat(64),
        sourceUrl: `https://credits.example.com/${gameSlug}`,
        approvedForPublicUse: creditEvidence === 'case-study',
      },
    ],
  };
}

test('distribution readiness passes when marketplace, partner, education, content, and proof targets are met', () => {
  const report = buildDistributionReadinessReport({
    metrics: readyMetrics(),
    ...readyEvidenceReports(),
    now: new Date('2026-05-18T00:00:00.000Z'),
  });

  assert.equal(report.generatedAt, '2026-05-18T00:00:00.000Z');
  assert.equal(report.summary.status, 'pass');
  assert.equal(report.summary.liveMarketplaceChannels, 3);
  assert.equal(report.summary.submittedMarketplaceChannels, 5);
  assert.equal(report.summary.readyForDistributionScale, true);
  assert.equal(report.summary.engineVendorStrategicInterest, true);
  assert.equal(report.summary.enginePartnershipStatus, 'pass');
  assert.equal(report.summary.codingAgentDistributionReady, true);
  assert.equal(report.summary.educationDistributionReady, true);
  assert.equal(report.summary.contentEngineReady, true);
  assert.equal(report.summary.commercialCreditNarrativeReady, true);
  assert.equal(report.enginePartnerships?.engineVendorStrategicInterest, true);
  assert.equal(report.contentCadence?.organicSignupsAttributed, 265);
  assert.equal(report.checks.every((check) => check.status === 'pass'), true);
});

test('distribution readiness rejects raw GTM metrics without proof packets', () => {
  const report = buildDistributionReadinessReport({
    metrics: readyMetrics(),
    now: new Date('2026-05-18T00:00:00.000Z'),
  });

  assert.equal(report.summary.status, 'fail');
  assert.equal(report.summary.readyForDistributionScale, false);
  assert.equal(report.summary.engineVendorStrategicInterest, false);
  assert.equal(report.summary.enginePartnershipStatus, 'fail');
  assert.equal(report.summary.codingAgentDistributionReady, false);
  assert.equal(report.summary.educationDistributionReady, false);
  assert.equal(report.summary.contentEngineReady, false);
  assert.equal(report.summary.commercialCreditNarrativeReady, false);
  assert.ok(report.checks.some((check) => check.id === 'engine-vendor-partnerships' && check.status === 'fail'));
  assert.ok(report.checks.some((check) => check.id === 'education-distribution' && check.status === 'fail'));
  assert.ok(report.checks.some((check) => check.id === 'organic-free-signups' && check.status === 'fail'));
  assert.ok(report.checks.some((check) => check.id === 'co-marketing' && check.status === 'fail'));
  assert.ok(report.checks.some((check) => check.id === 'content-cadence' && check.status === 'fail'));
  assert.ok(report.checks.some((check) => check.id === 'case-study-credits' && check.status === 'fail'));
  assert.ok(report.checks.some((check) => check.id === 'events-and-jams' && check.status === 'fail'));
});

test('distribution readiness fails closed when distribution evidence is missing', () => {
  const report = buildDistributionReadinessReport({
    now: new Date('2026-05-18T00:00:00.000Z'),
  });

  assert.equal(report.summary.status, 'fail');
  assert.equal(report.summary.readyForDistributionScale, false);
  assert.equal(report.summary.engineVendorStrategicInterest, false);
  assert.equal(report.summary.liveMarketplaceChannels, 0);
  assert.ok(report.checks.some((check) => check.id === 'marketplace-presence' && check.status === 'fail'));
  assert.ok(report.checks.some((check) => check.id === 'organic-free-signups' && check.status === 'fail'));
});

test('distribution metrics env parser sanitizes aggregate metrics only', () => {
  assert.deepEqual(distributionMetricsFromEnv({ GREYBOX_DISTRIBUTION_METRICS_JSON: 'nope' }), {});
  assert.deepEqual(distributionMetricsFromEnv({
    GREYBOX_DISTRIBUTION_METRICS_JSON: JSON.stringify({
      unityAssetStoreLive: true,
      organicFreeSignupsWeekly: 201,
      educationalInstitutionsActive: -1,
      coMarketingAnnouncements: 1,
      tutorialsThisWeek: 1,
      partnerContactEmail: 'do-not-return@example.com',
    }),
  }), {
    unityAssetStoreLive: true,
    organicFreeSignupsWeekly: 201,
    coMarketingAnnouncements: 1,
    tutorialsThisWeek: 1,
  });
});

test('distribution readiness markdown is phone-readable and secret-safe', () => {
  const markdown = formatDistributionReadinessMarkdown(buildDistributionReadinessReport({
    metrics: {
      ...readyMetrics(),
      steamworksPartnerAccepted: true,
    },
    ...readyEvidenceReports(),
    now: new Date('2026-05-18T00:00:00.000Z'),
  }));

  assert.match(markdown, /Greybox Distribution Readiness/u);
  assert.match(markdown, /Ready for distribution scale: yes/u);
  assert.match(markdown, /Engine-vendor strategic interest: yes/u);
  assert.match(markdown, /\| Engine vendor partnerships \| pass/u);
  assert.doesNotMatch(markdown, /API_KEY|SECRET|TOKEN|do-not-return|@/u);
});

test('distribution readiness endpoint is admin protected and supports markdown', async () => {
  await withServer({
    auditAdminToken: 'distribution-admin-0123456789abcdef',
    distributionMetrics: readyMetrics(),
    enginePartnershipRecords: readyEnginePartnerships(),
    codingAgentPartnershipRecords: readyCodingAgentPartnerships(),
    educationAdoptionRecords: readyEducationInstitutions(),
    contentCadenceRecords: readyContentRecords(),
    commercialCreditRecords: readyCommercialCredits(),
    contentCadenceNow: new Date('2026-05-23T00:00:00.000Z'),
  }, async (baseUrl) => {
    const denied = await fetch(`${baseUrl}/v1/strategy/distribution-readiness`);
    assert.equal(denied.status, 401);
    assert.deepEqual(await denied.json(), { error: 'audit_admin_required' });

    const response = await fetch(`${baseUrl}/v1/strategy/distribution-readiness`, {
      headers: { authorization: 'Bearer distribution-admin-0123456789abcdef' },
    });
    assert.equal(response.status, 200);
    const report = await response.json() as {
      summary: {
        readyForDistributionScale: boolean;
        engineVendorStrategicInterest: boolean;
        contentEngineReady: boolean;
      };
      metrics: { organicFreeSignupsWeekly: number };
    };
    assert.equal(report.summary.readyForDistributionScale, true);
    assert.equal(report.summary.engineVendorStrategicInterest, true);
    assert.equal(report.summary.contentEngineReady, true);
    assert.equal(report.metrics.organicFreeSignupsWeekly, 265);
    assert.doesNotMatch(JSON.stringify(report), /distribution-admin/u);

    const markdown = await fetch(`${baseUrl}/v1/strategy/distribution-readiness?format=markdown`, {
      headers: { authorization: 'Bearer distribution-admin-0123456789abcdef' },
    });
    assert.equal(markdown.status, 200);
    assert.match(markdown.headers.get('content-type') ?? '', /text\/markdown/u);
    assert.match(await markdown.text(), /Distribution Readiness/u);
  });
});
