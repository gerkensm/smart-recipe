const ansi = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
  red: "\x1b[31m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  cyan: "\x1b[36m",
};

export function blankLine(): void {
  console.log();
}

export function printHeading(message: string): void {
  console.log(`  ${ansi.bold}${message}${ansi.reset}`);
}

export function printWarning(message: string): void {
  console.log(`  ${ansi.bold}${ansi.yellow}⚠  ${message}${ansi.reset}`);
}

export function printError(message: string): void {
  console.log(`  ${ansi.red}✗ ${message}${ansi.reset}`);
}

export function printSuccess(message: string): void {
  console.log(`  ${ansi.green}✓ ${message}${ansi.reset}`);
}

export function printStatus(message: string): void {
  console.error(`  ${ansi.dim}${message}${ansi.reset}`);
}

export function colorCyan(message: string): string {
  return `${ansi.cyan}${message}${ansi.reset}`;
}

export function colorBold(message: string): string {
  return `${ansi.bold}${message}${ansi.reset}`;
}

export function colorDim(message: string): string {
  return `${ansi.dim}${message}${ansi.reset}`;
}
