/**
 * THE MODEL ON ITS OWN
 *
 * A language model is a function: text in, text out. No memory, no files, no actions.
 * Uncomment one section at a time (select it, Cmd+/), then run:
 *
 *   bun llm.ts
 *
 * How one call works (inference):
 *   1. The server writes the messages into one text and splits it into tokens (section 2 shows that text).
 *   2. Prefill: the model reads every prompt token in one pass.
 *   3. Decode: it predicts the next token, adds it to the text, and predicts again, one token at a time, until it
 *      writes a stop token or reaches max_tokens. The response streams because you are watching step 3 happen.
 */

const SERVER = "http://127.0.0.1:8080"; // the local model (llama-server)
const MODEL = `${SERVER}/v1/chat/completions`;
const stdout = Bun.stdout.writer(); // replies are printed piece by piece as they stream in
const CONTEXT_WINDOW = await contextWindow(); // how many tokens the model can hold at once: prompt + response

// The request and response follow the OpenAI Chat Completions format, which local servers copy:
//   https://platform.openai.com/docs/api-reference/chat/create

// ── Sampling: how the next token is picked ───────────────────────────────────
// For every next token the model has a list of candidates with odds ("7" 55%, "3" 12%, …). These settings decide
// which one gets picked:
//   temperature  how adventurous the pick is. 0 always takes the favourite: the same answer every time. Higher
//                sometimes takes an underdog: more variety. It controls consistency, not truth: at 0, a wrong
//                favourite is wrong every time.
//   top_k        only the k favourites may be picked.
//   top_p        only the favourites whose odds add up to p may be picked (0.5 = the top half of the odds).
// And when the response ends:
//   the model writes its end-of-turn token (from the chat template)     finish_reason "stop"
//   a `stop` text you passed appears, e.g. stop: ["."]                   finish_reason "stop"
//   max_tokens is reached, even mid-sentence                             finish_reason "length"
const DEFAULTS = {
  temperature: 0,
  max_tokens: 100,
  top_k: 0,
  top_p: 1,
  min_p: 0, // llama-server applies min_p 0.05 by default; off, so top_k and top_p are the only filters
};

// ── 1. One question, one answer ──────────────────────────────────────────────
// {
//   const prompt = "In one sentence: what is a token in a language model?";
//   await ask([{ role: "user", content: prompt }]);
// }

// ── 2. What the model actually reads: one long text ──────────────────────────
// {
//   // The server writes the messages, and any tools, into one text with the model's chat template.
//   const response = await fetch(`${SERVER}/apply-template`, {
//     method: "POST",
//     headers: { "content-type": "application/json" },
//     body: JSON.stringify({
//       messages: [
//         { role: "system", content: "You are a helpful assistant." },
//         { role: "user", content: "What is in tickets.csv?" },
//       ],
//       tools: [{ type: "function", function: { name: "read_file", description: "Read a file", parameters: { type: "object", properties: { path: { type: "string" } } } } }],
//     }),
//   });
//   const { prompt }: { prompt: string } = await response.json();
//   console.log(prompt); // special tokens mark who said what; tools are just more text; the model continues from the end
// }

// ── 3. Tokens: it picks the next one, again and again ────────────────────────
{
  // Models are not random: they love 7. Here are the odds for each token it wrote.
  const answer = await ask([{ role: "user", content: "Pick a random number between 1 and 10. Reply with the number only." }], { max_tokens: 3, logprobs: true, top_logprobs: 5 });
  for (const token of answer.tokens) {
    const options = token.top_logprobs.map((o) => `${JSON.stringify(o.token)} ${(Math.exp(o.logprob) * 100).toFixed(0)}%`);
    console.log(JSON.stringify(token.token).padEnd(8), "←", options.join("  "));
  }
}

// ── 4. Temperature, top-k and top-p: ask ten times, count the answers ────────
// {
//   const question: Message = { role: "user", content: "Pick a random number between 1 and 10. Reply with the number only." };
//   for (const options of [{ temperature: 0 }, { temperature: 1.5 }, { temperature: 1.5, top_k: 2 }, { temperature: 1.5, top_p: 0.5 }]) {
//     const counts: Record<string, number> = {};
//     for (let i = 0; i < 10; i++) {
//       const answer = await ask([question], { ...options, max_tokens: 3 }, false);
//       counts[answer.text.trim()] = (counts[answer.text.trim()] ?? 0) + 1;
//     }
//     const tally = Object.entries(counts).sort((a, b) => b[1] - a[1]).map(([n, times]) => `${n} ×${times}`);
//     console.log(JSON.stringify(options).padEnd(36), tally.join("  "));
//   }
// }

// ── 5. Stopping: the end-of-turn token, a stop text, or max_tokens ───────────
// {
//   const question: Message = { role: "user", content: "Describe a cat in three sentences." };
//   await ask([question]);                       // ends on its own: finish_reason "stop"
//   await ask([question], { stop: ["."] });      // ends at the first full stop: finish_reason "stop"
//   await ask([question], { max_tokens: 8 });    // cut off mid-sentence: finish_reason "length"
// }

// ── 6. System instruction: the same question, different rules ───────────────
// {
//   const question: Message = { role: "user", content: "Should I store passwords in my database?" };
//   for (const system of [
//     "You are a helpful assistant.",
//     "You are a senior security reviewer. Answer in at most two sentences and name the specific technique.",
//     "Answer only with YES or NO.",
//   ]) {
//     await ask([{ role: "system", content: system }, question]);
//   }
// }

// ── 7. No memory: every call starts from zero ────────────────────────────────
// {
//   await ask([{ role: "user", content: "My name is Zafar." }]);
//   await ask([{ role: "user", content: "What is my name?" }]); // a new call: it doesn't know
//   await ask([
//     { role: "user", content: "My name is Zafar." },
//     { role: "assistant", content: "Nice to meet you, Zafar." },
//     { role: "user", content: "What is my name?" },
//   ]); // "memory" is the app sending the conversation again
// }

// ── 8. It cannot see your files ──────────────────────────────────────────────
// {
//   const question = "What is the average time per ticket in tickets.csv?";
//   await ask([{ role: "user", content: question }]); // it guesses; run it twice: the same guess (temperature 0 is consistent, not correct)
//   const csv = await Bun.file("tickets.csv").text();
//   await ask([{ role: "user", content: `${question}\n\ntickets.csv:\n${csv}` }]); // the file is in the context now
//   console.log("Actual average (computed by code): 11.2 hours");
// }

// ─────────────────────────────────────────────────────────────────────────────
// Helpers

type Message = {
  role: "system" | "user" | "assistant";
  content: string;
};

/** A token the model wrote, and the top candidates it chose from. */
type Token = {
  token: string;
  logprob: number;
  top_logprobs: { token: string; logprob: number }[];
};

/** Tokens in and out, as the server counts them. It comes with the last piece of a streamed response. */
type Usage = { prompt_tokens: number; completion_tokens: number; total_tokens: number };

/** One piece of the streamed response. llama-server adds `timings` to the last one. */
type Chunk = {
  choices: { delta: { content?: string }; logprobs?: { content: Token[] }; finish_reason?: string | null }[];
  usage?: Usage;
  timings?: { predicted_per_second: number };
};

/**
 * Ask the model. Prints the prompt (what we send), streams the response as it is written, then the token counts and
 * how full the context window is. With show = false it prints only the response.
 */
async function ask(messages: Message[], options: Record<string, unknown> = {}, show = true) {
  if (show) {
    await print("\n── prompt ──\n");
    for (const message of messages) {
      const text = message.content.length > 200 ? `${message.content.slice(0, 200)}… (${message.content.length} characters)` : message.content;
      await print(`${message.role}: ${text}\n`);
    }
    await print("── response ──\n");
  }

  const response = await fetch(MODEL, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ messages, ...DEFAULTS, ...options, stream: true, stream_options: { include_usage: true } }),
  });

  let text = "";
  const tokens: Token[] = [];
  let usage: Usage | undefined;
  let speed = 0;
  let finishReason = "";
  for await (const line of lines(response)) {
    if (!line.startsWith("data: ") || line === "data: [DONE]") {
      continue;
    }
    const chunk: Chunk = JSON.parse(line.slice(6));
    const piece = chunk.choices[0]?.delta.content ?? "";
    text += piece;
    await print(piece);
    tokens.push(...(chunk.choices[0]?.logprobs?.content ?? []));
    usage = chunk.usage ?? usage;
    speed = chunk.timings?.predicted_per_second ?? speed;
    finishReason = chunk.choices[0]?.finish_reason ?? finishReason;
  }

  if (show) {
    await print(`\n\nfinish_reason: ${finishReason}   ("stop": it ended the turn or hit a stop text; "length": max_tokens)\n`);
    if (usage) {
      console.log("usage:", usage); // prompt tokens in, completion tokens out
      const used = usage.total_tokens;
      await print(`context window: ${used.toLocaleString()} of ${CONTEXT_WINDOW.toLocaleString()} tokens used (${((used / CONTEXT_WINDOW) * 100).toFixed(1)}%)\n`);
    }
    if (speed) {
      await print(`speed: ${speed.toFixed(0)} tokens/s\n`);
    }
  }
  return { text, tokens, finishReason };
}

/** The context window size, from llama-server's /props (it is set when the server starts, with -c). */
async function contextWindow(): Promise<number> {
  const props: { default_generation_settings?: { n_ctx?: number } } = await (await fetch(`${SERVER}/props`)).json();
  return props.default_generation_settings?.n_ctx ?? 0;
}

/** The streamed response, one line at a time (server-sent events: "data: {...}"). */
async function* lines(response: Response) {
  if (!response.body) {
    return;
  }
  const decoder = new TextDecoder();
  let buffer = "";
  for await (const chunk of response.body) {
    buffer += decoder.decode(chunk, { stream: true });
    const complete = buffer.split("\n");
    buffer = complete.pop() ?? "";
    yield* complete;
  }
}

/** Print as it arrives: write the text and flush it to the terminal straight away. */
async function print(text: string) {
  stdout.write(text);
  await stdout.flush();
}
