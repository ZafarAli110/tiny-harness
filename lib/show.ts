/**
 * Where a run shows up: the terminal (here), or the web page (server.ts sends the same events to it).
 */
import type { Message, TestResult } from "../agent/types.ts";

/** Everything a run reports as it happens. The terminal prints it; the web page (server.ts) draws it. */
export type Show = {
  turn: (turn: number, messages: Message[]) => void | Promise<void>; // a new turn of the loop starts: the conversation so far
  text: (piece: string) => void | Promise<void>; // the model's words, as they stream
  call: (name: string) => void | Promise<void>; // the model starts asking for a tool
  args: (piece: string) => void | Promise<void>; // the tool request's arguments, as they stream
  result: (result: string) => void | Promise<void>; // what the tool returned
  context: (used: number, size: number) => void | Promise<void>; // how full the context window is
  verified: (results: TestResult[]) => void | Promise<void>; // during the loop: it said "done"; did the tests pass?
  graded: (results: TestResult[]) => void | Promise<void>; // after the run: the final grade
  stop: (reason: string) => void | Promise<void>; // the loop stopped, and why
  ask: (question: string) => Promise<boolean>; // a yes/no question for a person (permission)
  working: () => () => void; // the model is working: show a sign of life until the returned function is called
};

// What the spinner says while the model works (like Claude Code's): a new one every couple of seconds
const WORDS = ["Thinking", "Reading the conversation", "Predicting the next token", "Weighing the odds", "Pondering", "Mulling it over"];

/** The conversation in short: each message's role, who wrote it, and its first 60 characters, on one line. */
export function conversation(messages: Message[]): { role: string; from: string; text: string }[] {
  return messages.map((m, i) => {
    // "user" is the task from you, or a later message from the app's checks (verify): the model can't tell them apart
    const from = m.role === "assistant" ? "the model" : m.role === "user" && i === 1 ? "you" : "the app";
    const call = m.tool_calls?.[0]?.function; // at most one: ask() tells the server one tool request per reply
    const raw = call ? `${call.name}(${call.arguments})` : m.content;
    const lines = raw.trim().split("\n").filter((line) => line.trim());
    const text = lines.join(" · ");
    const cut = text.length > 60 ? `${text.slice(0, 60)}…` : text;
    return { role: m.role, from, text: lines.length > 1 ? `${cut} (${lines.length} lines)` : cut };
  });
}

/** A tool's result as shown: up to 5 lines in full (indented under ⎿), longer ones as a line count. */
export function shortResult(result: string): string {
  const lines = result.trimEnd().split("\n");
  return lines.length > 5 ? `${lines.length} lines` : lines.join("\n     ");
}

/** Every test on its own line: ✓ in green if it passed, ✗ in red if it failed. */
function testLines(results: TestResult[]): string {
  return results.map((result) => (result.passed ? `\x1b[32m  ✓ ${result.name}\x1b[0m\n` : `\x1b[31m  ✗ ${result.name}\x1b[0m\n`)).join("");
}

const stdout = Bun.stdout.writer();

/** Print as it arrives: write the text and flush it to the terminal straight away. */
async function print(text: string) {
  stdout.write(text);
  await stdout.flush();
}

/** The terminal: text streams in, tool calls look like Claude Code's (⏺ … ⎿ …), permission is y/n. */
export function terminal(): Show {
  let shown = 0; // characters of the current tool call's arguments so far (the first 120 are printed)
  let open = false; // a tool call's "(" is printed and waiting for its ")"
  let counted = 0; // when the live count was last redrawn
  const live = process.stdout.isTTY; // a live count needs a terminal; into a file or pipe it is left out
  // after the first 120 characters, a count that keeps moving, so a long request (a whole file) does not look stuck
  const count = (last = false) => `\x1b8\x1b[K\x1b[2m ${shown.toLocaleString()} characters${last ? "" : " so far"}\x1b[0m`;
  const close = () => {
    const text = open ? `${live && shown > 120 ? count(true) : ""})\n` : "";
    open = false;
    return text;
  };
  return {
    turn: (turn, messages) =>
      print(
        `\n\x1b[36m── turn ${turn} · the model reads the whole conversation: ${messages.length} messages\x1b[0m\n` +
        conversation(messages)
          .map((m, i) => `\x1b[2m   ${i + 1} ${m.role.padEnd(10)} ${m.from.padEnd(10)} ${m.text}\x1b[0m\n`)
          .join(""),
      ),
    text: (piece) => print(piece),
    call: (name) => {
      shown = 0;
      open = true;
      return print(`\n⏺ ${name}(`);
    },
    args: (piece) => {
      const before = shown;
      shown += piece.length;
      if (before < 120) {
        // the first 120 characters as they come; at the cut, "…" and a saved cursor spot for the count (\x1b7)
        return print(piece.slice(0, 120 - before) + (shown > 120 ? `…${live ? "\x1b7" : ""}` : ""));
      }
      if (live && Date.now() - counted > 150) {
        counted = Date.now();
        return print(count());
      }
    },
    result: (result) => print(`${close()}  ⎿  ${shortResult(result)}\n`),
    context: (used, size) => print(`${close()}\x1b[2m  context window: ${used.toLocaleString()} of ${size.toLocaleString()} tokens used\x1b[0m\n`),
    verified: (results) => {
      const failed = results.filter((result) => !result.passed).length;
      return print(`${failed ? `⏺ tests failed: ${failed} of ${results.length}` : `⏺ tests passed: all ${results.length}`}\n${testLines(results)}`);
    },
    graded: (results) => print(`\n\x1b[36m── evaluation, after the run: the site's tests (not the model)\x1b[0m\n${testLines(results)}`),
    stop: (reason) => print(`\nSTOP: ${reason}\n`),
    ask: async (question) => prompt(`${close()}\n  ${question} [y/n]`)?.trim().toLowerCase() === "y",
    working: () => {
      if (!process.stdout.isTTY) {
        return () => {}; // into a file or a pipe: no spinner
      }
      const start = Date.now();
      let word = WORDS[0]!;
      let frame = 0;
      const draw = () => {
        if (frame % 14 === 13) {
          word = WORDS[Math.floor(Math.random() * WORDS.length)]!;
        }
        const seconds = Math.floor((Date.now() - start) / 1000);
        stdout.write(`\r\x1b[2m${"✻✳✢·✢✳"[frame % 6]} ${word}… ${seconds}s\x1b[0m\x1b[K`);
        stdout.flush();
        frame++;
      };
      draw();
      const timer = setInterval(draw, 150);
      let running = true;
      return () => {
        if (running) {
          running = false;
          clearInterval(timer);
          stdout.write("\r\x1b[K"); // rub the spinner out
          stdout.flush();
        }
      };
    },
  };
}

/** A run that shows nothing: for evals.ts, which only wants the result of each run. */
export function silent(): Show {
  const nothing = () => {};
  return {
    turn: nothing, text: nothing, call: nothing, args: nothing, result: nothing, context: nothing,
    verified: nothing, graded: nothing, stop: nothing, ask: async () => true, working: () => nothing,
  };
}
