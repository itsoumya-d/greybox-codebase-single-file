import StyleDictionary from 'style-dictionary';

function flattenTokenValues(obj, prefix = []) {
  const out = {};
  for (const [key, value] of Object.entries(obj)) {
    if (value && typeof value === 'object' && 'value' in value) {
      out[[...prefix, key].join('-')] = value.value;
    } else if (value && typeof value === 'object') {
      Object.assign(out, flattenTokenValues(value, [...prefix, key]));
    }
  }
  return out;
}

StyleDictionary.registerFormat({
  name: 'greybox/tailwind',
  format({ dictionary }) {
    const colors = {};
    const spacing = {};
    const radius = {};
    const shadows = {};
    for (const token of dictionary.allTokens) {
      const key = token.path.slice(1).join('-');
      if (token.path[0] === 'color') colors[key] = token.value;
      if (token.path[0] === 'space') spacing[token.path[1]] = token.value;
      if (token.path[0] === 'radius') radius[token.path[1]] = token.value;
      if (token.path[0] === 'shadow') shadows[token.path[1]] = token.value;
    }
    return `export default ${JSON.stringify({ theme: { extend: { colors, spacing, borderRadius: radius, boxShadow: shadows } } }, null, 2)};\n`;
  },
});

StyleDictionary.registerFormat({
  name: 'greybox/figma',
  format({ dictionary }) {
    return JSON.stringify(dictionary.tokens, null, 2) + '\n';
  },
});

StyleDictionary.registerFormat({
  name: 'greybox/unity',
  format({ dictionary }) {
    const values = Object.fromEntries(dictionary.allTokens.map((token) => [token.name, token.value]));
    return `// Proprietary and confidential. Copyright (c) 2026 Greybox Studio.\nnamespace Greybox.Brand\n{\n    public static class GreyboxTokens\n    {\n${Object.entries(values).map(([key, value]) => `        public const string ${key.replace(/[^A-Za-z0-9_]/g, '_')} = ${JSON.stringify(String(value))};`).join('\n')}\n    }\n}\n`;
  },
});

StyleDictionary.registerFormat({
  name: 'greybox/unreal',
  format({ dictionary }) {
    return JSON.stringify({
      assetType: 'GreyboxTokenDataAsset',
      note: 'Textual source for GreyboxTokens.uasset import in Unreal.',
      tokens: flattenTokenValues(dictionary.tokens),
    }, null, 2) + '\n';
  },
});

export default {
  source: ['tokens/*.json'],
  platforms: {
    css: {
      transformGroup: 'css',
      buildPath: 'dist/css/',
      files: [{ destination: 'tokens.css', format: 'css/variables', options: { selector: ':root' } }],
    },
    tailwind: {
      transformGroup: 'js',
      buildPath: 'dist/tailwind/',
      files: [{ destination: 'tokens.js', format: 'greybox/tailwind' }],
    },
    figma: {
      transformGroup: 'js',
      buildPath: 'dist/figma/',
      files: [{ destination: 'tokens.json', format: 'greybox/figma' }],
    },
    unity: {
      transformGroup: 'js',
      buildPath: 'dist/unity/',
      files: [{ destination: 'GreyboxTokens.cs', format: 'greybox/unity' }],
    },
    unreal: {
      transformGroup: 'js',
      buildPath: 'dist/unreal/',
      files: [{ destination: 'GreyboxTokens.uasset', format: 'greybox/unreal' }],
    },
  },
};
