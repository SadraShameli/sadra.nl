export enum WorkerTaskEventKind {
    Cancel = 'cancel',
    Done = 'done',
    Failed = 'failed',
    Progress = 'progress',
    Start = 'start',
}

export enum WorkerTaskPhase {
    Cancelled = 'cancelled',
    Done = 'done',
    Failed = 'failed',
    Idle = 'idle',
    Running = 'running',
}

export type WorkerTaskEvent<TProgress, TResult> =
    | WorkerTaskMessage<TProgress, TResult>
    | { kind: WorkerTaskEventKind.Cancel }
    | { kind: WorkerTaskEventKind.Start; runId: number };

export type WorkerTaskMessage<TProgress, TResult> =
    | { kind: WorkerTaskEventKind.Done; result: TResult; runId: number }
    | { kind: WorkerTaskEventKind.Failed; reason: string; runId: number }
    | {
          kind: WorkerTaskEventKind.Progress;
          progress: TProgress;
          runId: number;
      };

export interface WorkerTaskRequest<TRequest> {
    request: TRequest;
    runId: number;
}

export type WorkerTaskState<TProgress, TResult> =
    | {
          phase: WorkerTaskPhase.Cancelled;
          progress: null | TProgress;
          runId: number;
      }
    | {
          phase: WorkerTaskPhase.Done;
          result: TResult;
          runId: number;
      }
    | {
          phase: WorkerTaskPhase.Failed;
          reason: string;
          runId: number;
      }
    | { phase: WorkerTaskPhase.Idle }
    | {
          phase: WorkerTaskPhase.Running;
          progress: null | TProgress;
          runId: number;
      };

export const IDLE_WORKER_TASK: WorkerTaskState<never, never> = {
    phase: WorkerTaskPhase.Idle,
};

export function reduceWorkerTask<TProgress, TResult>(
    state: WorkerTaskState<TProgress, TResult>,
    event: WorkerTaskEvent<TProgress, TResult>,
): WorkerTaskState<TProgress, TResult> {
    switch (event.kind) {
        case WorkerTaskEventKind.Cancel: {
            return state.phase === WorkerTaskPhase.Running
                ? {
                      phase: WorkerTaskPhase.Cancelled,
                      progress: state.progress,
                      runId: state.runId,
                  }
                : state;
        }
        case WorkerTaskEventKind.Done: {
            return isCurrentRun(state, event.runId)
                ? {
                      phase: WorkerTaskPhase.Done,
                      result: event.result,
                      runId: event.runId,
                  }
                : state;
        }
        case WorkerTaskEventKind.Failed: {
            return isCurrentRun(state, event.runId)
                ? {
                      phase: WorkerTaskPhase.Failed,
                      reason: event.reason,
                      runId: event.runId,
                  }
                : state;
        }
        case WorkerTaskEventKind.Progress: {
            return isCurrentRun(state, event.runId)
                ? {
                      phase: WorkerTaskPhase.Running,
                      progress: event.progress,
                      runId: event.runId,
                  }
                : state;
        }
        case WorkerTaskEventKind.Start: {
            return {
                phase: WorkerTaskPhase.Running,
                progress: null,
                runId: event.runId,
            };
        }
    }
}

function isCurrentRun<TProgress, TResult>(
    state: WorkerTaskState<TProgress, TResult>,
    runId: number,
): boolean {
    return state.phase === WorkerTaskPhase.Running && state.runId === runId;
}
