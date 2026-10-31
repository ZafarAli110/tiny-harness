/**
 * STEP 1: the bare loop. The model, one tool (read_file), and nothing else around it.
 * (The shapes it uses, Message and Tool, are in types.ts.)
 *
 *   bun agent/1-loop.ts
 */
import type { Message } from "./types.ts";
import { readFile } from "../harness/tools.ts";
import { ask } from "../lib/model.ts";
import { terminal } from "../lib/show.ts";

const show = terminal();
const tools = [readFile];
const messages: Message[] = [
  { role: "system", content: "You are a helpful assistant." },
  { role: "user", content: "What is the average time per ticket in tickets.csv?" },
];

// ═════════════════════════════════════════════════════════════════
//   THE LOOP. This is the moment a model becomes an agent.
//
//   Ask the model. If it asks for a tool, the app runs it
//   and hands back the result. Ask again. That's all an agent is.
//   Claude Code, Cursor, Codex: this loop, with more around it.
// ═════════════════════════════════════════════════════════════════

for (let turn = 1; ; turn++) {
  await show.turn(turn, messages);

  // the model reads the whole conversation
  const reply = await ask(messages, tools, show);
  messages.push(reply);

  // its tool request, if it made one. [0]: the server is told to allow one request per reply (see lib/model.ts)
  const request = reply.tool_calls?.[0];

  // no request: it answered in plain words. That is how the model says it is done, so the loop stops.
  if (!request) {
    break;
  }

  // it asks for a tool: the app runs it
  const tool = tools.find((t) => t.name === request.function.name);
  const result = tool ? await tool.run(JSON.parse(request.function.arguments)) : `No tool ${request.function.name}`;
  await show.result(result);
  messages.push({ role: "tool", tool_call_id: request.id, content: result });
}
