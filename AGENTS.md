# SmartRecipe - AI Agent Instructions

Welcome to the SmartRecipe codebase. You are an expert AI coding assistant. Before writing or modifying any code in this repository, you must read, understand, and strictly adhere to the following guidelines.

## 🎯 Project Mission

SmartRecipe is a TypeScript toolkit and CLI that turns almost any recipe page into an editable device-native workflow draft for smart cookers (Monsieur Cuisine Smart / MC3.0, and Thermomix TM7/TM6/TM5).

**Core philosophy:** We translate generic text into highly structured, hardware-specific, localized machine workflows using LLMs, while keeping generation separate from execution.

## 🛠️ Tech Stack & Environment

- **Runtime:** Node.js (>= 20.18)
- **Language:** TypeScript (ES2022, `NodeNext` module resolution, STRICT mode enabled)
- **Module System:** ES Modules (ESM) only.
- **Build Tool:** `tsup`
- **Testing:** `vitest`
- **Key Libraries:** `openai`, `ajv` (Ajv2020), `@sinclair/typebox` (schemas), `playwright` (auth), `cheerio` / `marked`, `pino` (logging), `@inquirer/prompts` / `commander` (CLI).

## 🏗️ Architecture & Separation of Concerns

The project uses strict domain boundaries. Never bypass these boundaries.

- **`src/cli/`**: CLI orchestration, interactive prompts, and terminal rendering. _Rule: No core business logic or API calls happen directly here._
- **`src/devices/`**: The unified `DeviceApi` facade (`createDeviceApi`) and `DeviceAdapter` implementations (`mc` and `tm`). _Rule: Application code must use the unified facade rather than vendor clients where possible._
- **`src/mc/` & `src/tm/`**: Low-level vendor API clients, cookie/auth proxying, and raw payload transmission.
- **`src/sources/` & `src/retriever/`**: Source detection and ingestion. Converts web, MC, or Cookidoo sources into a normalized `RetrievedRecipePage` (Markdown).
- **`src/pipeline/`**: High-level workflow orchestration (`generateSmartRecipe`, `uploadSmartRecipe`).
- **`src/recipes/`**: Schemas, normalization, terminal printing, and mode abstractions.
- **`src/llm/`**: OpenAI API interactions, schema translation, and prompt building.

## 🔑 Core Design Principles

### 1. The Dual-Schema Architecture (CRITICAL)

SmartRecipe utilizes two distinct JSON schemas (defined via `Typebox`) for validation boundaries:

1.  **Model-Optimized Input Schema (`RecipeInputSchema`)**: Flattened, simplified, and tailored for LLM Structured Outputs (OpenAI Strict Mode).
2.  **API-Optimized Payload Schema (`SmartRecipePayloadSchema` / `CookidooPayload`)**: Rigid, nested, hardware-specific JSON required by the target device API.
    **Directive:** Never ask the LLM to generate the final device payload directly. Always generate `RecipeInputSchema`, validate it, and transform it using the device adapters.

### 2. The Split Pipeline

Generating a recipe and uploading a recipe are distinct phases.

- `generateSmartRecipe()` parses the page and calls the LLM. It has _no network side-effects_ beyond the LLM call.
- `uploadSmartRecipe()` handles the authentication and pushes the payload to the device cloud.

### 3. Smart Modes & Hardware Accuracy

The project maps text to specific hardware modes (e.g., `dough`, `blend`, `turbo`, `browning`, `steaming`).
**Directive:** Treat device capabilities as strict physical constraints.

- **NO Hallucinations:** Do not invent fictional hardware revisions, firmware versions, or capabilities for the Monsieur Cuisine Smart or Thermomix.
- Only utilize modes natively supported by the target device schema.

## 💻 Coding Standards

### TypeScript & ESM

- Use `.js` extensions in all relative imports (e.g., `import { X } from "./my-module.js";`).
- Avoid `any`. Use `unknown` and type narrowing, or specific `Typebox` / `Static<T>` types.
- Ensure all exported functions, interfaces, and types are explicitly typed.

### Error Handling

- Never throw generic `Error` objects for domain failures.
- Use specific error classes: `MonsieurCuisineApiError`, `CookidooError`, or `AuthFlowError`.
- Ensure HTTP status codes, original response bodies, and API endpoints are attached to error objects for debugging.

### Logging

- Do not use `console.log` for debugging or operational logs.
- Use the provided `pino` logger (`SmartRecipeLogger` from `src/logging/logger.ts`).
- Only use `console.log` in `src/cli/` when intentionally printing output to the user's terminal.

### Interactive vs. Non-Interactive (CLI)

- CLI commands must gracefully handle both interactive (`TTY`) and non-interactive environments (CI, piping, `--json` flag).
- Wrap prompts with checks to ensure the terminal is interactive; otherwise, fall back to default values, environment variables, or throw clear initialization errors.

## 🧪 Testing Guidelines

- Use `vitest`.
- Mock external network dependencies (OpenAI, Cookidoo API, Monsieur Cuisine API) using appropriate `vitest` mocking strategies or dependency injection.
- Ensure all schema validators and payload mappings are strictly unit-tested.
