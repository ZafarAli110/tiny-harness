/**
 * THE SHAPES: what goes to the model and comes back, and the few things the agent is built from.
 *
 * Read this first. Then the agent, one step at a time, each adding one piece (marked ← new):
 *   1-loop.ts  2-command.ts  3-rules.ts  4-permission.ts  5-limit.ts  6-verify.ts
 * and final.ts, the complete agent with every piece behind a switch (the web page and the task files run that one).
 */

// ── The conversation: what goes to the model and comes back ─────────────────
// These shapes are the OpenAI Chat Completions format: the de facto standard that local servers (llama-server,
// mlx_lm, Ollama, LM Studio) copy, so this code works with any of them.
//   https://platform.openai.com/docs/api-reference/chat/create
// The model itself never sees this JSON. The server writes the messages and tools into one long text, using the chat
// template that ships inside the model file (--jinja turns it on), and turns the model's tool-call text back into
// `tool_calls`. llm.ts section 2 prints that text.

/** One entry in the conversation. role: "system" | "user" | "assistant" | "tool" (a tool's result). */
export type Message = {
  role: string;
  content: string;
  tool_calls?: ToolCall[];
  tool_call_id?: string; // on a tool result: the id of the request it answers
};

/** The model's request to run a tool: which one, and its arguments as a JSON string. */
export type ToolCall = {
  // This one request, not the tool (that is function.name). Asked to read two files, the model sends two requests,
  // both read_file, each with its own id; each result goes back with that id, so the model knows which is which.
  id: string;
  type: "function"; // the server refuses a tool call sent back without it
  function: {
    name: string;
    arguments: string;
  };
};

// ── Tools, tests and tasks: ours, not the API's ─────────────────────────────

/** A tool: ours, not the API's. The model is told its name, description and params; the loop runs it when asked. */
export type Tool = {
  name: string;
  description: string;
  params: string[];
  risky?: boolean; // changes something: ask a person first (see harness/permission.ts)
  run: (args: Record<string, string>) => Promise<string>;
};

/** One test of the result, by name, and whether it passed. */
export type TestResult = { name: string; passed: boolean };

/** A task: what you ask for, its project rules, and what "done" means. */
export type Task = {
  prompt: string; // what you ask the agent to do
  rules: string; // the project's rules file (e.g. "RULES.md"), read into the system instruction when switched on
  tests?: string; // the project's tests (e.g. "site/site.test.ts"): what "done" means, run by the harness
  reset?: () => Promise<void>; // put things back before a run
};
