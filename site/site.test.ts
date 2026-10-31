/**
 * The site's own tests: what "a Contact section, done properly" means for this page. They belong to the project, not
 * to the agent; anyone can run them (bun test site), and the harness runs them when the agent says it is done.
 */
import { expect, test } from "bun:test";

const html = await Bun.file(`${import.meta.dir}/index.html`).text();
const css = await Bun.file(`${import.meta.dir}/styles.css`).text();

/** Every CSS rule: its selector and what is inside its braces. */
function rules(stylesheet: string): { selector: string; body: string }[] {
  const plain = stylesheet.replace(/\/\*[\s\S]*?\*\//g, ""); // without comments
  return [...plain.matchAll(/([^{}]+)\{([^}]*)\}/g)].map((match) => ({ selector: match[1]!.trim(), body: match[2]! }));
}
const before = rules(await Bun.file(`${import.meta.dir}/original.css`).text()).map((rule) => rule.selector);
const now = rules(css).map((rule) => rule.selector);
const added = rules(css).filter((rule) => !before.includes(rule.selector)); // the agent's new CSS
const classes = new Set([...html.matchAll(/class="([^"]+)"/g)].flatMap((match) => match[1]!.split(/\s+/))); // used in the page

test("Contact section", () => {
  expect(html.includes('id="contact"') && html.includes(">Contact</h2>")).toBe(true);
});

test("Name, Email and Message labels", () => {
  expect(['for="name"', 'for="email"', 'for="message"'].every((label) => html.includes(label))).toBe(true);
});

test("Send button", () => {
  expect(/<button[^>]*>\s*Send\s*<\/button>/.test(html)).toBe(true);
});

test("nav link to #contact", () => {
  expect(html.includes('href="#contact"')).toBe(true);
});

test("page's classes, no style attributes", () => {
  const section = html.match(/<section[^>]*id="contact"[^>]*>/)?.[0] ?? "";
  expect(section.includes('class="section"') && !html.includes("style=")).toBe(true);
});

test("About, Schedule and Venue kept", () => {
  expect(['id="about"', 'id="schedule"', 'id="venue"'].every((id) => html.includes(id))).toBe(true);
});

test("each label above its field", () => {
  // a new rule for the form or its fields that stacks label and field: display: block, a grid, or a flex column
  const stacks = added.some((rule) => /\b(form|input|label|textarea)\b|contact/.test(rule.selector) &&
    /display:\s*(block|grid)|flex-direction:\s*column/.test(rule.body));
  expect(stacks).toBe(true);
});

test("every new CSS class is used in index.html", () => {
  // CSS for a class the page does not have changes nothing you can see
  const used = added.flatMap((rule) => [...rule.selector.matchAll(/\.([\w-]+)/g)].map((match) => match[1]!));
  expect(used.every((name) => classes.has(name))).toBe(true);
});

test("every existing CSS rule kept", () => {
  expect(before.every((s) => now.includes(s))).toBe(true);
});
