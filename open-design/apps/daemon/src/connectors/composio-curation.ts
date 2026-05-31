import type { ConnectorToolCuration } from './catalog.js';

const STUDIO_PULSE_CURATION: ConnectorToolCuration = {
  useCases: ['personal_daily_digest'],
};

export const COMPOSIO_CURATION_OVERLAY: Readonly<Record<string, Readonly<Record<string, ConnectorToolCuration>>>> = {
  gmail: {
    gmail_fetch_recent_emails: { ...STUDIO_PULSE_CURATION, reason: 'Recent inbox activity is useful for a studio pulse.' },
    gmail_search_emails: { ...STUDIO_PULSE_CURATION, reason: 'Bounded email search can summarize recent studio activity.' },
  },
  googlecalendar: {
    googlecalendar_list_events: { ...STUDIO_PULSE_CURATION, reason: 'Upcoming and recent calendar events fit a studio briefing.' },
    googlecalendar_get_events: { ...STUDIO_PULSE_CURATION, reason: 'Calendar event retrieval supports recent schedule summaries.' },
  },
  googledrive: {
    googledrive_search: { ...STUDIO_PULSE_CURATION, reason: 'Drive search can surface recently changed personal files.' },
    googledrive_get_file: { ...STUDIO_PULSE_CURATION, reason: 'File metadata helps summarize recent document changes.' },
    googledrive_list_files: { ...STUDIO_PULSE_CURATION, reason: 'File listings can be bounded to recent creator file activity.' },
    googledrive_list_changes: { ...STUDIO_PULSE_CURATION, reason: 'Recent Drive changes are a strong studio pulse source.' },
  },
  googledocs: {
    googledocs_list_documents: { ...STUDIO_PULSE_CURATION, reason: 'Recent document listings support studio work recaps.' },
    googledocs_get_document: { ...STUDIO_PULSE_CURATION, reason: 'Document metadata can summarize recent creator-authored docs.' },
    googledocs_search_documents: { ...STUDIO_PULSE_CURATION, reason: 'Bounded document search is useful for a studio pulse.' },
  },
  googlesheets: {
    googlesheets_list_spreadsheets: { ...STUDIO_PULSE_CURATION, reason: 'Recent spreadsheet activity fits a studio recap.' },
    googlesheets_get_spreadsheet: { ...STUDIO_PULSE_CURATION, reason: 'Spreadsheet metadata can summarize recent creator changes.' },
    googlesheets_search_spreadsheets: { ...STUDIO_PULSE_CURATION, reason: 'Bounded spreadsheet search helps find recent activity.' },
  },
  slack: {
    slack_list_channels: { ...STUDIO_PULSE_CURATION, reason: 'Conversation discovery is useful when selecting recent message sources.' },
    slack_list_conversations: { ...STUDIO_PULSE_CURATION, reason: 'Conversation discovery is useful when selecting recent message sources.' },
    slack_get_channel_history: { ...STUDIO_PULSE_CURATION, reason: 'Recent Slack history is useful for a studio pulse.' },
    slack_fetch_conversation_history: { ...STUDIO_PULSE_CURATION, reason: 'Recent Slack history is useful for a studio pulse.' },
    slack_search_messages: { ...STUDIO_PULSE_CURATION, reason: 'Bounded Slack message search can surface recent studio activity.' },
    slack_list_messages: { ...STUDIO_PULSE_CURATION, reason: 'Recent Slack messages are suitable for a studio pulse.' },
  },
  github: {
    github_get_issue: { ...STUDIO_PULSE_CURATION, reason: 'Repo-scoped issue detail supports a studio pulse.' },
    github_list_pull_requests: { ...STUDIO_PULSE_CURATION, reason: 'Repo-scoped PR listing fits a studio pulse when bounded to owned repos.' },
    github_get_pull_request: { ...STUDIO_PULSE_CURATION, reason: 'PR detail is studio-pulse-friendly and repo-scoped.' },
    github_list_issues: { ...STUDIO_PULSE_CURATION, reason: 'Repo-scoped issue listing fits a studio pulse when bounded.' },
    github_list_notifications: { ...STUDIO_PULSE_CURATION, reason: 'Authenticated-account notifications are directly studio-pulse-relevant.' },
    github_list_events: { ...STUDIO_PULSE_CURATION, reason: 'Recent repo/account events can support a studio pulse when bounded.' },
    github_list_commits: { ...STUDIO_PULSE_CURATION, reason: 'Repo-scoped commit history is studio-pulse-friendly.' },
  },
  notion: {
    notion_search: { ...STUDIO_PULSE_CURATION, reason: 'Searching Notion pages and databases is useful for a studio recap.' },
    notion_fetch_database: { ...STUDIO_PULSE_CURATION, reason: 'Database reads can summarize recent tasks and notes.' },
    notion_query_database: { ...STUDIO_PULSE_CURATION, reason: 'Database queries support recent activity summaries.' },
  },
  linear: {
    linear_list_issues: { ...STUDIO_PULSE_CURATION, reason: 'Recent issue updates are useful in a studio pulse.' },
    linear_get_issue: { ...STUDIO_PULSE_CURATION, reason: 'Issue detail supports a concise task recap.' },
    linear_search_issues: { ...STUDIO_PULSE_CURATION, reason: 'Bounded issue search can surface current work.' },
  },
  jira: {
    jira_get_issue: { ...STUDIO_PULSE_CURATION, reason: 'Issue detail is useful for studio work summaries.' },
    jira_search_issues: { ...STUDIO_PULSE_CURATION, reason: 'Bounded issue search can surface recent assigned work.' },
    jira_list_issues: { ...STUDIO_PULSE_CURATION, reason: 'Recent issues are suitable for a studio pulse.' },
  },
  asana: {
    asana_get_tasks: { ...STUDIO_PULSE_CURATION, reason: 'Recent task activity is useful for a studio pulse.' },
    asana_list_tasks: { ...STUDIO_PULSE_CURATION, reason: 'Recent task activity is useful for a studio pulse.' },
    asana_search_tasks: { ...STUDIO_PULSE_CURATION, reason: 'Bounded task search can surface current work.' },
  },
  todoist: {
    todoist_get_tasks: { ...STUDIO_PULSE_CURATION, reason: 'Task lists are a natural studio pulse source.' },
    todoist_list_tasks: { ...STUDIO_PULSE_CURATION, reason: 'Task lists are a natural studio pulse source.' },
  },
  googletasks: {
    googletasks_list_tasks: { ...STUDIO_PULSE_CURATION, reason: 'Recent Google Tasks activity fits a studio pulse.' },
    googletasks_get_tasks: { ...STUDIO_PULSE_CURATION, reason: 'Recent Google Tasks activity fits a studio pulse.' },
  },
  outlook: {
    outlook_list_messages: { ...STUDIO_PULSE_CURATION, reason: 'Recent Outlook email activity is useful for a studio pulse.' },
    outlook_search_emails: { ...STUDIO_PULSE_CURATION, reason: 'Bounded Outlook mail search can surface recent activity.' },
    outlook_list_events: { ...STUDIO_PULSE_CURATION, reason: 'Recent Outlook calendar events fit a studio briefing.' },
  },
  microsoftteams: {
    microsoftteams_list_messages: { ...STUDIO_PULSE_CURATION, reason: 'Recent Teams messages are useful for a studio pulse.' },
    microsoftteams_get_messages: { ...STUDIO_PULSE_CURATION, reason: 'Recent Teams messages are useful for a studio pulse.' },
    microsoftteams_search_messages: { ...STUDIO_PULSE_CURATION, reason: 'Bounded Teams search can surface recent conversation activity.' },
  },
  discord: {
    discord_list_messages: { ...STUDIO_PULSE_CURATION, reason: 'Recent Discord messages can contribute to a studio pulse.' },
    discord_get_messages: { ...STUDIO_PULSE_CURATION, reason: 'Recent Discord messages can contribute to a studio pulse.' },
    discord_search_messages: { ...STUDIO_PULSE_CURATION, reason: 'Bounded Discord search can surface recent conversation activity.' },
  },
  figma: {
    figma_get_file: { ...STUDIO_PULSE_CURATION, reason: 'Recent file activity is useful in an art-direction pulse.' },
    figma_list_files: { ...STUDIO_PULSE_CURATION, reason: 'Recent file activity is useful in an art-direction pulse.' },
    figma_get_comments: { ...STUDIO_PULSE_CURATION, reason: 'Comment activity highlights review work for the day.' },
  },
  sentry: {
    sentry_list_issues: { ...STUDIO_PULSE_CURATION, reason: 'Recent issues are strong operational studio-pulse material.' },
    sentry_get_issue: { ...STUDIO_PULSE_CURATION, reason: 'Issue detail supports concise operational summaries.' },
    sentry_list_events: { ...STUDIO_PULSE_CURATION, reason: 'Recent events fit an engineering studio pulse.' },
  },
  gitlab: {
    gitlab_list_merge_requests: { ...STUDIO_PULSE_CURATION, reason: 'Recent merge requests fit a studio pulse.' },
    gitlab_get_merge_request: { ...STUDIO_PULSE_CURATION, reason: 'Merge request detail supports concise summaries.' },
    gitlab_list_issues: { ...STUDIO_PULSE_CURATION, reason: 'Recent issue activity is suitable for a studio pulse.' },
    gitlab_list_commits: { ...STUDIO_PULSE_CURATION, reason: 'Recent commits are useful for a studio pulse.' },
  },
  clickup: {
    clickup_get_tasks: { ...STUDIO_PULSE_CURATION, reason: 'Task activity is useful for a studio recap.' },
    clickup_list_tasks: { ...STUDIO_PULSE_CURATION, reason: 'Task activity is useful for a studio recap.' },
  },
  trello: {
    trello_get_cards: { ...STUDIO_PULSE_CURATION, reason: 'Card activity is suitable for a studio pulse.' },
    trello_list_cards: { ...STUDIO_PULSE_CURATION, reason: 'Card activity is suitable for a studio pulse.' },
    trello_search_cards: { ...STUDIO_PULSE_CURATION, reason: 'Bounded card search can surface current work.' },
  },
  hubspot: {
    hubspot_list_contacts: { ...STUDIO_PULSE_CURATION, reason: 'Recent community or partner activity may be useful for studio pulses.' },
    hubspot_list_deals: { ...STUDIO_PULSE_CURATION, reason: 'Recent publishing pipeline activity may be useful for studio pulses.' },
    hubspot_list_activities: { ...STUDIO_PULSE_CURATION, reason: 'Recent community pipeline activity can support a studio pulse.' },
  },
};
