import { mkdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const executable = process.env.CBM_TEST_BINARY;
if (!executable) throw new Error('Set CBM_TEST_BINARY to a codebase-memory-mcp executable.');
const prefixArgs = process.env.CBM_TEST_LAUNCHER ? [resolve(process.env.CBM_TEST_LAUNCHER)] : [];
const root = resolve('.test-work/backend-smoke');
const cache = resolve('.test-work/cbm-cache');
await mkdir(join(root, 'src'), { recursive: true });
await mkdir(cache, { recursive: true });
await writeFile(join(root, 'src', 'math.ts'), 'export function add(left: number, right: number) { return left + right; }\n');
await writeFile(join(root, 'package.json'), '{"name":"ragit-backend-smoke"}\n');

function tool(name, args) {
  const result = spawnSync(executable, [...prefixArgs, 'cli', '--quiet', '--json', name], {
    cwd: root, input: JSON.stringify(args), encoding: 'utf8', timeout: 120000,
    env: { ...process.env, CBM_ALLOWED_ROOT: root, CBM_CACHE_DIR: cache },
  });
  if (result.status !== 0) throw new Error(`${name} failed: ${result.stderr}`);
  const envelope = JSON.parse(result.stdout);
  if (envelope.isError) throw new Error(`${name} returned an error: ${JSON.stringify(envelope)}`);
  return envelope.content.map(part => part.text ?? '').join('\n');
}

const project = 'ragit-backend-smoke';
const indexed = tool('index_repository', { repo_path: root, name: project, mode: 'full', persistence: false });
if (!indexed.includes('indexed') && !indexed.includes('status')) throw new Error(`Unexpected index response: ${indexed}`);
const searched = tool('search_graph', { project, query: 'add', limit: 10, format: 'tree' });
if (!searched.includes('add')) throw new Error(`Search did not find add(): ${searched}`);
const source = tool('get_code_snippet', { project, qualified_name: `${project}.src.math.add`, source_mode: 'full', format: 'tree' });
if (!source.includes('left + right')) throw new Error(`Source retrieval did not return the function body: ${source}`);
console.log('backend smoke passed');
