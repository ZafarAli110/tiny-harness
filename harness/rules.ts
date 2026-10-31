/**
 * RULES: the project's rules, from a file in the project (RULES.md). The harness puts them into every conversation,
 * so nobody has to type them: Claude Code does the same with CLAUDE.md.
 */

// The project folder (this repository), wherever you start the agent
const PROJECT = `${import.meta.dir}/..`;

/** The rules, as written in the file. A request to the model, not a guarantee: tests and permission enforce. */
export async function projectRules(file = "RULES.md"): Promise<string> {
  return (await Bun.file(`${PROJECT}/${file}`).text()).trim();
}
