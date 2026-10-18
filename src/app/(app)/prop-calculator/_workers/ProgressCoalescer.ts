import {
    WorkerTaskEventKind,
    type WorkerTaskMessage,
} from '~/app/(app)/prop-calculator/_components/workerTaskState';

export interface ProgressCoalescing<TProgress> {
    readonly intervalMs: number;
    readonly merge: (held: null | TProgress, delta: TProgress) => TProgress;
}

type CoalescedMessage<TProgress> = WorkerTaskMessage<TProgress, unknown>;

export class ProgressCoalescer<TProgress> {
    static coalesce<TProgress>(
        worker: Worker,
        coalescing: ProgressCoalescing<TProgress>,
    ): Worker {
        return new ProgressCoalescer(worker, coalescing).listen();
    }

    private flushedAt = -Infinity;
    private readonly forwarded = new WeakSet<Event>();
    private held: null | TProgress = null;
    private heldRunId = 0;
    private pendingFlush: null | ReturnType<typeof setTimeout> = null;

    private readonly flush = (): void => {
        this.pendingFlush = null;
        if (this.held === null) return;
        this.flushedAt = performance.now();
        const message: CoalescedMessage<TProgress> = {
            kind: WorkerTaskEventKind.Progress,
            progress: this.held,
            runId: this.heldRunId,
        };
        const event = new MessageEvent('message', { data: message });
        this.forwarded.add(event);
        this.worker.dispatchEvent(event);
    };

    private readonly intercept = (
        event: MessageEvent<CoalescedMessage<TProgress>>,
    ): void => {
        if (this.forwarded.has(event)) return;
        if (event.data.kind !== WorkerTaskEventKind.Progress) {
            this.cancelFlush();
            return;
        }
        event.stopImmediatePropagation();
        this.held = this.coalescing.merge(this.held, event.data.progress);
        this.heldRunId = event.data.runId;
        if (this.pendingFlush !== null) return;
        const wait =
            this.flushedAt + this.coalescing.intervalMs - performance.now();
        if (wait <= 0) {
            this.flush();
            return;
        }
        this.pendingFlush = setTimeout(this.flush, wait);
    };

    private constructor(
        private readonly worker: Worker,
        private readonly coalescing: ProgressCoalescing<TProgress>,
    ) {}

    private cancelFlush(): void {
        if (this.pendingFlush === null) return;
        clearTimeout(this.pendingFlush);
        this.pendingFlush = null;
    }

    private listen(): Worker {
        this.worker.addEventListener('message', this.intercept);
        return this.worker;
    }
}
