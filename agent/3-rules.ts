/**
 * STEP 3: + the project's rules. The harness reads RULES.md into every conversation (Claude Code: CLAUDE.md).
 *
 *   bun agent/3-rules.ts
 */
import type { Message } from "./types.ts";
import { projectRules } from "../harness/rules.ts";
import { readFile, runCommand } from "../harness/tools.ts";
import { ask } from "../lib/model.ts";
import { terminal } from "../lib/show.ts";

// ← new: the project's rules, read from RULES.md
const rules = await projectRules();

const show = terminal();
const tools = [readFile, runCommand];
const messages: Message[] = [
  { role: "system", content: `You are a helpful assistant. ${rules}` }, // ← new: in every conversation, before the task
  { role: "user", content: "What is the average time per ticket in tickets.csv?" },
];

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
