/**
 * PERMISSION: a person approves risky actions. The model can ask for anything; code decides what runs without asking.
 */
import type { Show } from "../lib/show.ts";
import type { Tool } from "../agent/types.ts";

/** Ask a person before a risky tool runs (in the terminal, or with buttons on the page). Reading goes ahead. */
export async function allowed(tool: Tool | undefined, args: Record<string, string>, show: Show): Promise<boolean> {
  if (!tool?.risky) {
    return true;
  }
  return show.ask(`Allow ${tool.name}(${args.path ?? args.command ?? ""})?`);
}
