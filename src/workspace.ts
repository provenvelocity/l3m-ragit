import { createHash } from 'node:crypto';
import path from 'node:path';

export function projectName(root: string): string {
  return `ragit-${createHash('sha256').update(root).digest('hex').slice(0, 24)}`;
}

const SKIP = new Set(['.git', 'node_modules', '.codebase-memory', '.worktrees', '.claude-worktrees']);
export function shouldObserve(root: string, file: string): boolean {
  const relative = path.relative(root, file);
  if (!relative || relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) return false;
  return !relative.split(path.sep).some(part => SKIP.has(part));
}

export function selectWorkspace<T extends { root: string; name: string }>(items: T[], requested?: string, activeRoot?: string): T {
  const matches = requested ? items.filter(w => w.root === requested || w.name === requested)
    : activeRoot ? items.filter(w => w.root === activeRoot) : items;
  if (matches.length === 1) return matches[0];
  if (!requested && items.length === 1) return items[0];
  if (!items.length) throw new Error('No enabled workspace. Open a folder and enable Ragit.');
  throw new Error(`Choose an unambiguous workspace by absolute path: ${items.map(w => w.root).join(', ')}`);
}
