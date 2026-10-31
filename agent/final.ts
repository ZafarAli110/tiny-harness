/**
 * THE COMPLETE AGENT: the loop from the steps (1-loop.ts …), with every harness piece behind a switch.
 *
 * The pieces (tools, rules, permission, a turn limit, tests) are switched on one at a time: with the toggles on the
 * web page (bun server.ts), or in the terminal by changing the settings at the bottom of a task file and running it:
 *
 *   bun tickets.ts      the average time per ticket in tickets.csv
 *   bun website.ts      a Contact section for the page in site/
 */
import { evaluate, verify } from "../harness/verify.ts";
import { allowed } from "../harness/permission.ts";
import { projectRules } from "../harness/rules.ts";
import { ask } from "../lib/model.ts";
import type { Show } from "../lib/show.ts";
import type { Message, Task, Tool } from "./types.ts";

// ── System instruction ───────────────────────────────────────────────────────
export const SYSTEM = "You are a helpful assistant.";

// ── The harness: which pieces are switched on ────────────────────────────────
export type Settings = {
  tools: Tool[]; // what the app lets the model ask for
  rules: boolean; // the project's rules file in the system instruction
  askPermission: boolean; // ask a person before a risky tool runs (false: nobody is asked)
  turnLimit: number; // stop after this many turns (0: no limit)
  verify: boolean; // "done" is tested before the loop ends
  evaluate: boolean; // grade the result after the run
};

export async function runAgent(task: Task, settings: Settings, show: Show) {
  await task.reset?.(); // every run starts from the same place
  const messages: Message[] = [
    { role: "system", content: settings.rules ? `${SYSTEM} ${await projectRules(task.rules)}` : SYSTEM }, // ← rules
    { role: "user", content: task.prompt },
  ];

  // ═════════════════════════════════════════════════════════════════
  //   THE LOOP. This is the moment a model becomes an agent.
  //
  //   Ask the model. If it asks for a tool, the app runs it
  //   and hands back the result. Ask again. That's all an agent is.
  //   Claude Code, Cursor, Codex: this loop, with more around it.
  // ═════════════════════════════════════════════════════════════════
  for (let turn = 1; ; turn++) {
    if (settings.turnLimit && turn > settings.turnLimit) { // ← a budget
      await show.stop("turn limit");
      break;
    }
    await show.turn(turn, messages); // a new turn: the whole conversation goes to the model again

    // 1. the model decides
    const reply = await ask(messages, settings.tools, show);
    messages.push(reply);

    // its tool request, if it made one. [0]: the server is told to allow one request per reply (see lib/model.ts)
    const request = reply.tool_calls?.[0];
    if (request) {
      // 2. it asks for an action. It can't act; it can only ask.
      const tool = settings.tools.find((t) => t.name === request.function.name);
      const args = JSON.parse(request.function.arguments);
      if (settings.askPermission && !(await allowed(tool, args, show))) { // ← permission
        const refusal = "The user said no.";
        await show.result(refusal);
        messages.push({ role: "tool", tool_call_id: request.id, content: refusal });
        continue;
      }

      // 3. the APP acts
      const result = tool ? await tool.run(args) : `No tool ${request.function.name}`;
      await show.result(result);
      // 4. the model sees what happened
      messages.push({ role: "tool", tool_call_id: request.id, content: result }); // the id pairs it with the request
      continue; // 5. and goes again
    }

    // No request: it answered in plain words. That is how the model says it is done.
    // "Done" is a claim; the tests decide.
    if (settings.verify && task.tests && (await verify(task.tests, messages, show))) { // ← verification
      continue;
    }
    break;
  }

  if (settings.evaluate) { // ← evaluation: grade the result
    await evaluate(task, show);
  }
  return messages;
}
