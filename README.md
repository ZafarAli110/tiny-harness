# tiny-harness

A tiny coding-agent harness, built in six steps, to see how Claude Code and friends work.
**For learning, not production.** Everything runs on your own laptop, with a small open model (Qwen3.5-4B); no
account, no API key, nothing leaves your machine.

An agent is a model in a loop: it asks for a tool, the app runs it, the model reads the result and decides what to do
next. The **harness** is everything around that loop: what the model sees, what it may do, when it must stop, and how
"done" is decided. This repository builds one from nothing, one piece at a time, and shows the failure each piece fixes.

> **Warning.** From step 2 on, the agent can run shell commands on your computer, and in steps 2 and 3 nobody is asked
> first. That is the lesson of step 4, but it means the model could, in principle, run anything you could. Run it in a
> folder and on a machine you are comfortable with, and read each step before you run it.

## The six steps

Each file in `agent/` is the one before it plus a few lines marked `// ← new`. Read `agent/types.ts` first.

| Step | File | Adds | What you should see |
|---|---|---|---|
| 1 | `agent/1-loop.ts` | the bare loop, one tool (`read_file`) | it reads `tickets.csv`, then adds the hours in its head and gets the average wrong |
| 2 | `agent/2-command.ts` | `run_command`, a shell | it has a way to work the sum out, and still guesses |
| 3 | `agent/3-rules.ts` | the project's rules (`RULES.md`) | told to use a command for sums, it runs one and gets it right |
| 4 | `agent/4-permission.ts` | permission | every command waits for your y/n |
| 5 | `agent/5-limit.ts` | a turn limit | a loop the model will never end is stopped after 8 turns |
| 6 | `agent/6-verify.ts` | tests decide "done" | on a web page task, the site's tests fail, the failure goes back to the model, and it fixes the page |

`agent/final.ts` is the same loop with every piece behind a switch; the web page and `tickets.ts` / `website.ts` use it.

## Setup

You need about 3 GB of disk space (most of it the model) and an internet connection for the first run. The setup
scripts install three things, skip any that are already there, and can be run again safely:

1. [Bun](https://bun.sh), which runs the TypeScript;
2. [llama.cpp](https://github.com/ggml-org/llama.cpp)'s `llama-server`, which runs the model, added to your PATH;
3. the model, [Qwen3.5-4B, 4-bit](https://huggingface.co/unsloth/Qwen3.5-4B-GGUF) (`Qwen3.5-4B-Q4_K_M.gguf`, about
   2.7 GB), saved into `models/` where the demo looks for it. A half-finished download resumes where it stopped.

### Windows

In PowerShell, in this folder:

```powershell
powershell -ExecutionPolicy Bypass -File .\setup.ps1
```

llama.cpp goes into `%LOCALAPPDATA%\tiny-harness\llama.cpp` (the CPU build: no graphics card needed). Then **open a new
terminal** so it sees the updated PATH.

### macOS and Linux

In a terminal, in this folder:

```bash
./setup.sh
```

llama.cpp goes into `~/.tiny-harness/llama.cpp`, and a line is added to your shell's startup file (`~/.zshrc`,
`~/.bash_profile` or `~/.bashrc`). Then **open a new terminal**. If you already have llama.cpp (for example from
`brew install llama.cpp`), the script uses yours.

### Doing it by hand instead

Install Bun and llama.cpp yourself, then either put the model file in `models/`, or skip it: `server.ts` downloads it
from Hugging Face on the first run if `models/` is empty.

## Run it

**1. Start the model and the web page,** and leave this terminal running:

```bash
bun server.ts
```

It starts `llama-server` on port 8080 (its log goes to `llama-server.log`) and the web page on
<http://localhost:3008>. Ctrl-C stops both.

**2. In a second terminal, run the steps:**

```bash
bun agent/1-loop.ts
bun agent/2-command.ts
bun agent/3-rules.ts
bun agent/4-permission.ts
bun agent/5-limit.ts
bun agent/6-verify.ts
```

Each turn of the loop is marked, with every message the model reads. The model runs at temperature 0, so a step gives
the same answer every time on the same machine.

**The web page** has three tabs: what tokens are, the model's odds for its next word, and the agent with every harness
piece as a switch.

**More to try:**

- `bun tickets.ts` and `bun website.ts`: the two tasks on the complete agent; switch pieces on in the settings at the
  bottom of each file.
- `bun llm.ts`: the model on its own, one idea at a time.
- `bun evals.ts`: the website task many times, with and without tests, and a pass rate for each. Slow: each run is a
  whole agent run.

## How the code is laid out

```
agent/       the story: types.ts, the six steps, final.ts
harness/     what the harness adds: tools, rules, permission, verify and evaluate
lib/         plumbing you can skip: talking to llama-server, printing to the terminal
tickets.ts   task: the average time per ticket in tickets.csv
website.ts   task: a Contact form for the page in site/ (its tests: site/site.test.ts, its rules: site/RULES.md)
server.ts    the web page's server; playground.html is the page
```

## What it leaves out

It is tiny on purpose. A real harness such as Claude Code, Copilot, Cursor or Codex adds, among much else: memory
between sessions, a real sandbox for commands, several tool calls per reply, cost and time budgets, and a way to plug in
your own tools (MCP). The six decisions are the same; they make them for you, and let you change them.

## Troubleshooting

- **`llama-server not found`:** open a new terminal after the setup, so PATH is up to date.
- **`A llama-server is already running on :8080`:** stop the other one, or use it with `USE_RUNNING_MODEL=1 bun server.ts`.
- **Slow:** without a graphics card the model runs on the CPU. On a recent laptop expect a minute or two for each of
  steps 1 to 5, and several minutes for step 6, which writes a whole web page.
- **Windows: the agent writes Unix commands** such as `python3` or `awk`: it is told it has PowerShell, but small models
  slip. It reads the error and usually tries again; installing Python helps.
- **macOS: "cannot be opened because the developer cannot be verified":** if you downloaded llama.cpp through a browser
  rather than the setup script, run `xattr -dr com.apple.quarantine ~/.tiny-harness/llama.cpp`.

## Licence

MIT. See [LICENSE](LICENSE).
