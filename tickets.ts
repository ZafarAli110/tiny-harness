/**
 * TASK: the average time per ticket in tickets.csv (15 tickets, 168 hours, so 11.2).
 *
 * Switch the harness on in the settings at the bottom, one setting at a time, and run:
 *
 *   bun tickets.ts
 */
import { runAgent } from "./agent/final.ts";
import type { Task } from "./agent/types.ts";
import { readFile, runCommand } from "./harness/tools.ts";
import { terminal } from "./lib/show.ts";

export const tickets: Task = {
  prompt: "What is the average time per ticket in tickets.csv?",
  rules: "RULES.md",
  // no tests: a question answered in chat leaves nothing behind for a test to check
};

// ── In the terminal: switch the harness on here, one setting at a time ───────
if (import.meta.main) {
  await runAgent(
    tickets,
    {
      tools: [readFile], // add runCommand, and it can work the sum out with a command
      rules: false,
      askPermission: false, // true: you approve each run_command with y/n
      turnLimit: 0, // zero means no limit
      verify: false, // this task has no tests (see above), so verify and evaluate change nothing here
      evaluate: false,
    },
    terminal(),
  );
}
