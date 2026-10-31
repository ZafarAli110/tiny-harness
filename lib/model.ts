/**
 * Talking to the model: send the conversation to llama-server, stream the reply back, and put it together.
 */
import type { Show } from "./show.ts";
import type { Message, Tool } from "../agent/types.ts";

// the local model (llama-server)
const SERVER = process.env.MODEL_SERVER ?? "http://127.0.0.1:8080";
const MODEL = `${SERVER}/v1/chat/completions`;

/** One piece of a streamed reply: a few characters of text, or of a tool call. The last one carries `usage`. */
type Chunk = {
  choices: {
    delta: {
      content?: string;
      tool_calls?: { index: number; id?: string; function?: { name?: string; arguments?: string } }[];
    };
  }[];
  usage?: { total_tokens: number };
};

/**
 * Send the conversation, and the tools the model may ask for, to the model. The reply streams back a few tokens at
 * a time; each piece is shown as it arrives, like Claude Code, and assembled into one message. Then it shows how
 * full the context window is.
 */
export async function ask(messages: Message[], tools: Tool[], show: Show): Promise<Message> {
  const working = show.working(); // a sign of life until its first words arrive
  try {
    return await streamReply(messages, tools, show, working);
  } finally {
    working(); // stopped, whatever happened
  }
}

// 0 in the demo, so every run gives the same answer; evals.ts samples normally (TEMPERATURE=0.7) to see the spread
const temperature = () => Number(process.env.TEMPERATURE ?? 0);

async function streamReply(messages: Message[], tools: Tool[], show: Show, working: () => void): Promise<Message> {
  const response = await fetch(MODEL, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      messages,
      temperature: temperature(),
      max_tokens: 3000,
      stream: true,
      stream_options: { include_usage: true },
      ...(tools.length ? { tools: tools.map(describe), parallel_tool_calls: false } : {}), // one tool request per reply
    }),
  });

  if (!response.ok) {
    // A refused request comes back as an error, not a stream: say so instead of returning an empty reply.
    throw new Error(`the model server said ${response.status}: ${await response.text()}`);
  }

  const reply: Message = { role: "assistant", content: "" };
  let used = 0;
  for await (const line of lines(response)) {
    if (!line.startsWith("data: ") || line === "data: [DONE]") {
      continue;
    }
    const chunk: Chunk = JSON.parse(line.slice(6));
    used = chunk.usage?.total_tokens ?? used;
    const delta = chunk.choices[0]?.delta ?? {};

    if (delta.content || delta.tool_calls) {
      working(); // the first words are here
    }
    if (delta.content) {
      reply.content += delta.content;
      await show.text(delta.content);
    }
    for (const piece of delta.tool_calls ?? []) {
      reply.tool_calls ??= [];
      const call = (reply.tool_calls[piece.index] ??= { id: "", type: "function", function: { name: "", arguments: "" } });
      call.id ||= piece.id ?? "";
      if (piece.function?.name) {
        call.function.name += piece.function.name;
        await show.call(piece.function.name);
      }
      if (piece.function?.arguments) {
        call.function.arguments += piece.function.arguments;
        await show.args(piece.function.arguments);
      }
    }
  }
  if (!reply.tool_calls) {
    await show.text("\n");
  }
  if (used) {
    // The whole conversation goes back every turn, so the context window fills up: watch this number.
    await show.context(used, await contextWindow());
  }
  return reply;
}

/** One token of the model's answer: how likely it was, and the next likeliest tokens it nearly wrote instead. */
export type Odds = { token: string; p: number; next: { token: string; p: number }[] };

type Step = { token: string; logprob: number; top_logprobs: { token: string; logprob: number }[] };

/**
 * How sure the model was of each token of its last answer (the web page draws this). The server can't stream odds
 * while tools are on, so this sends the same request again without streaming: at temperature 0, the same answer.
 */
export async function oddsOf(messages: Message[], tools: Tool[]): Promise<Odds[]> {
  const response = await fetch(MODEL, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      messages: messages.slice(0, -1), // everything before the answer
      temperature: 0,
      max_tokens: 3000,
      logprobs: true, // the odds of each token it writes, and the 4 likeliest at that point
      top_logprobs: 4,
      ...(tools.length ? { tools: tools.map(describe), parallel_tool_calls: false } : {}), // one tool request per reply
    }),
  });
  const body: { choices: { logprobs?: { content?: Step[] } }[] } = await response.json();
  return (body.choices[0]?.logprobs?.content ?? []).map((step) => ({
    token: step.token,
    p: Math.exp(step.logprob),
    next: step.top_logprobs
      .filter((t) => t.token !== step.token)
      .slice(0, 3)
      .map((t) => ({ token: t.token, p: Math.exp(t.logprob) })),
  }));
}

/** How the API wants a tool described: a name, a description, and its arguments as JSON Schema. */
function describe(tool: Tool) {
  return {
    type: "function",
    function: {
      name: tool.name,
      description: tool.description,
      parameters: {
        type: "object",
        properties: Object.fromEntries(tool.params.map((param) => [param, { type: "string" }])),
        required: tool.params,
      },
    },
  };
}

/** The context window size, from llama-server's /props (it is set when the server starts, with -c). */
async function contextWindow(): Promise<number> {
  const props: { default_generation_settings?: { n_ctx?: number } } = await (await fetch(`${SERVER}/props`)).json();
  return props.default_generation_settings?.n_ctx ?? 0;
}

/** The streamed reply, one line at a time (server-sent events: "data: {...}"). */
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
