import { Defuddle } from "defuddle/node";

export async function htmlToMarkdown(html: string, url: string): Promise<{ title: string; markdown: string }> {
  const parsed = await suppressKnownDefuddleDiagnostics(() =>
    Defuddle(html, url, { markdown: true, separateMarkdown: true })
  );
  const title = parsed.title || "";
  const markdown = parsed.contentMarkdown || parsed.content || "";
  return { title, markdown: markdown.trim() };
}

async function suppressKnownDefuddleDiagnostics<T>(fn: () => Promise<T>): Promise<T> {
  const originalLog = console.log;
  const originalWarn = console.warn;
  const shouldSuppress = (args: unknown[]) => {
    const text = String(args[0] ?? "");
    return (
      text.startsWith("Initial parse returned very little content") ||
      text.startsWith("Picture element without img fallback")
    );
  };

  console.log = (...args: unknown[]) => {
    if (!shouldSuppress(args)) originalLog(...args);
  };
  console.warn = (...args: unknown[]) => {
    if (!shouldSuppress(args)) originalWarn(...args);
  };

  try {
    return await fn();
  } finally {
    console.log = originalLog;
    console.warn = originalWarn;
  }
}
