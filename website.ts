/**
 * TASK: add a Contact section to the event page in site/ (index.html and styles.css).
 *
 * Switch the harness on in the settings at the bottom, one setting at a time, and run:
 *
 *   bun website.ts
 */
import { runAgent } from "./agent/final.ts";
import type { Task } from "./agent/types.ts";
import { readFile, runCommand, writeFile } from "./harness/tools.ts";
import { terminal } from "./lib/show.ts";

const SITE = `${import.meta.dir}/site`; // the page the agent edits, wherever you start it from
const PAGE = `${SITE}/index.html`;
const STYLES = `${SITE}/styles.css`;

export const website: Task = {
  prompt: "Add a Contact section to site/index.html: a heading \"Contact\", a form with Name, Email and Message fields (each with its label above it) and a Send button, styled like the rest of the page, and a \"Contact\" link in the navigation.",
  rules: "site/RULES.md",
  tests: "site/site.test.ts", // the site's own tests
  reset: resetPage,
};

/** Every run starts from the original page and stylesheet. */
export async function resetPage() {
  await Bun.write(PAGE, Bun.file(`${SITE}/original.html`));
  await Bun.write(STYLES, Bun.file(`${SITE}/original.css`));
}

// ── In the terminal: switch the harness on here, one setting at a time ───────
if (import.meta.main) {
  await runAgent(
    website,
    {
      tools: [readFile, writeFile, runCommand],
      rules: true, // site/RULES.md
      askPermission: false, // true: you approve each write_file and run_command with y/n
      turnLimit: 12,
      verify: false, // off: it stops when it says it is done (agent/6-verify.ts shows what that misses)
      evaluate: true, // grades the page with the site's tests afterwards
    },
    terminal(),
  );
}
