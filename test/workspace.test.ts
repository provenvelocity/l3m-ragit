import assert from 'node:assert/strict';
import test from 'node:test';
import { projectName, selectWorkspace, shouldObserve } from '../src/workspace.ts';

test('project identity follows absolute checkout path', () => {
  assert.notEqual(projectName('/work/a/repo'), projectName('/work/b/repo'));
  assert.equal(projectName('/work/a/repo'), projectName('/work/a/repo'));
});

test('filters generated index and dependency trees', () => {
  assert.equal(shouldObserve('/repo', '/repo/src/a.ts'), true);
  assert.equal(shouldObserve('/repo', '/repo/node_modules/a.js'), false);
  assert.equal(shouldObserve('/repo', '/repo/.codebase-memory/graph.db.zst'), false);
  assert.equal(shouldObserve('/repo', '/other/a.ts'), false);
});

test('requires explicit selection for ambiguous multi-root workspace', () => {
  const items = [{ root: '/a/repo', name: 'repo' }, { root: '/b/repo', name: 'repo' }];
  assert.throws(() => selectWorkspace(items, 'repo'), /unambiguous/);
  assert.equal(selectWorkspace(items, '/b/repo').root, '/b/repo');
});
