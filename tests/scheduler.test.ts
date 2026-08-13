// Port of internal/scheduler/scheduler_test.go: timing, retry, and stop.
import { describe, expect, it } from "vitest";
import { Scheduler } from "../src/scheduler/scheduler.js";

function waitForRuns(runs: () => number, want: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const deadline = Date.now() + 1000;
    const tick = () => {
      if (runs() >= want) {
        resolve();
        return;
      }
      if (Date.now() >= deadline) {
        reject(new Error(`scheduler ran ${runs()} times, want at least ${want}`));
        return;
      }
      setTimeout(tick, 1);
    };
    tick();
  });
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

describe("Scheduler", () => {
  it("runs immediately and at the deadline", async () => {
    let runs = 0;
    const stop = new AbortController();

    const scheduler = new Scheduler(60 * 60 * 1000, async () => {
      runs++;
      if (runs === 1) {
        return new Date(Date.now() + 10);
      }
      return null;
    });
    scheduler.run(stop.signal);

    await waitForRuns(() => runs, 1);
    await waitForRuns(() => runs, 2);

    stop.abort();
    // Give the loop a chance to schedule another run if the abort failed.
    await sleep(10);
    expect(runs).toBe(2);
  });

  it("retries after a job error", async () => {
    let runs = 0;
    const stop = new AbortController();

    const scheduler = new Scheduler(10, async () => {
      runs++;
      throw new Error("temporary failure");
    });
    scheduler.run(stop.signal);

    await waitForRuns(() => runs, 2);
    stop.abort();
  });

  it("stops without running after abort", async () => {
    let runs = 0;
    const stop = new AbortController();

    const scheduler = new Scheduler(60 * 60 * 1000, async () => {
      runs++;
      return new Date(Date.now() + 60 * 60 * 1000);
    });
    scheduler.run(stop.signal);

    await waitForRuns(() => runs, 1);
    stop.abort();

    const finalRuns = runs;
    await sleep(25);
    expect(runs).toBe(finalRuns);
  });
});
