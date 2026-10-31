/**
 * VERIFY AND EVALUATE: "done" is a claim, so the harness runs the project's own tests (bun test), the way a hook in
 * Claude Code runs your test suite. The tests belong to the project (site/site.test.ts), not to the harness.
 */
import type { Message, Task, TestResult } from "../agent/types.ts";
import type { Show } from "../lib/show.ts";

// The project folder (this repository), wherever you start the agent
const PROJECT = `${import.meta.dir}/..`;

/** Run a test file with bun test: every test, by name, and whether it passed. */
export async function runTests(file: string): Promise<TestResult[]> {
  // bun names every test, passed or failed, in a JUnit report (its normal output names only the failures)
  const report = `${PROJECT}/.tests.xml`; // inside the project: works on Windows, macOS and Linux alike
  const run = Bun.spawnSync([process.execPath, "test", file, "--reporter=junit", `--reporter-outfile=${report}`], { cwd: PROJECT, stdout: "pipe", stderr: "pipe" });
  const xml = (await Bun.file(report).exists()) ? await Bun.file(report).text() : "";
  // <testcase name="…"/> passed; <testcase name="…"> … <failure …/> … </testcase> failed
  const results = [...xml.matchAll(/<testcase name="([^"]*)"[^>]*?(?:\/>|>([\s\S]*?)<\/testcase>)/g)].map((match) => ({
    name: match[1]!.replaceAll("&apos;", "'").replaceAll("&quot;", '"').replaceAll("&lt;", "<").replaceAll("&gt;", ">").replaceAll("&amp;", "&"),
    passed: !(match[2] ?? "").includes("<failure"),
  }));
  if (run.exitCode !== 0 && results.every((result) => result.passed)) {
    results.push({ name: "the tests did not run", passed: false }); // a broken test file, say: that is not "done" either
  }
  return results;
}

/** Verification, during the run: the model says it's done, so run the tests. True means it must keep going. */
export async function verify(tests: string, messages: Message[], show: Show): Promise<boolean> {
  const results = await runTests(tests);
  await show.verified(results);
  const failed = results.filter((result) => !result.passed).map((result) => result.name);
  if (failed.length === 0) {
    return false;
  }
  messages.push({ role: "user", content: `Not done. These tests failed: ${failed.join(", ")}. Fix them.` });
  return true;
}

/** Evaluation, after the run: grade the result with the same tests. Nothing goes back to the model. */
export async function evaluate(task: Task, show: Show) {
  if (task.tests) {
    await show.graded(await runTests(task.tests));
  }
}
