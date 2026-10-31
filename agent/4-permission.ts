/**
 * STEP 4: + permission. A risky tool (a command, a file write) waits for a person to say yes. Claude Code asks too.
 * Say no and the model is told so; it has to find another way.
 *
 *   bun agent/4-permission.ts
 */
import type { Message } from "./types.ts";
import { allowed } from "../harness/permission.ts";
import { projectRules } from "../harness/rules.ts";
import { readFile, runCommand } from "../harness/tools.ts";
import { ask } from "../lib/model.ts";
import { terminal } from "../lib/show.ts";

const rules = await projectRules();

const show = terminal();
const tools = [readFile, runCommand];
const messages: Message[] = [
  { role: "system", content: `You are a helpful assistant. ${rules}` },
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

  // it asks for a tool
  const tool = tools.find((t) => t.name === request.function.name);
  const args = JSON.parse(request.function.arguments);

  // ← new: a risky tool waits for a person. The model asked; a person decides.
  if (!(await allowed(tool, args, show))) {
    const refusal = "The user said no.";
    await show.result(refusal);
    messages.push({ role: "tool", tool_call_id: request.id, content: refusal });
    continue;
  }

  // the app runs it
  const result = tool ? await tool.run(args) : `No tool ${request.function.name}`;
  await show.result(result);
  messages.push({ role: "tool", tool_call_id: request.id, content: result });
}
