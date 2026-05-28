export * from "./adapter.js";
export * from "./mc/adapter.js";
export * from "./tm/adapter.js";

import { MonsieurCuisineAdapter } from "./mc/adapter.js";
import { ThermomixAdapter } from "./tm/adapter.js";
import type { DeviceAdapter } from "./adapter.js";

export function getDeviceAdapter(id: "mc" | "tm"): DeviceAdapter {
  if (id === "tm") {
    return new ThermomixAdapter();
  }
  return new MonsieurCuisineAdapter();
}
