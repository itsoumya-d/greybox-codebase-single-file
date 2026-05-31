import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');

async function readJson(rel) {
  return JSON.parse(await readFile(path.join(root, rel), 'utf8'));
}

function flattenLeaves(input, prefix = []) {
  const out = [];
  for (const [key, value] of Object.entries(input)) {
    if (value && typeof value === 'object' && 'value' in value) {
      if (value.value && typeof value.value === 'object' && !Array.isArray(value.value)) {
        for (const [childKey, childValue] of Object.entries(value.value)) {
          out.push({ path: [...prefix, key, childKey], value: childValue });
        }
      } else {
        out.push({ path: [...prefix, key], value: value.value });
      }
    } else if (value && typeof value === 'object') {
      out.push(...flattenLeaves(value, [...prefix, key]));
    }
  }
  return out;
}

function cssVarName(parts) {
  return `--gb-${parts.join('-')}`;
}

function cssValue(value) {
  if (typeof value === 'string') return value;
  if (typeof value === 'number') return String(value);
  if (value && typeof value === 'object') {
    return Object.entries(value)
      .map(([key, child]) => `${key}:${child}`)
      .join(';');
  }
  return String(value);
}

function jsKey(parts) {
  return parts.slice(1).join('-');
}

function csName(parts) {
  return parts
    .join('_')
    .replace(/[^A-Za-z0-9_]/g, '_')
    .replace(/^([0-9])/, '_$1')
    .toUpperCase();
}

function nestObject(tokens) {
  const rootObject = {};
  for (const token of tokens) {
    let cursor = rootObject;
    for (const part of token.path.slice(0, -1)) {
      cursor[part] ??= {};
      cursor = cursor[part];
    }
    cursor[token.path.at(-1)] = token.value;
  }
  return rootObject;
}

async function write(rel, content) {
  const target = path.join(root, rel);
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, content, 'utf8');
}

const tokenFiles = ['tokens/color.json', 'tokens/type.json', 'tokens/space.json', 'tokens/radius.json', 'tokens/shadow.json'];
const merged = {};
for (const file of tokenFiles) Object.assign(merged, await readJson(file));
const tokens = flattenLeaves(merged);

const css = [
  '/* Proprietary and confidential. Copyright (c) 2026 Greybox Studio. */',
  ':root {',
  ...tokens.map((token) => `  ${cssVarName(token.path)}: ${cssValue(token.value)};`),
  '}',
  '',
].join('\n');
await write('dist/css/tokens.css', css);

const tailwind = {
  theme: {
    extend: {
      colors: Object.fromEntries(tokens.filter((token) => token.path[0] === 'color').map((token) => [jsKey(token.path), token.value])),
      spacing: Object.fromEntries(tokens.filter((token) => token.path[0] === 'space').map((token) => [token.path[1], token.value])),
      borderRadius: Object.fromEntries(tokens.filter((token) => token.path[0] === 'radius').map((token) => [token.path[1], token.value])),
      boxShadow: Object.fromEntries(tokens.filter((token) => token.path[0] === 'shadow').map((token) => [token.path[1], token.value])),
      fontFamily: Object.fromEntries(tokens.filter((token) => token.path[0] === 'type' && token.path[1] === 'family').map((token) => [token.path[2], token.value])),
    },
  },
};
await write('dist/tailwind/tokens.js', `export default ${JSON.stringify(tailwind, null, 2)};\n`);

await write('dist/figma/tokens.json', JSON.stringify(nestObject(tokens), null, 2) + '\n');

const unityLines = [
  '// Proprietary and confidential. Copyright (c) 2026 Greybox Studio.',
  'namespace Greybox.Brand',
  '{',
  '    public static class GreyboxTokens',
  '    {',
  ...tokens.map((token) => `        public const string ${csName(token.path)} = ${JSON.stringify(cssValue(token.value))};`),
  '    }',
  '}',
  '',
];
await write('dist/unity/GreyboxTokens.cs', unityLines.join('\n'));

await write('dist/unreal/GreyboxTokens.uasset', JSON.stringify({
  assetType: 'GreyboxTokenDataAsset',
  format: 'json-source-for-uasset-import',
  tokens: Object.fromEntries(tokens.map((token) => [token.path.join('.'), token.value])),
}, null, 2) + '\n');

console.log(`built ${tokens.length} Greybox tokens`);
