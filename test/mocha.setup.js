// Run TypeScript tests through ts-node without type checking (`npm run check` does that).
process.env.TS_NODE_PROJECT = 'tsconfig.json';
process.env.TS_NODE_TRANSPILE_ONLY = 'true';
require('ts-node/register');
