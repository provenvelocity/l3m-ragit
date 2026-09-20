import assert from 'node:assert/strict';
import test from 'node:test';
import { decodeResult, qualifiedNames, runProcess } from '../src/backend.ts';

test('decodes a successful MCP result', () => {
  const result = decodeResult('{"content":[{"type":"text","text":"ok"}]}');
  assert.equal(result.content[0].text, 'ok');
});

test('rejects backend MCP errors', () => {
  assert.throws(() => decodeResult('{"content":[{"type":"text","text":"bad"}],"isError":true}'), /bad/);
});

test('extracts qualified names from exact and semantic tables', () => {
  const result = decodeResult(JSON.stringify({
    content: [{ type: 'text', text: 'ok' }],
    structuredContent: {
      cols: ['qn', 'label'], rows: [['project.first', 'Function']],
      semantic: { cols: ['qn', 'score'], rows: [['project.second', 0.9]] },
    },
  }));
  assert.deepEqual(qualifiedNames(result), ['project.first', 'project.second']);
});

test('passes arguments without shell evaluation', async () => {
  const value = 'literal $(uname) `uname` ; value';
  const output = await runProcess(process.execPath, ['-e', 'process.stdout.write(process.argv[1])', value], undefined,
    { cwd: process.cwd(), timeoutMs: 5000 });
  assert.equal(output, value);
});
