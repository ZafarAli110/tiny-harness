/**
 * STEP 6: + the project's tests. When the model says it is done, the harness runs them (bun test), the way a hook
 * runs your test suite in Claude Code. If they fail, the model is told which, and the loop goes on.
 *
 * A new task for this step, one that leaves something behind to test: a Contact section for the page in site/.
 * Its tests are the site's own (site/site.test.ts). Each file write asks you first (permission, step 4).
 *
 *   bun agent/6-verify.ts
 */
import type { Message } from "./types.ts";
import { allowed } from "../harness/permission.ts";
import { projectRules } from "../harness/rules.ts";
import { readFile, runCommand, writeFile } from "../harness/tools.ts";
import { verify } from "../harness/verify.ts";
import { ask } from "../lib/model.ts";
import { terminal } from "../lib/show.ts";
import { website } from "../website.ts";

await website.reset?.(); // every run starts from the original page (site/original.html)

const rules = await projectRules(website.rules); // the site's rules: site/RULES.md
const TESTS = "site/site.test.ts"; // ← new: the project's tests
const TURN_LIMIT = 12; // a page takes more turns than a sum: read, write, test, fix

const show = terminal();
const tools = [readFile, writeFile, runCommand];
const messages: Message[] = [
  { role: "system", content: `You are a helpful assistant. ${rules}` },
  { role: "user", content: website.prompt },
];

for (let turn = 1; ; turn++) {
  // stop after TURN_LIMIT turns, however close the model thinks it is
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

  // no request: it answered in plain words, which is how it says it is done
  if (!request) {
    // ← new: "done" is a claim; the project's tests decide. If any fail, it is told which, and goes again.
    if (await verify(TESTS, messages, show)) {
      continue;
    }
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
