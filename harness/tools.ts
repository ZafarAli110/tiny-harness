/**
 * TOOLS: what the app lets the model ask for. The model only writes a request; this code is what actually runs.
 */
import type { Tool } from "../agent/types.ts";

// The project folder (this repository): the model's paths and commands work from here, wherever you start the agent
const PROJECT = `${import.meta.dir}/..`;

export const readFile: Tool = {
  name: "read_file",
  description: "Read a file",
  params: ["path"],
  run: async ({ path }) => {
    const file = Bun.file(`${PROJECT}/${path}`);
    return (await file.exists()) ? file.text() : `No such file: ${path}`;
  },
};

export const writeFile: Tool = {
  name: "write_file",
  risky: true,
  description: "Replace a file's content",
  params: ["path", "content"],
  run: async ({ path, content }) => {
    await Bun.write(`${PROJECT}/${path}`, content);
    return `Wrote ${path}`;
  },
};

/**
 * A shell, like Claude Code's Bash tool. The model writes a command; the app runs it in the project folder, as you,
 * exactly as if you had typed it in a terminal, and hands back what it printed. On Windows that terminal is PowerShell.
 *
 * Why: one general tool instead of many special ones. With a shell the model can work out sums (python3, awk), search
 * files (grep), list them (ls), run the tests (bun test), use git: anything you could do at a terminal.
 * The risk is the same list: it can also delete files, install things or reach the network. Nothing here stops it;
 * that is what permission is for (step 4).
 */
const WINDOWS = process.platform === "win32";

export const runCommand: Tool = {
  name: "run_command",
  risky: true, // it can change anything: a person should approve it first
  // the model is told which shell it gets, so it writes PowerShell on Windows rather than sh
  description: WINDOWS
    ? "Run a PowerShell command in the project folder and return its output"
    : "Run a shell command in the project folder and return its output",
  params: ["command"],
  run: async ({ command }) => {
    // the system shell runs the whole line, pipes and quotes included, and waits for it to finish
    const line = WINDOWS ? ["powershell", "-NoProfile", "-Command", command] : ["sh", "-c", command];
    const shell = Bun.spawnSync(line, { cwd: PROJECT, stdout: "pipe", stderr: "pipe" });
    // what it printed, errors included, so the model can read a failure and try again
    return shell.stdout.toString() + shell.stderr.toString();
  },
};
