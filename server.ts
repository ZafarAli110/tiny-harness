/**
 * The web demo: serves the playground page and runs agent/final.ts for it, step by step.
 *
 *   bun server.ts      → http://localhost:3008   (it starts llama-server on :8080 too; Ctrl-C stops both)
 *   USE_RUNNING_MODEL=1 bun server.ts             (use a llama-server that is already running instead)
 *
 * The page talks to llama-server directly for tokens and sampling. For the agent it calls this server, which runs the
 * same runAgent() as the terminal and streams each step to the page as it happens (server-sent events).
 */
import { runAgent, type Settings } from "./agent/final.ts";
import { readFile, runCommand, writeFile } from "./harness/tools.ts";
import { oddsOf } from "./lib/model.ts";
import { conversation, shortResult, type Show } from "./lib/show.ts";
import { tickets } from "./tickets.ts";
import { resetPage, website } from "./website.ts";

const TASKS = { tickets, website }; // the page's two tasks, by name

process.chdir(import.meta.dir); // the tools read and write paths like site/index.html, relative to this folder

// ── The model: llama-server starts and stops with this demo ──────────────────
// One command for the talk, the same settings every time, and an empty prompt cache on every start.

// llama-server: on PATH, or where setup.sh / setup.ps1 put it (found even before you open a new terminal)
const SETUP_DIR = process.platform === "win32"
  ? `${process.env.LOCALAPPDATA}\\tiny-harness\\llama.cpp`
  : `${process.env.HOME}/.tiny-harness/llama.cpp`;
const separator = process.platform === "win32" ? ";" : ":";
const LLAMA_SERVER = Bun.which("llama-server", { PATH: `${process.env.PATH}${separator}${SETUP_DIR}` });

// the model: models/ (where the setup scripts download it), or fetched from Hugging Face on the first run
const MODEL_FILE = `${import.meta.dir}/models/Qwen3.5-4B-Q4_K_M.gguf`;
const MODEL = (await Bun.file(MODEL_FILE).exists()) ? ["-m", MODEL_FILE] : ["-hf", "unsloth/Qwen3.5-4B-GGUF:Q4_K_M"];

const LLAMA = [LLAMA_SERVER ?? "llama-server", ...MODEL, "--jinja", "--port", "8080", "-c", "32768",
  "--chat-template-kwargs", '{"enable_thinking":false}'];

async function modelReady() {
  try {
    return (await fetch("http://localhost:8080/health")).ok; // 503 while the model loads, 200 when it is ready
  } catch {
    return false;
  }
}

if (!process.env.USE_RUNNING_MODEL) {
  if (await modelReady()) {
    console.error("A llama-server is already running on :8080. Stop it first, or run USE_RUNNING_MODEL=1 bun server.ts to use it.");
    process.exit(1);
  }
  if (!LLAMA_SERVER) {
    console.error("llama-server not found. Run the setup first: ./setup.sh (macOS, Linux) or .\\setup.ps1 (Windows).");
    process.exit(1);
  }
  const llama = Bun.spawn(LLAMA, { stdout: "ignore", stderr: Bun.file("llama-server.log") });
  const stop = () => {
    llama.kill();
    process.exit(0);
  };
  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);
  console.log("Starting llama-server and loading the model (its log: llama-server.log)…");
  while (!(await modelReady())) {
    if (llama.exitCode !== null) {
      console.error(`llama-server stopped (exit code ${llama.exitCode}). See llama-server.log.`);
      process.exit(1);
    }
    await Bun.sleep(500);
  }
}
await resetPage(); // site/index.html is the agent's working copy; it starts as site/original.html
let answer: ((allow: boolean) => void) | undefined; // a permission question waiting for the Yes/No button

/** The page's choices, as sent by the Agent tab. */
type Choices = {
  task: keyof typeof TASKS;
  readFile: boolean;
  runCommand: boolean;
  writeFile: boolean;
  rules: boolean;
  askPermission: boolean;
  turnLimit: boolean;
  verify: boolean;
  evaluate: boolean;
};

function run(choices: Choices): Response {
  const task = TASKS[choices.task];
  const settings: Settings = {
    tools: [
      ...(choices.readFile ? [readFile] : []),
      ...(choices.runCommand ? [runCommand] : []),
      ...(choices.writeFile ? [writeFile] : []),
    ],
    rules: choices.rules,
    askPermission: choices.askPermission,
    turnLimit: choices.turnLimit ? 12 : 0,
    verify: choices.verify,
    evaluate: choices.evaluate,
  };

  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: Record<string, unknown>) => controller.enqueue(`data: ${JSON.stringify(event)}\n\n`);
      const show: Show = {
        turn: (turn, messages) => send({ type: "turn", turn, messages: conversation(messages) }),
        text: (piece) => send({ type: "text", piece }),
        call: (name) => send({ type: "call", name }),
        args: (piece) => send({ type: "args", piece }),
        result: (result) => send({ type: "result", result, shown: shortResult(result) }),
        context: (used, size) => send({ type: "context", used, size }),
        verified: (results) => send({ type: "verified", results }),
        graded: (results) => send({ type: "graded", results }),
        stop: (reason) => send({ type: "stop", reason }),
        working: () => {
          send({ type: "working" });
          let running = true;
          return () => {
            if (running) {
              running = false;
              send({ type: "working-done" });
            }
          };
        },
        ask: (question) => {
          send({ type: "ask", question });
          return new Promise((resolve) => (answer = resolve));
        },
      };
      try {
        const messages = await runAgent(task, settings, show);
        const last = messages.at(-1);
        if (last?.role === "assistant" && !last.tool_calls) {
          send({ type: "odds-wait" });
          send({ type: "odds", odds: await oddsOf(messages, settings.tools) }); // how sure it was of its answer
        }
        send({ type: "done" });
      } catch (error) {
        send({ type: "error", message: error instanceof Error ? error.message : String(error) });
      }
      controller.close();
    },
  });
  return new Response(stream, { headers: { "content-type": "text/event-stream", "cache-control": "no-cache" } });
}

const server = Bun.serve({
  port: Number(process.env.PORT ?? 3008),
  idleTimeout: 255, // the model can think for a while between steps
  async fetch(request) {
    const { pathname } = new URL(request.url);

    if (pathname === "/") {
      return new Response(Bun.file("playground.html"));
    }
    if (pathname === "/tickets.csv") {
      return new Response(Bun.file("tickets.csv"), { headers: { "content-type": "text/csv" } });
    }
    if (pathname === "/agent/run" && request.method === "POST") {
      return run(await request.json());
    }
    if (pathname === "/agent/answer" && request.method === "POST") {
      const { allow }: { allow: boolean } = await request.json();
      answer?.(allow);
      answer = undefined;
      return new Response("ok");
    }
    if (pathname.startsWith("/site/") && !pathname.includes("..")) {
      // The page the agent edits, for the live preview. Only files inside site/.
      const file = Bun.file(`.${pathname}`);
      if (await file.exists()) {
        return new Response(file, { headers: { "cache-control": "no-store" } });
      }
    }
    return new Response("Not found", { status: 404 });
  },
});

console.log(`Demo on ${server.url} (llama-server on :8080)`);
