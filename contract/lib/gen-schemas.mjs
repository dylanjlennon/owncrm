// Regenerates schemas.mjs from the JSON Schema files, which are the source of truth.
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const dir = join(dirname(fileURLToPath(import.meta.url)), '..', 'schema');
const out = {};
for (const f of readdirSync(dir).filter((x) => x.endsWith('.schema.json')).sort()) out[f.replace('.schema.json', '')] = JSON.parse(readFileSync(join(dir, f), 'utf8'));
writeFileSync(join(dirname(fileURLToPath(import.meta.url)), 'schemas.mjs'),
  '// Generated from contract/schema/*.schema.json by `npm run contract:schemas`. Do not edit by hand.\n// A test checks that this file and the JSON files say the same thing.\nexport const SCHEMAS = ' + JSON.stringify(out, null, 2) + ';\n');
console.log('schemas.mjs written');
