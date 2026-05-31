// Proprietary and confidential. Copyright (c) 2026 Greybox Studio.

import type { CodingAgentPartnershipReport } from './codingAgentPartnerships.js';
import type { CommercialCreditReport } from './commercialCredits.js';
import type { ContentCadenceReport } from './contentCadence.js';
import type { EducationAdoptionReport } from './educationAdoption.js';
import type { EnginePartnershipReport } from './enginePartnerships.js';

export type DistributionReadinessStatus = 'pass' | 'warn' | 'fail';

export interface DistributionMetricInput {
  unityAssetStoreSubmitted?: boolean;
  unityAssetStoreLive?: boolean;
  unrealMarketplaceSubmitted?: boolean;
  unrealMarketplaceLive?: boolean;
  godotAssetLibrarySubmitted?: boolean;
  godotAssetLibraryLive?: boolean;
  itchCreatorToolsLive?: boolean;
  steamworksPartnerApplied?: boolean;
  steamworksPartnerAccepted?: boolean;
  unityVerifiedSolutionApplied?: boolean;
  unityVerifiedSolutionAchieved?: boolean;
  epicMegaGrantApplied?: boolean;
  epicMegaGrantLanded?: boolean;
  godotSponsorshipActive?: boolean;
  educationalInstitutionsActive?: number;
  organicFreeSignupsWeekly?: number;
  coMarketingAnnouncements?: number;
  codingCliPartnerships?: number;
  caseStudiesThisMonth?: number;
  creditedCommercialGames?: number;
  tutorialsThisWeek?: number;
  socialPostsThisWeek?: number;
  livestreamsThisWeek?: number;
  newslettersThisWeek?: number;
  changelogPostsThisWeek?: number;
  gdcTalksSubmitted?: number;
  gdcTalksAccepted?: number;
  jamSponsorshipsActive?: number;
}

export interface DistributionMetrics {
  unityAssetStoreSubmitted: boolean;
  unityAssetStoreLive: boolean;
  unrealMarketplaceSubmitted: boolean;
  unrealMarketplaceLive: boolean;
  godotAssetLibrarySubmitted: boolean;
  godotAssetLibraryLive: boolean;
  itchCreatorToolsLive: boolean;
  steamworksPartnerApplied: boolean;
  steamworksPartnerAccepted: boolean;
  unityVerifiedSolutionApplied: boolean;
  unityVerifiedSolutionAchieved: boolean;
  epicMegaGrantApplied: boolean;
  epicMegaGrantLanded: boolean;
  godotSponsorshipActive: boolean;
  educationalInstitutionsActive: number;
  organicFreeSignupsWeekly: number;
  coMarketingAnnouncements: number;
  codingCliPartnerships: number;
  caseStudiesThisMonth: number;
  creditedCommercialGames: number;
  tutorialsThisWeek: number;
  socialPostsThisWeek: number;
  livestreamsThisWeek: number;
  newslettersThisWeek: number;
  changelogPostsThisWeek: number;
  gdcTalksSubmitted: number;
  gdcTalksAccepted: number;
  jamSponsorshipsActive: number;
}

export interface DistributionReadinessCheck {
  id: string;
  label: string;
  status: DistributionReadinessStatus;
  current: string;
  target: string;
  owner: string;
  detail: string;
  evidence: string[];
  remediation?: string;
}

export interface DistributionReadinessReport {
  generatedAt: string;
  disclaimer: string;
  targets: {
    educationalInstitutions: number;
    organicFreeSignupsWeekly: number;
    coMarketingAnnouncements: number;
    creditedCommercialGames: number;
    contentCadence: {
      tutorials: number;
      socialPosts: number;
      livestreams: number;
      newsletters: number;
      changelogPosts: number;
    };
  };
  metrics: DistributionMetrics;
  summary: {
    status: DistributionReadinessStatus;
    checks: number;
    pass: number;
    warn: number;
    fail: number;
    liveMarketplaceChannels: number;
    submittedMarketplaceChannels: number;
    readyForDistributionScale: boolean;
    engineVendorStrategicInterest: boolean;
    enginePartnershipStatus: DistributionReadinessStatus;
    codingAgentPartnershipStatus: DistributionReadinessStatus;
    educationAdoptionStatus: DistributionReadinessStatus;
    contentCadenceStatus: DistributionReadinessStatus;
    commercialCreditStatus: DistributionReadinessStatus;
    codingAgentDistributionReady: boolean;
    educationDistributionReady: boolean;
    contentEngineReady: boolean;
    commercialCreditNarrativeReady: boolean;
  };
  checks: DistributionReadinessCheck[];
  enginePartnerships?: EnginePartnershipReport['summary'];
  codingAgentPartnerships?: CodingAgentPartnershipReport['summary'];
  educationAdoption?: EducationAdoptionReport['summary'];
  contentCadence?: ContentCadenceReport['summary'];
  commercialCredits?: CommercialCreditReport['summary'];
}

type DistributionEvidenceReports = {
  enginePartnershipReport: EnginePartnershipReport | undefined;
  codingAgentPartnershipReport: CodingAgentPartnershipReport | undefined;
  educationAdoptionReport: EducationAdoptionReport | undefined;
  contentCadenceReport: ContentCadenceReport | undefined;
  commercialCreditReport: CommercialCreditReport | undefined;
};

export function distributionMetricsFromEnv(
  env: Record<string, string | undefined> = process.env,
): DistributionMetricInput {
  const raw = env.GREYBOX_DISTRIBUTION_METRICS_JSON;
  if (!raw?.trim()) return {};
  try {
    const parsed = JSON.parse(raw);
    if (!isRecord(parsed)) return {};
    return {
      ...optionalBool('unityAssetStoreSubmitted', parsed.unityAssetStoreSubmitted),
      ...optionalBool('unityAssetStoreLive', parsed.unityAssetStoreLive),
      ...optionalBool('unrealMarketplaceSubmitted', parsed.unrealMarketplaceSubmitted),
      ...optionalBool('unrealMarketplaceLive', parsed.unrealMarketplaceLive),
      ...optionalBool('godotAssetLibrarySubmitted', parsed.godotAssetLibrarySubmitted),
      ...optionalBool('godotAssetLibraryLive', parsed.godotAssetLibraryLive),
      ...optionalBool('itchCreatorToolsLive', parsed.itchCreatorToolsLive),
      ...optionalBool('steamworksPartnerApplied', parsed.steamworksPartnerApplied),
      ...optionalBool('steamworksPartnerAccepted', parsed.steamworksPartnerAccepted),
      ...optionalBool('unityVerifiedSolutionApplied', parsed.unityVerifiedSolutionApplied),
      ...optionalBool('unityVerifiedSolutionAchieved', parsed.unityVerifiedSolutionAchieved),
      ...optionalBool('epicMegaGrantApplied', parsed.epicMegaGrantApplied),
      ...optionalBool('epicMegaGrantLanded', parsed.epicMegaGrantLanded),
      ...optionalBool('godotSponsorshipActive', parsed.godotSponsorshipActive),
      ...optionalNumber('educationalInstitutionsActive', parsed.educationalInstitutionsActive),
      ...optionalNumber('organicFreeSignupsWeekly', parsed.organicFreeSignupsWeekly),
      ...optionalNumber('coMarketingAnnouncements', parsed.coMarketingAnnouncements),
      ...optionalNumber('codingCliPartnerships', parsed.codingCliPartnerships),
      ...optionalNumber('caseStudiesThisMonth', parsed.caseStudiesThisMonth),
      ...optionalNumber('creditedCommercialGames', parsed.creditedCommercialGames),
      ...optionalNumber('tutorialsThisWeek', parsed.tutorialsThisWeek),
      ...optionalNumber('socialPostsThisWeek', parsed.socialPostsThisWeek),
      ...optionalNumber('livestreamsThisWeek', parsed.livestreamsThisWeek),
      ...optionalNumber('newslettersThisWeek', parsed.newslettersThisWeek),
      ...optionalNumber('changelogPostsThisWeek', parsed.changelogPostsThisWeek),
      ...optionalNumber('gdcTalksSubmitted', parsed.gdcTalksSubmitted),
      ...optionalNumber('gdcTalksAccepted', parsed.gdcTalksAccepted),
      ...optionalNumber('jamSponsorshipsActive', parsed.jamSponsorshipsActive),
    };
  } catch {
    return {};
  }
}

export function buildDistributionReadinessReport(options: {
  metrics?: DistributionMetricInput;
  enginePartnershipReport?: EnginePartnershipReport;
  codingAgentPartnershipReport?: CodingAgentPartnershipReport;
  educationAdoptionReport?: EducationAdoptionReport;
  contentCadenceReport?: ContentCadenceReport;
  commercialCreditReport?: CommercialCreditReport;
  now?: Date;
} = {}): DistributionReadinessReport {
  const evidence = {
    enginePartnershipReport: options.enginePartnershipReport,
    codingAgentPartnershipReport: options.codingAgentPartnershipReport,
    educationAdoptionReport: options.educationAdoptionReport,
    contentCadenceReport: options.contentCadenceReport,
    commercialCreditReport: options.commercialCreditReport,
  };
  const metrics = withEvidenceReports(normalizeMetrics(options.metrics ?? distributionMetricsFromEnv()), evidence);
  const checks = buildChecks(metrics, evidence);
  const pass = checks.filter((check) => check.status === 'pass').length;
  const warn = checks.filter((check) => check.status === 'warn').length;
  const fail = checks.filter((check) => check.status === 'fail').length;
  const liveMarketplaceChannels = [
    metrics.unityAssetStoreLive,
    metrics.unrealMarketplaceLive,
    metrics.godotAssetLibraryLive,
    metrics.itchCreatorToolsLive,
    metrics.steamworksPartnerAccepted,
  ].filter(Boolean).length;
  const submittedMarketplaceChannels = [
    metrics.unityAssetStoreSubmitted || metrics.unityAssetStoreLive,
    metrics.unrealMarketplaceSubmitted || metrics.unrealMarketplaceLive,
    metrics.godotAssetLibrarySubmitted || metrics.godotAssetLibraryLive,
    metrics.itchCreatorToolsLive,
    metrics.steamworksPartnerApplied || metrics.steamworksPartnerAccepted,
  ].filter(Boolean).length;
  return {
    generatedAt: (options.now ?? new Date()).toISOString(),
    disclaimer: 'Distribution readiness is internal operating evidence only. Marketplace portals, partner agreements, grant award notices, sponsor invoices, analytics exports, and published case studies remain authoritative.',
    targets: {
      educationalInstitutions: 5,
      organicFreeSignupsWeekly: 200,
      coMarketingAnnouncements: 1,
      creditedCommercialGames: 5,
      contentCadence: {
        tutorials: 1,
        socialPosts: 2,
        livestreams: 1,
        newsletters: 1,
        changelogPosts: 1,
      },
    },
    metrics,
    summary: {
      status: fail > 0 ? 'fail' : warn > 0 ? 'warn' : 'pass',
      checks: checks.length,
      pass,
      warn,
      fail,
      liveMarketplaceChannels,
      submittedMarketplaceChannels,
      readyForDistributionScale: fail === 0
        && liveMarketplaceChannels >= 3
        && evidence.educationAdoptionReport?.summary.educationDistributionReady === true
        && evidence.contentCadenceReport?.summary.contentEngineReady === true,
      engineVendorStrategicInterest: evidence.enginePartnershipReport?.summary.engineVendorStrategicInterest === true
        && evidence.codingAgentPartnershipReport?.summary.distributionRequirementMet === true
        && evidence.commercialCreditReport?.summary.acquisitionNarrativeReady === true,
      enginePartnershipStatus: evidence.enginePartnershipReport?.summary.status ?? 'fail',
      codingAgentPartnershipStatus: evidence.codingAgentPartnershipReport?.summary.status ?? 'fail',
      educationAdoptionStatus: evidence.educationAdoptionReport?.summary.status ?? 'fail',
      contentCadenceStatus: evidence.contentCadenceReport?.summary.status ?? 'fail',
      commercialCreditStatus: evidence.commercialCreditReport?.summary.status ?? 'fail',
      codingAgentDistributionReady: evidence.codingAgentPartnershipReport?.summary.distributionRequirementMet === true,
      educationDistributionReady: evidence.educationAdoptionReport?.summary.educationDistributionReady === true,
      contentEngineReady: evidence.contentCadenceReport?.summary.contentEngineReady === true,
      commercialCreditNarrativeReady: evidence.commercialCreditReport?.summary.acquisitionNarrativeReady === true,
    },
    checks,
    ...(evidence.enginePartnershipReport ? { enginePartnerships: evidence.enginePartnershipReport.summary } : {}),
    ...(evidence.codingAgentPartnershipReport ? { codingAgentPartnerships: evidence.codingAgentPartnershipReport.summary } : {}),
    ...(evidence.educationAdoptionReport ? { educationAdoption: evidence.educationAdoptionReport.summary } : {}),
    ...(evidence.contentCadenceReport ? { contentCadence: evidence.contentCadenceReport.summary } : {}),
    ...(evidence.commercialCreditReport ? { commercialCredits: evidence.commercialCreditReport.summary } : {}),
  };
}

export function formatDistributionReadinessMarkdown(report: DistributionReadinessReport): string {
  const lines = [
    '# Greybox Distribution Readiness',
    '',
    `Generated: ${report.generatedAt}`,
    `Status: ${report.summary.status}`,
    `Ready for distribution scale: ${report.summary.readyForDistributionScale ? 'yes' : 'no'}`,
    `Engine-vendor strategic interest: ${report.summary.engineVendorStrategicInterest ? 'yes' : 'no'}`,
    `Disclaimer: ${report.disclaimer}`,
    '',
    '## Summary',
    '',
    `- Live marketplace channels: ${report.summary.liveMarketplaceChannels}`,
    `- Submitted marketplace channels: ${report.summary.submittedMarketplaceChannels}`,
    `- Education institutions: ${report.metrics.educationalInstitutionsActive}`,
    `- Organic free signups/week: ${report.metrics.organicFreeSignupsWeekly}`,
    `- Co-marketing announcements: ${report.metrics.coMarketingAnnouncements}`,
    `- Commercial game credits: ${report.metrics.creditedCommercialGames}`,
    `- Engine partnership proof ready: ${report.summary.enginePartnershipStatus === 'pass' ? 'yes' : 'no'}`,
    `- Coding-agent distribution ready: ${report.summary.codingAgentDistributionReady ? 'yes' : 'no'}`,
    `- Education distribution ready: ${report.summary.educationDistributionReady ? 'yes' : 'no'}`,
    `- Content engine ready: ${report.summary.contentEngineReady ? 'yes' : 'no'}`,
    `- Commercial credit narrative ready: ${report.summary.commercialCreditNarrativeReady ? 'yes' : 'no'}`,
    '',
    '## Checks',
    '',
    '| Check | Status | Current | Target | Owner |',
    '| --- | --- | --- | --- | --- |',
  ];
  for (const check of report.checks) {
    lines.push(`| ${escapeTableCell(check.label)} | ${check.status} | ${escapeTableCell(check.current)} | ${escapeTableCell(check.target)} | ${escapeTableCell(check.owner)} |`);
  }
  lines.push('');
  return lines.join('\n');
}

function buildChecks(
  metrics: DistributionMetrics,
  evidence: DistributionEvidenceReports,
): DistributionReadinessCheck[] {
  return [
    marketplacePresenceCheck(metrics),
    enginePartnershipCheck(metrics, evidence.enginePartnershipReport),
    educationDistributionCheck(metrics, evidence.educationAdoptionReport),
    organicSignupCheck(metrics, evidence.contentCadenceReport),
    coMarketingCheck(metrics, evidence.codingAgentPartnershipReport),
    contentCadenceCheck(metrics, evidence.contentCadenceReport),
    caseStudyCheck(metrics, evidence.commercialCreditReport),
    eventSponsorshipCheck(metrics, evidence.contentCadenceReport),
  ];
}

function withEvidenceReports(
  metrics: DistributionMetrics,
  evidence: DistributionEvidenceReports,
): DistributionMetrics {
  const enginePartnerships = evidence.enginePartnershipReport?.summary;
  const codingAgentPartnerships = evidence.codingAgentPartnershipReport?.summary;
  const educationAdoption = evidence.educationAdoptionReport?.summary;
  const contentCadence = evidence.contentCadenceReport?.summary;
  const commercialCredits = evidence.commercialCreditReport?.summary;
  return {
    ...metrics,
    unityVerifiedSolutionApplied: enginePartnerships?.unityVerifiedApplied ?? metrics.unityVerifiedSolutionApplied,
    unityVerifiedSolutionAchieved: enginePartnerships?.unityVerifiedAchieved ?? metrics.unityVerifiedSolutionAchieved,
    epicMegaGrantApplied: enginePartnerships?.epicMegaGrantApplied ?? metrics.epicMegaGrantApplied,
    epicMegaGrantLanded: enginePartnerships?.epicMegaGrantLanded ?? metrics.epicMegaGrantLanded,
    godotSponsorshipActive: enginePartnerships?.godotSponsorshipActive ?? metrics.godotSponsorshipActive,
    educationalInstitutionsActive: educationAdoption?.activeInstitutions ?? metrics.educationalInstitutionsActive,
    organicFreeSignupsWeekly: contentCadence?.organicSignupsAttributed ?? metrics.organicFreeSignupsWeekly,
    coMarketingAnnouncements: codingAgentPartnerships?.anchorCoMarketingAnnouncements ?? metrics.coMarketingAnnouncements,
    codingCliPartnerships: codingAgentPartnerships?.partnerPipeline ?? metrics.codingCliPartnerships,
    caseStudiesThisMonth: commercialCredits?.approvedCaseStudies ?? metrics.caseStudiesThisMonth,
    creditedCommercialGames: commercialCredits?.verifiedCommercialCredits ?? metrics.creditedCommercialGames,
    tutorialsThisWeek: contentCadence?.tutorialsThisWeek ?? metrics.tutorialsThisWeek,
    socialPostsThisWeek: contentCadence?.socialPostsThisWeek ?? metrics.socialPostsThisWeek,
    livestreamsThisWeek: contentCadence?.livestreamsThisWeek ?? metrics.livestreamsThisWeek,
    newslettersThisWeek: contentCadence?.newslettersThisWeek ?? metrics.newslettersThisWeek,
    changelogPostsThisWeek: contentCadence?.changelogPostsThisWeek ?? metrics.changelogPostsThisWeek,
    gdcTalksSubmitted: contentCadence?.gdcTalksSubmitted ?? metrics.gdcTalksSubmitted,
    jamSponsorshipsActive: contentCadence?.jamSponsorshipsActive ?? metrics.jamSponsorshipsActive,
  };
}

function marketplacePresenceCheck(metrics: DistributionMetrics): DistributionReadinessCheck {
  const live = [
    metrics.unityAssetStoreLive,
    metrics.unrealMarketplaceLive,
    metrics.godotAssetLibraryLive,
    metrics.itchCreatorToolsLive,
    metrics.steamworksPartnerAccepted,
  ].filter(Boolean).length;
  const submitted = [
    metrics.unityAssetStoreSubmitted || metrics.unityAssetStoreLive,
    metrics.unrealMarketplaceSubmitted || metrics.unrealMarketplaceLive,
    metrics.godotAssetLibrarySubmitted || metrics.godotAssetLibraryLive,
    metrics.itchCreatorToolsLive,
    metrics.steamworksPartnerApplied || metrics.steamworksPartnerAccepted,
  ].filter(Boolean).length;
  const status: DistributionReadinessStatus = live >= 3 ? 'pass' : submitted >= 3 ? 'warn' : 'fail';
  return {
    id: 'marketplace-presence',
    label: 'Marketplace presence',
    status,
    current: `${live} live, ${submitted} submitted/applied`,
    target: 'Unity, Godot, itch/Steam live; Unreal submitted after Unity is irreproachable',
    owner: 'Distribution',
    detail: 'Marketplace presence is the compounding distribution layer for engine-specific adoption.',
    evidence: ['Unity Asset Store listing', 'Unreal Marketplace submission', 'Godot Asset Library listing', 'itch.io listing', 'Steamworks partner portal'],
    ...(status === 'pass' ? {} : { remediation: 'Finish Unity Asset Store submission, publish the free Godot listing, and stage Unreal after Unity adoption evidence passes.' }),
  };
}

function enginePartnershipCheck(
  metrics: DistributionMetrics,
  enginePartnership: EnginePartnershipReport | undefined,
): DistributionReadinessCheck {
  if (!enginePartnership) {
    return {
      id: 'engine-vendor-partnerships',
      label: 'Engine vendor partnerships',
      status: 'fail',
      current: `${[metrics.unityVerifiedSolutionAchieved, metrics.epicMegaGrantLanded, metrics.godotSponsorshipActive].filter(Boolean).length}/3 raw win(s), no engine-partnership packet`,
      target: 'Unity Verified Solution, Epic MegaGrant, and active Godot sponsorship',
      owner: 'Partnerships',
      detail: 'Engine-vendor claims need portal, award, and sponsorship evidence rather than raw booleans.',
      evidence: ['GET /v1/strategy/engine-partnerships', 'Unity Verified Solutions portal', 'Epic MegaGrant award notice', 'Godot sponsorship invoice'],
      remediation: 'Generate the engine-partnership packet before counting engine-vendor strategic interest.',
    };
  }
  const wins = [
    enginePartnership.summary.unityVerifiedAchieved,
    enginePartnership.summary.epicMegaGrantLanded,
    enginePartnership.summary.godotSponsorshipActive,
  ].filter(Boolean).length;
  const applied = [
    enginePartnership.summary.unityVerifiedApplied || enginePartnership.summary.unityVerifiedAchieved,
    enginePartnership.summary.epicMegaGrantApplied || enginePartnership.summary.epicMegaGrantLanded,
    enginePartnership.summary.godotSponsorshipActive,
  ].filter(Boolean).length;
  const status: DistributionReadinessStatus = enginePartnership.summary.engineVendorStrategicInterest
    ? 'pass'
    : applied >= 2
      ? 'warn'
      : 'fail';
  return {
    id: 'engine-vendor-partnerships',
    label: 'Engine vendor partnerships',
    status,
    current: `${wins}/3 achieved, ${applied}/3 applied or active, ${enginePartnership.summary.evidenceItems} evidence item(s)`,
    target: 'Unity Verified Solution, Epic MegaGrant, and active Godot sponsorship',
    owner: 'Partnerships',
    detail: 'Engine-vendor signals lift strategic value beyond ordinary SaaS distribution.',
    evidence: ['GET /v1/strategy/engine-partnerships', 'Unity Verified Solutions portal', 'Epic MegaGrant award notice', 'Godot sponsorship invoice'],
    ...(status === 'pass' ? {} : { remediation: 'Use Unity adoption proof, open-core trust, and Godot goodwill to complete engine-vendor partnership applications.' }),
  };
}

function educationDistributionCheck(
  metrics: DistributionMetrics,
  educationAdoption: EducationAdoptionReport | undefined,
): DistributionReadinessCheck {
  if (!educationAdoption) {
    return {
      id: 'education-distribution',
      label: 'Educational distribution',
      status: 'fail',
      current: `${metrics.educationalInstitutionsActive} raw active institution(s), no education-adoption packet`,
      target: '5+ educational institutions actively using Greybox in coursework',
      owner: 'Developer Relations',
      detail: 'Education distribution needs active-term coursework, accreditation, license, and instructor evidence.',
      evidence: ['GET /v1/strategy/education-adoption', 'course syllabus screenshots', 'free education license ledger'],
      remediation: 'Generate the education adoption packet before counting institutions in distribution readiness.',
    };
  }
  const status: DistributionReadinessStatus = educationAdoption.summary.educationDistributionReady
    ? 'pass'
    : educationAdoption.summary.activeInstitutions >= 1
      ? 'warn'
      : 'fail';
  return {
    id: 'education-distribution',
    label: 'Educational distribution',
    status,
    current: `${educationAdoption.summary.activeInstitutions} active institution(s), ${educationAdoption.summary.activeSeats} seat(s), ${educationAdoption.summary.engineExportCourses} engine-export course(s)`,
    target: '5+ educational institutions actively using Greybox in coursework',
    owner: 'Developer Relations',
    detail: 'Education creates low-cost adoption and future team familiarity with Greybox workflows.',
    evidence: ['GET /v1/strategy/education-adoption', 'course syllabus screenshots', 'free education license ledger'],
    ...(status === 'pass' ? {} : { remediation: 'Recruit accredited game-design programs and package coursework around Unity sample exports.' }),
  };
}

function organicSignupCheck(
  metrics: DistributionMetrics,
  contentCadence: ContentCadenceReport | undefined,
): DistributionReadinessCheck {
  if (!contentCadence) {
    return {
      id: 'organic-free-signups',
      label: 'Organic free signups',
      status: 'fail',
      current: `${metrics.organicFreeSignupsWeekly}/week raw, no content-cadence packet`,
      target: '200+ organic-search free signups per week attributed to public content',
      owner: 'Growth',
      detail: 'Organic signup volume should be tied to public content evidence before distribution scale claims pass.',
      evidence: ['GET /v1/strategy/content-cadence', 'PostHog signup dashboard', 'Search Console export'],
      remediation: 'Generate the content cadence packet before counting organic free signups.',
    };
  }
  const status: DistributionReadinessStatus = contentCadence.summary.organicSignupTargetMet
    ? 'pass'
    : contentCadence.summary.organicSignupsAttributed >= 50
      ? 'warn'
      : 'fail';
  return {
    id: 'organic-free-signups',
    label: 'Organic free signups',
    status,
    current: `${contentCadence.summary.organicSignupsAttributed}/week attributed`,
    target: '200+ organic-search free signups per week attributed to public content',
    owner: 'Growth',
    detail: 'Organic signup volume is the repeatable top-of-funnel needed before paid GTM spend.',
    evidence: ['GET /v1/strategy/content-cadence', 'PostHog signup dashboard', 'Search Console export'],
    ...(status === 'pass' ? {} : { remediation: 'Increase tutorial cadence, sample SEO pages, and engine-specific onboarding content.' }),
  };
}

function coMarketingCheck(
  metrics: DistributionMetrics,
  codingAgentPartnership: CodingAgentPartnershipReport | undefined,
): DistributionReadinessCheck {
  if (!codingAgentPartnership) {
    return {
      id: 'co-marketing',
      label: 'Coding-agent co-marketing',
      status: 'fail',
      current: `${metrics.coMarketingAnnouncements} raw announcement(s), ${metrics.codingCliPartnerships} raw CLI partnership(s), no coding-agent packet`,
      target: '1+ co-marketing announcement with Anthropic or OpenAI, plus CLI partner pipeline',
      owner: 'Partnerships',
      detail: 'Agent-channel credibility needs public announcement and MCP validation evidence.',
      evidence: ['GET /v1/strategy/coding-agent-partnerships', 'partner announcement URL', 'webinar page', 'signed co-marketing plan'],
      remediation: 'Generate the coding-agent partnership packet before counting co-marketing in distribution readiness.',
    };
  }
  const status: DistributionReadinessStatus = codingAgentPartnership.summary.distributionRequirementMet
    ? 'pass'
    : codingAgentPartnership.summary.partnerPipeline >= 1
      ? 'warn'
      : 'fail';
  return {
    id: 'co-marketing',
    label: 'Coding-agent co-marketing',
    status,
    current: `${codingAgentPartnership.summary.anchorCoMarketingAnnouncements} anchor announcement(s), ${codingAgentPartnership.summary.partnerPipeline} partner(s), ${codingAgentPartnership.summary.validatedCliIntegrations} validated integration(s)`,
    target: '1+ co-marketing announcement with Anthropic or OpenAI, plus CLI partner pipeline',
    owner: 'Partnerships',
    detail: 'Agent-channel credibility makes Greybox legible to coding-agent and engine ecosystems.',
    evidence: ['GET /v1/strategy/coding-agent-partnerships', 'partner announcement URL', 'webinar page', 'signed co-marketing plan'],
    ...(status === 'pass' ? {} : { remediation: 'Prioritize Anthropic/OpenAI/Cursor partnership proof around the Unity MCP bridge.' }),
  };
}

function contentCadenceCheck(
  metrics: DistributionMetrics,
  contentCadence: ContentCadenceReport | undefined,
): DistributionReadinessCheck {
  if (!contentCadence) {
    return {
      id: 'content-cadence',
      label: 'Weekly content cadence',
      status: 'fail',
      current: `${metrics.tutorialsThisWeek} raw tutorials, ${metrics.socialPostsThisWeek} raw social, no content-cadence packet`,
      target: '1 tutorial, 2 social posts, 1 livestream, 1 newsletter, 1 changelog weekly',
      owner: 'Content',
      detail: 'The content engine must be proven from public archive evidence rather than hand-entered weekly counters.',
      evidence: ['GET /v1/strategy/content-cadence', 'blog CMS', 'stream archive', 'newsletter archive', 'release notes'],
      remediation: 'Generate the content cadence packet before counting weekly content output.',
    };
  }
  const requirements = [
    contentCadence.summary.tutorialsThisWeek >= 1,
    contentCadence.summary.socialPostsThisWeek >= 2,
    contentCadence.summary.livestreamsThisWeek >= 1,
    contentCadence.summary.newslettersThisWeek >= 1,
    contentCadence.summary.changelogPostsThisWeek >= 1,
  ];
  const passed = requirements.filter(Boolean).length;
  const status: DistributionReadinessStatus = passed === requirements.length
    ? 'pass'
    : passed >= 3
      ? 'warn'
      : 'fail';
  return {
    id: 'content-cadence',
    label: 'Weekly content cadence',
    status,
    current: `${contentCadence.summary.tutorialsThisWeek} tutorials, ${contentCadence.summary.socialPostsThisWeek} social, ${contentCadence.summary.livestreamsThisWeek} livestreams, ${contentCadence.summary.newslettersThisWeek} newsletters, ${contentCadence.summary.changelogPostsThisWeek} changelogs`,
    target: '1 tutorial, 2 social posts, 1 livestream, 1 newsletter, 1 changelog weekly',
    owner: 'Content',
    detail: 'The content engine turns shipped features into recurring creator demand.',
    evidence: ['GET /v1/strategy/content-cadence', 'blog CMS', 'stream archive', 'newsletter archive', 'release notes'],
    ...(status === 'pass' ? {} : { remediation: 'Run the Monday-Friday publishing cadence from the GTM plan before scaling paid acquisition.' }),
  };
}

function caseStudyCheck(
  metrics: DistributionMetrics,
  commercialCredits: CommercialCreditReport | undefined,
): DistributionReadinessCheck {
  if (!commercialCredits) {
    return {
      id: 'case-study-credits',
      label: 'Case studies and game credits',
      status: 'fail',
      current: `${metrics.caseStudiesThisMonth} raw case study/studies this month, ${metrics.creditedCommercialGames} raw credited commercial game(s), no commercial-credit packet`,
      target: '1+ real shipped-game case study/month and 5+ commercial game credits',
      owner: 'Developer Relations',
      detail: 'Public shipped-game proof should come from the commercial credit evidence registry.',
      evidence: ['GET /v1/strategy/commercial-credits', 'case study URLs', 'game credits screenshots', 'customer quote approvals'],
      remediation: 'Generate the commercial credit packet before counting shipped-game proof in distribution readiness.',
    };
  }
  const status: DistributionReadinessStatus = commercialCredits.summary.acquisitionNarrativeReady
    ? 'pass'
    : commercialCredits.summary.verifiedCommercialCredits >= 3 || commercialCredits.summary.approvedCaseStudies >= 1
      ? 'warn'
      : 'fail';
  return {
    id: 'case-study-credits',
    label: 'Case studies and game credits',
    status,
    current: `${commercialCredits.summary.approvedCaseStudies} approved case study/studies, ${commercialCredits.summary.verifiedCommercialCredits} verified commercial credit(s)`,
    target: '1+ real shipped-game case study/month and 5+ commercial game credits',
    owner: 'Developer Relations',
    detail: 'Public shipped-game proof is what turns distribution into buyer narrative momentum.',
    evidence: ['GET /v1/strategy/commercial-credits', 'case study URLs', 'game credits screenshots', 'customer quote approvals'],
    ...(status === 'pass' ? {} : { remediation: 'Prioritize launch-bound indie customers and secure explicit Greybox credit language.' }),
  };
}

function eventSponsorshipCheck(
  metrics: DistributionMetrics,
  contentCadence: ContentCadenceReport | undefined,
): DistributionReadinessCheck {
  if (!contentCadence) {
    return {
      id: 'events-and-jams',
      label: 'Events and game jams',
      status: 'fail',
      current: `${metrics.gdcTalksSubmitted} raw GDC talk(s), ${metrics.jamSponsorshipsActive} raw jam sponsorship(s), no content-cadence packet`,
      target: '1+ GDC talk submitted per cycle and active Ludum Dare / Global Game Jam / GMTK Jam sponsorships',
      owner: 'Developer Relations',
      detail: 'Event and jam claims need submission receipts, sponsorship invoices, and public archive evidence.',
      evidence: ['GET /v1/strategy/content-cadence', 'GDC submission receipt', 'jam sponsorship invoices', 'event landing pages'],
      remediation: 'Generate the content cadence packet before counting event distribution.',
    };
  }
  const status: DistributionReadinessStatus = contentCadence.summary.eventDistributionReady
    ? 'pass'
    : contentCadence.summary.gdcTalksSubmitted >= 1 || contentCadence.summary.jamSponsorshipsActive >= 1
      ? 'warn'
      : 'fail';
  return {
    id: 'events-and-jams',
    label: 'Events and game jams',
    status,
    current: `${contentCadence.summary.gdcTalksSubmitted} GDC talk(s) submitted, ${contentCadence.summary.jamSponsorshipsActive} jam sponsorship(s)`,
    target: '1+ GDC talk submitted per cycle and active Ludum Dare / Global Game Jam / GMTK Jam sponsorships',
    owner: 'Developer Relations',
    detail: 'Community events convert credibility into creator supply and public category language.',
    evidence: ['GET /v1/strategy/content-cadence', 'GDC submission receipt', 'jam sponsorship invoices', 'event landing pages'],
    ...(status === 'pass' ? {} : { remediation: 'Submit the Greybox Unity round-trip talk and sponsor two high-signal game-jam communities.' }),
  };
}

function normalizeMetrics(input: DistributionMetricInput): DistributionMetrics {
  return {
    unityAssetStoreSubmitted: input.unityAssetStoreSubmitted === true,
    unityAssetStoreLive: input.unityAssetStoreLive === true,
    unrealMarketplaceSubmitted: input.unrealMarketplaceSubmitted === true,
    unrealMarketplaceLive: input.unrealMarketplaceLive === true,
    godotAssetLibrarySubmitted: input.godotAssetLibrarySubmitted === true,
    godotAssetLibraryLive: input.godotAssetLibraryLive === true,
    itchCreatorToolsLive: input.itchCreatorToolsLive === true,
    steamworksPartnerApplied: input.steamworksPartnerApplied === true,
    steamworksPartnerAccepted: input.steamworksPartnerAccepted === true,
    unityVerifiedSolutionApplied: input.unityVerifiedSolutionApplied === true,
    unityVerifiedSolutionAchieved: input.unityVerifiedSolutionAchieved === true,
    epicMegaGrantApplied: input.epicMegaGrantApplied === true,
    epicMegaGrantLanded: input.epicMegaGrantLanded === true,
    godotSponsorshipActive: input.godotSponsorshipActive === true,
    educationalInstitutionsActive: nonNegative(input.educationalInstitutionsActive),
    organicFreeSignupsWeekly: nonNegative(input.organicFreeSignupsWeekly),
    coMarketingAnnouncements: nonNegative(input.coMarketingAnnouncements),
    codingCliPartnerships: nonNegative(input.codingCliPartnerships),
    caseStudiesThisMonth: nonNegative(input.caseStudiesThisMonth),
    creditedCommercialGames: nonNegative(input.creditedCommercialGames),
    tutorialsThisWeek: nonNegative(input.tutorialsThisWeek),
    socialPostsThisWeek: nonNegative(input.socialPostsThisWeek),
    livestreamsThisWeek: nonNegative(input.livestreamsThisWeek),
    newslettersThisWeek: nonNegative(input.newslettersThisWeek),
    changelogPostsThisWeek: nonNegative(input.changelogPostsThisWeek),
    gdcTalksSubmitted: nonNegative(input.gdcTalksSubmitted),
    gdcTalksAccepted: nonNegative(input.gdcTalksAccepted),
    jamSponsorshipsActive: nonNegative(input.jamSponsorshipsActive),
  };
}

function optionalBool(key: keyof DistributionMetricInput, value: unknown): Partial<DistributionMetricInput> {
  return typeof value === 'boolean' ? { [key]: value } : {};
}

function optionalNumber(key: keyof DistributionMetricInput, value: unknown): Partial<DistributionMetricInput> {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? { [key]: value } : {};
}

function nonNegative(value: number | undefined): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : 0;
}

function escapeTableCell(value: string): string {
  return value.replaceAll('|', '\\|').replaceAll('\n', '<br>');
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}
