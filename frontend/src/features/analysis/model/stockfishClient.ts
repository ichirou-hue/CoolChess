export type PositionAnalysis = {
  scoreCp: number;
  bestMove: string;
  depth: number;
  principalVariation: string[];
};

export type MoveClassification = 'best' | 'excellent' | 'good' | 'inaccuracy' | 'mistake' | 'blunder' | 'great' | 'miss';

export function classifyMove(before: PositionAnalysis, after: PositionAnalysis, playedMove: string) {
  // UCI scores are from the root side-to-move perspective: before is the learner's
  // view, after is the opponent's view, so add the two scores to find the loss.
  const lossCp = Math.max(0, before.scoreCp + after.scoreCp);
  const afterForPlayerCp = -after.scoreCp;
  if (before.scoreCp >= 150 && afterForPlayerCp <= 0 && lossCp >= 80) {
    return { classification: 'miss' as const, lossCp };
  }
  const changesOutcome = (before.scoreCp <= -200 && afterForPlayerCp >= -50)
    || (before.scoreCp <= 50 && afterForPlayerCp >= 200);
  if (changesOutcome && (before.bestMove === playedMove || lossCp <= 8)) {
    return { classification: 'great' as const, lossCp };
  }
  const classification: MoveClassification = before.bestMove === playedMove ? 'best'
    : lossCp <= 12 ? 'excellent'
      : lossCp <= 45 ? 'good'
        : lossCp <= 100 ? 'inaccuracy'
          : lossCp <= 220 ? 'mistake' : 'blunder';
  return { classification, lossCp };
}

type AnalysisJob = {
  fen: string;
  depth: number;
  resolve: (result: PositionAnalysis | null) => void;
  latest: PositionAnalysis | null;
};

/** A small UCI client for the local Stockfish WebAssembly worker. */
export class StockfishClient {
  private worker: Worker;
  private ready = false;
  private queue: AnalysisJob[] = [];
  private active: AnalysisJob | null = null;
  private disposed = false;
  private readyFailed = false;
  private readyTimeout: number;

  constructor() {
    this.worker = new Worker('/engine/stockfish-19-lite-single.js');
    this.worker.addEventListener('message', this.onMessage);
    this.worker.addEventListener('error', this.onError);
    this.worker.postMessage('uci');
    this.readyTimeout = window.setTimeout(() => {
      if (!this.ready && !this.disposed) this.failAll();
    }, 12000);
  }

  analyze(fen: string, depth = 10): Promise<PositionAnalysis | null> {
    if (this.disposed || this.readyFailed) return Promise.resolve(null);
    return new Promise((resolve) => {
      this.queue.push({ fen, depth, resolve, latest: null });
      this.startNext();
    });
  }

  dispose() {
    this.disposed = true;
    window.clearTimeout(this.readyTimeout);
    this.active?.resolve(this.active.latest);
    this.queue.forEach((job) => job.resolve(null));
    this.queue = [];
    this.worker.removeEventListener('message', this.onMessage);
    this.worker.removeEventListener('error', this.onError);
    this.worker.terminate();
  }

  private onMessage = (event: MessageEvent<string>) => {
    const message = String(event.data).trim();
    if (message === 'uciok') {
      this.worker.postMessage('isready');
      return;
    }
    if (message === 'readyok') {
      this.ready = true;
      window.clearTimeout(this.readyTimeout);
      this.startNext();
      return;
    }
    if (message.startsWith('info ') && this.active) {
      const score = message.match(/\bscore (cp|mate) (-?\d+)/);
      const depth = Number(message.match(/\bdepth (\d+)/)?.[1] ?? 0);
      const pv = message.match(/\bpv ((?:[a-h][1-8][a-h][1-8][qrbn]?\s*)+)/)?.[1]?.trim().split(/\s+/) ?? [];
      if (score && depth > (this.active.latest?.depth ?? 0)) {
        const value = Number(score[2]);
        const scoreCp = score[1] === 'mate' ? Math.sign(value || 1) * Math.max(18000, 20000 - Math.abs(value) * 100) : value;
        this.active.latest = { scoreCp, bestMove: pv[0] ?? '', depth, principalVariation: pv };
      }
      return;
    }
    if (message.startsWith('bestmove ') && this.active) {
      const bestMove = message.split(/\s+/)[1] ?? '';
      if (this.active.latest && bestMove && bestMove !== '(none)') this.active.latest.bestMove = bestMove;
      this.finishActive(this.active.latest);
    }
  };

  private onError = () => this.failAll();

  private failAll() {
    this.readyFailed = true;
    this.active?.resolve(this.active.latest);
    this.active = null;
    this.queue.forEach((job) => job.resolve(null));
    this.queue = [];
  }

  private startNext() {
    if (!this.ready || this.active || this.disposed) return;
    this.active = this.queue.shift() ?? null;
    if (!this.active) return;
    this.worker.postMessage(`position fen ${this.active.fen}`);
    this.worker.postMessage(`go depth ${this.active.depth}`);
  }

  private finishActive(result: PositionAnalysis | null) {
    const job = this.active;
    if (job) job.resolve(result);
    this.active = null;
    this.startNext();
  }
}
