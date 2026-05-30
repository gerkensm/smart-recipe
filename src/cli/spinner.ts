import ora from "ora";

export interface CliSpinner {
  update(message: string): void;
  succeed(message?: string): void;
  fail(message?: string): void;
  stop(): void;
}

export function createCliSpinner(message: string, enabled: boolean): CliSpinner {
  if (!enabled) return noopSpinner;

  const spinner = ora({
    text: message,
    stream: process.stderr,
  }).start();

  return {
    update(nextMessage: string): void {
      spinner.text = nextMessage;
    },
    succeed(nextMessage?: string): void {
      spinner.succeed(nextMessage);
    },
    fail(nextMessage?: string): void {
      spinner.fail(nextMessage);
    },
    stop(): void {
      spinner.stop();
    },
  };
}

export async function withCliSpinner<T>(
  message: string,
  enabled: boolean,
  task: (spinner: CliSpinner) => Promise<T>,
  options: { successMessage?: string; failureMessage?: string } = {}
): Promise<T> {
  const spinner = createCliSpinner(message, enabled);
  try {
    const result = await task(spinner);
    if (options.successMessage) {
      spinner.succeed(options.successMessage);
    } else {
      spinner.stop();
    }
    return result;
  } catch (error) {
    if (options.failureMessage) {
      spinner.fail(options.failureMessage);
    } else {
      spinner.stop();
    }
    throw error;
  }
}

const noopSpinner: CliSpinner = {
  update(): void {
    // No terminal spinner in JSON or non-interactive modes.
  },
  succeed(): void {
    // No-op.
  },
  fail(): void {
    // No-op.
  },
  stop(): void {
    // No-op.
  },
};
