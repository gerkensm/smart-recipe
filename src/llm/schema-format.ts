export function makeOpenAIStrictSchema(sourceSchema: unknown): Record<string, unknown> {
  const cloned = structuredClone(sourceSchema) as Record<string, unknown>;
  delete cloned.$schema;
  delete cloned.$id;
  inlineLocalRefs(cloned, cloned);
  simplifyForOpenAI(cloned);
  requireAllObjectProperties(cloned);
  return cloned;
}

function inlineLocalRefs(node: unknown, root: Record<string, unknown>): void {
  if (!node || typeof node !== "object") return;
  if (Array.isArray(node)) {
    node.forEach((child) => inlineLocalRefs(child, root));
    return;
  }
  const object = node as Record<string, unknown>;
  const ref = object.$ref;
  if (typeof ref === "string" && ref.startsWith("#/")) {
    const target = ref
      .slice(2)
      .split("/")
      .reduce<unknown>((current, part) => (current && typeof current === "object" ? (current as Record<string, unknown>)[part] : undefined), root);
    if (target && typeof target === "object") {
      delete object.$ref;
      Object.assign(object, structuredClone(target));
    }
  }
  for (const child of Object.values(object)) inlineLocalRefs(child, root);
}

function simplifyForOpenAI(value: unknown): void {
  if (!value || typeof value !== "object") return;
  if (Array.isArray(value)) {
    value.forEach(simplifyForOpenAI);
    return;
  }
  const object = value as Record<string, unknown>;
  if ("const" in object) {
    object.enum = [object.const];
    delete object.const;
  }
  for (const key of ["default", "examples", "uniqueItems", "if", "then", "else", "patternProperties"]) {
    delete object[key];
  }
  for (const child of Object.values(object)) simplifyForOpenAI(child);
}

function requireAllObjectProperties(value: unknown): void {
  if (!value || typeof value !== "object") return;
  if (Array.isArray(value)) {
    value.forEach(requireAllObjectProperties);
    return;
  }
  const object = value as Record<string, unknown>;
  if (object.type === "object" && object.properties && typeof object.properties === "object") {
    object.required = Object.keys(object.properties as Record<string, unknown>);
  }
  for (const child of Object.values(object)) requireAllObjectProperties(child);
}
