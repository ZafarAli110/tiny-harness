/**
 * STEP 5: + a turn limit. A loop the model never ends stops anyway, after a set number of turns.
 *
 * The failure it stops: the shell has been taken away (too risky, say), but RULES.md still tells the model to use
 * run_command. It cannot, so it keeps trying, turn after turn. Without the limit it would run until you stopped it.
 * (Step 4 shows another one: answer no to every request, and it asks again for ever.)
 *
 *   bun agent/5-limit.ts
 */
import type { Message } from "./types.ts";
import { allowed } from "../harness/permission.ts";
import { projectRules } from "../harness/rules.ts";
import { readFile } from "../harness/tools.ts";
import { ask } from "../lib/model.ts";
import { terminal } from "../lib/show.ts";

const rules = await projectRules();
const TURN_LIMIT = 8; // ← new: a budget, the same idea as a time or cost limit

const show = terminal();
const tools = [readFile]; // ← changed: run_command taken away, but RULES.md still says to use it
const messages: Message[] = [
  { role: "system", content: `You are a helpful assistant. ${rules}` },
  { role: "user", content: "What is the average time per ticket in tickets.csv?" },
];

for (let turn = 1; ; turn++) {
  // ← new: stop after TURN_LIMIT turns, however close the model thinks it is
  if (turn > TURN_LIMIT) {
    await show.stop("turn limit");
    break;
  }
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

  // a risky tool waits for a person. The model asked; a person decides.
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
