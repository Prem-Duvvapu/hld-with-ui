/**
 * Read evidence contracts' declared kind conditions, not an independent selector/kind registry.
 * This supports the actual inline type + kind-only allOf/if/then shapes in current contracts;
 * an unfamiliar selector constraint fails closed rather than guessing its nullability.
 */
function selectorConstraint(value, references) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  if (!Object.hasOwn(value, "$ref")) return value;
  // Resolve only an explicitly supplied scalar owner. No remote loading, ref chains or
  // guessed nullable/intersection semantics; unfamiliar reference shapes fail closed.
  if (
    typeof value.$ref !== "string" ||
    Object.keys(value).some(
      (key) => !["$ref", "title", "description"].includes(key),
    ) ||
    !Object.hasOwn(references, value.$ref)
  )
    return null;
  const resolved = references[value.$ref];
  if (
    !resolved ||
    !["string", "integer", "number", "boolean"].includes(resolved.type) ||
    ["$ref", "anyOf", "oneOf", "allOf"].some((key) =>
      Object.hasOwn(resolved, key),
    )
  )
    return null;
  return resolved;
}

export function eventSupportsSelector(schema, kind, selector, references = {}) {
  if (!schema?.properties?.kind?.enum?.includes(kind)) return false;
  const base = selectorConstraint(schema.properties[selector], references);
  if (!base) return false;
  let required = schema.required?.includes(selector) ?? false;
  const constraints = [base];
  for (const branch of schema.allOf ?? []) {
    if (
      Object.hasOwn(branch.else?.properties ?? {}, selector) ||
      branch.else?.required?.includes(selector)
    )
      return false;
    const hasConstraint = Object.hasOwn(
      branch.then?.properties ?? {},
      selector,
    );
    const constraint = branch.then?.properties?.[selector];
    const requires = branch.then?.required?.includes(selector) ?? false;
    if (!hasConstraint && !requires) continue;
    const condition = branch.if?.properties?.kind;
    if (
      !condition ||
      Object.keys(branch.if).some(
        (key) => !["properties", "required", "type"].includes(key),
      ) ||
      (Object.hasOwn(branch.if, "type") && branch.if.type !== "object") ||
      branch.if.required?.some((field) => field !== "kind") ||
      Object.keys(branch.if.properties).some((field) => field !== "kind") ||
      (!Array.isArray(condition.enum) && typeof condition.const !== "string")
    )
      return false;
    const applies = condition.enum?.includes(kind) ?? condition.const === kind;
    if (!applies) continue;
    if (hasConstraint) {
      if (constraint === false) return false;
      const resolved = selectorConstraint(constraint, references);
      if (!resolved) return false;
      constraints.push(resolved);
    }
    required ||= requires;
  }
  if (constraints.some((constraint) => constraint.type === "null"))
    return false;
  return (
    required &&
    constraints.some(
      (constraint) =>
        typeof constraint.type === "string" && constraint.type !== "null",
    )
  );
}

export function kindsSupportingSelectors(schema, selectors, references = {}) {
  return (schema?.properties?.kind?.enum ?? []).filter((kind) =>
    selectors.every((selector) =>
      eventSupportsSelector(schema, kind, selector, references),
    ),
  );
}
