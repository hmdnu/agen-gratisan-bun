// In-process poll scheduler, a port of internal/scheduler/scheduler.go.
// No cron: a setTimeout loop re-arms itself to the job's next requested run,
// exactly like the Go time.Timer loop. AbortSignal plays the Go stop channel.
import { errorMessage } from "../util/guards.js";

export type Job = () => Promise<Date | null>;

export class Scheduler {
  constructor(
    private readonly retryIntervalMs: number,
    private readonly job: Job,
  ) {}

  run(signal: AbortSignal): void {
    if (this.retryIntervalMs <= 0) {
      return;
    }
    void this.loop(signal);
  }

  private async loop(signal: AbortSignal): Promise<void> {
    while (!signal.aborted) {
      let nextRun: Date | null;
      try {
        nextRun = await this.job();
      } catch (err) {
        console.error("scheduled job failed: " + errorMessage(err));
        nextRun = new Date(Date.now() + this.retryIntervalMs);
      }
      if (nextRun === null || nextRun.getTime() <= Date.now()) {
        nextRun = new Date(Date.now() + this.retryIntervalMs);
      }
      await sleepUntil(nextRun, signal);
    }
  }
}

function sleepUntil(target: Date, signal: AbortSignal): Promise<void> {
  return new Promise<void>((resolve) => {
    const timer = setTimeout(
      resolve,
      Math.max(0, target.getTime() - Date.now()),
    );
    const onAbort = () => {
      clearTimeout(timer);
      resolve();
    };
    signal.addEventListener("abort", onAbort, { once: true });
  });
}
