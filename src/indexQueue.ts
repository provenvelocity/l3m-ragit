export interface IndexState {
  revision: number; indexedRevision: number;
  phase: 'pending' | 'indexing' | 'ready' | 'failed' | 'disposed';
  lastIndexedAt?: string; error?: string;
}

/** In-memory revisions describe observed changes, not atomic filesystem snapshots. */
export class IndexQueue {
  private state: IndexState = { revision: 1, indexedRevision: 0, phase: 'pending' };
  private timer?: ReturnType<typeof setTimeout>;
  private running?: Promise<void>;
  private lifetime = new AbortController();
  private index: (signal: AbortSignal) => Promise<void>;
  private debounceMs: number;
  private notify: (state: IndexState) => void;

  constructor(index: (signal: AbortSignal) => Promise<void>, debounceMs: number, notify: (state: IndexState) => void = () => {}) {
    this.index = index; this.debounceMs = debounceMs; this.notify = notify;
  }

  snapshot(): IndexState { return { ...this.state }; }

  markChanged(): void {
    if (this.lifetime.signal.aborted) return;
    this.state.revision++;
    this.state.error = undefined;
    if (!this.running) this.state.phase = 'pending';
    this.notify(this.snapshot());
    this.schedule();
  }

  schedule(): void {
    if (this.lifetime.signal.aborted) return;
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => { this.timer = undefined; void this.flush().catch(() => {}); }, this.debounceMs);
  }

  async flush(): Promise<void> {
    if (this.lifetime.signal.aborted) throw new Error('Workspace indexing stopped.');
    if (this.timer) { clearTimeout(this.timer); this.timer = undefined; }
    if (this.running) return this.running;
    if (this.state.indexedRevision === this.state.revision) return;
    this.running = this.drain();
    try { await this.running; } finally { this.running = undefined; }
  }

  private async drain(): Promise<void> {
    while (this.state.indexedRevision < this.state.revision) {
      if (this.lifetime.signal.aborted) throw new Error('Workspace indexing stopped.');
      const target = this.state.revision;
      this.state.phase = 'indexing';
      this.state.error = undefined;
      this.notify(this.snapshot());
      try {
        await this.index(this.lifetime.signal);
        if (this.lifetime.signal.aborted) throw new Error('Workspace indexing stopped.');
        this.state.indexedRevision = target;
        this.state.lastIndexedAt = new Date().toISOString();
      } catch (error) {
        if (!this.lifetime.signal.aborted) {
          this.state.phase = 'failed';
          this.state.error = error instanceof Error ? error.message : String(error);
          this.notify(this.snapshot());
        }
        throw error;
      }
    }
    this.state.phase = 'ready';
    this.notify(this.snapshot());
  }

  dispose(): void {
    if (this.timer) clearTimeout(this.timer);
    this.lifetime.abort();
    this.state.phase = 'disposed';
  }
}
