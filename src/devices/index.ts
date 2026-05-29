export * from "./adapter.js";
export * from "./api.js";
export * from "./mc/adapter.js";
export * from "./tm/adapter.js";
export * from "./tm/api.js";
export * from "./tm/client.js";
export * from "./tm/errors.js";
export * from "./tm/payload.js";
export * from "./tm/prompts.js";
export * from "./tm/schema.js";
export * from "./tm/types.js";

import { MonsieurCuisineAdapter } from "./mc/adapter.js";
import { ThermomixAdapter } from "./tm/adapter.js";
import type { DeviceAdapter } from "./adapter.js";

export function getDeviceAdapter(id: "mc" | "tm"): DeviceAdapter {
  if (id === "tm") {
    return new ThermomixAdapter();
  }
  return new MonsieurCuisineAdapter();
}
