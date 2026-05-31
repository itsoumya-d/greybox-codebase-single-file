// Proprietary and confidential. Copyright (c) 2026 Greybox Studio.

import assert from 'node:assert/strict';
import type http from 'node:http';
import test from 'node:test';
import {
  buildEducationAdoptionReport,
  educationAdoptionRecordsFromEnv,
  formatEducationAdoptionMarkdown,
  type EducationInstitutionRecordInput,
} from '../src/enterprise/educationAdoption.js';
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

function readyInstitutions(): EducationInstitutionRecordInput[] {
  return [
    institution('nova-game-school', 'Nova Game School', 'Game Design BFA', 'Vertical Slice Studio', 'US', 'Unity', 26, 8, 'a'),
    institution('mithila-design-institute', 'Mithila Design Institute', 'Interactive Media', 'Playable Systems', 'India', 'Godot', 22, 6, 'b'),
    institution('rhein-games-academy', 'Rhein Games Academy', 'Game Production', 'Engine Export Lab', 'EU', 'Unreal', 24, 5, 'c'),
    institution('harbor-arts-college', 'Harbor Arts College', 'Level Design', 'Greyboxing Workshop', 'US', 'Multiple', 28, 7, 'd'),
    institution('pacific-play-lab', 'Pacific Play Lab', 'Technical Design', 'Design-to-Engine Lab', 'APAC', 'Unity', 25, 4, 'e'),
  ];
}

function institution(
  institutionSlug: string,
  institutionName: string,
  programName: string,
  courseName: string,
  region: EducationInstitutionRecordInput['region'],
  engineFocus: EducationInstitutionRecordInput['engineFocus'],
  activeSeats: number,
  studentProjectsShipped: number,
  hashDigit: string,
): EducationInstitutionRecordInput {
  return {
    institutionSlug,
    institutionName,
    programName,
    courseName,
    region,
    status: 'active',
    engineFocus,
    termStart: '2026-01-10T00:00:00.000Z',
    termEnd: '2026-06-30T00:00:00.000Z',
    activeSeats,
    accredited: true,
    freeEducationLicense: true,
    courseworkUsesEngineExport: true,
    instructorTrainingCompleted: true,
    studentProjectsShipped,
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

test('education adoption report proves five active coursework institutions', () => {
  const report = buildEducationAdoptionReport({
    now: new Date('2026-05-18T00:00:00.000Z'),
    records: readyInstitutions(),
  });

  assert.equal(report.generatedAt, '2026-05-18T00:00:00.000Z');
  assert.equal(report.summary.status, 'pass');
  assert.equal(report.summary.activeInstitutions, 5);
  assert.equal(report.summary.accreditedActiveInstitutions, 5);
  assert.equal(report.summary.activeSeats, 125);
  assert.equal(report.summary.engineExportCourses, 5);
  assert.equal(report.summary.trainedInstructorInstitutions, 5);
  assert.equal(report.summary.educationDistributionReady, true);
  assert.ok(report.institutions.every((record) => record.activeNow));
  assert.ok(report.institutions.some((record) => record.publicHosts.includes('showcase.example.edu')));
  assert.doesNotMatch(JSON.stringify(report), /sourceHash|SECRET|TOKEN|@|learner names|guardian data|private roster/u);
});

test('education adoption report fails closed on weak course evidence', () => {
  const report = buildEducationAdoptionReport({
    now: new Date('2026-05-18T00:00:00.000Z'),
    records: [
      {
        ...institution('thin-course', 'Thin Course', 'Game Design', 'Prototype Lab', 'US', 'Unity', 28, 2, '3'),
        evidence: [{
          type: 'syllabus',
          capturedAt: '2026-02-01T00:00:00.000Z',
          sourceHash: '3'.repeat(64),
          sourceUrl: 'https://courses.example.edu/thin-course/syllabus',
        }],
      },
      {
        ...institution('untrained-course', 'Untrained Course', 'Game Design', 'Export Lab', 'EU', 'Godot', 22, 1, '4'),
        freeEducationLicense: false,
        instructorTrainingCompleted: false,
      },
    ],
  });

  assert.equal(report.summary.status, 'fail');
  assert.equal(report.summary.activeInstitutions, 2);
  assert.equal(report.summary.educationDistributionReady, false);
  assert.ok(report.checks.some((check) => check.id === 'active-institutions' && check.status === 'warn'));
  assert.ok(report.checks.some((check) => check.id === 'coursework-evidence' && check.status === 'fail'));
  assert.ok(report.checks.some((check) => check.id === 'education-trust-hygiene' && check.status === 'fail'));
});

test('education adoption env parser keeps sanitized known fields only', () => {
  assert.deepEqual(educationAdoptionRecordsFromEnv({ GREYBOX_EDUCATION_ADOPTION_JSON: 'nope' }), []);
  const records = educationAdoptionRecordsFromEnv({
    GREYBOX_EDUCATION_ADOPTION_JSON: JSON.stringify([
      {
        institutionSlug: 'safe-campus',
        institutionName: 'Safe Campus',
        programName: 'Game Design',
        courseName: 'Engine Export Lab',
        region: 'US',
        status: 'active',
        engineFocus: 'Unity',
        termStart: '2026-01-10',
        termEnd: '2026-06-30',
        activeSeats: 31.7,
        accredited: true,
        freeEducationLicense: true,
        courseworkUsesEngineExport: true,
        instructorTrainingCompleted: true,
        studentProjectsShipped: 9,
        instructorEmail: 'do-not-return@example.com',
        privateRoster: 'do not return',
        evidence: [
          {
            type: 'course-page',
            capturedAt: '2026-02-01',
            sourceHash: '5'.repeat(64),
            sourceUrl: 'https://courses.example.edu/safe-campus#private',
            rawRoster: 'do not return',
          },
          {
            type: 'license-ledger',
            capturedAt: '2026-02-02',
            sourceUrl: 'https://licenses.example.edu/safe-campus',
          },
        ],
      },
      {
        institutionSlug: 'unsafe-campus',
        institutionName: 'owner@example.com',
        programName: 'Game Design',
        courseName: 'Export Lab',
        region: 'US',
        status: 'active',
        engineFocus: 'Unity',
        termStart: '2026-01-10',
        termEnd: '2026-06-30',
      },
    ]),
  });

  assert.equal(records.length, 1);
  assert.equal(records[0]?.institutionSlug, 'safe-campus');
  assert.equal(records[0]?.activeSeats, 31);
  assert.equal(records[0]?.evidence?.length, 1);
  assert.equal(records[0]?.evidence?.[0]?.sourceUrl, 'https://courses.example.edu/safe-campus');
  assert.doesNotMatch(JSON.stringify(records), /do-not-return|privateRoster|rawRoster|licenses\.example|owner@example/u);
});

test('education adoption markdown and endpoint are admin protected and safe', async () => {
  const markdown = formatEducationAdoptionMarkdown(buildEducationAdoptionReport({
    now: new Date('2026-05-18T00:00:00.000Z'),
    records: readyInstitutions(),
  }));
  assert.match(markdown, /Greybox Education Adoption Readiness/u);
  assert.match(markdown, /Education distribution ready: yes/u);
  assert.match(markdown, /\| Active institutions \| pass/u);
  assert.doesNotMatch(markdown, /sourceHash|TOKEN|SECRET|@/u);

  await withServer({
    auditAdminToken: 'education-admin-0123456789abcdef',
    educationAdoptionRecords: readyInstitutions(),
  }, async (baseUrl) => {
    const denied = await fetch(`${baseUrl}/v1/strategy/education-adoption`);
    assert.equal(denied.status, 401);
    assert.deepEqual(await denied.json(), { error: 'audit_admin_required' });

    const response = await fetch(`${baseUrl}/v1/strategy/education-adoption`, {
      headers: { authorization: 'Bearer education-admin-0123456789abcdef' },
    });
    assert.equal(response.status, 200);
    const report = await response.json() as {
      summary: { educationDistributionReady: boolean; activeInstitutions: number; activeSeats: number };
      institutions: Array<{ institutionName: string; publicHosts: string[] }>;
    };
    assert.equal(report.summary.educationDistributionReady, true);
    assert.equal(report.summary.activeInstitutions, 5);
    assert.equal(report.summary.activeSeats, 125);
    assert.ok(report.institutions.some((record) => record.publicHosts.includes('courses.example.edu')));
    assert.doesNotMatch(JSON.stringify(report), /education-admin|sourceHash/u);

    const markdownResponse = await fetch(`${baseUrl}/v1/strategy/education-adoption?format=markdown`, {
      headers: { authorization: 'Bearer education-admin-0123456789abcdef' },
    });
    assert.equal(markdownResponse.status, 200);
    assert.match(markdownResponse.headers.get('content-type') ?? '', /text\/markdown/u);
    assert.match(await markdownResponse.text(), /Education Adoption Readiness/u);
  });
});

test('education adoption report rejects malformed dates, hashes, and private URLs', () => {
  assert.throws(() => buildEducationAdoptionReport({
    now: new Date('2026-05-18T00:00:00.000Z'),
    records: [{
      ...institution('future-campus', 'Future Campus', 'Game Design', 'Export Lab', 'US', 'Unity', 20, 1, '6'),
      termStart: '2026-06-01T00:00:00.000Z',
    }],
  }), /termStart cannot be in the future/u);

  assert.throws(() => buildEducationAdoptionReport({
    now: new Date('2026-05-18T00:00:00.000Z'),
    records: [{
      ...institution('bad-term', 'Bad Term', 'Game Design', 'Export Lab', 'US', 'Unity', 20, 1, '6'),
      termEnd: '2025-12-01T00:00:00.000Z',
    }],
  }), /termEnd cannot precede termStart/u);

  assert.throws(() => buildEducationAdoptionReport({
    now: new Date('2026-05-18T00:00:00.000Z'),
    records: [{
      ...institution('bad-hash', 'Bad Hash', 'Game Design', 'Export Lab', 'US', 'Unity', 20, 1, '6'),
      evidence: [{
        type: 'syllabus',
        capturedAt: '2026-02-01T00:00:00.000Z',
        sourceHash: 'not-a-hash',
      }],
    }],
  }), /sourceHash must be a SHA-256/u);

  assert.throws(() => buildEducationAdoptionReport({
    now: new Date('2026-05-18T00:00:00.000Z'),
    records: [{
      ...institution('private-url', 'Private URL', 'Game Design', 'Export Lab', 'US', 'Unity', 20, 1, '6'),
      evidence: [{
        type: 'syllabus',
        capturedAt: '2026-02-01T00:00:00.000Z',
        sourceHash: '6'.repeat(64),
        sourceUrl: 'http://localhost/private',
      }],
    }],
  }), /sourceUrl must be a public HTTPS URL/u);
});
