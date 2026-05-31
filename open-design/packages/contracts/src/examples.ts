import type { ChatRequest } from './api/chat';
import type { ConnectorDetail } from './api/connectors';
import type { ProjectFile } from './api/files';
import type { LiveArtifact, LiveArtifactCreateInput, LiveArtifactUpdateInput } from './api/live-artifacts';
import type { HealthResponse } from './api/registry';
import type { ApiErrorResponse, ApiValidationErrorDetails } from './errors';
import type { ChatSseEvent } from './sse/chat';
import type { ProxySseEvent } from './sse/proxy';

export const exampleChatRequest: ChatRequest = {
  agentId: 'claude',
  message: '## player studio\nCreate an open-world RPG vertical slice game design package.',
  currentPrompt: 'Create an open-world RPG vertical slice game design package.',
  systemPrompt: 'Design a playable, emotionally coherent game experience with genre pillars, systems, levels, HUD, art direction, accessibility, and production constraints.',
  projectId: 'project_1',
  attachments: ['brief.pdf'],
  model: 'default',
  reasoning: null,
};

export const exampleProjectFile: ProjectFile = {
  name: 'index.html',
  path: 'index.html',
  type: 'file',
  size: 1024,
  mtime: 1_713_000_000,
  kind: 'html',
  mime: 'text/html',
};

export const exampleChatSseEvents: ChatSseEvent[] = [
  { event: 'start', data: { bin: 'claude', cwd: '/legacy/internal/path' } },
  { event: 'agent', data: { type: 'text_delta', delta: 'Hello' } },
  { event: 'stdout', data: { chunk: 'plain output' } },
  { event: 'end', data: { code: 0 } },
];

export const exampleProxySseEvents: ProxySseEvent[] = [
  { event: 'start', data: { model: 'gpt-4o-mini' } },
  { event: 'delta', data: { delta: 'Hello' } },
  { event: 'end', data: { code: 0 } },
];

export const exampleApiErrorResponse: ApiErrorResponse = {
  error: {
    code: 'BAD_REQUEST',
    message: 'Missing message',
    retryable: false,
  },
};

const exampleLiveArtifactValidationDetails: ApiValidationErrorDetails = {
  kind: 'validation',
  issues: [
    {
      path: 'document.templatePath',
      message: 'Live game artifact templates must be stored at template.html.',
      code: 'INVALID_TEMPLATE_PATH',
    },
  ],
};

export const exampleLiveArtifactValidationErrorResponse: ApiErrorResponse = {
  error: {
    code: 'LIVE_ARTIFACT_INVALID',
    message: 'Live game artifact validation failed',
    details: exampleLiveArtifactValidationDetails,
    retryable: false,
  },
};

export const exampleHealthResponse: HealthResponse = { ok: true, service: 'daemon' };

export const exampleLiveArtifact: LiveArtifact = {
  schemaVersion: 1,
  id: 'live_artifact_1',
  projectId: 'project_1',
  createdByRunId: 'run_1',
  title: 'Season Balance Board',
  slug: 'season-balance-board',
  status: 'active',
  pinned: false,
  preview: { type: 'html', entry: 'index.html' },
  refreshStatus: 'idle',
  createdAt: '2026-04-29T12:00:00.000Z',
  updatedAt: '2026-04-29T12:00:00.000Z',
  document: {
    format: 'html_template_v1',
    templatePath: 'template.html',
    generatedPreviewPath: 'index.html',
    dataPath: 'data.json',
    dataJson: {
      title: 'Season Balance Board',
      metrics: [{ label: 'D7 retention', value: '41%', delta: '+3 pts' }],
    },
  },
};

export const exampleLiveArtifactCreateInput: LiveArtifactCreateInput = {
  title: 'Season Balance Board',
  slug: 'season-balance-board',
  pinned: false,
  status: 'active',
  preview: { type: 'html', entry: 'index.html' },
  document: {
    format: 'html_template_v1',
    templatePath: 'template.html',
    generatedPreviewPath: 'index.html',
    dataPath: 'data.json',
    dataJson: {
      title: 'Season Balance Board',
      metrics: [{ label: 'D7 retention', value: '41%', delta: '+3 pts' }],
    },
  },
};

export const exampleLiveArtifactUpdateInput: LiveArtifactUpdateInput = {
  title: 'Season Balance Board',
  pinned: true,
  preview: { type: 'html', entry: 'index.html' },
};

export const exampleConnectorDetail: ConnectorDetail = {
  id: 'github',
  name: 'GitHub',
  provider: 'composio',
  category: 'developer',
  description: 'Search repositories, issues, pull requests, commits, and releases from a connected GitHub account via Composio.',
  status: 'available',
  toolCount: 1,
  tools: [
    {
      name: 'github.search_issues_and_pull_requests',
      title: 'Search issues and pull requests',
      description: 'Search issues and pull requests across repositories visible to the connected account.',
      inputSchemaJson: { type: 'object', additionalProperties: true },
      outputSchemaJson: { type: 'object', additionalProperties: true },
      safety: {
        sideEffect: 'read',
        approval: 'auto',
        reason: 'Tool name, scope, or description indicates explicit read-only behavior.',
      },
      refreshEligible: true,
      curation: {
        useCases: ['personal_daily_digest'],
        reason: 'Curated for recent GitHub activity in a studio pulse.',
      },
    },
  ],
  auth: { provider: 'composio', configured: false },
  allowedToolNames: ['github.search_issues_and_pull_requests'],
  curatedToolNames: ['github.search_issues_and_pull_requests'],
  featuredToolNames: ['github.search_issues_and_pull_requests'],
  minimumApproval: 'auto',
};
