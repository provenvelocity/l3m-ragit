import assert from 'node:assert/strict';
import test from 'node:test';
import { IndexQueue } from '../src/indexQueue.ts';

test('coalesces changes and catches changes during indexing', async () => {
  let runs = 0;
  let release: (() => void) | undefined;
  const queue = new IndexQueue(async () => {
    runs++;
    if (runs === 1) await new Promise<void>(resolve => { release = resolve; });
  }, 10000);
  const flushing = queue.flush();
  await new Promise(resolve => setImmediate(resolve));
  queue.markChanged();
  queue.markChanged();
  release!();
  await flushing;
  assert.equal(runs, 2);
  assert.equal(queue.snapshot().phase, 'ready');
  assert.equal(queue.snapshot().indexedRevision, queue.snapshot().revision);
  queue.dispose();
});

test('failed indexing is never reported ready and can retry', async () => {
  let shouldFail = true;
  const queue = new IndexQueue(async () => {
    if (shouldFail) throw new Error('broken');
  }, 10000);
  await assert.rejects(queue.flush(), /broken/);
  assert.equal(queue.snapshot().phase, 'failed');
  shouldFail = false;
  await queue.flush();
  assert.equal(queue.snapshot().phase, 'ready');
  queue.dispose();
});
