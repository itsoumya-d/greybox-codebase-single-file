import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { LOCALIZED_CONTENT_IDS } from '../../src/i18n/content';
import { ar } from '../../src/i18n/locales/ar';
import { de } from '../../src/i18n/locales/de';
import { en } from '../../src/i18n/locales/en';
import { esES } from '../../src/i18n/locales/es-ES';
import { fa } from '../../src/i18n/locales/fa';
import { fr } from '../../src/i18n/locales/fr';
import { hu } from '../../src/i18n/locales/hu';
import { id } from '../../src/i18n/locales/id';
import { ja } from '../../src/i18n/locales/ja';
import { ko } from '../../src/i18n/locales/ko';
import { pl } from '../../src/i18n/locales/pl';
import { ptBR } from '../../src/i18n/locales/pt-BR';
import { ru } from '../../src/i18n/locales/ru';
import { th } from '../../src/i18n/locales/th';
import { tr } from '../../src/i18n/locales/tr';
import { uk } from '../../src/i18n/locales/uk';
import { zhCN } from '../../src/i18n/locales/zh-CN';
import { zhTW } from '../../src/i18n/locales/zh-TW';
import { LOCALES, LOCALE_LABEL, type Dict, type Locale } from '../../src/i18n/types';

const EXPECTED_LOCALES = ['en', 'id', 'de', 'zh-CN', 'zh-TW', 'pt-BR', 'es-ES', 'ru', 'fa', 'ar', 'ja', 'ko', 'pl', 'hu', 'fr', 'uk', 'tr', 'th'];

function placeholders(value: string): string[] {
  const names: string[] = [];
  for (const match of value.matchAll(/\{(\w+)\}/g)) {
    if (match[1]) {
      names.push(match[1]);
    }
  }
  return names.sort();
}

const DICTS: Record<Locale, Dict> = {
  en,
  id,
  de,
  'zh-CN': zhCN,
  'zh-TW': zhTW,
  'pt-BR': ptBR,
  'es-ES': esES,
  ru,
  fa,
  ar,
  ja,
  ko,
  pl,
  hu,
  fr,
  uk,
  tr,
  th,
};

async function loadDict(locale: Locale): Promise<Dict> {
  return DICTS[locale];
}

function explicitLocaleKeys(locale: Locale): string[] {
  const source = readFileSync(new URL(`../../src/i18n/locales/${locale}.ts`, import.meta.url), 'utf8');
  return Array.from(source.matchAll(/'([^']+)':/g), (match) => match[1] ?? '').filter(Boolean);
}

const GAME_FIRST_VISIBLE_COPY_RULES: Array<{ key: keyof Dict; forbidden: RegExp }> = [
  {
    key: 'settings.cliEnvHint',
    forbidden: /\bpackaged app runs\b|\bpackaged application\b|aplikasi paket|打包版應用|打包版应用|แอปพลิเคชัน|แอป/i,
  },
  {
    key: 'settings.runtimePackaged',
    forbidden:
      /\bpackaged app\b|\bpackaged application\b|app empacotado|app empaquetada|application empaquetée|paketierte app|aplicación|aplicativo|aplicativo|aplikasi|aplikacja|alkalmazás|uygulama|应用|應用|アプリ|앱|прилож|додат|تطبيق|برنامه|แอป/i,
  },
  {
    key: 'gameFiles.kindLiveArtifact',
    forbidden: /\blive app\b|ตัวแอป/i,
  },
  {
    key: 'fileViewer.deployLinkDelayed',
    forbidden: /\b(site|website)\b|sitio|webhely|strona|сайт|сайта|站点|站點|サイト|사이트|سایت|الموقع|เว็บไซต์|ตัวเว็บ/i,
  },
  {
    key: 'fileViewer.deployLinkProtected',
    forbidden: /\b(site|website)\b|sitio|webhely|strona|сайт|сайта|站点|站點|サイト|사이트|سایت|الموقع|เว็บไซต์|ตัวเว็บ/i,
  },
  {
    key: 'settings.notifyDesktopBlocked',
    forbidden:
      /\bsite settings\b|configuración del sitio|configurações do site|paramètres du site|Site-Einstellungen|webhely|witryny|настройках сайта|налаштуваннях сайту|站点设置|網站設定|サイト設定|사이트 설정|تنظیمات سایت|إعدادات الموقع|Site ayar|ตัวเว็บ|เว็บไซต์/i,
  },
  {
    key: 'settings.mcpHint',
    forbidden: /\bapplication\b|應用程式|应用程式|應用|应用/i,
  },
  {
    key: 'settings.mcpCapabilityPull',
    forbidden: /\bdesign package\b|\bcomponent\b|設計套件|设计包|元件|组件/i,
  },
  {
    key: 'settings.mcpCapabilityDefault',
    forbidden: /\bapplication\b|應用程式|应用程式|哪個設計|哪个设计|哪份设计|which design\b/i,
  },
];

const SETTINGS_MCP_VISIBLE_KEYS = [
  'settings.mcpServerTitle',
  'settings.mcpServerHint',
  'settings.mcpTitle',
  'settings.mcpHint',
  'settings.mcpDaemonError',
  'settings.mcpBuildDaemon',
  'settings.mcpNodeMissing',
  'settings.mcpBuildHint',
  'settings.mcpMethodCli',
  'settings.mcpInstructionCli',
  'settings.mcpMethodToml',
  'settings.mcpInstructionCodex',
  'settings.mcpMethodOneClick',
  'settings.mcpInstructionCursor',
  'settings.mcpDeeplinkInstallCursor',
  'settings.mcpMethodJson',
  'settings.mcpInstructionCopilot',
  'settings.mcpInstructionAntigravity',
  'settings.mcpInstructionZed',
  'settings.mcpInstructionWindsurf',
  'settings.mcpCopyAria',
  'settings.mcpResolvingFailed',
  'settings.mcpLoadingPaths',
  'settings.mcpCopied',
  'settings.mcpCopy',
  'settings.mcpCursorApproval',
  'settings.mcpRestartNote',
  'settings.mcpRestartDetail',
  'settings.mcpCapabilitiesTitle',
  'settings.mcpCapabilityRead',
  'settings.mcpCapabilityPull',
  'settings.mcpCapabilityDefault',
  'settings.mcpRunningNote',
  'settings.externalMcpAboutTemplate',
  'settings.externalMcpAddServer',
  'settings.externalMcpApprovedRefresh',
  'settings.externalMcpApprovedRefreshTitle',
  'settings.externalMcpArgsLabel',
  'settings.externalMcpArgsPlaceholder',
  'settings.externalMcpBrowserDidNotOpen',
  'settings.externalMcpCategoryArtBibles',
  'settings.externalMcpCategoryArtBiblesHint',
  'settings.externalMcpCategoryDataViz',
  'settings.externalMcpCategoryDataVizHint',
  'settings.externalMcpCategoryGameUiModules',
  'settings.externalMcpCategoryGameUiModulesHint',
  'settings.externalMcpCategoryImageEditing',
  'settings.externalMcpCategoryImageEditingHint',
  'settings.externalMcpCategoryImageGeneration',
  'settings.externalMcpCategoryImageGenerationHint',
  'settings.externalMcpCategoryPublishing',
  'settings.externalMcpCategoryPublishingHint',
  'settings.externalMcpCategoryUtilities',
  'settings.externalMcpCategoryUtilitiesHint',
  'settings.externalMcpCategoryWebCapture',
  'settings.externalMcpCategoryWebCaptureHint',
  'settings.externalMcpChecking',
  'settings.externalMcpClosePicker',
  'settings.externalMcpCollapse',
  'settings.externalMcpCollapseServer',
  'settings.externalMcpCommandLabel',
  'settings.externalMcpCommandPlaceholder',
  'settings.externalMcpCommandRequired',
  'settings.externalMcpConnect',
  'settings.externalMcpConnected',
  'settings.externalMcpConnecting',
  'settings.externalMcpCustomDescription',
  'settings.externalMcpCustomTitle',
  'settings.externalMcpDaemonUnreachable',
  'settings.externalMcpDescription',
  'settings.externalMcpDisconnect',
  'settings.externalMcpDisconnectFailed',
  'settings.externalMcpDisconnecting',
  'settings.externalMcpDisplayNamePlaceholder',
  'settings.externalMcpEmptyBody',
  'settings.externalMcpEmptyTitle',
  'settings.externalMcpEnableServer',
  'settings.externalMcpEnvLabel',
  'settings.externalMcpEnvPlaceholder',
  'settings.externalMcpEnvShortLabel',
  'settings.externalMcpExpand',
  'settings.externalMcpExpandEdit',
  'settings.externalMcpExpandServer',
  'settings.externalMcpFilterPlaceholder',
  'settings.externalMcpHeadersLabel',
  'settings.externalMcpHeadersPlaceholder',
  'settings.externalMcpHeading',
  'settings.externalMcpHomepage',
  'settings.externalMcpHttpSseHint',
  'settings.externalMcpInvalidId',
  'settings.externalMcpJsonHelperHead',
  'settings.externalMcpJsonHelperToggle',
  'settings.externalMcpLoading',
  'settings.externalMcpMoveDown',
  'settings.externalMcpMoveUp',
  'settings.externalMcpNoTemplates',
  'settings.externalMcpNonExpiringToken',
  'settings.externalMcpNotConnected',
  'settings.externalMcpNotConnectedHint',
  'settings.externalMcpOauthSaveFirstPrefix',
  'settings.externalMcpOauthSaveFirstSuffix',
  'settings.externalMcpOpenAuthorization',
  'settings.externalMcpPickerHint',
  'settings.externalMcpPickerTitle',
  'settings.externalMcpReauthTitle',
  'settings.externalMcpReconnect',
  'settings.externalMcpRefresh',
  'settings.externalMcpRefreshTitle',
  'settings.externalMcpRemoveServer',
  'settings.externalMcpSaveChanges',
  'settings.externalMcpSaveFailed',
  'settings.externalMcpSaved',
  'settings.externalMcpSavedMessage',
  'settings.externalMcpSaving',
  'settings.externalMcpStarting',
  'settings.externalMcpStoredPrefix',
  'settings.externalMcpTokenExpires',
  'settings.externalMcpTransportAria',
  'settings.externalMcpTransportLabel',
  'settings.externalMcpTryLabel',
  'settings.externalMcpTryTitle',
  'settings.externalMcpUnnamedServer',
  'settings.externalMcpUrlLabel',
  'settings.externalMcpUrlMalformed',
  'settings.externalMcpUrlPlaceholder',
  'settings.externalMcpUrlProtocol',
  'settings.externalMcpUrlRequired',
  'settings.externalMcpWaitingAuthorization',
  'settings.externalMcpWaitingHint',
] as const satisfies ReadonlyArray<keyof Dict>;

const SETTINGS_EXTERNAL_MCP_STATUS_KEYS = [
  'settings.externalMcpDaemonUnreachable',
  'settings.externalMcpSaveFailed',
  'settings.externalMcpEmptyTitle',
  'settings.externalMcpEmptyBody',
  'settings.externalMcpStoredPrefix',
  'settings.externalMcpOauthSaveFirstSuffix',
  'settings.externalMcpNotConnectedHint',
] as const satisfies ReadonlyArray<keyof Dict>;

const EXTERNAL_MCP_STATUS_MIXED_ENGLISH_FORBIDDEN =
  /\b(?:Could not reach the local daemon|Make sure AI Game Design Studio is running|then reopen this panel|Save failed\. Check|No studio MCP servers configured|Click Add server|get started: pick|custom stdio \/ HTTP studio server|Stored in the AI Game Design Studio data directory as|grant AI Game Design Studio access via the provider OAuth flow|Click Connect)\b/i;

const REVIEWED_PROJECT_ACTION_AND_MCP_HELPER_MIXED_ENGLISH_KEYS = [
  'projectActions.workingDirectoryUnavailable',
  'projectActions.clipboardUnavailable',
  'projectActions.folderOpened',
  'settings.externalMcpDescription',
  'settings.externalMcpNoTemplates',
  'settings.externalMcpCustomDescription',
  'settings.externalMcpEnableServer',
  'settings.externalMcpRemoveServer',
  'settings.externalMcpTryTitle',
  'settings.externalMcpOauthSaveFirstPrefix',
  'settings.externalMcpJsonHelperToggle',
  'settings.externalMcpDisconnectFailed',
  'settings.externalMcpWaitingHint',
  'settings.externalMcpCategoryImageEditingHint',
  'settings.externalMcpCategoryUtilitiesHint',
] as const satisfies ReadonlyArray<keyof Dict>;

const REVIEWED_PROJECT_ACTION_AND_MCP_HELPER_MIXED_ENGLISH_FORBIDDEN =
  /\b(?:Working directory unavailable|Update the daemon|Clipboard unavailable|Copy this prompt manually|Folder opened|Surface concept-art|production tools from third-party|No templates match|Try clearing the filter|custom server option below|Blank studio setup|Pick stdio|fill the fields yourself|Enable this MCP server|Remove this MCP server|Paste this prompt|end-to-end|Save first, then click|Need help\? Map|Disconnect failed|Check daemon logs|Approve in the browser tab|catch the callback automatically|Local post-processing|CV-driven edits|similar studio production helpers)\b/i;

const REVIEWED_ARTIFACT_REFRESH_AND_INSPECT_MIXED_ENGLISH_KEYS = [
  'fileViewer.inspectHintNoTargets',
  'liveArtifact.refresh.statusReadyDescription',
  'liveArtifact.viewer.historySessionHint',
  'liveArtifact.viewer.historySessionEmpty',
] as const satisfies ReadonlyArray<keyof Dict>;

const REVIEWED_ARTIFACT_REFRESH_AND_INSPECT_MIXED_ENGLISH_FORBIDDEN =
  /\b(?:This artifact has no|ask the agent to add them|Refreshable sources are configured|waiting for a run|Events observed while this tab is open|No refresh activity yet|Trigger Refresh to record a timeline|automated runs)\b/i;

const SETTINGS_MODEL_DISCOVERY_VISIBLE_KEYS = [
  'settings.fetchModels',
  'settings.fetchModelsTitle',
  'settings.fetchModelsRunning',
  'settings.fetchModelsSuccess',
  'settings.fetchModelsEmpty',
  'settings.fetchModelsUnsupported',
  'settings.fetchModelsFailed',
  'settings.azureModelFetchHint',
] as const satisfies ReadonlyArray<keyof Dict>;

const SETTINGS_CLI_ENV_VISIBLE_KEYS = [
  'settings.cliEnvTitle',
  'settings.cliEnvHint',
  'settings.cliEnvClaudeConfigDir',
  'settings.cliEnvCodexHome',
  'settings.cliEnvCodexBin',
] as const satisfies ReadonlyArray<keyof Dict>;

const FILE_VIEWER_CLOUDFLARE_VISIBLE_KEYS = [
  'fileViewer.cloudflareApiToken',
  'fileViewer.cloudflareApiTokenGetLink',
  'fileViewer.cloudflareApiTokenPlaceholder',
  'fileViewer.cloudflareApiTokenReuseHint',
  'fileViewer.cloudflareApiTokenRequired',
  'fileViewer.cloudflareApiTokenScopeHint',
  'fileViewer.cloudflareAccountId',
  'fileViewer.cloudflareAccountIdHint',
  'fileViewer.cloudflareAccountIdRequired',
  'fileViewer.cloudflareZoneLabel',
  'fileViewer.cloudflareZonePlaceholder',
  'fileViewer.cloudflareZoneRequired',
  'fileViewer.cloudflareZonesLoading',
  'fileViewer.cloudflareZonesRefresh',
  'fileViewer.cloudflareZonesLoadFailed',
  'fileViewer.cloudflareZonesEmpty',
  'fileViewer.cloudflareDomainPrefixLabel',
  'fileViewer.cloudflareDomainPrefixInvalid',
  'fileViewer.cloudflareHostnamePreview',
  'fileViewer.cloudflareCustomDomainHint',
  'fileViewer.cloudflareCustomDomainLinkLabel',
  'fileViewer.cloudflarePagesPreviewHint',
] as const satisfies ReadonlyArray<keyof Dict>;

const FILE_VIEWER_STUDIO_PACKAGE_VISIBLE_KEYS = [
  'fileViewer.exportPptxHint',
] as const satisfies ReadonlyArray<keyof Dict>;

const FILE_VIEWER_INSPECT_VISIBLE_KEYS = [
  'fileViewer.inspect',
  'fileViewer.inspectCloseAria',
  'fileViewer.inspectColors',
  'fileViewer.inspectTypography',
  'fileViewer.inspectSpacingShape',
  'fileViewer.inspectResetElement',
  'fileViewer.inspectSaving',
  'fileViewer.inspectSaved',
  'fileViewer.inspectSaveToSource',
  'fileViewer.inspectPickerTitle',
  'fileViewer.inspectPickerAria',
  'fileViewer.inspectPicker',
  'fileViewer.inspectPodsTitle',
  'fileViewer.inspectPodsAria',
  'fileViewer.inspectPods',
  'fileViewer.inspectHintNoTargets',
  'fileViewer.inspectHintActionInspect',
  'fileViewer.inspectHintActionCommentOn',
  'fileViewer.inspectHintReady',
  'fileViewer.inspectHintActionTuneStyle',
  'fileViewer.inspectHintActionLeaveComment',
  'fileViewer.inspectHintClose',
  'fileViewer.templateKicker',
] as const satisfies ReadonlyArray<keyof Dict>;

const GAME_FILES_LIVE_ARTIFACT_VISIBLE_KEYS = [
  'gameFiles.sectionLiveArtifacts',
  'gameFiles.kindLiveArtifact',
] as const satisfies ReadonlyArray<keyof Dict>;

const GAME_FILES_VIEWER_TAXONOMY_VISIBLE_KEYS = [
  'gameFiles.refresh',
  'gameFiles.upload.label',
  'gameFiles.groupBy',
  'gameFiles.groupByKind',
  'gameFiles.groupByModified',
  'gameFiles.expandGroup',
  'gameFiles.collapseGroup',
  'gameFiles.sectionScripts',
  'gameFiles.sectionImages',
  'gameFiles.sectionSketches',
  'gameFiles.modifiedToday',
  'gameFiles.modifiedYesterday',
  'gameFiles.modifiedPrevious7Days',
  'gameFiles.modifiedPrevious30Days',
  'gameFiles.modifiedOlder',
  'gameFiles.kindImage',
  'gameFiles.kindSketch',
  'gameFiles.kindText',
  'gameFiles.kindCode',
  'gameFiles.kindPdf',
  'gameFiles.kindDocument',
  'gameFiles.kindSpreadsheet',
  'gameFiles.kindBinary',
  'gameFiles.colName',
  'fileViewer.binaryMeta',
  'fileViewer.pdfMeta',
  'fileViewer.documentMeta',
  'fileViewer.imageMeta',
  'fileViewer.spreadsheetMeta',
  'fileViewer.sketchMeta',
  'fileViewer.videoMeta',
  'fileViewer.audioMeta',
  'fileViewer.source',
  'fileViewer.tweaks',
  'fileViewer.edit',
  'fileViewer.deployProviderLabel',
  'fileViewer.vercelProvider',
  'fileViewer.vercelToken',
  'fileViewer.vercelTeamId',
  'fileViewer.vercelTeamSlug',
  'fileViewer.optional',
] as const satisfies ReadonlyArray<keyof Dict>;

const CHAT_PROJECT_REFERENCE_VISIBLE_KEYS = [
  'chat.importProject',
] as const satisfies ReadonlyArray<keyof Dict>;

const LIVE_ARTIFACT_REFRESH_VISIBLE_KEYS = [
  'liveArtifact.refresh.button',
  'liveArtifact.refresh.buttonTitle',
  'liveArtifact.refresh.loadingTitle',
  'liveArtifact.refresh.noSourceTitle',
  'liveArtifact.refresh.running',
  'liveArtifact.refresh.runningMessage',
  'liveArtifact.refresh.runningAction',
  'liveArtifact.refresh.successOne',
  'liveArtifact.refresh.successMany',
  'liveArtifact.refresh.successAction',
  'liveArtifact.refresh.previousFailure',
  'liveArtifact.refresh.failureAction',
  'liveArtifact.refresh.networkFailure',
  'liveArtifact.refresh.genericFailure',
  'liveArtifact.refresh.statusNever',
  'liveArtifact.refresh.statusReady',
  'liveArtifact.refresh.statusSucceeded',
  'liveArtifact.refresh.statusFailed',
  'liveArtifact.refresh.statusReadyDescription',
  'liveArtifact.refresh.relativeAgo',
  'liveArtifact.refresh.relativeFromNow',
  'liveArtifact.refresh.relativeJustNow',
  'liveArtifact.refresh.eventRefreshStarted',
  'liveArtifact.refresh.eventStarted',
  'liveArtifact.refresh.eventSucceeded',
  'liveArtifact.refresh.eventFailed',
  'liveArtifact.refresh.logStatusCancelled',
  'liveArtifact.refresh.logStatusUnknown',
  'liveArtifact.refresh.sourceUpdatedOne',
  'liveArtifact.refresh.sourceUpdatedMany',
] as const satisfies ReadonlyArray<keyof Dict>;

const LIVE_ARTIFACT_VIEWER_VISIBLE_KEYS = [
  'liveArtifact.viewer.tabPreview',
  'liveArtifact.viewer.tabCode',
  'liveArtifact.viewer.tabData',
  'liveArtifact.viewer.tabRefreshHistory',
  'liveArtifact.viewer.dataEmpty',
  'liveArtifact.viewer.code.templateHeading',
  'liveArtifact.viewer.code.renderedHeading',
  'liveArtifact.viewer.code.templateHelp',
  'liveArtifact.viewer.code.renderedHelp',
  'liveArtifact.viewer.code.variantAria',
  'liveArtifact.viewer.code.variantTemplate',
  'liveArtifact.viewer.code.variantRendered',
  'liveArtifact.viewer.code.loading',
  'liveArtifact.viewer.code.unavailable',
  'liveArtifact.viewer.code.empty',
  'liveArtifact.viewer.historyLastRefreshed',
  'liveArtifact.viewer.historyNever',
  'liveArtifact.viewer.historyCreated',
  'liveArtifact.viewer.historyLastUpdated',
  'liveArtifact.viewer.historyUnknown',
  'liveArtifact.viewer.historyPersistedTitle',
  'liveArtifact.viewer.historyPersistedHint',
  'liveArtifact.viewer.historyPersistedEmpty',
  'liveArtifact.viewer.historySessionTitle',
  'liveArtifact.viewer.historySessionHint',
  'liveArtifact.viewer.historySessionEmpty',
  'liveArtifact.viewer.historyDocumentSource',
  'liveArtifact.viewer.historyDocumentSourceHint',
  'liveArtifact.viewer.historyDocumentType',
  'liveArtifact.viewer.historyDocumentTool',
  'liveArtifact.viewer.historyDocumentConnector',
  'liveArtifact.viewer.historyAdvancedDebug',
  'liveArtifact.viewer.historyAdvancedDebugNote',
] as const satisfies ReadonlyArray<keyof Dict>;

const GAME_PROJECT_LIVE_STATUS_VISIBLE_KEYS = [
  'gameProjects.badgeLive',
  'gameProjects.liveArtifactBadgesAria',
  'gameProjects.liveCount',
  'gameProjects.statusLive',
  'gameProjects.statusArchived',
  'gameProjects.statusError',
  'gameProjects.statusRefreshing',
  'gameProjects.statusRefreshFailed',
  'gameProjects.statusRefreshed',
] as const satisfies ReadonlyArray<keyof Dict>;

const SETTINGS_PRIVACY_VISIBLE_KEYS = [
  'settings.privacy',
  'settings.privacyHint',
  'settings.privacyConsentKicker',
  'settings.privacyConsentLead',
  'settings.privacyConsentFooter',
  'settings.privacyConsentShare',
  'settings.privacyConsentDecline',
  'settings.privacyMetrics',
  'settings.privacyMetricsHint',
  'settings.privacyContent',
  'settings.privacyContentHint',
  'settings.privacyArtifacts',
  'settings.privacyArtifactsHint',
  'settings.privacyInstallationId',
  'settings.privacyOptedOut',
  'settings.privacyDataDeletion',
  'settings.privacyDataDeletionHint',
] as const satisfies ReadonlyArray<keyof Dict>;

const REVIEWED_SETTINGS_OPS_LOCALES = [
  'id',
  'de',
  'zh-CN',
  'zh-TW',
  'pt-BR',
  'es-ES',
  'ru',
  'fa',
  'ar',
  'ja',
  'ko',
  'pl',
  'hu',
  'fr',
  'uk',
  'tr',
  'th',
] as const satisfies ReadonlyArray<Locale>;

const REVIEWED_SETTINGS_OPS_KEYS = [
  'settings.cliEnvTitle',
  'settings.cliEnvHint',
  'settings.cliEnvClaudeConfigDir',
  'settings.cliEnvCodexHome',
  'settings.cliEnvCodexBin',
  'settings.libraryToggleLabel',
  'settings.libraryInstallGithub',
  'settings.libraryInstallUrl',
  'settings.libraryInstallPath',
  'settings.orbit.title',
  'settings.orbit.artifactKickerLive',
] as const satisfies ReadonlyArray<keyof Dict>;

const REVIEWED_CLOUDFLARE_DEPLOY_LOCALES = ['id', 'de', 'es-ES', 'ja'] as const satisfies ReadonlyArray<Locale>;

const REVIEWED_CLOUDFLARE_DEPLOY_KEYS = [
  'fileViewer.cloudflareApiToken',
  'fileViewer.cloudflareApiTokenGetLink',
  'fileViewer.cloudflareApiTokenPlaceholder',
  'fileViewer.cloudflareApiTokenReuseHint',
  'fileViewer.cloudflareApiTokenRequired',
  'fileViewer.cloudflareApiTokenScopeHint',
  'fileViewer.cloudflareAccountId',
  'fileViewer.cloudflareAccountIdHint',
  'fileViewer.cloudflareAccountIdRequired',
  'fileViewer.cloudflareZoneLabel',
  'fileViewer.cloudflareZonePlaceholder',
  'fileViewer.cloudflareZoneRequired',
  'fileViewer.cloudflareZonesLoading',
  'fileViewer.cloudflareZonesRefresh',
  'fileViewer.cloudflareZonesLoadFailed',
  'fileViewer.cloudflareZonesEmpty',
  'fileViewer.cloudflareDomainPrefixLabel',
  'fileViewer.cloudflareDomainPrefixInvalid',
  'fileViewer.cloudflareHostnamePreview',
  'fileViewer.cloudflareCustomDomainHint',
  'fileViewer.cloudflareCustomDomainLinkLabel',
  'fileViewer.cloudflarePagesPreviewHint',
] as const satisfies ReadonlyArray<keyof Dict>;

const SETTINGS_PRIVACY_ENGLISH_FALLBACK_FORBIDDEN =
  /What data is shared with the AI Game Design Studio team|Help us improve AI Game Design Studio|AI Game Design Studio can share usage data|You can change either of these any time|Anonymous metrics|Run counts, token usage|Conversation content|Your prompts and the assistant|Project artifacts manifest|generated artifact files|Filenames, types, sizes of generated files|Delete my data|Rotates your anonymous ID/i;

const OLD_PRODUCT_IDENTITY_FORBIDDEN =
  /\bOpen Design\b|اوپن دیزاین|開放設計|开放设计|オープンデザイン|오픈 디자인/i;

const DESIGN_SYSTEM_FORBIDDEN =
  /\bdesign systems?\b|designsysteme|sistemas de diseño|sistemas de design|sistem desain|дизайн-систем|систем[аиы] дизайна|системи дизайну|systemy projekt|디자인 시스템|デザインシステム|設計系統|設計系统|设计系统|设计体系|ระบบการออกแบบ|designrendszer|أنظمة التصميم|سیستم‌های طراحی|tasarım sistemleri/i;

const GAME_ART_BIBLE_VISIBLE_KEYS: Array<keyof Dict> = [
  'entry.tabGameArtBibles',
  'newproj.gameArtBible',
  'newproj.gameArtBibleCategoryFallback',
  'newproj.gameArtBibleSearch',
  'newproj.gameArtBibleEmpty',
  'examples.tagGameArtBible',
  'gameArtBible.searchPlaceholder',
  'gameArtBible.emptyNoMatch',
  'gameArtBible.previewTitle',
  'chat.importSkills',
  'misc.gameArtBible',
  'settings.library',
  'settings.libraryGameArtBibles',
];

const RETIRED_ART_BIBLE_IDS = [
  'airbnb',
  'default',
  'enterprise',
  'notion',
  'shopify',
  'slack',
  'stripe',
  'warm-editorial',
];

const CURATED_ART_BIBLE_IDS = [
  'anime-gacha',
  'arcade-neon',
  'cozy-casual',
  'cyberpunk-fps',
  'fantasy-rpg',
  'game-control-center',
  'horror-survival',
  'military-tactical',
  'pixel-retro',
  'sci-fi-tactical',
  'soulslike-dark',
  'sports-broadcast',
  'steampunk-adventure',
  'stylized-3d',
  'underwater-exploration',
  'vaporwave-racing',
  'western-frontier',
];

const PROJECT_GALLERY_FORBIDDEN =
  /\bdesigns?\b|diseños?|デザイン|디자인|设计|設計|designs|tasarımlar|tasarım yok|ดีไซน์|desain|تصاميم|التصاميم|tervek|nincs terv|дизайны|дизайни|дизайнів|طرح‌ها|طرحی/i;

const PROJECT_GALLERY_VISIBLE_KEYS: Array<keyof Dict> = [
  'entry.tabGameProjects',
  'gameProjects.subYours',
  'gameProjects.cardFreeform',
  'gameProjects.kanbanEmptyColumn',
];

const EXAMPLE_SCENARIO_FORBIDDEN =
  /\bdesigns?\b|\bmarketing\b|\bsales?\b|diseños?|ventas|vertrieb|ventes|vendas|sprzedaż|продажи|продажі|маркетинг|セールス|マーケティング|마케팅|영업|销售|銷售|行銷|業務|ตลาด|ฝ่ายขาย|pazarlama|satış|مبيعات|تسويق|فروش|بازاریابی/i;

const EXAMPLE_SCENARIO_VISIBLE_KEYS: Array<keyof Dict> = [
  'examples.scenarioArtDirection',
  'examples.scenarioGameCampaigns',
  'examples.scenarioPitch',
];

const CONNECTOR_BUSINESS_BUCKET_VISIBLE_KEYS = [
  'connectors.category.productionFinance',
  'connectors.category.studioOperations',
  'connectors.category.telemetry',
  'connectors.category.playerCommunity',
  'connectors.category.artDirection',
  'connectors.category.playtestFeedback',
  'connectors.category.gameCampaigns',
  'connectors.category.gameSystems',
  'connectors.category.production',
  'connectors.category.marketIntelligence',
  'connectors.category.whiteboard',
] as const satisfies ReadonlyArray<keyof Dict>;

const REVIEWED_CONNECTOR_CATEGORY_LOCALES = ['id', 'de', 'es-ES', 'ja'] as const satisfies ReadonlyArray<Locale>;

const REVIEWED_CONNECTOR_CATEGORY_KEYS = Object.keys(en).filter((key): key is keyof Dict => {
  return key.startsWith('connectors.category.');
});

const REVIEWED_CONNECTOR_PANEL_KEYS = Object.keys(en).filter((key): key is keyof Dict => {
  return key.startsWith('connectors.') && !key.startsWith('connectors.category.');
});

const CONNECTOR_TOOL_PAGING_VISIBLE_KEYS = [
  'connectors.toolDetailsUnavailable',
  'connectors.loadMoreTools',
] as const satisfies ReadonlyArray<keyof Dict>;

const TOOL_ACTION_VISIBLE_KEYS = [
  'tool.todos',
  'tool.write',
  'tool.edit',
  'tool.read',
  'tool.search',
  'tool.in',
  'tool.error',
] as const satisfies ReadonlyArray<keyof Dict>;

type ConnectorStudioCategoryKey = (typeof CONNECTOR_BUSINESS_BUCKET_VISIBLE_KEYS)[number];

const CONNECTOR_STUDIO_CATEGORY_LABELS_BY_LOCALE: Record<
  Locale,
  Record<ConnectorStudioCategoryKey, string>
> = {
  en: {
    'connectors.category.productionFinance': 'Production finance',
    'connectors.category.studioOperations': 'Studio operations',
    'connectors.category.telemetry': 'Telemetry',
    'connectors.category.playerCommunity': 'Player community',
    'connectors.category.artDirection': 'Art direction',
    'connectors.category.playtestFeedback': 'Playtest feedback',
    'connectors.category.gameCampaigns': 'Game campaigns',
    'connectors.category.gameSystems': 'Game systems',
    'connectors.category.production': 'Production studio',
    'connectors.category.marketIntelligence': 'Market intelligence',
    'connectors.category.whiteboard': 'Art direction',
  },
  id: {
    'connectors.category.productionFinance': 'Keuangan produksi',
    'connectors.category.studioOperations': 'Operasi studio',
    'connectors.category.telemetry': 'Telemetri',
    'connectors.category.playerCommunity': 'Komunitas pemain',
    'connectors.category.artDirection': 'Arahan seni',
    'connectors.category.playtestFeedback': 'Masukan playtest',
    'connectors.category.gameCampaigns': 'Kampanye game',
    'connectors.category.gameSystems': 'Sistem game',
    'connectors.category.production': 'Produksi',
    'connectors.category.marketIntelligence': 'Intelijen pasar',
    'connectors.category.whiteboard': 'Arahan seni',
  },
  de: {
    'connectors.category.productionFinance': 'Produktionsfinanzen',
    'connectors.category.studioOperations': 'Studio-Betrieb',
    'connectors.category.telemetry': 'Telemetrie',
    'connectors.category.playerCommunity': 'Spieler-Community',
    'connectors.category.artDirection': 'Künstlerische Leitung',
    'connectors.category.playtestFeedback': 'Playtest-Feedback',
    'connectors.category.gameCampaigns': 'Game-Kampagnen',
    'connectors.category.gameSystems': 'Spielsysteme',
    'connectors.category.production': 'Produktion',
    'connectors.category.marketIntelligence': 'Marktintelligenz',
    'connectors.category.whiteboard': 'Künstlerische Leitung',
  },
  'zh-CN': {
    'connectors.category.productionFinance': '制作财务',
    'connectors.category.studioOperations': '工作室运营',
    'connectors.category.telemetry': '遥测',
    'connectors.category.playerCommunity': '玩家社区',
    'connectors.category.artDirection': '美术指导',
    'connectors.category.playtestFeedback': '试玩反馈',
    'connectors.category.gameCampaigns': '游戏推广',
    'connectors.category.gameSystems': '游戏系统',
    'connectors.category.production': '制作',
    'connectors.category.marketIntelligence': '市场情报',
    'connectors.category.whiteboard': '美术指导',
  },
  'zh-TW': {
    'connectors.category.productionFinance': '製作財務',
    'connectors.category.studioOperations': '工作室營運',
    'connectors.category.telemetry': '遙測',
    'connectors.category.playerCommunity': '玩家社群',
    'connectors.category.artDirection': '美術指導',
    'connectors.category.playtestFeedback': '試玩回饋',
    'connectors.category.gameCampaigns': '遊戲宣傳',
    'connectors.category.gameSystems': '遊戲系統',
    'connectors.category.production': '製作',
    'connectors.category.marketIntelligence': '市場情報',
    'connectors.category.whiteboard': '美術指導',
  },
  'pt-BR': {
    'connectors.category.productionFinance': 'Finanças de produção',
    'connectors.category.studioOperations': 'Operações do estúdio',
    'connectors.category.telemetry': 'Telemetria',
    'connectors.category.playerCommunity': 'Comunidade de jogadores',
    'connectors.category.artDirection': 'Direção de arte',
    'connectors.category.playtestFeedback': 'Feedback de playtest',
    'connectors.category.gameCampaigns': 'Campanhas de jogo',
    'connectors.category.gameSystems': 'Sistemas de jogo',
    'connectors.category.production': 'Produção',
    'connectors.category.marketIntelligence': 'Inteligência de mercado',
    'connectors.category.whiteboard': 'Direção de arte',
  },
  'es-ES': {
    'connectors.category.productionFinance': 'Finanzas de producción',
    'connectors.category.studioOperations': 'Operaciones del estudio',
    'connectors.category.telemetry': 'Telemetría',
    'connectors.category.playerCommunity': 'Comunidad de jugadores',
    'connectors.category.artDirection': 'Dirección de arte',
    'connectors.category.playtestFeedback': 'Feedback de playtest',
    'connectors.category.gameCampaigns': 'Campañas de juego',
    'connectors.category.gameSystems': 'Sistemas de juego',
    'connectors.category.production': 'Producción',
    'connectors.category.marketIntelligence': 'Inteligencia de mercado',
    'connectors.category.whiteboard': 'Dirección de arte',
  },
  ru: {
    'connectors.category.productionFinance': 'Финансы производства',
    'connectors.category.studioOperations': 'Операции студии',
    'connectors.category.telemetry': 'Телеметрия',
    'connectors.category.playerCommunity': 'Сообщество игроков',
    'connectors.category.artDirection': 'Арт-дирекшн',
    'connectors.category.playtestFeedback': 'Обратная связь плейтеста',
    'connectors.category.gameCampaigns': 'Игровые кампании',
    'connectors.category.gameSystems': 'Игровые системы',
    'connectors.category.production': 'Производство',
    'connectors.category.marketIntelligence': 'Рыночная аналитика',
    'connectors.category.whiteboard': 'Арт-дирекшн',
  },
  fa: {
    'connectors.category.productionFinance': 'مالی تولید',
    'connectors.category.studioOperations': 'عملیات استودیو',
    'connectors.category.telemetry': 'تله‌متری',
    'connectors.category.playerCommunity': 'جامعه بازیکنان',
    'connectors.category.artDirection': 'کارگردانی هنری',
    'connectors.category.playtestFeedback': 'بازخورد پلی‌تست',
    'connectors.category.gameCampaigns': 'کمپین‌های بازی',
    'connectors.category.gameSystems': 'سیستم‌های بازی',
    'connectors.category.production': 'تولید',
    'connectors.category.marketIntelligence': 'هوش بازار',
    'connectors.category.whiteboard': 'کارگردانی هنری',
  },
  ar: {
    'connectors.category.productionFinance': 'تمويل الإنتاج',
    'connectors.category.studioOperations': 'عمليات الاستوديو',
    'connectors.category.telemetry': 'القياسات عن بُعد',
    'connectors.category.playerCommunity': 'مجتمع اللاعبين',
    'connectors.category.artDirection': 'الإخراج الفني',
    'connectors.category.playtestFeedback': 'ملاحظات اختبار اللعب',
    'connectors.category.gameCampaigns': 'حملات اللعبة',
    'connectors.category.gameSystems': 'أنظمة اللعبة',
    'connectors.category.production': 'الإنتاج',
    'connectors.category.marketIntelligence': 'استخبارات السوق',
    'connectors.category.whiteboard': 'الإخراج الفني',
  },
  ja: {
    'connectors.category.productionFinance': '制作財務',
    'connectors.category.studioOperations': 'スタジオ運用',
    'connectors.category.telemetry': 'テレメトリ',
    'connectors.category.playerCommunity': 'プレイヤーコミュニティ',
    'connectors.category.artDirection': 'アートディレクション',
    'connectors.category.playtestFeedback': 'プレイテストフィードバック',
    'connectors.category.gameCampaigns': 'ゲームキャンペーン',
    'connectors.category.gameSystems': 'ゲームシステム',
    'connectors.category.production': '制作',
    'connectors.category.marketIntelligence': '市場インテリジェンス',
    'connectors.category.whiteboard': 'アートディレクション',
  },
  ko: {
    'connectors.category.productionFinance': '제작 재무',
    'connectors.category.studioOperations': '스튜디오 운영',
    'connectors.category.telemetry': '텔레메트리',
    'connectors.category.playerCommunity': '플레이어 커뮤니티',
    'connectors.category.artDirection': '아트 디렉션',
    'connectors.category.playtestFeedback': '플레이테스트 피드백',
    'connectors.category.gameCampaigns': '게임 캠페인',
    'connectors.category.gameSystems': '게임 시스템',
    'connectors.category.production': '제작',
    'connectors.category.marketIntelligence': '시장 인텔리전스',
    'connectors.category.whiteboard': '아트 디렉션',
  },
  pl: {
    'connectors.category.productionFinance': 'Finanse produkcji',
    'connectors.category.studioOperations': 'Operacje studia',
    'connectors.category.telemetry': 'Telemetria',
    'connectors.category.playerCommunity': 'Społeczność graczy',
    'connectors.category.artDirection': 'Kierunek artystyczny',
    'connectors.category.playtestFeedback': 'Opinie z playtestów',
    'connectors.category.gameCampaigns': 'Kampanie gry',
    'connectors.category.gameSystems': 'Systemy gry',
    'connectors.category.production': 'Produkcja',
    'connectors.category.marketIntelligence': 'Analiza rynku',
    'connectors.category.whiteboard': 'Kierunek artystyczny',
  },
  hu: {
    'connectors.category.productionFinance': 'Gyártási pénzügyek',
    'connectors.category.studioOperations': 'Stúdióműveletek',
    'connectors.category.telemetry': 'Telemetria',
    'connectors.category.playerCommunity': 'Játékosközösség',
    'connectors.category.artDirection': 'Művészeti irány',
    'connectors.category.playtestFeedback': 'Játékteszt-visszajelzés',
    'connectors.category.gameCampaigns': 'Játékkampányok',
    'connectors.category.gameSystems': 'Játékrendszerek',
    'connectors.category.production': 'Gyártás',
    'connectors.category.marketIntelligence': 'Piaci intelligencia',
    'connectors.category.whiteboard': 'Művészeti irány',
  },
  fr: {
    'connectors.category.productionFinance': 'Finances de production',
    'connectors.category.studioOperations': 'Opérations du studio',
    'connectors.category.telemetry': 'Télémétrie',
    'connectors.category.playerCommunity': 'Communauté de joueurs',
    'connectors.category.artDirection': 'Direction artistique',
    'connectors.category.playtestFeedback': 'Retours de playtest',
    'connectors.category.gameCampaigns': 'Campagnes de jeu',
    'connectors.category.gameSystems': 'Systèmes de jeu',
    'connectors.category.production': 'Production de jeu',
    'connectors.category.marketIntelligence': 'Intelligence de marché',
    'connectors.category.whiteboard': 'Direction artistique',
  },
  uk: {
    'connectors.category.productionFinance': 'Виробничі фінанси',
    'connectors.category.studioOperations': 'Операції студії',
    'connectors.category.telemetry': 'Телеметрія',
    'connectors.category.playerCommunity': 'Спільнота гравців',
    'connectors.category.artDirection': 'Артдирекшн',
    'connectors.category.playtestFeedback': 'Відгуки плейтесту',
    'connectors.category.gameCampaigns': 'Ігрові кампанії',
    'connectors.category.gameSystems': 'Ігрові системи',
    'connectors.category.production': 'Виробництво',
    'connectors.category.marketIntelligence': 'Ринкова аналітика',
    'connectors.category.whiteboard': 'Артдирекшн',
  },
  tr: {
    'connectors.category.productionFinance': 'Prodüksiyon finansı',
    'connectors.category.studioOperations': 'Stüdyo operasyonları',
    'connectors.category.telemetry': 'Telemetri',
    'connectors.category.playerCommunity': 'Oyuncu topluluğu',
    'connectors.category.artDirection': 'Sanat yönetimi',
    'connectors.category.playtestFeedback': 'Oyun testi geri bildirimi',
    'connectors.category.gameCampaigns': 'Oyun kampanyaları',
    'connectors.category.gameSystems': 'Oyun sistemleri',
    'connectors.category.production': 'Prodüksiyon',
    'connectors.category.marketIntelligence': 'Pazar istihbaratı',
    'connectors.category.whiteboard': 'Sanat yönetimi',
  },
  th: {
    'connectors.category.productionFinance': 'การเงินการผลิต',
    'connectors.category.studioOperations': 'การดำเนินงานสตูดิโอ',
    'connectors.category.telemetry': 'เทเลเมทรี',
    'connectors.category.playerCommunity': 'ชุมชนผู้เล่น',
    'connectors.category.artDirection': 'การกำกับศิลป์',
    'connectors.category.playtestFeedback': 'ข้อเสนอแนะจากเพลย์เทสต์',
    'connectors.category.gameCampaigns': 'แคมเปญเกม',
    'connectors.category.gameSystems': 'ระบบเกม',
    'connectors.category.production': 'การผลิต',
    'connectors.category.marketIntelligence': 'ข่าวกรองตลาด',
    'connectors.category.whiteboard': 'การกำกับศิลป์',
  },
};

const ACTIVE_WORKSPACE_FORBIDDEN =
  /\bdesigns?\b|\bcomponents?\b|diseños?|composant|componente|komponen|komponent|komponens|компонент|bileşen|デザイン|コンポーネント|디자인|컴포넌트|设计|設計|组件|元件|tasarım|diseño|дизайн|дизайну|طراحی|تصميم|التصميم|مكون|مؤلفه|طرح|desain|ออกแบบ/i;

const ACTIVE_WORKSPACE_VISIBLE_KEYS: Array<keyof Dict> = [
  'project.metaFreeform',
  'chat.composerPlaceholder',
  'chat.importFig',
  'gameFiles.dropDesc',
  'fileViewer.exportPptxHint',
  'fileViewer.reactMeta',
  'pet.subtitle',
];

const AGDS_COMMAND_VISIBLE_KEYS: Array<keyof Dict> = [
  'pet.slashSearch',
];

const RESIDUAL_SHORT_UI_FALLBACK_VISIBLE_KEYS = [
  'agentPicker.label',
  'assistant.role',
  'assistant.statusStreaming',
  'assistant.verbTodos',
  'avatar.codeAgent',
  'avatar.localCli',
  'avatar.metaOffline',
  'avatar.reasoningLabel',
  'chat.conversationsHeading',
  'chat.conversationsTitle',
  'chat.stop',
  'chat.tabChat',
  'common.default',
  'common.offline',
  'connectors.category.communication',
  'connectors.category.documentation',
  'connectors.category.fitness',
  'connectors.category.media',
  'connectors.category.nonprofit',
  'connectors.category.production',
  'connectors.category.video',
  'connectors.statusLabel',
  'conv.heading',
  'conv.label',
  'entry.tabConnectors',
  'examples.modeLive',
  'examples.scenarioGeneral',
  'examples.scenarioProduction',
  'examples.shareUnavailable',
  'examples.surfaceLabel',
  'examples.unavailablePlaceholder',
  'gameArtBible.showcase',
  'gameArtBible.surfaceLabel',
  'gameArtBible.tokens',
  'manualEdit.radius',
  'manualEdit.tabSource',
  'manualEdit.tabStyle',
  'manualEdit.text',
  'pet.atlasRow.idle',
  'pet.atlasRow.review',
  'pet.codexRefresh',
  'pet.fieldFrames',
  'pet.fieldGlyph',
  'pet.fieldName',
  'pet.imageUpload',
  'pet.navTitle',
  'pet.railTitle',
  'pet.slashHatchArg',
  'pet.tabCommunity',
  'preview.unavailableBody',
  'preview.unavailableTitle',
  'qf.cardRefs',
  'sketch.color',
  'sketch.textPrompt',
  'sketch.toolRect',
  'sketch.toolText',
  'sketch.undo',
] as const satisfies ReadonlyArray<keyof Dict>;

const PLAYABLE_CONCEPT_VISIBLE_KEYS: Array<keyof Dict> = [
  'newproj.tabPrototype',
  'newproj.titlePrototype',
  'examples.modePrototypeDesktop',
  'examples.modePrototypeMobile',
  'examples.tagMobilePrototype',
  'examples.tagDesktopPrototype',
];

const GENERIC_PROTOTYPE_FORBIDDEN =
  /\bprototype\b|\bprototypes\b|prototipos?|prototipos|prototyp\w*|prototípus\w*|prototip\b|prototipler|prototipler|prototip|プロトタイプ|프로토타입|原型|نمونه اولیه|نموذج أولي|ต้นแบบ/i;

const NEW_PROJECT_GAME_BRIEF_VISIBLE_KEYS = [
  'newproj.gameDetails',
  'newproj.gameGenre',
  'newproj.gameGenrePlaceholder',
  'newproj.gamePlayerMode',
  'newproj.gamePlatform',
  'newproj.gameDimensionality',
  'newproj.gameCamera',
  'newproj.gameEngine',
  'newproj.gameInput',
  'newproj.gameSession',
  'newproj.gameAudience',
  'newproj.gameAudiencePlaceholder',
  'newproj.gameEmotion',
  'newproj.gameEmotionPlaceholder',
  'newproj.gameMonetization',
  'newproj.gameArtStyle',
  'newproj.gameArtStylePlaceholder',
  'newproj.gameInspirations',
  'newproj.gameInspirationsPlaceholder',
] as const satisfies ReadonlyArray<keyof Dict>;

const NEW_PROJECT_GAME_BRIEF_EXPECTED_ROWS: Record<Locale, string> = {
  en: 'Game design brief|Genre|Mobile roguelike dungeon crawler|Player mode|Platform|2D / 3D|Camera|Engine target|Input|Session|Audience|teens, cozy casual players, tactics fans|Emotional goal|tension, mastery, wonder, friendship|Monetization|Art style|pixel retro, stylized 3D, tactical sci-fi|Inspirations|Hades, Into the Breach, Monument Valley',
  id: 'Brief desain game|Genre game|Roguelike dungeon crawler mobile|Mode pemain|Platform target|Format 2D / 3D|Kamera|Target engine|Kontrol|Sesi|Audiens|remaja, pemain kasual cozy, penggemar taktik|Tujuan emosional|ketegangan, penguasaan, rasa kagum, persahabatan|Monetisasi|Gaya seni|pixel retro, 3D stilisasi, sci-fi taktis|Inspirasi|contoh: Hades, Into the Breach, Monument Valley',
  de: 'Game-Design-Brief|Spielgenre|Mobiler Roguelike-Dungeon-Crawler|Spielermodus|Plattform|2D-/3D-Format|Kamera|Engine-Ziel|Eingabe|Spielsitzung|Zielgruppe|Teenager, cozy Casual-Spieler, Taktikfans|Emotionales Ziel|Spannung, Meisterschaft, Staunen, Freundschaft|Monetarisierung|Artstyle|Pixel-Retro, stilisiertes 3D, taktische Sci-Fi|Inspirationen|z. B. Hades, Into the Breach, Monument Valley',
  'zh-CN': '游戏设计简报|类型|移动端 Roguelike 地牢探索|玩家模式|平台|2D / 3D 形式|镜头|目标引擎|输入|单局时长|受众|青少年、治愈休闲玩家、战术爱好者|情绪目标|紧张、精通、惊奇、友谊|商业模式|美术风格|像素复古、风格化 3D、战术科幻|灵感作品|例如 Hades、Into the Breach、Monument Valley',
  'zh-TW': '遊戲設計簡報|類型|行動 Roguelike 地城探索|玩家模式|平台|2D / 3D 形式|鏡頭|目標引擎|輸入|單局時長|受眾|青少年、療癒休閒玩家、戰術愛好者|情緒目標|緊張、精通、驚奇、友誼|商業模式|美術風格|像素復古、風格化 3D、戰術科幻|靈感作品|例如 Hades、Into the Breach、Monument Valley',
  'pt-BR': 'Brief de design de jogo|Gênero|Dungeon crawler roguelike mobile|Modo de jogador|Plataforma|Formato 2D / 3D|Câmera|Engine alvo|Entrada|Sessão|Público|adolescentes, jogadores cozy casuais, fãs de tática|Meta emocional|tensão, domínio, encanto, amizade|Monetização|Estilo de arte|pixel retrô, 3D estilizado, ficção científica tática|Inspirações|ex.: Hades, Into the Breach, Monument Valley',
  'es-ES': 'Brief de diseño de juego|Género|Dungeon crawler roguelike móvil|Modo de jugador|Plataforma|Formato 2D / 3D|Cámara|Motor objetivo|Entrada|Sesión|Audiencia|adolescentes, jugadores cozy casuales, fans de táctica|Objetivo emocional|tensión, maestría, asombro, amistad|Monetización|Estilo artístico|pixel retro, 3D estilizado, ciencia ficción táctica|Inspiraciones|p. ej., Hades, Into the Breach, Monument Valley',
  ru: 'Бриф игрового дизайна|Жанр|Мобильный roguelike dungeon crawler|Режим игрока|Платформа|Формат 2D / 3D|Камера|Целевой движок|Ввод|Сессия|Аудитория|подростки, cozy casual игроки, фанаты тактики|Эмоциональная цель|напряжение, мастерство, чудо, дружба|Монетизация|Художественный стиль|пиксельное ретро, стилизованное 3D, тактическая фантастика|Вдохновения|например: Hades, Into the Breach, Monument Valley',
  fa: 'بریف طراحی بازی|ژانر|دانجن‌کراولر روگ‌لایک موبایل|حالت بازیکن|پلتفرم|قالب 2D / 3D|دوربین|موتور هدف|ورودی|جلسه|مخاطب|نوجوانان، بازیکنان کژوال cozy، طرفداران تاکتیک|هدف احساسی|تنش، مهارت، شگفتی، دوستی|درآمدزایی|سبک هنری|پیکسل رترو، 3D استایلایز، علمی‌تخیلی تاکتیکی|الهام‌ها|Hades، Into the Breach، Monument Valley',
  ar: 'موجز تصميم اللعبة|النوع|زاحف زنزانات roguelike للجوال|نمط اللاعب|المنصة|تنسيق 2D / 3D|الكاميرا|المحرك المستهدف|الإدخال|الجلسة|الجمهور|مراهقون، لاعبو cozy casual، محبو التكتيك|الهدف العاطفي|توتر، إتقان، دهشة، صداقة|تحقيق الدخل|الأسلوب الفني|بكسل ريترو، 3D بأسلوب فني، خيال علمي تكتيكي|الإلهامات|Hades، Into the Breach، Monument Valley',
  ja: 'ゲームデザインブリーフ|ジャンル|モバイル向けローグライクダンジョンクローラー|プレイヤーモード|プラットフォーム|2D / 3D形式|カメラ|対象エンジン|入力|セッション|対象プレイヤー|ティーン、cozy カジュアル層、タクティクスファン|感情目標|緊張、熟達、驚き、友情|収益モデル|アートスタイル|ピクセルレトロ、スタイライズ 3D、タクティカル SF|インスピレーション|Hades、Into the Breach、Monument Valley',
  ko: '게임 디자인 브리프|장르|모바일 로그라이크 던전 크롤러|플레이어 모드|플랫폼|2D / 3D 형식|카메라|대상 엔진|입력|세션|대상 플레이어|십대, cozy 캐주얼 플레이어, 전술 팬|감정 목표|긴장, 숙련, 경이, 우정|수익화|아트 스타일|픽셀 레트로, 스타일라이즈 3D, 전술 SF|영감|예: Hades, Into the Breach, Monument Valley',
  pl: 'Brief projektu gry|Gatunek|Mobilny roguelike dungeon crawler|Tryb gracza|Platforma|Format 2D / 3D|Kamera|Docelowy silnik|Sterowanie|Sesja|Odbiorcy|nastolatki, cozy casual gracze, fani taktyki|Cel emocjonalny|napięcie, mistrzostwo, zachwyt, przyjaźń|Monetyzacja|Styl artystyczny|pixel retro, stylizowane 3D, taktyczne sci-fi|Inspiracje|np. Hades, Into the Breach, Monument Valley',
  hu: 'Játéktervezési brief|Műfaj|Mobil roguelike dungeon crawler|Játékosmód|Célplatform|2D / 3D formátum|Kamera|Célmotor|Irányítás|Játékmenet|Célközönség|tinédzserek, cozy casual játékosok, taktikai rajongók|Érzelmi cél|feszültség, mesteri tudás, csoda, barátság|Monetizáció|Művészeti stílus|pixel retro, stilizált 3D, taktikai sci-fi|Inspirációk|pl. Hades, Into the Breach, Monument Valley',
  fr: 'Brief de game design|Genre de jeu|Dungeon crawler roguelike mobile|Mode joueur|Plateforme|Format 2D / 3D|Caméra|Moteur cible|Entrée|Session de jeu|Public cible|ados, joueurs cozy casual, fans de tactique|Objectif émotionnel|tension, maîtrise, émerveillement, amitié|Monétisation|Style artistique|pixel rétro, 3D stylisée, science-fiction tactique|Références|ex. Hades, Into the Breach, Monument Valley',
  uk: 'Бриф ігрового дизайну|Жанр|Мобільний roguelike dungeon crawler|Режим гравця|Платформа|Формат 2D / 3D|Камера|Цільовий рушій|Ввід|Сесія|Аудиторія|підлітки, cozy casual гравці, фанати тактики|Емоційна мета|напруга, майстерність, диво, дружба|Монетизація|Художній стиль|піксельне ретро, стилізоване 3D, тактична фантастика|Натхнення|наприклад: Hades, Into the Breach, Monument Valley',
  tr: 'Oyun tasarım brifi|Tür|Mobil roguelike dungeon crawler|Oyuncu modu|Hedef platform|2D / 3D biçimi|Kamera|Hedef motor|Girdi|Oturum|Kitle|gençler, cozy casual oyuncular, taktik hayranları|Duygusal hedef|gerilim, ustalık, hayranlık, dostluk|Gelir modeli|Sanat tarzı|piksel retro, stilize 3D, taktik bilim kurgu|İlhamlar|örn. Hades, Into the Breach, Monument Valley',
  th: 'บรีฟออกแบบเกม|แนวเกม|ดันเจี้ยนครอว์เลอร์ roguelike บนมือถือ|โหมดผู้เล่น|แพลตฟอร์ม|รูปแบบ 2D / 3D|กล้อง|เอนจินเป้าหมาย|อินพุต|เซสชัน|กลุ่มเป้าหมาย|วัยรุ่น, ผู้เล่น cozy casual, แฟนเกมกลยุทธ์|เป้าหมายทางอารมณ์|ความตึงเครียด, ความชำนาญ, ความพิศวง, มิตรภาพ|การสร้างรายได้|สไตล์ศิลป์|พิกเซลเรโทร, 3D สไตไลซ์, ไซไฟเชิงยุทธวิธี|แรงบันดาลใจ|เช่น Hades, Into the Breach, Monument Valley',
};

const NEW_PROJECT_MEDIA_CONNECTOR_VISIBLE_KEYS = [
  'newproj.imageStylePlaceholder',
  'newproj.connectorsHint',
  'newproj.connectorsEmptyBody',
] as const satisfies ReadonlyArray<keyof Dict>;

const NEW_PROJECT_LIVE_OPS_VISIBLE_KEYS = [
  'newproj.tabLiveArtifact',
  'newproj.titleLiveArtifact',
  'newproj.createLiveArtifact',
] as const satisfies ReadonlyArray<keyof Dict>;

const REVIEWED_NEW_PROJECT_FRONT_DOOR_LOCALES = ['id', 'de', 'es-ES', 'ja', 'fr'] as const satisfies ReadonlyArray<Locale>;

const REVIEWED_NEW_PROJECT_FRONT_DOOR_KEYS = [
  'newproj.tabLiveArtifact',
  'newproj.titleLiveArtifact',
  'newproj.createLiveArtifact',
  'newproj.fidelityLabel',
  'newproj.gameArtBibleModeMulti',
  'newproj.gameArtBibleBadgeDefault',
  'newproj.surfaceImage',
  'newproj.surfaceVideo',
  'newproj.surfaceAudio',
  'newproj.modelLabel',
  'newproj.videoLengthSeconds',
  'newproj.audioKindSpeech',
  'newproj.audioKindSfx',
  'newproj.audioDurationSeconds',
] as const satisfies ReadonlyArray<keyof Dict>;

const REVIEWED_NEW_PROJECT_EXTRA_VISIBLE_KEYS: Partial<Record<Locale, ReadonlyArray<keyof Dict>>> = {
  pl: ['newproj.modelLabel'],
  tr: ['newproj.surfaceVideo', 'newproj.modelLabel'],
};

const NEW_PROJECT_RESIDUAL_FRONT_DOOR_KEYS = [
  'newproj.scrollTabsLeft',
  'newproj.scrollTabsRight',
  'newproj.betaCapability',
  'newproj.betaLabel',
  'newproj.studioEditorSurfaces',
  'newproj.gamePlatform',
  'newproj.gameDimensionality',
  'newproj.gameInspirationsPlaceholder',
  'newproj.surfaceVideo',
  'newproj.modelLabel',
  'newproj.videoLengthSeconds',
  'newproj.audioDurationSeconds',
] as const satisfies ReadonlyArray<keyof Dict>;

const NEW_PROJECT_CONNECTOR_VISIBLE_KEYS = [
  'newproj.connectorsLabel',
  'newproj.connectorsHint',
  'newproj.connectorsEmptyTitle',
  'newproj.connectorsEmptyBody',
  'newproj.connectorsEmptyCta',
  'newproj.connectorsLoading',
  'newproj.connectorsCountOne',
  'newproj.connectorsCountMany',
  'newproj.connectorsManage',
] as const satisfies ReadonlyArray<keyof Dict>;

const NEW_PROJECT_MEDIA_CONNECTOR_EXPECTED_ROWS: Record<Locale, string> = {
  en: 'Key art, sprite reference, stylized 3D prop, UI icon set|Data sources this game control center can pull from.|Connect a data source so your game live-ops center can fetch real player, economy, or content signals.',
  id: 'Key art, referensi sprite, prop 3D stilisasi, set ikon UI|Sumber data yang dapat ditarik pusat kontrol game ini.|Hubungkan sumber data agar pusat live-ops game dapat mengambil sinyal pemain, ekonomi, atau konten nyata.',
  de: 'Key Art, Sprite-Referenz, stilisiertes 3D-Prop, UI-Icon-Set|Datenquellen, aus denen dieses Game Control Center ziehen kann.|Verbinde eine Datenquelle, damit dein Game-Live-Ops-Center echte Spieler-, Ökonomie- oder Content-Signale abrufen kann.',
  'zh-CN': '主视觉、精灵参考、风格化 3D 道具、UI 图标套装|此游戏控制中心可拉取的数据源。|连接数据源，让游戏 Live Ops 中心获取真实玩家、经济或内容信号。',
  'zh-TW': '主視覺、精靈參考、風格化 3D 道具、UI 圖示套組|此遊戲控制中心可拉取的資料來源。|連接資料來源，讓遊戲 Live Ops 中心取得真實玩家、經濟或內容信號。',
  'pt-BR': 'Key art, referência de sprite, prop 3D estilizado, conjunto de ícones de UI|Fontes de dados que este centro de controle do jogo pode consultar.|Conecte uma fonte de dados para que o centro de live ops do jogo busque sinais reais de jogadores, economia ou conteúdo.',
  'es-ES': 'Key art, referencia de sprite, prop 3D estilizado, set de iconos de UI|Fuentes de datos de las que este centro de control del juego puede extraer información.|Conecta una fuente de datos para que el centro de live ops del juego obtenga señales reales de jugadores, economía o contenido.',
  ru: 'Ключевой арт, референс спрайта, стилизованный 3D-проп, набор UI-иконок|Источники данных, из которых может получать сигналы этот игровой центр управления.|Подключите источник данных, чтобы центр live ops игры получал реальные сигналы игроков, экономики или контента.',
  fa: 'کی‌آرت، مرجع اسپرایت، پراپ 3D استایلایز، مجموعه آیکون UI|منابع داده‌ای که این مرکز کنترل بازی می‌تواند از آن‌ها داده بگیرد.|یک منبع داده وصل کنید تا مرکز live-ops بازی سیگنال‌های واقعی بازیکن، اقتصاد یا محتوا را دریافت کند.',
  ar: 'فن رئيسي، مرجع سبرايت، مجسم 3D بأسلوب فني، مجموعة أيقونات UI|مصادر البيانات التي يمكن لمركز تحكم اللعبة هذا السحب منها.|صِل مصدر بيانات ليجلب مركز live ops للعبة إشارات حقيقية عن اللاعبين أو الاقتصاد أو المحتوى.',
  ja: 'キーアート、スプライト参照、スタイライズ3Dプロップ、UIアイコンセット|このゲームコントロールセンターが取得できるデータソース。|データソースを接続すると、ゲームのライブ運営センターが実際のプレイヤー、経済、コンテンツのシグナルを取得できます。',
  ko: '키 아트, 스프라이트 레퍼런스, 스타일라이즈 3D 프롭, UI 아이콘 세트|이 게임 컨트롤 센터가 가져올 수 있는 데이터 소스입니다.|데이터 소스를 연결해 게임 라이브옵스 센터가 실제 플레이어, 경제, 콘텐츠 신호를 가져오게 하세요.',
  pl: 'Key art, referencja sprite’a, stylizowany rekwizyt 3D, zestaw ikon UI|Źródła danych, z których może korzystać to centrum sterowania gry.|Połącz źródło danych, aby centrum live ops gry pobierało realne sygnały graczy, ekonomii lub treści.',
  hu: 'Key art, sprite-referencia, stilizált 3D kellék, UI ikoncsomag|Adatforrások, amelyekből ez a játékvezérlő központ dolgozhat.|Csatlakoztass adatforrást, hogy a játék live ops központja valós játékos-, gazdasági vagy tartalmi jeleket kérhessen le.',
  fr: 'Key art, référence de sprite, prop 3D stylisé, set d’icônes UI|Sources de données que ce centre de contrôle du jeu peut interroger.|Connectez une source de données pour que le centre live ops du jeu récupère de vrais signaux joueurs, économie ou contenu.',
  uk: 'Ключовий арт, референс спрайта, стилізований 3D-проп, набір UI-іконок|Джерела даних, з яких може брати сигнали цей центр керування грою.|Підключіть джерело даних, щоб центр live ops гри отримував реальні сигнали гравців, економіки або контенту.',
  tr: 'Key art, sprite referansı, stilize 3D prop, UI ikon seti|Bu oyun kontrol merkezinin veri çekebileceği kaynaklar.|Bir veri kaynağı bağlayarak oyun live ops merkezinin gerçek oyuncu, ekonomi veya içerik sinyallerini çekmesini sağlayın.',
  th: 'คีย์อาร์ต, อ้างอิงสไปรต์, พร็อป 3D สไตไลซ์, ชุดไอคอน UI|แหล่งข้อมูลที่ศูนย์ควบคุมเกมนี้ดึงมาใช้ได้|เชื่อมต่อแหล่งข้อมูลเพื่อให้ศูนย์ live ops ของเกมดึงสัญญาณผู้เล่น เศรษฐกิจ หรือคอนเทนต์จริงได้',
};

const NEW_PROJECT_MEDIA_CONNECTOR_FORBIDDEN =
  /editorial|photo|fot[oó]|fotó|fotoğraf|photography|artifact can pull|live game artifact can|placeholder|placeholders|artefaktum|artefact|артефакт|مصنوع|العنصر|아티팩트|artifact นี้|編集写真|에디토리얼|占位|佔位|ภาพถ่ายแนวบทความ/i;

const CORE_WORKSPACE_LOCALIZED_VISIBLE_KEYS = [
  'studio.previewPill',
  'studio.identitySubtitle',
  'gameFiles.title',
  'gameFiles.upload',
  'gameFiles.newSketch',
  'gameFiles.empty',
  'gameFiles.searchPlaceholder',
  'project.metaFreeform',
  'chat.composerPlaceholder',
  'examples.scenarioGameplaySystems',
  'examples.scenarioArtDirection',
  'examples.scenarioGameCampaigns',
  'examples.scenarioPitch',
  'examples.scenarioProduction',
] as const satisfies ReadonlyArray<keyof Dict>;

const WORKSPACE_GAME_FILES_LINK_VISIBLE_KEYS = [
  'workspace.gameFiles',
  'workspace.openFromGameFiles',
  'workspace.gameFilesLink',
] as const satisfies ReadonlyArray<keyof Dict>;

const WORKSPACE_CHROME_VISIBLE_KEYS = [
  'workspace.focusMode',
  'workspace.showChat',
] as const satisfies ReadonlyArray<keyof Dict>;

const PROJECT_ACTIONS_VISIBLE_KEYS = [
  'common.dismiss',
  'projectActions.toolbarAria',
  'projectActions.finalizing',
  'projectActions.cancelFinalize',
  'projectActions.finalizePackage',
  'projectActions.refinalizeStale',
  'projectActions.refinalize',
  'projectActions.continueInCli',
  'projectActions.specStale',
  'projectActions.specFreshnessUnknown',
  'projectActions.finalizeFirst',
  'projectActions.specStalenessAria',
  'projectActions.workingDirectoryUnavailable',
  'projectActions.clipboardUnavailable',
  'projectActions.workingDirectory',
  'projectActions.folderOpened',
  'projectActions.folderOpenFailed',
  'projectActions.openTerminalManually',
] as const satisfies ReadonlyArray<keyof Dict>;

const PROJECT_PRESENCE_VISIBLE_KEYS = [
  'projectPresence.aria',
  'projectPresence.label',
  'projectPresence.collaboratorFallback',
  'projectPresence.chipTitle',
  'projectPresence.chipTitleWithCursor',
  'projectPresence.modeEditing',
  'projectPresence.modeCommenting',
  'projectPresence.modeReviewing',
  'projectPresence.modeViewing',
  'projectPresence.surfaceGameFiles',
  'projectPresence.surfaceGameplayViewport',
  'projectPresence.surfaceLevelViewport',
  'projectPresence.surfaceWorldMap',
  'projectPresence.surfaceNarrativeGraph',
  'projectPresence.surfaceNodeGraph',
  'projectPresence.surfaceBehaviorTree',
  'projectPresence.surfaceSystems',
  'projectPresence.surfacePlayablePreview',
  'projectPresence.surfaceGameMedia',
  'projectPresence.surfaceLiveArtifact',
  'projectPresence.surfaceSketchBoard',
  'projectPresence.surfaceProductionBoard',
  'projectPresence.surfaceFallback',
] as const satisfies ReadonlyArray<keyof Dict>;

const STUDIO_MODE_STRIP_VISIBLE_KEYS = [
  'studioMode.eyebrow',
  'studioMode.aria',
  'studioMode.gameplay',
  'studioMode.gameplayDescription',
  'studioMode.level',
  'studioMode.levelDescription',
  'studioMode.narrative',
  'studioMode.narrativeDescription',
  'studioMode.worldMap',
  'studioMode.worldMapDescription',
  'studioMode.logicGraph',
  'studioMode.logicGraphDescription',
  'studioMode.production',
  'studioMode.productionDescription',
] as const satisfies ReadonlyArray<keyof Dict>;

const STUDIO_MODE_STRIP_ENGLISH_FALLBACK_FORBIDDEN =
  /^Studio Surface$|^Studio surfaces$|^Gameplay$|Simulation preview|^Level$|Traversal, objectives|^Narrative$|Dialogue flow|^World Map$|Biome distribution|^Logic Graph$|Gameplay logic, behavior trees|^Production$|Milestones, feasibility/i;

const ROUTINES_SECTION_VISIBLE_KEYS = [
  'routines.kindHourly',
  'routines.kindDaily',
  'routines.kindWeekdays',
  'routines.kindWeekly',
  'routines.weekdaySunShort',
  'routines.weekdayMonShort',
  'routines.weekdayTueShort',
  'routines.weekdayWedShort',
  'routines.weekdayThuShort',
  'routines.weekdayFriShort',
  'routines.weekdaySatShort',
  'routines.weekdaySunday',
  'routines.weekdayMonday',
  'routines.weekdayTuesday',
  'routines.weekdayWednesday',
  'routines.weekdayThursday',
  'routines.weekdayFriday',
  'routines.weekdaySaturday',
  'routines.scheduleHourly',
  'routines.scheduleDaily',
  'routines.scheduleWeekdays',
  'routines.scheduleWeekly',
  'routines.statusQueued',
  'routines.statusRunning',
  'routines.statusSucceeded',
  'routines.statusFailed',
  'routines.statusCanceled',
  'routines.schedule',
  'routines.minuteEveryHour',
  'routines.time',
  'routines.timezone',
  'routines.historyLoading',
  'routines.historyEmpty',
  'routines.triggerManual',
  'routines.triggerScheduled',
  'routines.openProjectTitle',
  'routines.openProject',
  'routines.errorPickProject',
  'routines.deleteConfirm',
  'routines.title',
  'routines.subtitle',
  'routines.newRun',
  'routines.name',
  'routines.namePlaceholder',
  'routines.prompt',
  'routines.promptPlaceholder',
  'routines.gameProject',
  'routines.createEachRun',
  'routines.createEachRunHint',
  'routines.reuseProject',
  'routines.reuseProjectHint',
  'routines.pickProject',
  'routines.creating',
  'routines.emptyTitle',
  'routines.emptyBody',
  'routines.targetReuse',
  'routines.targetNewEachRun',
  'routines.paused',
  'routines.nextRun',
  'routines.lastRun',
  'routines.runNow',
  'routines.pause',
  'routines.resume',
  'routines.hideHistory',
  'routines.runHistory',
  'routines.deleteTitle',
] as const satisfies ReadonlyArray<keyof Dict>;

const ROUTINES_SECTION_ENGLISH_FALLBACK_FORBIDDEN =
  /^Hourly$|^Daily$|^Weekdays$|^Weekly$|^Sun$|^Mon$|^Tue$|^Wed$|^Thu$|^Fri$|^Sat$|^Sunday$|^Monday$|^Tuesday$|^Wednesday$|^Thursday$|^Friday$|^Saturday$|Runs every hour|Runs daily|Runs Mon-Fri|Runs every|^queued$|^running$|^succeeded$|^failed$|^canceled$|^Schedule$|Minute of every hour|^Time$|^Timezone$|Loading studio runs|No studio runs yet|manual run|scheduled run|Open the game project|Pick a game project|Delete this scheduled studio run|Scheduled studio runs|Schedule recurring game-studio work|New scheduled run|^Name$|Live-ops morning brief|^Prompt$|Pull yesterday's GitHub|Game project|Create a new game project|fresh, isolated game workspace|Reuse an existing game project|Each run lives|Creating|No scheduled studio runs yet|new game project each run|^paused$|^next: \{time\}$|^last:$|Run studio now|^Pause$|^Resume$|Hide run history|Run history/i;

const GAME_TELEMETRY_BOARD_VISIBLE_KEYS = [
  'gameTelemetry.aria',
  'gameTelemetry.eyebrow',
  'gameTelemetry.title',
  'gameTelemetry.eventCountOne',
  'gameTelemetry.eventCountMany',
  'gameTelemetry.loading',
  'gameTelemetry.noTimestamp',
  'gameTelemetry.sessions',
  'gameTelemetry.scenes',
  'gameTelemetry.latestSignal',
  'gameTelemetry.designRisks',
  'gameTelemetry.noRisks',
  'gameTelemetry.heatmapCells',
  'gameTelemetry.unknownScene',
  'gameTelemetry.heatmapSignalOne',
  'gameTelemetry.heatmapSignalMany',
  'gameTelemetry.noHeatmap',
] as const satisfies ReadonlyArray<keyof Dict>;

const GAME_TELEMETRY_BOARD_ENGLISH_FALLBACK_FORBIDDEN =
  /^Game telemetry board$|^Production Telemetry$|^Telemetry Board$|^\{count\} event(?:s)?$|Loading player signal analysis|^No timestamp$|^Sessions$|^Scenes$|^Latest Signal$|^Design Risks$|No design-risk insights yet|^Heatmap Cells$|^Unknown scene$|^\{count\} signal(?:s)? near \{x\}, \{y\}$|No spatial telemetry cells yet/i;

const STUDIO_DOCUMENT_EDITOR_VISIBLE_KEYS = [
  'studioDoc.sceneHierarchy',
  'studioDoc.liveCursors',
  'studioDoc.collaborator',
  'studioDoc.invalidJson',
  'studioDoc.savedAt',
  'studioDoc.addMarker',
  'studioDoc.addTerrain',
  'studioDoc.addPolygonTerrain',
  'studioDoc.addTerrainPaint',
  'studioDoc.addSculptPatch',
  'studioDoc.addCamera',
  'studioDoc.saving',
  'studioDoc.inspector',
  'studioDoc.jsonSource',
  'studioDoc.noSelectableNode',
  'studioDoc.position',
  'studioDoc.nudgeUp',
  'studioDoc.nudgeLeft',
  'studioDoc.nudgeRight',
  'studioDoc.nudgeDown',
  'studioDoc.raiseHeight',
  'studioDoc.lowerHeight',
  'studioDoc.addBrushSample',
  'studioDoc.broadenBrush',
  'studioDoc.tightenBrush',
  'studioDoc.meshVerts',
  'studioDoc.waypointCountOne',
  'studioDoc.waypointCountMany',
  'studioDoc.addWaypoint',
  'studioDoc.panelSpatialReadability',
  'studioDoc.panelWorldSimulation',
  'studioDoc.panelCameraPlan',
  'studioDoc.panelStudioCollaboration',
  'studioDoc.panelRuntimeVariables',
  'studioDoc.panelDesignCritique',
  'studioDoc.panelReadableTells',
  'studioDoc.panelCounterplayRules',
  'studioDoc.panelDifficultyDirector',
  'studioDoc.panelAccessibility',
  'studioDoc.panelProductionScaling',
  'studioDoc.panelTelemetryIteration',
  'studioDoc.panelDesignTokens',
  'studioDoc.panelPlatformAdaptation',
  'studioDoc.panelEthicsAccessibility',
  'studioDoc.panelGenreBenchmarks',
  'studioDoc.presenceViewing',
  'studioDoc.sourceCursorsAria',
  'studioDoc.remoteDraftVisible',
  'studioDoc.saveFailed',
  'studioDoc.defaultObjective',
  'studioDoc.selectEntityHint',
  'studioDoc.metaSightlineTraversalTension',
  'studioDoc.metaFramingComfortReadability',
  'studioDoc.defaultNodeLogicOwner',
  'studioDoc.defaultRuntimeVariableNote',
  'studioDoc.labelCritique',
  'studioDoc.labelTell',
  'studioDoc.labelRule',
  'studioDoc.labelNote',
  'studioDoc.labelAssist',
  'studioDoc.labelIteration',
  'studioDoc.labelEthic',
  'studioDoc.labelAccess',
  'studioDoc.labelPlaytest',
  'studioDoc.metricTarget',
  'studioDoc.metricCurrent',
  'studioDoc.metricRisk',
  'studioDoc.metricNeedsTelemetry',
  'studioDoc.labelLoop',
  'studioDoc.defaultSystemPillars',
  'studioDoc.labelBenchmark',
  'studioDoc.needsStudioReviewNotes',
  'studioDoc.labelEcosystem',
  'studioDoc.metaReactiveWorldLoop',
  'studioDoc.labelNpcSchedule',
  'studioDoc.labelFactionTerritory',
  'studioDoc.labelWeather',
  'studioDoc.metaDynamicEventPressure',
  'studioDoc.labelPersistence',
  'studioDoc.metaWorldState',
  'studioDoc.labelDestruction',
  'studioDoc.metaReactiveEnvironment',
  'studioDoc.labelReactiveRule',
  'studioDoc.labelMilestone',
  'studioDoc.metaProductionTarget',
  'studioDoc.labelAssetBudget',
  'studioDoc.metaContentLoad',
  'studioDoc.labelQA',
  'studioDoc.labelEngine',
  'studioDoc.metaScopeVariant',
  'studioDoc.labelTeamSize',
  'studioDoc.labelFeasibility',
  'studioDoc.labelTimeline',
  'studioDoc.labelConstraint',
  'studioDoc.tokenRarityColors',
  'studioDoc.tokenFactionPalettes',
  'studioDoc.tokenBiomePalettes',
  'studioDoc.tokenStatusEffectColors',
  'studioDoc.tokenMotionProfiles',
  'studioDoc.tokenAudioCues',
  'studioDoc.metaGameTokenGroup',
  'studioDoc.defaultBehaviorType',
  'studioDoc.metaTerrainZone',
  'studioDoc.metaTerrainPaint',
  'studioDoc.metaTerrainSculpt',
  'studioDoc.metaPath',
  'studioDoc.metaBeat',
  'studioDoc.metaDynamicEvent',
  'studioDoc.metaSpatialRead',
  'studioDoc.metaCamera',
  'studioDoc.metaEdge',
  'studioDoc.metaMetric',
  'studioDoc.detailEntityPosition',
  'studioDoc.detailControlPoints',
  'studioDoc.detailSceneBeatNeedsPacing',
  'studioDoc.detailTriggerTbd',
  'studioDoc.detailImpactTbd',
  'studioDoc.detailSpatialReadNeedsNotes',
  'studioDoc.detailNodeWithOutputs',
  'studioDoc.detailRoutesTo',
  'studioDoc.detailBehaviorNodeNeedsCounterplay',
  'studioDoc.detailMetricTargetCurrent',
  'studioDoc.detailMetricTargetOnly',
  'studioDoc.detailLoopReward',
  'studioDoc.noInspectorDetails',
  'studioDoc.mergeConflict',
  'studioDoc.operationCouldNotApply',
  'studioDoc.schemaMismatch',
  'studioDoc.schemaDocumentPath',
  'studioDoc.kindGameViewport',
  'studioDoc.kindNodeGraph',
  'studioDoc.kindBehaviorTree',
  'studioDoc.kindGameSystem',
] as const satisfies ReadonlyArray<keyof Dict>;

const STUDIO_DOCUMENT_EDITOR_ENGLISH_FALLBACK_FORBIDDEN =
  /Scene Hierarchy|Live Cursors|Studio collaborator|Invalid JSON|Saved \{time\}|Add Marker|Add Terrain|Add Polygon Terrain|Add Terrain Paint|Add Sculpt Patch|Add Camera|Saving|Inspector|JSON Source|No selectable game system node yet|Position \{x\}, \{y\}|Nudge Up|Nudge Left|Nudge Right|Nudge Down|Raise Height|Lower Height|Add Brush Sample|Broaden Brush|Tighten Brush|\{count\} mesh verts|\{count\} waypoints?|Add Waypoint|Spatial Readability|World Simulation|Camera Plan|Studio Collaboration|Runtime Variables|Design Critique|Readable Tells|Counterplay Rules|Difficulty Director|Accessibility|Production Scaling|Telemetry & Iteration|Design Tokens|Platform Adaptation|Ethics & Accessibility|Genre Benchmarks|Collaborator cursors in JSON source|Remote source draft is visible locally|Could not save the studio document|Plan objective, spawn logic, combat readability, and reward placement|Select an entity, then use arrow keys|Sightline \/ traversal \/ tension|Framing \/ comfort \/ readability|Node logic should expose player-readable triggers|Tune during playtest to protect readability and pacing|Target \{value\}|Current \{value\}|Risk \{value\}|Metric needs telemetry|Tie every tuning value back to pillars|Needs studio review notes|Reactive world loop|NPC Schedule|Faction Territory|Dynamic event pressure|World state|Reactive environment|Reactive Rule|Production target|Asset Budget|Content load|Scope variant|Team Size|Rarity Colors|Faction Palettes|Biome Palettes|Status Effect Colors|Motion Profiles|Audio Cues|Game token group|Behavior must stay readable|terrain zone|terrain paint|terrain sculpt|dynamic event|spatial read|\{type\} at \{x\}, \{y\}|control points|Scene beat needs pacing notes|Trigger TBD|Impact TBD|Spatial read needs sightline|node with \{count\} outputs|routes to|Behavior node needs player-readable counterplay|Target \{target\}|current \{current\}|Reward: \{reward\}|No inspector details yet|Studio document merge conflict|operation could not be applied|does not match the game schema|Game Viewport|Node Graph|Behavior Tree|Game System/i;

const CHAT_COMMENT_LOCALIZED_VISIBLE_KEYS = [
  'chat.comments.attached',
  'chat.comments.emptyAttached',
  'chat.comments.saved',
  'chat.comments.emptySaved',
  'chat.comments.add',
  'chat.comments.addAll',
  'chat.comments.remove',
  'chat.comments.placeholder',
  'chat.comments.addSend',
  'chat.comments.updateSend',
  'chat.comments.removeAttachment',
  'chat.comments.removeAttachmentAria',
] as const satisfies ReadonlyArray<keyof Dict>;

const CHAT_STARTER_LOCALIZED_VISIBLE_KEYS = [
  'chat.example1Title',
  'chat.example1Prompt',
  'chat.example2Title',
  'chat.example2Prompt',
  'chat.example3Title',
  'chat.example3Prompt',
] as const satisfies ReadonlyArray<keyof Dict>;

const CHAT_COMMENT_ENGLISH_FALLBACK_FORBIDDEN =
  /Attached to chat|No comments attached|Saved comments|No saved comments|Comment on this element|Add & send|Update & send|Remove comment attachment/i;

const CHAT_STARTER_ENGLISH_FALLBACK_FORBIDDEN =
  /Open-world RPG GDD deck|Create a 10-slide game pitch|Sci-fi tactical HUD|Design a dense sci-fi tactical game HUD|Live ops season roadmap|Create a refreshable live-ops season roadmap/i;

const CORE_WORKSPACE_LOCALIZED_EXPECTED_ROWS: Record<Locale, string> = {
  "en": 'Game Studio Preview|Game Design Operating System|Game Files|Upload game files|New game sketch|Game Files is empty. Drop concept art, level maps, GDDs, HUD specs, or studio notes below.|Search game files…|freeform|Describe the game scene, system, HUD, level, or studio asset you want — paste/drop images or @ reference a file…|Gameplay systems|Art direction|Game campaigns|Pitch|Production',
  "id": 'Pratinjau Studio Game|Sistem Operasi Desain Game|File Game|Unggah file game|Sketsa game baru|File Game kosong. Taruh concept art, peta level, GDD, spesifikasi HUD, atau catatan studio di bawah.|Cari file game…|bebas|Jelaskan scene game, sistem, HUD, level, atau aset studio yang kamu inginkan — tempel/jatuhkan gambar atau @ referensikan file…|Sistem gameplay|Arahan seni|Kampanye game|Pitch game|Produksi',
  "de": 'Game-Studio-Vorschau|Betriebssystem für Game Design|Game-Dateien|Game-Dateien hochladen|Neue Game-Skizze|Der Bereich Game-Dateien ist leer. Lege Concept Art, Levelkarten, GDDs, HUD-Spezifikationen oder Studio-Notizen unten ab.|Game-Dateien suchen…|frei|Beschreibe die Spielszene, das System, HUD, Level oder Studio-Asset, das du möchtest — Bilder einfügen/ablegen oder per @ eine Datei referenzieren…|Gameplay-Systeme|Künstlerische Leitung|Game-Kampagnen|Pitch-Präsentation|Produktion',
  "zh-CN": '游戏工作室预览|游戏设计操作系统|游戏文件|上传游戏文件|新建游戏草图|游戏文件为空。可在下方放入概念美术、关卡地图、GDD、HUD 规格或工作室笔记。|搜索游戏文件…|自由形式|描述你想要的游戏场景、系统、HUD、关卡或工作室资产 — 粘贴/拖入图片，或用 @ 引用文件…|玩法系统|美术指导|游戏推广|提案|制作',
  "zh-TW": '遊戲工作室預覽|遊戲設計作業系統|遊戲檔案|上傳遊戲檔案|新增遊戲草圖|遊戲檔案是空的。可在下方放入概念美術、關卡地圖、GDD、HUD 規格或工作室筆記。|搜尋遊戲檔案…|自由形式|描述你想要的遊戲場景、系統、HUD、關卡或工作室資產 — 貼上/拖入圖片，或用 @ 引用檔案…|玩法系統|美術指導|遊戲宣傳|提案|製作',
  "pt-BR": 'Prévia do estúdio de jogos|Sistema operacional de design de jogos|Arquivos do jogo|Enviar arquivos do jogo|Novo esboço do jogo|A área de arquivos do jogo está vazia. Solte concept art, mapas de nível, GDDs, specs de HUD ou notas do estúdio abaixo.|Buscar arquivos do jogo…|livre|Descreva a cena, sistema, HUD, nível ou asset de estúdio do jogo que você quer — cole/solte imagens ou use @ para referenciar um arquivo…|Sistemas de gameplay|Direção de arte|Campanhas de jogo|Apresentação|Produção',
  "es-ES": 'Vista previa del estudio de juegos|Sistema operativo de diseño de juegos|Archivos del juego|Subir archivos del juego|Nuevo boceto del juego|La sección de archivos del juego está vacía. Suelta concept art, mapas de nivel, GDD, especificaciones de HUD o notas del estudio abajo.|Buscar archivos del juego…|libre|Describe la escena, sistema, HUD, nivel o asset de estudio del juego que quieres — pega/suelta imágenes o usa @ para referenciar un archivo…|Sistemas de gameplay|Dirección de arte|Campañas de juego|Presentación|Producción',
  "ru": 'Предпросмотр игровой студии|Операционная система игрового дизайна|Игровые файлы|Загрузить игровые файлы|Новый игровой эскиз|Игровые файлы пусты. Добавьте ниже концепт-арт, карты уровней, GDD, спецификации HUD или заметки студии.|Поиск игровых файлов…|свободный формат|Опишите нужную игровую сцену, систему, HUD, уровень или студийный ассет — вставьте/перетащите изображения или укажите файл через @…|Геймплейные системы|Арт-дирекшн|Игровые кампании|Питч|Производство',
  "fa": 'پیش‌نمایش استودیوی بازی|سیستم عامل طراحی بازی|فایل‌های بازی|بارگذاری فایل‌های بازی|طرح تازه بازی|فایل‌های بازی خالی است. کانسپت آرت، نقشه مرحله، GDD، مشخصات HUD یا یادداشت‌های استودیو را پایین رها کنید.|جستجوی فایل‌های بازی…|فرم آزاد|صحنه بازی، سیستم، HUD، مرحله یا دارایی استودیویی موردنظرتان را توصیف کنید — تصویر بچسبانید/رها کنید یا با @ به فایل ارجاع دهید…|سیستم‌های گیم‌پلی|کارگردانی هنری|کمپین‌های بازی|پیچ|تولید',
  "ar": 'معاينة استوديو الألعاب|نظام تشغيل تصميم الألعاب|ملفات اللعبة|رفع ملفات اللعبة|مخطط لعبة جديد|ملفات اللعبة فارغة. أسقط أدناه رسومات المفهوم أو خرائط المستويات أو GDD أو مواصفات HUD أو ملاحظات الاستوديو.|ابحث في ملفات اللعبة…|صياغة حرة|صف مشهد اللعبة أو النظام أو HUD أو المستوى أو أصل الاستوديو الذي تريده — الصق/أسقط الصور أو استخدم @ للإشارة إلى ملف…|أنظمة اللعب|الإخراج الفني|حملات اللعبة|عرض تقديمي|الإنتاج',
  "ja": 'ゲームスタジオプレビュー|ゲームデザインOS|ゲームファイル|ゲームファイルをアップロード|新しいゲームスケッチ|ゲームファイルは空です。コンセプトアート、レベルマップ、GDD、HUD仕様、スタジオメモを下にドロップしてください。|ゲームファイルを検索…|自由形式|作りたいゲームシーン、システム、HUD、レベル、スタジオアセットを説明してください — 画像を貼り付け/ドロップするか、@ でファイルを参照…|ゲームプレイシステム|アートディレクション|ゲームキャンペーン|ピッチ|制作',
  "ko": '게임 스튜디오 미리보기|게임 디자인 운영체제|게임 파일|게임 파일 업로드|새 게임 스케치|게임 파일이 비어 있습니다. 아래에 콘셉트 아트, 레벨 맵, GDD, HUD 사양 또는 스튜디오 노트를 놓으세요.|게임 파일 검색…|자유 형식|원하는 게임 장면, 시스템, HUD, 레벨 또는 스튜디오 에셋을 설명하세요 — 이미지를 붙여넣거나 드롭하고 @로 파일을 참조하세요…|게임플레이 시스템|아트 디렉션|게임 캠페인|피치|제작',
  "pl": 'Podgląd studia gier|System operacyjny projektowania gier|Pliki gry|Prześlij pliki gry|Nowy szkic gry|Pliki gry są puste. Upuść poniżej concept art, mapy poziomów, GDD, specyfikacje HUD lub notatki studia.|Szukaj plików gry…|swobodny format|Opisz scenę gry, system, HUD, poziom lub asset studia, którego chcesz — wklej/upuszczaj obrazy albo odwołaj się do pliku przez @…|Systemy rozgrywki|Kierunek artystyczny|Kampanie gry|Prezentacja|Produkcja',
  "hu": 'Játékstúdió-előnézet|Játéktervezési operációs rendszer|Játékfájlok|Játékfájlok feltöltése|Új játékvázlat|A Játékfájlok terület üres. Dobj ide koncepciórajzot, pályatérképet, GDD-t, HUD-specifikációt vagy stúdiójegyzetet.|Játékfájlok keresése…|szabad forma|Írd le a kívánt játékjelenetet, rendszert, HUD-ot, pályát vagy stúdióassetet — illessz/dobj be képeket, vagy hivatkozz fájlra @ jellel…|Játékmenet-rendszerek|Művészeti irány|Játékkampányok|Pitchterv|Gyártás',
  "fr": 'Aperçu du studio de jeu|Système d’exploitation de game design|Fichiers de jeu|Importer des fichiers de jeu|Nouvelle esquisse de jeu|La section Fichiers de jeu est vide. Déposez ci-dessous concept art, cartes de niveau, GDD, specs HUD ou notes de studio.|Rechercher dans les fichiers de jeu…|forme libre|Décrivez la scène de jeu, le système, le HUD, le niveau ou l’asset de studio souhaité — collez/déposez des images ou référencez un fichier avec @…|Systèmes de gameplay|Direction artistique|Campagnes de jeu|Argumentaire|Production studio',
  "uk": 'Перегляд ігрової студії|Операційна система ігрового дизайну|Ігрові файли|Завантажити ігрові файли|Новий ігровий ескіз|Ігрові файли порожні. Додайте нижче концепт-арт, карти рівнів, GDD, специфікації HUD або нотатки студії.|Пошук ігрових файлів…|вільна форма|Опишіть потрібну ігрову сцену, систему, HUD, рівень або студійний асет — вставте/перетягніть зображення або вкажіть файл через @…|Геймплейні системи|Артдирекшн|Ігрові кампанії|Пітч|Виробництво',
  "tr": 'Oyun stüdyosu önizlemesi|Oyun tasarımı işletim sistemi|Oyun dosyaları|Oyun dosyalarını yükle|Yeni oyun taslağı|Oyun dosyaları alanı boş. Aşağıya konsept sanat, seviye haritası, GDD, HUD spesifikasyonu veya stüdyo notları bırak.|Oyun dosyalarında ara…|serbest form|İstediğin oyun sahnesini, sistemi, HUD’u, seviyeyi veya stüdyo varlığını anlat — görsel yapıştır/bırak ya da @ ile dosya referansla…|Oynanış sistemleri|Sanat yönetimi|Oyun kampanyaları|Sunum|Prodüksiyon',
  "th": 'พรีวิวสตูดิโอเกม|ระบบปฏิบัติการออกแบบเกม|ไฟล์เกม|อัปโหลดไฟล์เกม|สเก็ตช์เกมใหม่|ไฟล์เกมยังว่างอยู่ วางคอนเซ็ปต์อาร์ต แผนที่เลเวล GDD สเปก HUD หรือโน้ตสตูดิโอไว้ด้านล่าง|ค้นหาไฟล์เกม…|รูปแบบอิสระ|อธิบายฉากเกม ระบบ HUD เลเวล หรือแอสเซ็ตสตูดิโอที่ต้องการ — วาง/ลากรูปภาพ หรือใช้ @ อ้างอิงไฟล์…|ระบบเกมเพลย์|การกำกับศิลป์|แคมเปญเกม|พิตช์|การผลิต',
};

const WORKSPACE_GAME_FILES_LINK_EXPECTED_ROWS: Record<Locale, string> = {
  en: 'Game Files|Open a game file from|Game Files',
  id: 'File Game|Buka file game dari|File Game',
  de: 'Game-Dateien|Game-Datei öffnen aus|Game-Dateien',
  'zh-CN': '游戏文件|从这里打开游戏文件：|游戏文件',
  'zh-TW': '遊戲檔案|從這裡開啟遊戲檔案：|遊戲檔案',
  'pt-BR': 'Arquivos do jogo|Abrir um arquivo do jogo em|Arquivos do jogo',
  'es-ES': 'Archivos del juego|Abrir un archivo del juego desde|Archivos del juego',
  ru: 'Игровые файлы|Открыть игровой файл из|Игровые файлы',
  fa: 'فایل‌های بازی|باز کردن فایل بازی از|فایل‌های بازی',
  ar: 'ملفات اللعبة|افتح ملف لعبة من|ملفات اللعبة',
  ja: 'ゲームファイル|ゲームファイルを開く場所|ゲームファイル',
  ko: '게임 파일|게임 파일 열기 위치|게임 파일',
  pl: 'Pliki gry|Otwórz plik gry z|Pliki gry',
  hu: 'Játékfájlok|Játékfájl megnyitása innen|Játékfájlok',
  fr: 'Fichiers de jeu|Ouvrir un fichier de jeu depuis|Fichiers de jeu',
  uk: 'Ігрові файли|Відкрити ігровий файл із|Ігрові файли',
  tr: 'Oyun dosyaları|Şuradan oyun dosyası aç|Oyun dosyaları',
  th: 'ไฟล์เกม|เปิดไฟล์เกมจาก|ไฟล์เกม',
};

const WORKSPACE_CHROME_EXPECTED_ROWS: Record<Locale, string> = {
  en: 'Focus workspace|Show chat',
  id: 'Fokus ruang kerja|Tampilkan obrolan',
  de: 'Arbeitsbereich fokussieren|Chat anzeigen',
  'zh-CN': '专注工作区|显示聊天',
  'zh-TW': '專注工作區|顯示聊天',
  'pt-BR': 'Focar área de trabalho|Mostrar chat',
  'es-ES': 'Enfocar espacio de trabajo|Mostrar chat',
  ru: 'Сфокусировать рабочую область|Показать чат',
  fa: 'تمرکز روی فضای کار|نمایش گفتگو',
  ar: 'تركيز مساحة العمل|إظهار الدردشة',
  ja: 'ワークスペースに集中|チャットを表示',
  ko: '작업공간 집중|채팅 표시',
  pl: 'Skup obszar roboczy|Pokaż czat',
  hu: 'Munkaterület fókusza|Csevegés megjelenítése',
  fr: 'Concentrer l’espace de travail|Afficher le chat',
  uk: 'Сфокусувати робочу область|Показати чат',
  tr: 'Çalışma alanına odaklan|Sohbeti göster',
  th: 'โหมดโฟกัส|เปิดแชท',
};

const MANUAL_EDIT_EMPTY_EXPECTED_BY_LOCALE: Record<Locale, string> = {
  en: 'Select a gameplay surface in the preview or choose a layer.',
  id: 'Pilih permukaan gameplay di pratinjau atau pilih lapisan.',
  de: 'Wähle im Preview eine Gameplay-Fläche aus oder wähle eine Ebene.',
  'zh-CN': '在预览中选择一个玩法界面区域，或选择一个图层。',
  'zh-TW': '在預覽中選擇一個玩法介面區域，或選擇一個圖層。',
  'pt-BR': 'Selecione uma superfície de gameplay na prévia ou escolha uma camada.',
  'es-ES': 'Selecciona una superficie de gameplay en la vista previa o elige una capa.',
  ru: 'Выберите игровую поверхность в предпросмотре или выберите слой.',
  fa: 'یک سطح گیم‌پلی را در پیش‌نمایش انتخاب کنید یا یک لایه را برگزینید.',
  ar: 'اختر سطح لعب في المعاينة أو اختر طبقة.',
  ja: 'プレビュー内のゲームプレイ面を選択するか、レイヤーを選んでください。',
  ko: '미리보기에서 게임플레이 표면을 선택하거나 레이어를 선택하세요.',
  pl: 'Wybierz powierzchnię gameplayu w podglądzie albo wybierz warstwę.',
  hu: 'Válassz egy játékmenet-felületet az előnézetben, vagy válassz egy réteget.',
  fr: 'Sélectionnez une surface de gameplay dans l’aperçu ou choisissez un calque.',
  uk: 'Виберіть ігрову поверхню в перегляді або виберіть шар.',
  tr: 'Önizlemede bir oynanış yüzeyi seç veya bir katman seç.',
  th: 'เลือกพื้นผิวเกมเพลย์ในพรีวิว หรือเลือกเลเยอร์',
};

const MANUAL_EDIT_LOCALIZED_VISIBLE_KEYS = [
  'manualEdit.layers',
  'manualEdit.editableCount',
  'manualEdit.title',
  'manualEdit.selectLayer',
  'manualEdit.empty',
  'manualEdit.noClass',
  'manualEdit.tabsAria',
  'manualEdit.tabContent',
  'manualEdit.tabStyle',
  'manualEdit.tabAttributes',
  'manualEdit.tabHtml',
  'manualEdit.tabSource',
  'manualEdit.attributesJson',
  'manualEdit.selectedHtml',
  'manualEdit.fullSource',
  'manualEdit.applyContent',
  'manualEdit.applyStyle',
  'manualEdit.applyAttributes',
  'manualEdit.applyHtml',
  'manualEdit.applySource',
  'manualEdit.invalidAttributes',
  'manualEdit.changes',
  'manualEdit.undo',
  'manualEdit.redo',
  'manualEdit.noChanges',
  'manualEdit.imageUrl',
  'manualEdit.altText',
  'manualEdit.label',
  'manualEdit.text',
  'manualEdit.href',
  'manualEdit.textColor',
  'manualEdit.background',
  'manualEdit.fontSize',
  'manualEdit.weight',
  'manualEdit.align',
  'manualEdit.padding',
  'manualEdit.margin',
  'manualEdit.radius',
  'manualEdit.border',
  'manualEdit.width',
  'manualEdit.minHeight',
] as const satisfies ReadonlyArray<keyof Dict>;

const MANUAL_EDIT_ENGLISH_FALLBACK_FORBIDDEN =
  /\b(?:Layers|editable|Manual editor|Select a layer|Click an element in the preview|no class|Manual edit tabs|Selected element HTML|Full artifact source|Apply Content|Apply Style|Apply Attributes|Apply Source|Invalid attributes JSON|No manual edits yet|Image URL|Alt text|Text color|Background|Font size|Weight|Align|Padding|Margin|Border|Width|Min height|Href)\b/i;

describe('i18n locales', () => {
  it('registers every supported locale in the language menu', () => {
    expect(LOCALES).toEqual(EXPECTED_LOCALES);
    expect((LOCALE_LABEL as Record<string, string>).id).toBe('Bahasa Indonesia');
    expect((LOCALE_LABEL as Record<string, string>).de).toBe('Deutsch');
    expect((LOCALE_LABEL as Record<string, string>).ja).toBe('日本語');
  });

  it('keeps locale dictionaries aligned with English keys and placeholders', async () => {
    const englishKeys = Object.keys(en).sort();

    for (const locale of LOCALES) {
      const dict = await loadDict(locale);
      expect(Object.keys(dict).sort()).toEqual(englishKeys);

      for (const key of englishKeys) {
        const dictKey = key as keyof Dict;
        expect(placeholders(dict[dictKey]), `${locale}.${key}`).toEqual(
          placeholders(en[dictKey]),
        );
      }
    }
  });

  it('declares every locale key explicitly instead of relying on inherited English source copy', () => {
    const englishKeys = explicitLocaleKeys('en').sort();

    for (const locale of LOCALES.filter((item) => item !== 'en')) {
      expect(explicitLocaleKeys(locale).sort(), `${locale} explicit dictionary keys`).toEqual(englishKeys);
    }
  });

  it('keeps visible runtime, deploy, and notification copy game-studio native', async () => {
    for (const locale of LOCALES) {
      const dict = await loadDict(locale);

      expect(dict['studio.identityName'], `${locale}.studio.identityName`).toBe('AI Game Design Studio');

      for (const { key, forbidden } of GAME_FIRST_VISIBLE_COPY_RULES) {
        expect(dict[key], `${locale}.${key}`).not.toMatch(forbidden);
      }
    }
  });

  it('localizes MCP setup instructions without English fallbacks', async () => {
    for (const locale of LOCALES.filter((item) => item !== 'en')) {
      const dict = await loadDict(locale);

      for (const key of SETTINGS_MCP_VISIBLE_KEYS) {
        expect(dict[key], `${locale}.${key} English fallback`).not.toBe(en[key]);
      }
    }
  });

  it('localizes external MCP status copy without mixed English fragments', async () => {
    for (const locale of LOCALES.filter((item) => item !== 'en')) {
      const dict = await loadDict(locale);

      for (const key of SETTINGS_EXTERNAL_MCP_STATUS_KEYS) {
        expect(dict[key], `${locale}.${key} mixed English fragment`).not.toMatch(
          EXTERNAL_MCP_STATUS_MIXED_ENGLISH_FORBIDDEN,
        );
      }
    }
  });

  it('localizes reviewed project action and external MCP helper copy without mixed English fragments', async () => {
    for (const locale of LOCALES.filter((item) => item !== 'en')) {
      const dict = await loadDict(locale);

      for (const key of REVIEWED_PROJECT_ACTION_AND_MCP_HELPER_MIXED_ENGLISH_KEYS) {
        expect(dict[key], `${locale}.${key} mixed English fragment`).not.toMatch(
          REVIEWED_PROJECT_ACTION_AND_MCP_HELPER_MIXED_ENGLISH_FORBIDDEN,
        );
      }
    }
  });

  it('localizes artifact inspection and refresh history helper copy without mixed English fragments', async () => {
    for (const locale of LOCALES.filter((item) => item !== 'en')) {
      const dict = await loadDict(locale);

      for (const key of REVIEWED_ARTIFACT_REFRESH_AND_INSPECT_MIXED_ENGLISH_KEYS) {
        expect(dict[key], `${locale}.${key} mixed English fragment`).not.toMatch(
          REVIEWED_ARTIFACT_REFRESH_AND_INSPECT_MIXED_ENGLISH_FORBIDDEN,
        );
      }
    }
  });

  it('localizes model discovery settings without English fallbacks', async () => {
    for (const locale of LOCALES.filter((item) => item !== 'en')) {
      const dict = await loadDict(locale);

      for (const key of SETTINGS_MODEL_DISCOVERY_VISIBLE_KEYS) {
        expect(dict[key], `${locale}.${key} English fallback`).not.toBe(en[key]);
      }
    }
  });

  it('localizes CLI config location settings without English fallbacks', async () => {
    for (const locale of LOCALES.filter((item) => item !== 'en')) {
      const dict = await loadDict(locale);

      for (const key of SETTINGS_CLI_ENV_VISIBLE_KEYS) {
        expect(dict[key], `${locale}.${key} English fallback`).not.toBe(en[key]);
      }
    }
  });

  it('localizes privacy settings copy and names game artifact files explicitly', async () => {
    for (const locale of LOCALES) {
      const dict = await loadDict(locale);

      expect(dict['settings.privacyConsentFooter'], `${locale}.settings.privacyConsentFooter`).not.toMatch(
        /generated artifact files/i,
      );
      expect(dict['settings.privacyArtifacts'], `${locale}.settings.privacyArtifacts`).not.toBe(
        'Project artifacts manifest',
      );
      expect(dict['settings.privacyArtifactsHint'], `${locale}.settings.privacyArtifactsHint`).not.toMatch(
        /Filenames, types, sizes of generated files/i,
      );

      if (locale !== 'en') {
        for (const key of SETTINGS_PRIVACY_VISIBLE_KEYS) {
          expect(dict[key], `${locale}.${key} English fallback`).not.toBe(en[key]);
          expect(dict[key], `${locale}.${key} English phrase`).not.toMatch(
            SETTINGS_PRIVACY_ENGLISH_FALLBACK_FORBIDDEN,
          );
        }
      }
    }
  });

  it('keeps reviewed Cloudflare deploy controls localized instead of inheriting English', async () => {
    for (const locale of REVIEWED_CLOUDFLARE_DEPLOY_LOCALES) {
      const dict = await loadDict(locale);

      for (const key of REVIEWED_CLOUDFLARE_DEPLOY_KEYS) {
        expect(dict[key], `${locale}.${key} English fallback`).not.toBe(en[key]);
      }
    }
  });

  it('localizes Cloudflare game artifact deploy guidance without English fallbacks', async () => {
    for (const locale of LOCALES.filter((item) => item !== 'en')) {
      const dict = await loadDict(locale);

      for (const key of FILE_VIEWER_CLOUDFLARE_VISIBLE_KEYS) {
        expect(dict[key], `${locale}.${key} English fallback`).not.toBe(en[key]);
      }
    }
  });

  it('localizes FileViewer studio package export guidance without English fallbacks', async () => {
    for (const locale of LOCALES.filter((item) => item !== 'en')) {
      const dict = await loadDict(locale);

      for (const key of FILE_VIEWER_STUDIO_PACKAGE_VISIBLE_KEYS) {
        expect(dict[key], `${locale}.${key} English fallback`).not.toBe(en[key]);
      }
    }
  });

  it('localizes FileViewer inspect and template chrome without English fallbacks', async () => {
    for (const locale of LOCALES.filter((item) => item !== 'en')) {
      const dict = await loadDict(locale);

      for (const key of FILE_VIEWER_INSPECT_VISIBLE_KEYS) {
        expect(dict[key], `${locale}.${key} English fallback`).not.toBe(en[key]);
      }
    }
  });

  it('localizes Game Files live artifact labels without English fallbacks', async () => {
    for (const locale of LOCALES.filter((item) => item !== 'en')) {
      const dict = await loadDict(locale);

      for (const key of GAME_FILES_LIVE_ARTIFACT_VISIBLE_KEYS) {
        expect(dict[key], `${locale}.${key} English fallback`).not.toBe(en[key]);
        expect(dict[key], `${locale}.${key} English phrase`).not.toMatch(/live game artifact/i);
      }
    }
  });

  it('localizes Game Files and FileViewer taxonomy controls without English fallbacks', async () => {
    for (const locale of LOCALES.filter((item) => item !== 'en')) {
      const dict = await loadDict(locale);

      for (const key of GAME_FILES_VIEWER_TAXONOMY_VISIBLE_KEYS) {
        expect(dict[key], `${locale}.${key} English fallback`).not.toBe(en[key]);
      }
    }
  });

  it('localizes chat project-reference controls without English fallbacks', async () => {
    for (const locale of LOCALES.filter((item) => item !== 'en')) {
      const dict = await loadDict(locale);

      for (const key of CHAT_PROJECT_REFERENCE_VISIBLE_KEYS) {
        expect(dict[key], `${locale}.${key} English fallback`).not.toBe(en[key]);
      }
    }
  });

  it('localizes live artifact refresh and viewer controls without English fallbacks', async () => {
    const keys = [...LIVE_ARTIFACT_REFRESH_VISIBLE_KEYS, ...LIVE_ARTIFACT_VIEWER_VISIBLE_KEYS];

    for (const locale of LOCALES.filter((item) => item !== 'en')) {
      const dict = await loadDict(locale);

      for (const key of keys) {
        expect(dict[key], `${locale}.${key} English fallback`).not.toBe(en[key]);
      }
    }
  });

  it('localizes Game Projects live artifact status badges without English fallbacks', async () => {
    for (const locale of LOCALES.filter((item) => item !== 'en')) {
      const dict = await loadDict(locale);

      for (const key of GAME_PROJECT_LIVE_STATUS_VISIBLE_KEYS) {
        expect(dict[key], `${locale}.${key} English fallback`).not.toBe(en[key]);
      }
    }
  });

  it('keeps localized copy free of retired product identity names', async () => {
    for (const locale of LOCALES) {
      const dict = await loadDict(locale);
      for (const [key, value] of Object.entries(dict)) {
        expect(value, `${locale}.${key}`).not.toMatch(OLD_PRODUCT_IDENTITY_FORBIDDEN);
      }
    }
  });

  it('labels the visual system catalog as game art bibles in every locale', async () => {
    for (const locale of LOCALES) {
      const dict = await loadDict(locale);

      for (const key of GAME_ART_BIBLE_VISIBLE_KEYS) {
        expect(dict[key], `${locale}.${key}`).not.toMatch(DESIGN_SYSTEM_FORBIDDEN);
      }
    }
  });

  it('keeps localized game art bible fallback ids scoped to the curated catalog', () => {
    for (const [locale, ids] of Object.entries(LOCALIZED_CONTENT_IDS)) {
      expect(ids.gameArtBibles, `${locale}.gameArtBibles`).toEqual(
        expect.arrayContaining(CURATED_ART_BIBLE_IDS),
      );
      expect(ids.gameArtBibles, `${locale}.gameArtBibles`).not.toEqual(
        expect.arrayContaining(RETIRED_ART_BIBLE_IDS),
      );
    }
  });

  it('labels the project gallery as games rather than designs in every locale', async () => {
    for (const locale of LOCALES) {
      const dict = await loadDict(locale);

      for (const key of PROJECT_GALLERY_VISIBLE_KEYS) {
        expect(dict[key], `${locale}.${key}`).not.toMatch(PROJECT_GALLERY_FORBIDDEN);
      }
    }
  });

  it('labels example scenarios as game-studio disciplines instead of business/design buckets', async () => {
    for (const locale of LOCALES) {
      const dict = await loadDict(locale);

      for (const key of EXAMPLE_SCENARIO_VISIBLE_KEYS) {
        expect(dict[key], `${locale}.${key}`).not.toMatch(EXAMPLE_SCENARIO_FORBIDDEN);
      }
    }
  });

  it('labels business connector buckets as game-studio disciplines in every locale', async () => {
    for (const locale of LOCALES) {
      const dict = await loadDict(locale);
      const expectedLabels = CONNECTOR_STUDIO_CATEGORY_LABELS_BY_LOCALE[locale];

      for (const key of CONNECTOR_BUSINESS_BUCKET_VISIBLE_KEYS) {
        expect(dict[key], `${locale}.${key}`).toBe(expectedLabels[key]);
      }
    }
  });

  it('keeps reviewed Settings operations controls localized instead of inheriting English', async () => {
    for (const locale of REVIEWED_SETTINGS_OPS_LOCALES) {
      const dict = await loadDict(locale);

      for (const key of REVIEWED_SETTINGS_OPS_KEYS) {
        expect(dict[key], `${locale}.${key}`).not.toBe(en[key]);
      }
    }
  });

  it('keeps reviewed connector category labels localized instead of inheriting English', async () => {
    for (const locale of REVIEWED_CONNECTOR_CATEGORY_LOCALES) {
      const dict = await loadDict(locale);

      for (const key of REVIEWED_CONNECTOR_CATEGORY_KEYS) {
        expect(dict[key], `${locale}.${key}`).not.toBe(en[key]);
      }
    }
  });

  it('keeps reviewed connector panel controls localized instead of inheriting English', async () => {
    for (const locale of REVIEWED_CONNECTOR_CATEGORY_LOCALES) {
      const dict = await loadDict(locale);

      for (const key of REVIEWED_CONNECTOR_PANEL_KEYS) {
        expect(dict[key], `${locale}.${key}`).not.toBe(en[key]);
      }
    }
  });

  it('localizes connector tool pagination controls without English fallbacks', async () => {
    for (const locale of LOCALES.filter((item) => item !== 'en')) {
      const dict = await loadDict(locale);

      for (const key of CONNECTOR_TOOL_PAGING_VISIBLE_KEYS) {
        expect(dict[key], `${locale}.${key}`).not.toBe(en[key]);
      }
    }
  });

  it('localizes visible tool action labels without English fallbacks', async () => {
    for (const locale of LOCALES.filter((item) => item !== 'en')) {
      const dict = await loadDict(locale);

      for (const key of TOOL_ACTION_VISIBLE_KEYS) {
        expect(dict[key], `${locale}.${key}`).not.toBe(en[key]);
      }
    }
  });

  it('keeps active workspace labels framed as game-studio work instead of generic design work', async () => {
    for (const locale of LOCALES) {
      const dict = await loadDict(locale);

      for (const key of ACTIVE_WORKSPACE_VISIBLE_KEYS) {
        expect(dict[key], `${locale}.${key}`).not.toMatch(ACTIVE_WORKSPACE_FORBIDDEN);
      }
    }
  });

  it('labels playable concept surfaces without generic prototype wording', async () => {
    for (const locale of LOCALES) {
      const dict = await loadDict(locale);

      for (const key of PLAYABLE_CONCEPT_VISIBLE_KEYS) {
        expect(dict[key], `${locale}.${key}`).not.toMatch(GENERIC_PROTOTYPE_FORBIDDEN);
      }
    }
  });

  it('localizes the New Project game-brief onboarding fields in every locale', async () => {
    for (const locale of LOCALES) {
      const dict = await loadDict(locale);
      const expectedValues = NEW_PROJECT_GAME_BRIEF_EXPECTED_ROWS[locale].split('|');
      expect(expectedValues, `${locale}.game brief expected values`).toHaveLength(
        NEW_PROJECT_GAME_BRIEF_VISIBLE_KEYS.length,
      );

      for (const [index, key] of NEW_PROJECT_GAME_BRIEF_VISIBLE_KEYS.entries()) {
        expect(dict[key], `${locale}.${key}`).toBe(expectedValues[index]);
      }
    }
  });

  it('localizes New Project media and connector guidance as game-studio onboarding', async () => {
    for (const locale of LOCALES) {
      const dict = await loadDict(locale);
      const expectedValues = NEW_PROJECT_MEDIA_CONNECTOR_EXPECTED_ROWS[locale].split('|');
      expect(expectedValues, `${locale}.media connector expected values`).toHaveLength(
        NEW_PROJECT_MEDIA_CONNECTOR_VISIBLE_KEYS.length,
      );

      for (const [index, key] of NEW_PROJECT_MEDIA_CONNECTOR_VISIBLE_KEYS.entries()) {
        expect(dict[key], `${locale}.${key}`).toBe(expectedValues[index]);
        expect(dict[key], `${locale}.${key} old generic artifact/media wording`).not.toMatch(
          NEW_PROJECT_MEDIA_CONNECTOR_FORBIDDEN,
        );
        if (locale !== 'en') {
          expect(dict[key], `${locale}.${key} English fallback`).not.toBe(en[key]);
        }
      }

      for (const key of NEW_PROJECT_CONNECTOR_VISIBLE_KEYS) {
        if (locale !== 'en') {
          expect(dict[key], `${locale}.${key} English fallback`).not.toBe(en[key]);
        }
      }
    }
  });

  it('keeps reviewed New Project front-door controls localized instead of inheriting English', async () => {
    for (const locale of REVIEWED_NEW_PROJECT_FRONT_DOOR_LOCALES) {
      const dict = await loadDict(locale);

      for (const key of REVIEWED_NEW_PROJECT_FRONT_DOOR_KEYS) {
        expect(dict[key], `${locale}.${key}`).not.toBe(en[key]);
      }
    }

    for (const [locale, keys] of Object.entries(REVIEWED_NEW_PROJECT_EXTRA_VISIBLE_KEYS) as Array<[Locale, ReadonlyArray<keyof Dict>]>) {
      const dict = await loadDict(locale);

      for (const key of keys) {
        expect(dict[key], `${locale}.${key}`).not.toBe(en[key]);
      }
    }
  });

  it('localizes residual New Project front-door controls without English fallbacks', async () => {
    for (const locale of LOCALES.filter((item) => item !== 'en')) {
      const dict = await loadDict(locale);

      for (const key of NEW_PROJECT_RESIDUAL_FRONT_DOOR_KEYS) {
        expect(dict[key], `${locale}.${key} English fallback`).not.toBe(en[key]);
      }
    }
  });

  it('localizes New Project live-ops center controls without English artifact wording', async () => {
    for (const locale of LOCALES.filter((item) => item !== 'en')) {
      const dict = await loadDict(locale);

      for (const key of NEW_PROJECT_LIVE_OPS_VISIBLE_KEYS) {
        expect(dict[key], `${locale}.${key} English fallback`).not.toBe(en[key]);
        expect(dict[key], `${locale}.${key} English artifact phrase`).not.toMatch(/live game artifact/i);
      }
    }
  });

  it('localizes core studio workspace surfaces without English fallbacks', async () => {
    for (const locale of LOCALES) {
      const dict = await loadDict(locale);
      const expectedValues = CORE_WORKSPACE_LOCALIZED_EXPECTED_ROWS[locale].split('|');
      expect(expectedValues, `${locale}.core workspace expected values`).toHaveLength(
        CORE_WORKSPACE_LOCALIZED_VISIBLE_KEYS.length,
      );

      for (const [index, key] of CORE_WORKSPACE_LOCALIZED_VISIBLE_KEYS.entries()) {
        expect(dict[key], `${locale}.${key}`).toBe(expectedValues[index]);
        if (locale !== 'en' && expectedValues[index] !== en[key]) {
          expect(dict[key], `${locale}.${key} English fallback`).not.toBe(en[key]);
        }
      }
    }
  });

  it('localizes workspace Game Files cross-links without English fallbacks', async () => {
    for (const locale of LOCALES) {
      const dict = await loadDict(locale);
      const expectedValues = WORKSPACE_GAME_FILES_LINK_EXPECTED_ROWS[locale].split('|');
      expect(expectedValues, `${locale}.workspace game files expected values`).toHaveLength(
        WORKSPACE_GAME_FILES_LINK_VISIBLE_KEYS.length,
      );

      for (const [index, key] of WORKSPACE_GAME_FILES_LINK_VISIBLE_KEYS.entries()) {
        expect(dict[key], `${locale}.${key}`).toBe(expectedValues[index]);
        if (locale !== 'en') {
          expect(dict[key], `${locale}.${key} English fallback`).not.toBe(en[key]);
        }
      }
    }
  });

  it('localizes project action toolbar and studio presence labels without English fallbacks', async () => {
    for (const locale of LOCALES.filter((item) => item !== 'en')) {
      const dict = await loadDict(locale);

      for (const key of PROJECT_ACTIONS_VISIBLE_KEYS) {
        expect(dict[key], `${locale}.${key} English fallback`).not.toBe(en[key]);
      }

      for (const key of PROJECT_PRESENCE_VISIBLE_KEYS) {
        expect(dict[key], `${locale}.${key} English fallback`).not.toBe(en[key]);
      }
    }
  });

  it('localizes workspace focus and chat toggle labels without English fallbacks', async () => {
    for (const locale of LOCALES) {
      const dict = await loadDict(locale);
      const expectedValues = WORKSPACE_CHROME_EXPECTED_ROWS[locale].split('|');
      expect(expectedValues, `${locale}.workspace chrome expected values`).toHaveLength(
        WORKSPACE_CHROME_VISIBLE_KEYS.length,
      );

      for (const [index, key] of WORKSPACE_CHROME_VISIBLE_KEYS.entries()) {
        expect(dict[key], `${locale}.${key}`).toBe(expectedValues[index]);
        if (locale !== 'en') {
          expect(dict[key], `${locale}.${key} English fallback`).not.toBe(en[key]);
        }
      }
    }
  });

  it('localizes the studio mode strip without English fallback copy', async () => {
    for (const locale of LOCALES.filter((item) => item !== 'en')) {
      const dict = await loadDict(locale);

      for (const key of STUDIO_MODE_STRIP_VISIBLE_KEYS) {
        expect(dict[key], `${locale}.${key} English fallback`).not.toBe(en[key]);
        expect(dict[key], `${locale}.${key} English phrase`).not.toMatch(
          STUDIO_MODE_STRIP_ENGLISH_FALLBACK_FORBIDDEN,
        );
      }
    }
  });

  it('localizes scheduled studio run controls without English fallback copy', async () => {
    for (const locale of LOCALES.filter((item) => item !== 'en')) {
      const dict = await loadDict(locale);

      for (const key of ROUTINES_SECTION_VISIBLE_KEYS) {
        expect(dict[key], `${locale}.${key} English fallback`).not.toBe(en[key]);
        expect(dict[key], `${locale}.${key} English phrase`).not.toMatch(
          ROUTINES_SECTION_ENGLISH_FALLBACK_FORBIDDEN,
        );
      }
    }
  });

  it('localizes the telemetry board without English fallback copy', async () => {
    for (const locale of LOCALES.filter((item) => item !== 'en')) {
      const dict = await loadDict(locale);

      for (const key of GAME_TELEMETRY_BOARD_VISIBLE_KEYS) {
        expect(dict[key], `${locale}.${key} English fallback`).not.toBe(en[key]);
        expect(dict[key], `${locale}.${key} English phrase`).not.toMatch(
          GAME_TELEMETRY_BOARD_ENGLISH_FALLBACK_FORBIDDEN,
        );
      }
    }
  });

  it('localizes studio document editor chrome without English fallbacks', async () => {
    for (const locale of LOCALES.filter((item) => item !== 'en')) {
      const dict = await loadDict(locale);

      for (const key of STUDIO_DOCUMENT_EDITOR_VISIBLE_KEYS) {
        expect(dict[key], `${locale}.${key} English fallback`).not.toBe(en[key]);
        expect(dict[key], `${locale}.${key} English phrase`).not.toMatch(
          STUDIO_DOCUMENT_EDITOR_ENGLISH_FALLBACK_FORBIDDEN,
        );
      }
    }
  });

  it('localizes manual game-surface editing guidance without English fallback text', async () => {
    for (const locale of LOCALES) {
      const dict = await loadDict(locale);
      expect(dict['manualEdit.empty'], `${locale}.manualEdit.empty`).toBe(
        MANUAL_EDIT_EMPTY_EXPECTED_BY_LOCALE[locale],
      );
      expect(dict['manualEdit.empty'], `${locale}.manualEdit.empty legacy wording`).not.toMatch(
        /Click an element in the preview/i,
      );
      if (locale !== 'en') {
        expect(dict['manualEdit.empty'], `${locale}.manualEdit.empty English fallback`).not.toBe(
          en['manualEdit.empty'],
        );
      }
    }
  });

  it('localizes manual editor controls instead of inheriting English control labels', async () => {
    for (const locale of LOCALES.filter((item) => item !== 'en')) {
      const dict = await loadDict(locale);

      for (const key of MANUAL_EDIT_LOCALIZED_VISIBLE_KEYS) {
        expect(dict[key], `${locale}.${key} English fallback phrase`).not.toMatch(
          MANUAL_EDIT_ENGLISH_FALLBACK_FORBIDDEN,
        );
      }
    }
  });

  it('localizes chat starter prompts without inherited English examples', async () => {
    for (const locale of LOCALES.filter((item) => item !== 'en')) {
      const dict = await loadDict(locale);

      expect(dict['chat.example2Tag'], `${locale}.chat.example2Tag`).toBe('HUD');

      for (const key of CHAT_STARTER_LOCALIZED_VISIBLE_KEYS) {
        expect(dict[key], `${locale}.${key} English fallback`).not.toBe(en[key]);
        expect(dict[key], `${locale}.${key} English phrase`).not.toMatch(
          CHAT_STARTER_ENGLISH_FALLBACK_FORBIDDEN,
        );
      }
    }
  });

  it('localizes studio review comment controls without English fallbacks', async () => {
    for (const locale of LOCALES.filter((item) => item !== 'en')) {
      const dict = await loadDict(locale);

      for (const key of CHAT_COMMENT_LOCALIZED_VISIBLE_KEYS) {
        expect(dict[key], `${locale}.${key} English fallback`).not.toBe(en[key]);
        expect(dict[key], `${locale}.${key} English phrase`).not.toMatch(CHAT_COMMENT_ENGLISH_FALLBACK_FORBIDDEN);
      }
    }
  });

  it('uses the preferred AGDS command name in visible CLI helper copy', async () => {
    for (const locale of LOCALES) {
      const dict = await loadDict(locale);

      for (const key of AGDS_COMMAND_VISIBLE_KEYS) {
        expect(dict[key], `${locale}.${key}`).toContain('AGDS');
        expect(dict[key], `${locale}.${key}`).not.toMatch(/\bOD\b|OD-Research|OD research/i);
        if (locale !== 'en') {
          expect(dict[key], `${locale}.${key} English fallback`).not.toBe(en[key]);
        }
      }
    }
  });

  it('localizes short residual studio labels without exact English fallback', async () => {
    for (const locale of LOCALES.filter((item) => item !== 'en')) {
      const dict = await loadDict(locale);

      for (const key of RESIDUAL_SHORT_UI_FALLBACK_VISIBLE_KEYS) {
        expect(dict[key], `${locale}.${key} English fallback`).not.toBe(en[key]);
      }
    }
  });

  it('keeps Indonesian connector settings copy translated instead of falling back to English', () => {
    const translatedKeys: Array<keyof Dict> = [
      'settings.connectorsNavHint',
      'settings.connectorsHint',
      'settings.connectorsComposioApiKey',
      'settings.connectorsSavedTitle',
      'settings.connectorsSaved',
      'settings.connectorsGetApiKey',
      'settings.connectorsApiKeyPlaceholder',
      'settings.connectorsClear',
      'settings.connectorsSaveKey',
      'settings.connectorsKeyError',
      'settings.connectorsHelpEmpty',
      'settings.connectorsLoadingSavedKey',
      'settings.autosaveSaving',
      'settings.autosaveSaved',
      'settings.autosaveError',
      'settings.orbit.eyebrow',
      'settings.orbit.navHint',
      'settings.orbit.lede',
      'settings.orbit.statusOnTitle',
      'settings.orbit.statusOffTitle',
      'settings.orbit.runTitle',
      'settings.orbit.running',
      'settings.orbit.runOpen',
      'settings.orbit.dailySummaryTitle',
      'settings.orbit.dailySummarySub',
      'settings.orbit.runTimeTitle',
      'settings.orbit.runTimeSub',
      'settings.orbit.nextRun',
      'settings.orbit.nextRunScheduledAfterSave',
      'settings.orbit.schedule',
      'settings.orbit.pausedManualOnly',
      'settings.orbit.templateTitle',
      'settings.orbit.templateMissing',
      'settings.orbit.templateMissingOption',
      'settings.orbit.templateMissingInstall',
      'settings.orbit.templateMissingPickAnother',
      'settings.orbit.templateResetTitle',
      'settings.orbit.templateReset',
      'settings.orbit.templateHelp',
      'settings.orbit.templatesLoading',
      'settings.orbit.templatesOptgroup',
      'settings.orbit.lastRun',
      'settings.orbit.countChecked',
      'settings.orbit.countSucceeded',
      'settings.orbit.countSkipped',
      'settings.orbit.countFailed',
      'settings.orbit.runError',
      'settings.orbit.artifactKickerLive',
    ];

    for (const key of translatedKeys) {
      expect(id[key], key).not.toBe(en[key]);
    }
  });

  it('declares CI-sensitive Indonesian fallback keys explicitly', () => {
    const explicitKeys = new Set(explicitLocaleKeys('id'));
    const requiredExplicitKeys = Object.keys(en).filter((key) => {
      return (
        key.startsWith('connectors.category.') ||
        key.startsWith('liveArtifact.refresh.') ||
        key.startsWith('liveArtifact.viewer.')
      );
    });

    expect(requiredExplicitKeys.filter((key) => !explicitKeys.has(key))).toEqual([]);
  });

  it('avoids brittle per-key English lookups in the Indonesian locale source', () => {
    const source = readFileSync(new URL('../../src/i18n/locales/id.ts', import.meta.url), 'utf8');

    expect(source).not.toMatch(/en\['(?:connectors\.category\.|liveArtifact\.(?:refresh|viewer)\.)/);
  });
});
