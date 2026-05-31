// Proprietary and confidential. Copyright (c) 2026 Greybox Studio.

export type EducationRegion = 'US' | 'EU' | 'India' | 'APAC' | 'LATAM' | 'Other';
export type EducationInstitutionStatus = 'planned' | 'pilot' | 'active' | 'completed' | 'paused';
export type EducationEngine = 'Unity' | 'Unreal' | 'Godot' | 'Multiple';
export type EducationEvidenceType =
  | 'syllabus'
  | 'license-ledger'
  | 'course-page'
  | 'lms-screenshot'
  | 'instructor-approval'
  | 'project-showcase';
export type EducationAdoptionStatus = 'pass' | 'warn' | 'fail';

export interface EducationAdoptionEvidenceInput {
  type?: EducationEvidenceType;
  capturedAt?: string;
  sourceHash?: string;
  sourceUrl?: string;
}

export interface EducationInstitutionRecordInput {
  institutionSlug?: string;
  institutionName?: string;
  programName?: string;
  courseName?: string;
  region?: EducationRegion;
  status?: EducationInstitutionStatus;
  engineFocus?: EducationEngine;
  termStart?: string;
  termEnd?: string;
  activeSeats?: number;
  accredited?: boolean;
  freeEducationLicense?: boolean;
  courseworkUsesEngineExport?: boolean;
  instructorTrainingCompleted?: boolean;
  studentProjectsShipped?: number;
  evidence?: readonly EducationAdoptionEvidenceInput[];
}

interface EducationAdoptionEvidence {
  type: EducationEvidenceType;
  capturedAt: string;
  sourceHash: string;
  sourceUrl?: string;
}

interface EducationInstitutionRecord {
  institutionSlug: string;
  institutionName: string;
  programName: string;
  courseName: string;
  region: EducationRegion;
  status: EducationInstitutionStatus;
  engineFocus: EducationEngine;
  termStart: string;
  termEnd: string;
  activeSeats: number;
  accredited: boolean;
  freeEducationLicense: boolean;
  courseworkUsesEngineExport: boolean;
  instructorTrainingCompleted: boolean;
  studentProjectsShipped: number;
  evidence: EducationAdoptionEvidence[];
}

export interface EducationAdoptionCheck {
  id: string;
  label: string;
  status: EducationAdoptionStatus;
  current: string;
  target: string;
  owner: string;
  detail: string;
  evidence: string[];
  remediation?: string;
}

export interface EducationAdoptionReport {
  generatedAt: string;
  disclaimer: string;
  targets: {
    activeInstitutions: number;
    minimumActiveSeats: number;
    minimumEngineExportCourses: number;
  };
  summary: {
    status: EducationAdoptionStatus;
    checks: number;
    pass: number;
    warn: number;
    fail: number;
    submittedInstitutions: number;
    activeInstitutions: number;
    accreditedActiveInstitutions: number;
    activeSeats: number;
    engineExportCourses: number;
    trainedInstructorInstitutions: number;
    evidenceItems: number;
    publicEvidenceItems: number;
    studentProjectsShipped: number;
    educationDistributionReady: boolean;
  };
  institutions: Array<{
    institutionSlug: string;
    institutionName: string;
    programName: string;
    courseName: string;
    region: EducationRegion;
    status: EducationInstitutionStatus;
    engineFocus: EducationEngine;
    termStart: string;
    termEnd: string;
    activeSeats: number;
    activeNow: boolean;
    accredited: boolean;
    freeEducationLicense: boolean;
    courseworkUsesEngineExport: boolean;
    instructorTrainingCompleted: boolean;
    studentProjectsShipped: number;
    evidenceItems: number;
    evidenceTypes: EducationEvidenceType[];
    publicHosts: string[];
  }>;
  checks: EducationAdoptionCheck[];
}

const REGIONS = new Set<EducationRegion>(['US', 'EU', 'India', 'APAC', 'LATAM', 'Other']);
const STATUSES = new Set<EducationInstitutionStatus>(['planned', 'pilot', 'active', 'completed', 'paused']);
const ENGINES = new Set<EducationEngine>(['Unity', 'Unreal', 'Godot', 'Multiple']);
const EVIDENCE_TYPES = new Set<EducationEvidenceType>([
  'syllabus',
  'license-ledger',
  'course-page',
  'lms-screenshot',
  'instructor-approval',
  'project-showcase',
]);

export function educationAdoptionRecordsFromEnv(
  env: Record<string, string | undefined> = process.env,
): EducationInstitutionRecordInput[] {
  const raw = env.GREYBOX_EDUCATION_ADOPTION_JSON;
  if (!raw?.trim()) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.flatMap((value) => {
      if (!isRecord(value)) return [];
      const record = educationRecordFromRecord(value);
      return record ? [record] : [];
    });
  } catch {
    return [];
  }
}

export function buildEducationAdoptionReport(options: {
  records?: readonly EducationInstitutionRecordInput[];
  now?: Date;
} = {}): EducationAdoptionReport {
  const now = options.now ?? new Date();
  const records = normalizeRecords(options.records ?? educationAdoptionRecordsFromEnv(), now);
  const activeRecords = records.filter((record) => isActiveInstitution(record, now));
  const activeInstitutions = new Set(activeRecords.map((record) => record.institutionSlug)).size;
  const accreditedActiveInstitutions = new Set(activeRecords
    .filter((record) => record.accredited)
    .map((record) => record.institutionSlug)).size;
  const activeSeats = activeRecords.reduce((sum, record) => sum + record.activeSeats, 0);
  const engineExportCourses = activeRecords.filter((record) => record.courseworkUsesEngineExport).length;
  const trainedInstructorInstitutions = new Set(activeRecords
    .filter((record) => record.instructorTrainingCompleted)
    .map((record) => record.institutionSlug)).size;
  const evidenceItems = records.reduce((sum, record) => sum + record.evidence.length, 0);
  const publicEvidenceItems = records.reduce((sum, record) => {
    return sum + record.evidence.filter((item) => item.sourceUrl).length;
  }, 0);
  const studentProjectsShipped = activeRecords.reduce((sum, record) => sum + record.studentProjectsShipped, 0);
  const checks = buildChecks(records, {
    activeInstitutions,
    accreditedActiveInstitutions,
    activeSeats,
    engineExportCourses,
    trainedInstructorInstitutions,
  }, now);
  const pass = checks.filter((check) => check.status === 'pass').length;
  const warn = checks.filter((check) => check.status === 'warn').length;
  const fail = checks.filter((check) => check.status === 'fail').length;
  return {
    generatedAt: now.toISOString(),
    disclaimer: 'Education adoption readiness is internal operating evidence only. Course pages, syllabi, license ledgers, LMS captures, and instructor approvals remain authoritative. Do not include private personal data, nonpublic enrollment lists, credentials, unreviewed coursework files, or protected youth data.',
    targets: {
      activeInstitutions: 5,
      minimumActiveSeats: 100,
      minimumEngineExportCourses: 5,
    },
    summary: {
      status: fail > 0 ? 'fail' : warn > 0 ? 'warn' : 'pass',
      checks: checks.length,
      pass,
      warn,
      fail,
      submittedInstitutions: new Set(records.map((record) => record.institutionSlug)).size,
      activeInstitutions,
      accreditedActiveInstitutions,
      activeSeats,
      engineExportCourses,
      trainedInstructorInstitutions,
      evidenceItems,
      publicEvidenceItems,
      studentProjectsShipped,
      educationDistributionReady: activeInstitutions >= 5
        && accreditedActiveInstitutions >= 5
        && activeSeats >= 100
        && engineExportCourses >= 5
        && trainedInstructorInstitutions >= 5,
    },
    institutions: records.map((record) => ({
      institutionSlug: record.institutionSlug,
      institutionName: record.institutionName,
      programName: record.programName,
      courseName: record.courseName,
      region: record.region,
      status: record.status,
      engineFocus: record.engineFocus,
      termStart: record.termStart,
      termEnd: record.termEnd,
      activeSeats: record.activeSeats,
      activeNow: isActiveInstitution(record, now),
      accredited: record.accredited,
      freeEducationLicense: record.freeEducationLicense,
      courseworkUsesEngineExport: record.courseworkUsesEngineExport,
      instructorTrainingCompleted: record.instructorTrainingCompleted,
      studentProjectsShipped: record.studentProjectsShipped,
      evidenceItems: record.evidence.length,
      evidenceTypes: [...new Set(record.evidence.map((item) => item.type))].sort(),
      publicHosts: [...new Set(record.evidence.flatMap((item) => {
        return item.sourceUrl ? [new URL(item.sourceUrl).host] : [];
      }))].sort(),
    })),
    checks,
  };
}

export function formatEducationAdoptionMarkdown(report: EducationAdoptionReport): string {
  const lines = [
    '# Greybox Education Adoption Readiness',
    '',
    `Generated: ${report.generatedAt}`,
    `Status: ${report.summary.status}`,
    `Education distribution ready: ${report.summary.educationDistributionReady ? 'yes' : 'no'}`,
    `Disclaimer: ${report.disclaimer}`,
    '',
    '## Summary',
    '',
    `- Active institutions: ${report.summary.activeInstitutions}/${report.targets.activeInstitutions}`,
    `- Accredited active institutions: ${report.summary.accreditedActiveInstitutions}/${report.targets.activeInstitutions}`,
    `- Active seats: ${report.summary.activeSeats}/${report.targets.minimumActiveSeats}`,
    `- Engine export courses: ${report.summary.engineExportCourses}/${report.targets.minimumEngineExportCourses}`,
    `- Trained instructor institutions: ${report.summary.trainedInstructorInstitutions}`,
    `- Evidence items: ${report.summary.evidenceItems}`,
    '',
    '## Institutions',
    '',
    '| Institution | Program | Course | Region | Engine | Active | Seats | Evidence | Public hosts |',
    '| --- | --- | --- | --- | --- | --- | ---: | ---: | --- |',
  ];
  for (const institution of report.institutions) {
    lines.push(`| ${escapeTableCell(institution.institutionName)} | ${escapeTableCell(institution.programName)} | ${escapeTableCell(institution.courseName)} | ${institution.region} | ${institution.engineFocus} | ${institution.activeNow ? 'yes' : 'no'} | ${institution.activeSeats} | ${institution.evidenceItems} | ${escapeTableCell(institution.publicHosts.join(', ') || '-')} |`);
  }
  lines.push(
    '',
    '## Checks',
    '',
    '| Check | Status | Current | Target | Owner |',
    '| --- | --- | --- | --- | --- |',
  );
  for (const check of report.checks) {
    lines.push(`| ${escapeTableCell(check.label)} | ${check.status} | ${escapeTableCell(check.current)} | ${escapeTableCell(check.target)} | ${escapeTableCell(check.owner)} |`);
  }
  lines.push('');
  return lines.join('\n');
}

function educationRecordFromRecord(record: Record<string, unknown>): EducationInstitutionRecordInput | undefined {
  const institutionSlug = optionalSlug(record.institutionSlug);
  const institutionName = optionalSafeText(record.institutionName, 96);
  const programName = optionalSafeText(record.programName, 96);
  const courseName = optionalSafeText(record.courseName, 96);
  const region = optionalRegion(record.region);
  const status = optionalStatus(record.status);
  const engineFocus = optionalEngine(record.engineFocus);
  const termStart = optionalIsoDate(record.termStart);
  const termEnd = optionalIsoDate(record.termEnd);
  if (!institutionSlug || !institutionName || !programName || !courseName || !region || !status || !engineFocus || !termStart || !termEnd) {
    return undefined;
  }
  return {
    institutionSlug,
    institutionName,
    programName,
    courseName,
    region,
    status,
    engineFocus,
    termStart,
    termEnd,
    ...optionalNumberField('activeSeats', record.activeSeats),
    ...optionalBoolField('accredited', record.accredited),
    ...optionalBoolField('freeEducationLicense', record.freeEducationLicense),
    ...optionalBoolField('courseworkUsesEngineExport', record.courseworkUsesEngineExport),
    ...optionalBoolField('instructorTrainingCompleted', record.instructorTrainingCompleted),
    ...optionalNumberField('studentProjectsShipped', record.studentProjectsShipped),
    evidence: Array.isArray(record.evidence)
      ? record.evidence.flatMap((item) => isRecord(item) ? evidenceFromRecord(item) : [])
      : [],
  };
}

function evidenceFromRecord(record: Record<string, unknown>): EducationAdoptionEvidenceInput[] {
  const type = optionalEvidenceType(record.type);
  const capturedAt = optionalIsoDate(record.capturedAt);
  const sourceHash = optionalSourceHash(record.sourceHash);
  if (!type || !capturedAt || !sourceHash) return [];
  return [{
    type,
    capturedAt,
    sourceHash,
    ...optionalUrlField('sourceUrl', record.sourceUrl),
  }];
}

function normalizeRecords(
  records: readonly EducationInstitutionRecordInput[],
  now: Date,
): EducationInstitutionRecord[] {
  return records
    .map((record) => normalizeRecord(record, now))
    .sort((left, right) => left.institutionName.localeCompare(right.institutionName) || left.courseName.localeCompare(right.courseName));
}

function normalizeRecord(record: EducationInstitutionRecordInput, now: Date): EducationInstitutionRecord {
  const institutionSlug = normalizeSlug(record.institutionSlug);
  const institutionName = normalizeSafeText(record.institutionName, 'institutionName', 96);
  const programName = normalizeSafeText(record.programName, 'programName', 96);
  const courseName = normalizeSafeText(record.courseName, 'courseName', 96);
  if (!record.region || !REGIONS.has(record.region)) throw new Error('education adoption region is invalid');
  if (!record.status || !STATUSES.has(record.status)) throw new Error('education adoption status is invalid');
  if (!record.engineFocus || !ENGINES.has(record.engineFocus)) throw new Error('education adoption engineFocus is invalid');
  const termStart = normalizeIsoDate(record.termStart, 'termStart');
  const termEnd = normalizeIsoDate(record.termEnd, 'termEnd');
  if (Date.parse(termEnd) < Date.parse(termStart)) throw new Error('education adoption termEnd cannot precede termStart');
  if (Date.parse(termStart) > now.getTime()) throw new Error('education adoption termStart cannot be in the future');
  return {
    institutionSlug,
    institutionName,
    programName,
    courseName,
    region: record.region,
    status: record.status,
    engineFocus: record.engineFocus,
    termStart,
    termEnd,
    activeSeats: nonNegative(record.activeSeats),
    accredited: record.accredited === true,
    freeEducationLicense: record.freeEducationLicense === true,
    courseworkUsesEngineExport: record.courseworkUsesEngineExport === true,
    instructorTrainingCompleted: record.instructorTrainingCompleted === true,
    studentProjectsShipped: nonNegative(record.studentProjectsShipped),
    evidence: (record.evidence ?? []).map((evidence) => normalizeEvidence(evidence, now)),
  };
}

function normalizeEvidence(evidence: EducationAdoptionEvidenceInput, now: Date): EducationAdoptionEvidence {
  if (!evidence.type || !EVIDENCE_TYPES.has(evidence.type)) throw new Error('education adoption evidence type is invalid');
  const capturedAt = normalizeIsoDate(evidence.capturedAt, 'evidence.capturedAt');
  if (Date.parse(capturedAt) > now.getTime()) throw new Error('education adoption evidence capturedAt cannot be in the future');
  if (!evidence.sourceHash || !/^[a-f0-9]{64}$/iu.test(evidence.sourceHash)) {
    throw new Error('education adoption evidence sourceHash must be a SHA-256 hex digest');
  }
  return {
    type: evidence.type,
    capturedAt,
    sourceHash: evidence.sourceHash.toLowerCase(),
    ...(evidence.sourceUrl ? { sourceUrl: normalizePublicUrl(evidence.sourceUrl) } : {}),
  };
}

function buildChecks(
  records: readonly EducationInstitutionRecord[],
  summary: {
    activeInstitutions: number;
    accreditedActiveInstitutions: number;
    activeSeats: number;
    engineExportCourses: number;
    trainedInstructorInstitutions: number;
  },
  now: Date,
): EducationAdoptionCheck[] {
  const activeRecords = records.filter((record) => isActiveInstitution(record, now));
  const missingEvidence = activeRecords.filter((record) => !hasRequiredEvidence(record));
  const missingTrustHygiene = activeRecords.filter((record) => !record.accredited || !record.freeEducationLicense);
  return [
    {
      id: 'active-institutions',
      label: 'Active institutions',
      status: summary.activeInstitutions >= 5 ? 'pass' : summary.activeInstitutions >= 2 ? 'warn' : 'fail',
      current: `${summary.activeInstitutions} active institution(s)`,
      target: '5+ educational institutions actively using Greybox in coursework',
      owner: 'Developer Relations',
      detail: 'Education distribution compounds adoption by putting Greybox into game-design coursework.',
      evidence: ['course syllabus', 'public course page', 'free education license ledger'],
      remediation: 'Recruit accredited game-design programs and package Unity/Godot sample coursework.',
    },
    {
      id: 'coursework-evidence',
      label: 'Coursework evidence',
      status: missingEvidence.length === 0 && activeRecords.length > 0 ? 'pass' : 'fail',
      current: `${missingEvidence.length} active course(s) missing syllabus/license evidence`,
      target: 'Every counted active institution has syllabus/course proof and education license proof',
      owner: 'Developer Relations',
      detail: 'A school should not count unless coursework use and license entitlement are both evidenced.',
      evidence: ['syllabus digest', 'license ledger digest', 'LMS capture digest'],
      remediation: 'Attach hashed syllabus/course proof plus education license evidence before counting a course.',
    },
    {
      id: 'active-seats',
      label: 'Active seats',
      status: summary.activeSeats >= 100 ? 'pass' : summary.activeSeats >= 40 ? 'warn' : 'fail',
      current: `${summary.activeSeats} active education seat(s)`,
      target: '100+ active education seats across the first cohort',
      owner: 'Developer Relations',
      detail: 'Seat volume shows the program is more than isolated instructor demos.',
      evidence: ['seat ledger digest', 'course enrollment aggregate'],
      remediation: 'Expand free education licensing to larger cohorts once evidence hygiene is in place.',
    },
    {
      id: 'engine-export-coursework',
      label: 'Engine export coursework',
      status: summary.engineExportCourses >= 5 ? 'pass' : summary.engineExportCourses >= 2 ? 'warn' : 'fail',
      current: `${summary.engineExportCourses} active course(s) use engine export workflows`,
      target: '5+ active courses using Unity, Unreal, or Godot export workflows',
      owner: 'Education',
      detail: 'The education motion should reinforce Greybox as the design-to-engine layer, not a generic design tool.',
      evidence: ['assignment brief digest', 'project showcase digest', 'engine export capture'],
      remediation: 'Add engine-export assignments to the education kit and verify with project-showcase evidence.',
    },
    {
      id: 'education-trust-hygiene',
      label: 'Education trust hygiene',
      status: missingTrustHygiene.length === 0 && summary.trainedInstructorInstitutions >= summary.activeInstitutions && activeRecords.length > 0
        ? 'pass'
        : 'fail',
      current: `${missingTrustHygiene.length} active record(s) missing accreditation or free-license proof, ${summary.trainedInstructorInstitutions} trained instructor institution(s)`,
      target: 'Every active institution is accredited, free-licensed, and instructor-trained',
      owner: 'Trust',
      detail: 'The free education program should stay clean on consent, licensing, and instructor oversight.',
      evidence: ['accreditation status', 'education license ledger', 'instructor onboarding proof'],
      remediation: 'Do not count an institution until accreditation, free-license, and instructor training evidence are present.',
    },
  ];
}

function hasRequiredEvidence(record: EducationInstitutionRecord): boolean {
  const hasCourseProof = record.evidence.some((item) => item.type === 'syllabus' || item.type === 'course-page');
  const hasLicenseProof = record.evidence.some((item) => item.type === 'license-ledger');
  return hasCourseProof && hasLicenseProof;
}

function isActiveInstitution(record: EducationInstitutionRecord, now: Date): boolean {
  return record.status === 'active'
    && Date.parse(record.termStart) <= now.getTime()
    && Date.parse(record.termEnd) >= now.getTime();
}

function normalizeSlug(value: string | undefined): string {
  if (!value || !/^[a-z0-9][a-z0-9-]{1,62}[a-z0-9]$/u.test(value)) {
    throw new Error('education adoption institutionSlug must be a lowercase URL-safe slug');
  }
  return value;
}

function normalizeSafeText(value: string | undefined, label: string, maxLength: number): string {
  const text = optionalSafeText(value, maxLength);
  if (!text) throw new Error(`education adoption ${label} is invalid`);
  return text;
}

function normalizeIsoDate(value: string | undefined, label: string): string {
  if (!value || Number.isNaN(Date.parse(value))) throw new Error(`education adoption ${label} must be an ISO timestamp`);
  return new Date(value).toISOString();
}

function normalizePublicUrl(value: string): string {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error('education adoption sourceUrl must be a valid HTTPS URL');
  }
  if (url.protocol !== 'https:' || url.username || url.password || !url.hostname.includes('.')) {
    throw new Error('education adoption sourceUrl must be a public HTTPS URL');
  }
  url.hash = '';
  return url.toString();
}

function optionalSlug(value: unknown): string | undefined {
  return typeof value === 'string' && /^[a-z0-9][a-z0-9-]{1,62}[a-z0-9]$/u.test(value) ? value : undefined;
}

function optionalSafeText(value: unknown, maxLength: number): string | undefined {
  if (typeof value !== 'string') return undefined;
  const text = value.trim();
  if (!text || text.length > maxLength) return undefined;
  if (/[\u0000-\u001f\u007f]/u.test(text)) return undefined;
  if (/@|api[_-]?key|secret|token|password|learner|guardian|minor|private roster|raw submission/iu.test(text)) return undefined;
  return text;
}

function optionalRegion(value: unknown): EducationRegion | undefined {
  return typeof value === 'string' && REGIONS.has(value as EducationRegion) ? value as EducationRegion : undefined;
}

function optionalStatus(value: unknown): EducationInstitutionStatus | undefined {
  return typeof value === 'string' && STATUSES.has(value as EducationInstitutionStatus)
    ? value as EducationInstitutionStatus
    : undefined;
}

function optionalEngine(value: unknown): EducationEngine | undefined {
  return typeof value === 'string' && ENGINES.has(value as EducationEngine) ? value as EducationEngine : undefined;
}

function optionalEvidenceType(value: unknown): EducationEvidenceType | undefined {
  return typeof value === 'string' && EVIDENCE_TYPES.has(value as EducationEvidenceType)
    ? value as EducationEvidenceType
    : undefined;
}

function optionalIsoDate(value: unknown): string | undefined {
  return typeof value === 'string' && !Number.isNaN(Date.parse(value)) ? new Date(value).toISOString() : undefined;
}

function optionalSourceHash(value: unknown): string | undefined {
  return typeof value === 'string' && /^[a-f0-9]{64}$/iu.test(value) ? value.toLowerCase() : undefined;
}

function optionalUrlField(field: string, value: unknown): Record<string, string> {
  if (typeof value !== 'string') return {};
  try {
    return { [field]: normalizePublicUrl(value) };
  } catch {
    return {};
  }
}

function optionalBoolField(field: string, value: unknown): Record<string, boolean> {
  return typeof value === 'boolean' ? { [field]: value } : {};
}

function optionalNumberField(field: string, value: unknown): Record<string, number> {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? { [field]: Math.floor(value) } : {};
}

function nonNegative(value: number | undefined): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? Math.floor(value) : 0;
}

function escapeTableCell(value: string): string {
  return value.replaceAll('|', '\\|').replaceAll('\n', '<br>');
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
