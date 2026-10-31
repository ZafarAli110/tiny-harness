/**
 * EVALUATION ACROSS MANY RUNS: is the harness getting better? Run the same task several times, without and with
 * verification, grade every run with the site's tests, and count how many passed.
 *
 * One run tells you about one run. A pass rate over many tells you whether a change to the harness helped. The model
 * samples normally here (temperature 0.7), as it would in real use, so runs differ; the demo uses 0 to repeat itself.
 *
 *   bun evals.ts        (several minutes: each run is a whole agent run)
 */
import { runAgent } from "./agent/final.ts";
import { readFile, runCommand, writeFile } from "./harness/tools.ts";
import { runTests } from "./harness/verify.ts";
import { silent } from "./lib/show.ts";
import { website } from "./website.ts";

process.env.TEMPERATURE = "0.7"; // sample as in real use, so each run can come out differently

/** Wait until the model server answers again (llama-server's /health says 200 once the model is loaded). */
async function modelBack() {
  for (;;) {
    const ok = await fetch(`${process.env.MODEL_SERVER ?? "http://127.0.0.1:8080"}/health`).then((r) => r.ok, () => false);
    if (ok) {
      return;
    }
    await Bun.sleep(2000);
  }
}
const RUNS = 5;

for (const verify of [false, true]) {
  console.log(`\n${verify ? "With" : "Without"} verification:`);
  let passed = 0;
  for (let run = 1; run <= RUNS; run++) {
    const started = Date.now();
    try {
      await runAgent(
        website,
        { tools: [readFile, writeFile, runCommand], rules: true, askPermission: false, turnLimit: 12, verify, evaluate: false },
        silent(),
      );
    } catch {
      // the model server went away mid-run (restarted, say): wait for it, then do this run again
      console.log(`  run ${run}: the model stopped answering; waiting for it, then repeating the run`);
      await modelBack();
      run--;
      continue;
    }
    const results = await runTests(website.tests ?? ""); // grade what this run left behind
    const failed = results.filter((result) => !result.passed).map((result) => result.name);
    const seconds = Math.round((Date.now() - started) / 1000);
    if (failed.length === 0) {
      passed++;
    }
    console.log(`  run ${run}: ${failed.length === 0 ? "✓ all tests passed" : `✗ ${failed.join(", ")}`} (${seconds}s)`);
  }
  console.log(`  → ${passed} of ${RUNS} passed`);
}
