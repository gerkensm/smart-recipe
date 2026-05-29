import process from "node:process";
import fs from "node:fs";
import tty from "node:tty";
import {
  confirm as inquirerConfirm,
  input as inquirerInput,
  password as inquirerPassword,
  select as inquirerSelect
} from "@inquirer/prompts";

let ttyStream: tty.ReadStream | undefined;

function getInteractiveInput() {
  if (process.platform === "win32") {
    return process.stdin;
  }
  if ((process.stdin as any).readableEnded || !(process.stdin as any).readable) {
    if (!ttyStream) {
      try {
        const fd = fs.openSync("/dev/tty", "r");
        ttyStream = new tty.ReadStream(fd);
      } catch {
        return process.stdin;
      }
    }
    return ttyStream;
  }
  return process.stdin;
}

export function confirm(options: Parameters<typeof inquirerConfirm>[0]) {
  return inquirerConfirm(options, { input: getInteractiveInput() });
}

export function input(options: Parameters<typeof inquirerInput>[0]) {
  return inquirerInput(options, { input: getInteractiveInput() });
}

export function password(options: Parameters<typeof inquirerPassword>[0]) {
  return inquirerPassword(options, { input: getInteractiveInput() });
}

export function select<T>(options: Parameters<typeof inquirerSelect<T>>[0]) {
  return inquirerSelect<T>(options, { input: getInteractiveInput() });
}
