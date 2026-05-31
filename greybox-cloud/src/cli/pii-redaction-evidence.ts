// Proprietary and confidential. Copyright (c) 2026 Greybox Studio.

import {
  buildPiiRedactionEvidenceDotenv,
  buildPiiRedactionEvidenceEnvJson,
  buildPiiRedactionEvidenceGithubEnv,
} from '../enterprise/piiRedactionEvidenceSource.js';

type EvidenceFormat = 'json' | 'dotenv' | 'github-env';

const format = parseFormat(process.argv.slice(2));

if (format === 'dotenv') {
  process.stdout.write(buildPiiRedactionEvidenceDotenv());
} else if (format === 'github-env') {
  process.stdout.write(buildPiiRedactionEvidenceGithubEnv());
} else {
  process.stdout.write(`${buildPiiRedactionEvidenceEnvJson()}\n`);
}

function parseFormat(args: string[]): EvidenceFormat {
  const formatFlag = args.find((arg) => arg.startsWith('--format='));
  const formatIndex = args.indexOf('--format');
  const formatValue = formatIndex >= 0 ? args[formatIndex + 1] : undefined;
  const format = formatFlag?.slice('--format='.length) ?? formatValue ?? 'json';
  if (formatIndex >= 0 && (!formatValue || formatValue.startsWith('--'))) {
    throw new Error('Missing value for --format. Use json, dotenv, or github-env.');
  }
  if (format === 'json' || format === 'dotenv' || format === 'github-env') return format;
  throw new Error('Unsupported format. Use --format=json, --format=dotenv, or --format=github-env.');
}
