// Curated metadata overrides for Composio toolkits.
//
// The Composio public toolkit list is long and the default description we
// used to ship (`Connect to <name> through Composio.`) is uninformative.
// This module hosts hand-written overrides for the most common toolkits so
// each connector card surfaces an accurate, category-specific description
// and a better category tag than the generic "Composio" bucket.
//
// Keep keys in sync with the slugs in DOCUMENTED_COMPOSIO_TOOLKITS. If a
// toolkit is missing from this map, composio.ts falls back to a neutral
// description generated from the display name.

export interface ComposioToolkitMetadata {
  /** Human-authored description tailored to the studio connector. */
  description: string;
  /** Preferred category tag for the connector card. */
  category: string;
  /** Snapshot count for first paint before live toolkit metadata loads. */
  toolCount?: number;
}

export const COMPOSIO_TOOLKIT_METADATA: Record<string, ComposioToolkitMetadata> = {
  // Developer tooling
  GITHUB: {
    description:
      'Browse repositories, read issues and pull requests, inspect commits, and search code across GitHub.',
    category: 'Developer',
    toolCount: 2,
  },
  GITLAB: {
    description:
      'Inspect GitLab projects, issues, merge requests, and pipelines for engineering workflows.',
    category: 'Developer',
  },
  BITBUCKET: {
    description:
      'Read Bitbucket repositories, pull requests, and pipelines to feed code-aware artifacts.',
    category: 'Developer',
  },
  LINEAR: {
    description:
      'Query Linear issues, projects, cycles, and teams to ground production plans in live studio data.',
    category: 'Production',
  },
  JIRA: {
    description:
      'Search Jira issues, sprints, epics, and boards to build milestone boards and production roadmaps.',
    category: 'Production',
  },
  CONFLUENCE: {
    description:
      'Search and read Confluence spaces and pages for internal documentation context.',
    category: 'Documentation',
  },
  SENTRY: {
    description:
      'Inspect Sentry issues, events, and release health to surface live-service incidents.',
    category: 'Observability',
  },
  DATADOG: {
    description:
      'Query Datadog monitors, metrics, and incidents for live-ops reliability boards.',
    category: 'Observability',
  },
  PAGERDUTY: {
    description:
      'Read PagerDuty incidents, services, and schedules to power live-ops incident runbooks.',
    category: 'Observability',
  },
  DATABRICKS: {
    description:
      'Access Databricks workspaces, clusters, and SQL warehouses for data-backed game design artifacts.',
    category: 'Data platform',
  },
  SNOWFLAKE: {
    description:
      'Run read-only queries against Snowflake warehouses to pull analytics into live game artifacts.',
    category: 'Data platform',
  },
  SUPABASE: {
    description:
      'Inspect Supabase projects, tables, and storage buckets for playable concepts grounded in real data.',
    category: 'Data platform',
  },
  CONVEX: {
    description: 'Query Convex tables and functions for realtime-backed live game artifacts.',
    category: 'Data platform',
  },
  PRISMA: {
    description: 'Inspect Prisma schema and data models for game-systems data models.',
    category: 'Developer',
  },
  PINECONE: {
    description: 'Query Pinecone indexes and namespaces for retrieval-augmented artifacts.',
    category: 'AI infrastructure',
  },
  DIGITAL_OCEAN: {
    description: 'Inspect DigitalOcean droplets, databases, and spaces for engine and service status boards.',
    category: 'Developer',
  },
  FLY: {
    description: 'Read Fly.io services, machines, and volumes to power engine and service status artifacts.',
    category: 'Developer',
  },
  APIFY_MCP: {
    description: 'Run Apify actors to scrape, crawl, and enrich data for game production artifacts.',
    category: 'Automation',
    toolCount: 8,
  },
  TAVILY_MCP: {
    description: 'Run Tavily web search and extraction for research-grounded game design artifacts.',
    category: 'Research',
  },
  GRANOLA_MCP: {
    description: 'Pull Granola meeting notes and summaries into production briefs.',
    category: 'Production',
  },
  TINYFISH_MCP: {
    description: 'Run TinyFish browsing agents to capture structured research data into game artifacts.',
    category: 'Automation',
  },

  // Production / docs
  NOTION: {
    description:
      'Search Notion pages and databases, read page content, and pull structured records into game artifacts.',
    category: 'Production',
    toolCount: 48,
  },
  GOOGLEDOCS: {
    description: 'Read Google Docs content and comments to source text for GDDs and live game artifacts.',
    category: 'Production',
  },
  GOOGLESHEETS: {
    description:
      'Read and search Google Sheets spreadsheets to power balance sheets, economy charts, and live-ops boards.',
    category: 'Spreadsheets',
  },
  EXCEL: {
    description:
      'Read Excel workbooks, worksheets, and ranges to pull numbers into balance and production artifacts.',
    category: 'Spreadsheets',
  },
  GOOGLESLIDES: {
    description: 'Read Google Slides presentations for reference in new decks.',
    category: 'Presentations',
  },
  GOOGLEDRIVE: {
    description: 'Search and read files and folders stored in Google Drive.',
    category: 'Storage',
    toolCount: 2,
  },
  DROPBOX: {
    description: 'Search and read files stored in Dropbox for document-grounded game artifacts.',
    category: 'Storage',
  },
  BOX: {
    description: 'Browse and read Box files and folders for studio document workflows.',
    category: 'Storage',
  },
  ONE_DRIVE: {
    description: 'Search and read files in OneDrive for Microsoft 365 document workflows.',
    category: 'Storage',
  },
  SHARE_POINT: {
    description: 'Browse SharePoint sites and lists to pull structured enterprise content.',
    category: 'Storage',
  },
  EGNYTE: {
    description: 'Read Egnyte folders and files for controlled production document workflows.',
    category: 'Storage',
  },
  GOOGLECALENDAR: {
    description: 'Read calendar events and availability from Google Calendar.',
    category: 'Calendar',
  },
  OUTLOOK: {
    description: 'Read Outlook mailboxes, calendars, and studio collaborator records for Microsoft 365 workflows.',
    category: 'Email',
  },
  GMAIL: {
    description: 'Search and read Gmail threads to surface inbox context in production artifacts.',
    category: 'Email',
  },
  GOOGLE_CHAT: {
    description: 'Read Google Chat spaces and messages for studio-comms grounded artifacts.',
    category: 'Communication',
  },
  SLACK: {
    description: 'Search Slack channels, read messages, and list studio members and channels.',
    category: 'Communication',
  },
  SLACKBOT: {
    description: 'Use a Slack bot identity to read channels and messages in a workspace.',
    category: 'Communication',
  },
  DISCORD: {
    description: 'Read Discord servers, channels, and messages for community and player-feedback analytics.',
    category: 'Communication',
  },
  DISCORDBOT: {
    description: 'Use a Discord bot identity to read servers, channels, and messages.',
    category: 'Communication',
  },
  MICROSOFT_TEAMS: {
    description: 'Read Microsoft Teams channels, chats, and meetings for studio context.',
    category: 'Communication',
  },
  WEBEX: {
    description: 'Read Webex rooms, messages, and meeting metadata.',
    category: 'Communication',
  },
  ZOOM: {
    description: 'Read Zoom meetings, recordings, and participant metadata.',
    category: 'Meetings',
  },
  GOOGLEMEET: {
    description: 'Read Google Meet meeting and participant metadata.',
    category: 'Meetings',
  },
  WHATSAPP: {
    description: 'Read WhatsApp Business conversations and message metadata.',
    category: 'Communication',
  },

  // Project mgmt / tasks / collaboration
  ASANA: {
    description: 'Query Asana projects, tasks, and teams for production delivery artifacts.',
    category: 'Production',
  },
  MONDAY: {
    description: 'Read monday.com boards, items, and updates.',
    category: 'Production',
  },
  MONDAY_MCP: {
    description: 'Run monday.com actions through the MCP integration.',
    category: 'Production',
  },
  CLICKUP: {
    description: 'Query ClickUp spaces, lists, and tasks for planning artifacts.',
    category: 'Production',
  },
  TRELLO: {
    description: 'Read Trello boards, lists, and cards for production-board artifacts.',
    category: 'Production',
  },
  BASECAMP: {
    description: 'Read Basecamp projects, todos, and messages.',
    category: 'Production',
  },
  WRIKE: {
    description: 'Query Wrike folders, tasks, and custom fields.',
    category: 'Production',
  },
  TODOIST: {
    description: 'Read Todoist projects and tasks for personal production artifacts.',
    category: 'Tasks',
  },
  TICKTICK: {
    description: 'Read TickTick lists and tasks for personal production artifacts.',
    category: 'Tasks',
  },
  DART: {
    description: 'Query Dart workspaces, tasks, and docs for engineering planning.',
    category: 'Production',
  },
  PRODUCTBOARD: {
    description: 'Read Productboard notes and roadmaps for game-mechanic prioritization.',
    category: 'Production',
  },
  GOOGLETASKS: {
    description: 'Read Google Tasks lists and tasks.',
    category: 'Tasks',
  },
  ROAM: {
    description: 'Read Roam Research graphs and pages for networked-note artifacts.',
    category: 'Documentation',
  },

  // Art direction / studio boards
  FIGMA: {
    description:
      'Read Figma files, canvases, frames, and game UI modules to reference real HUD and art-direction context.',
    category: 'Art direction',
  },
  MIRO: {
    description: 'Read Miro boards and sticky notes for level planning, systems mapping, and studio production artifacts.',
    category: 'Studio planning',
  },
  MURAL: {
    description: 'Read Mural boards and widgets for workshop-grounded game planning artifacts.',
    category: 'Studio planning',
  },
  CANVA: {
    description: 'Read Canva key art, pitch visuals, and game identity assets.',
    category: 'Art direction',
  },
  MATTERPORT: {
    description: 'Read Matterport spaces and captures for 3D environment, camera, and level-reference artifacts.',
    category: 'Art direction',
  },

  // Player community / publishing pipeline
  HUBSPOT: {
    description: 'Use HubSpot playtest groups, publishing partners, and player-support signals in game production artifacts.',
    category: 'Player community',
  },
  SALESFORCE: {
    description: 'Query Salesforce objects and reports for publishing, partner, or community planning.',
    category: 'Player community',
  },
  SALESFORCE_SERVICE_CLOUD: {
    description: 'Query Salesforce Service Cloud cases, accounts, and knowledge articles for player-support planning.',
    category: 'Player support',
  },
  PIPEDRIVE: {
    description: 'Read Pipedrive partner pipeline, outreach activity, and publishing status.',
    category: 'Player community',
  },
  ATTIO: {
    description: 'Query Attio lists, records, and attributes for modern community-ops workflows.',
    category: 'Player community',
  },
  CAPSULE_CRM: {
    description: 'Read Capsule community records, publishing opportunities, and studio follow-up tasks.',
    category: 'Player community',
  },
  KOMMO: {
    description: 'Read Kommo outreach groups, community records, and publishing pipelines.',
    category: 'Player community',
  },
  ZOHO: {
    description: 'Query Zoho community modules, records, and reports for game production planning.',
    category: 'Player community',
  },
  ZOHO_BIGIN: {
    description: 'Read Zoho Bigin partner pipelines, publishing opportunities, and community records.',
    category: 'Player community',
  },
  ZOHO_BOOKS: {
    description: 'Read Zoho Books budget records, accounts, and ledgers for production budgeting.',
    category: 'Production finance',
  },
  ZOHO_DESK: {
    description: 'Query Zoho Desk tickets, agents, and departments for player-support planning.',
    category: 'Player support',
  },
  ZOHO_INVENTORY: {
    description: 'Read Zoho Inventory items, merch activity, and warehouses.',
    category: 'Production finance',
  },
  ZOHO_INVOICE: {
    description: 'Read Zoho Invoice budget records and estimates for production budgeting.',
    category: 'Production finance',
  },
  ZOHO_MAIL: {
    description: 'Search Zoho Mail folders and messages.',
    category: 'Email',
  },
  FOLLOW_UP_BOSS: {
    description: 'Read Follow Up Boss partner records, publishing opportunities, and activity for studio pipeline planning.',
    category: 'Player community',
  },
  HIGHLEVEL: {
    description: 'Query HighLevel community records, publishing pipelines, and launch campaigns.',
    category: 'Player community',
  },
  PARMA: {
    description: 'Read Parma community relationships and interactions for studio planning.',
    category: 'Player community',
  },
  INSIGHTO_AI: {
    description: 'Read Insighto.ai voice agent conversations and analytics.',
    category: 'AI agents',
  },
  LEVER: {
    description: 'Query Lever opportunities, candidates, and postings.',
    category: 'Studio operations',
  },
  RECRUITEE: {
    description: 'Read Recruitee candidates, jobs, and pipelines.',
    category: 'Studio operations',
  },
  GONG: {
    description: 'Read Gong call recordings, transcripts, and publishing and partner insights.',
    category: 'Market intelligence',
  },

  // Player support
  INTERCOM: {
    description: 'Query Intercom player conversations, profiles, and support articles.',
    category: 'Player community',
  },
  ZENDESK: {
    description: 'Read Zendesk tickets, player profiles, and help center articles.',
    category: 'Player community',
  },
  GORGIAS: {
    description: 'Read Gorgias tickets and macros for player support planning.',
    category: 'Player community',
  },
  HELP_SCOUT: {
    description: 'Query Help Scout mailboxes and conversations for player support planning.',
    category: 'Player community',
  },
  SERVICENOW: {
    description: 'Read ServiceNow incidents, change requests, and operational records for studio support planning.',
    category: 'Studio operations',
  },
  FRESHBOOKS: {
    description: 'Read FreshBooks budget records, collaborators, and expenses.',
    category: 'Production finance',
  },

  // Production finance
  STRIPE: {
    description: 'Read Stripe charges, subscriptions, and payouts for store or live-service economy planning.',
    category: 'Production finance',
  },
  QUICKBOOKS: {
    description: 'Query QuickBooks budget records and accounts for production budgeting.',
    category: 'Production finance',
  },
  XERO: {
    description: 'Read Xero budget records, collaborator records, and ledgers.',
    category: 'Production finance',
  },
  NETSUITE: {
    description: 'Query NetSuite production records, saved searches, and budget reports.',
    category: 'Production finance',
  },
  RAMP: {
    description: 'Read Ramp transactions, cards, and vendors.',
    category: 'Production finance',
  },
  BREX: {
    description: 'Read Brex transactions, cards, and budgets.',
    category: 'Production finance',
  },
  RAZORPAY: {
    description: 'Read Razorpay store transactions, merch activity, and settlements.',
    category: 'Production finance',
  },
  MONEYBIRD: {
    description: 'Read Moneybird budget records, collaborator records, and administrations.',
    category: 'Production finance',
  },
  FREEAGENT: {
    description: 'Read FreeAgent budget records, expenses, and timeslips.',
    category: 'Production finance',
  },
  COUPA: {
    description: 'Read Coupa suppliers, budget records, and requisitions for production planning.',
    category: 'Production finance',
  },
  SPLITWISE: {
    description: 'Read Splitwise groups, expenses, and balances.',
    category: 'Production finance',
  },
  YNAB: {
    description: 'Read YNAB budgets, accounts, and transactions.',
    category: 'Production finance',
  },
  BEEMINDER: {
    description: 'Read Beeminder goals and datapoints.',
    category: 'Personal',
  },

  // Game campaigns / launch channels
  MAILCHIMP: {
    description: 'Read Mailchimp audiences, campaigns, and reports.',
    category: 'Game campaigns',
  },
  BREVO: {
    description: 'Read Brevo audience groups, campaigns, and SMS metrics.',
    category: 'Game campaigns',
  },
  KLAVIYO: {
    description: 'Read Klaviyo lists, segments, flows, and campaign metrics.',
    category: 'Game campaigns',
  },
  OMNISEND: {
    description: 'Read Omnisend campaigns, automations, and audiences.',
    category: 'Game campaigns',
  },
  SENDLOOP: {
    description: 'Read Sendloop lists and campaigns.',
    category: 'Game campaigns',
  },
  KIT: {
    description: 'Read Kit (ConvertKit) creator audiences, sequences, and broadcasts.',
    category: 'Game campaigns',
  },
  GOOGLEADS: {
    description: 'Read Google Ads campaigns, ad groups, and performance reports.',
    category: 'Game campaigns',
  },
  METAADS: {
    description: 'Read Meta (Facebook/Instagram) Ads campaigns and insights.',
    category: 'Game campaigns',
  },
  REDDIT_ADS: {
    description: 'Read Reddit Ads campaigns and performance.',
    category: 'Game campaigns',
  },
  LINKEDIN_ADS: {
    description: 'Read LinkedIn Ads campaigns, creatives, and analytics.',
    category: 'Game campaigns',
  },
  GOOGLE_ANALYTICS: {
    description: 'Query Google Analytics 4 reports, metrics, and audiences.',
    category: 'Telemetry',
  },
  GOOGLE_SEARCH_CONSOLE: {
    description: 'Query Google Search Console pages, queries, and performance metrics.',
    category: 'Telemetry',
  },
  GOOGLEBIGQUERY: {
    description: 'Run read-only BigQuery SQL for analytics-grounded artifacts.',
    category: 'Telemetry',
  },

  // Community channels
  LINKEDIN: {
    description: 'Read LinkedIn studio profiles, posts, and company pages.',
    category: 'Player community',
  },
  TWITTER: {
    description: 'Read Twitter/X timelines, posts, creator profiles, and searches.',
    category: 'Player community',
    toolCount: 72,
  },
  FACEBOOK: {
    description: 'Read Facebook pages, posts, and insights.',
    category: 'Player community',
  },
  INSTAGRAM: {
    description: 'Read Instagram media, profiles, and insights.',
    category: 'Player community',
  },
  REDDIT: {
    description: 'Read Reddit subreddits, posts, and comments.',
    category: 'Player community',
  },
  TIKTOK: {
    description: 'Read TikTok videos, profiles, and analytics.',
    category: 'Player community',
  },
  SNAPCHAT: {
    description: 'Read Snapchat Ads Manager campaigns and audience insights.',
    category: 'Game campaigns',
  },
  YOUTUBE: {
    description: 'Read YouTube channels, videos, comments, and analytics.',
    category: 'Video',
  },
  SPOTIFY: {
    description: 'Read Spotify playlists, tracks, and listener metadata.',
    category: 'Media',
  },
  STRAVA: {
    description: 'Read Strava activities, athletes, and segments.',
    category: 'Fitness',
  },
  GUMROAD: {
    description: 'Read Gumroad releases, revenue signals, and audience data for indie launch planning.',
    category: 'Production finance',
  },
  DUB: {
    description: 'Read Dub links, domains, and analytics.',
    category: 'Game campaigns',
  },
  EVENTBRITE: {
    description: 'Read Eventbrite events, attendees, and ticketing signals.',
    category: 'Events',
  },
  TICKETMASTER: {
    description: 'Read Ticketmaster events, venues, and attractions.',
    category: 'Events',
  },
  EPIC_GAMES: {
    description: 'Read Epic Games store and developer portal data.',
    category: 'Gaming',
  },

  // Studio operations / team
  BAMBOOHR: {
    description: 'Read BambooHR studio team members, time off, and directories.',
    category: 'Studio operations',
  },
  GUSTO: {
    description: 'Read Gusto studio team records, payroll runs, and benefits.',
    category: 'Studio operations',
  },

  // Scheduling / signing
  CAL: {
    description: 'Read Cal.com event types, bookings, and availability.',
    category: 'Scheduling',
  },
  CALENDLY: {
    description: 'Read Calendly event types, bookings, and participants.',
    category: 'Scheduling',
  },
  SCHEDULEONCE: {
    description: 'Read ScheduleOnce bookings, calendars, and event types.',
    category: 'Scheduling',
  },
  CLOCKIFY: {
    description: 'Read Clockify time entries, projects, and reports.',
    category: 'Time tracking',
    toolCount: 75,
  },
  HARVEST: {
    description: 'Read Harvest time entries, projects, and production budget records.',
    category: 'Time tracking',
  },
  TIMELY: {
    description: 'Read Timely time entries and memories.',
    category: 'Time tracking',
  },
  WAKATIME: {
    description: 'Read WakaTime coding time, languages, and projects.',
    category: 'Time tracking',
  },
  FATHOM: {
    description: 'Read Fathom call recordings and summaries.',
    category: 'Meetings',
  },
  DIALPAD: {
    description: 'Read Dialpad calls, studio collaborators, and rooms.',
    category: 'Communication',
  },
  DOCUSIGN: {
    description: 'Read DocuSign envelopes, signers, and templates.',
    category: 'Signing',
  },
  DROPBOX_SIGN: {
    description: 'Read Dropbox Sign (HelloSign) signature requests and templates.',
    category: 'Signing',
  },
  BOLDSIGN: {
    description: 'Read BoldSign envelopes, templates, and signers.',
    category: 'Signing',
  },

  // Playtest feedback
  TYPEFORM: {
    description: 'Read Typeform playtest surveys, responses, and analytics.',
    category: 'Playtest feedback',
  },
  TALLY: {
    description: 'Read Tally playtest surveys and submissions.',
    category: 'Playtest feedback',
  },
  GOOGLEFORMS: {
    description: 'Read Google Forms playtest responses.',
    category: 'Playtest feedback',
  },
  SURVEY_MONKEY: {
    description: 'Read SurveyMonkey surveys and responses.',
    category: 'Playtest feedback',
  },

  // Game content / data stores
  AIRTABLE: {
    description: 'Query Airtable bases, tables, and records for structured game production artifacts.',
    category: 'Database',
    toolCount: 25,
  },
  CONTENTFUL: {
    description: 'Read Contentful lore entries, content types, and media assets.',
    category: 'Game content',
  },
  STORYBLOK: {
    description: 'Read Storyblok narrative entries, spaces, and content blocks.',
    category: 'Game content',
  },
  WEBFLOW: {
    description: 'Read Webflow collections and content items for launch-reference artifacts.',
    category: 'Game campaigns',
  },
  SHOPIFY: {
    description: 'Read Shopify store items, merch activity, and audience data for creator-store planning.',
    category: 'Production finance',
  },
  SQUARE: {
    description: 'Read Square store transactions, catalog, and locations.',
    category: 'Production finance',
  },
  SHIPPO: {
    description: 'Read Shippo shipments, tracking, and labels.',
    category: 'Logistics',
  },
  LODGIFY: {
    description: 'Read Lodgify properties, bookings, and rates.',
    category: 'Hospitality',
  },
  SERVICEM8: {
    description: 'Read ServiceM8 jobs, staff, and field-service records for studio operations.',
    category: 'Studio operations',
  },

  // Education / LMS / knowledge
  CANVAS: {
    description: 'Read Canvas LMS courses, assignments, and submissions.',
    category: 'Education',
    toolCount: 574,
  },
  D2LBRIGHTSPACE: {
    description: 'Read D2L Brightspace courses, enrollments, and gradebooks.',
    category: 'Education',
  },
  GOOGLE_CLASSROOM: {
    description: 'Read Google Classroom courses, coursework, and rosters.',
    category: 'Education',
  },
  BLACKBOARD: {
    description: 'Read Blackboard courses, assignments, and learner records.',
    category: 'Education',
  },
  BLACKBAUD: {
    description: 'Read Blackbaud constituents, gifts, and campaigns.',
    category: 'Nonprofit',
  },
  CROWDIN: {
    description: 'Read Crowdin projects, strings, and translations.',
    category: 'Localization',
  },
  HUGGING_FACE: {
    description: 'Read Hugging Face models, datasets, and spaces metadata.',
    category: 'AI infrastructure',
  },
  YANDEX: {
    description: 'Query Yandex services such as search and translate.',
    category: 'Search',
  },
  GOOGLE_MAPS: {
    description: 'Query Google Maps places, routes, and geocoding.',
    category: 'Maps',
  },
  GOOGLEPHOTOS: {
    description: 'Read Google Photos albums and media metadata.',
    category: 'Media',
  },
  GOOGLECONTACTS: {
    description: 'Read Google Contacts collaborator records and groups.',
    category: 'Player community',
  },
  GOOGLE_ADMIN: {
    description: 'Read Google Workspace studio directory, members, and groups.',
    category: 'Studio operations',
  },
  GOOGLESUPER: {
    description: 'Unified Google Workspace access across Gmail, Drive, Calendar, and Docs.',
    category: 'Production',
  },

  // Security / misc
  BITWARDEN: {
    description: 'Read Bitwarden organization vaults and metadata (no secret values).',
    category: 'Security',
  },
  BORNEO: {
    description: 'Read Borneo data discovery findings and policies.',
    category: 'Security',
  },
  APALEO: {
    description: 'Read Apaleo property, reservation, and folio data for hospitality workflows.',
    category: 'Hospitality',
  },
  EXIST: {
    description: 'Read Exist personal analytics and correlations.',
    category: 'Personal',
  },
  PUSHBULLET: {
    description: 'Read Pushbullet pushes and devices.',
    category: 'Personal',
  },
  STACK_EXCHANGE: {
    description: 'Search Stack Exchange questions, answers, and tags across sites.',
    category: 'Research',
  },
  LINKHUT: {
    description: 'Read Linkhut bookmarks and tags.',
    category: 'Personal',
  },
  ZOOMINFO: {
    description: 'Query ZoomInfo companies, partner records, and intent signals for publishing research.',
    category: 'Market intelligence',
  },
  TONEDEN: {
    description: 'Read ToneDen campaigns and audiences for soundtrack, trailer, and launch planning.',
    category: 'Game campaigns',
  },
};

/**
 * Resolve curated metadata for a toolkit slug. Returns undefined when the
 * toolkit has not been manually described yet — callers should fall back
 * to a generic description in that case.
 */
export function getComposioToolkitMetadata(slug: string): ComposioToolkitMetadata | undefined {
  return COMPOSIO_TOOLKIT_METADATA[slug];
}
