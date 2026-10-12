/**
 * Read the event contracts' declared kind conditions, not an independent selector/kind registry.
 * This supports the actual inline type + kind-only allOf/if/then shapes in current contracts;
 * an unfamiliar selector constraint fails closed rather than guessing its nullability.
 */
export function eventSupportsSelector(schema, kind, selector) {
  if (!schema?.properties?.kind?.enum?.includes(kind)) return false;
  const base = schema.properties[selector];
  if (!base) return false;
  let required = schema.required?.includes(selector) ?? false;
  const constraints = [base];
  for (const branch of schema.allOf ?? []) {
    if (
      branch.else?.properties?.[selector] ||
      branch.else?.required?.includes(selector)
    )
      return false;
    const constraint = branch.then?.properties?.[selector];
    const requires = branch.then?.required?.includes(selector) ?? false;
    if (!constraint && !requires) continue;
    const condition = branch.if?.properties?.kind;
    if (
      !condition ||
      Object.keys(branch.if).some(
        (key) => !["properties", "required"].includes(key),
      ) ||
      branch.if.required?.some((field) => field !== "kind") ||
      Object.keys(branch.if.properties).some((field) => field !== "kind") ||
      (!Array.isArray(condition.enum) && typeof condition.const !== "string")
    )
      return false;
    const applies = condition.enum?.includes(kind) ?? condition.const === kind;
    if (!applies) continue;
    if (constraint) constraints.push(constraint);
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

export function kindsSupportingSelectors(schema, selectors) {
  return (schema?.properties?.kind?.enum ?? []).filter((kind) =>
    selectors.every((selector) =>
      eventSupportsSelector(schema, kind, selector),
    ),
  );
}
