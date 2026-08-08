/**
 * Allow-listed UI-action bus: lets the agent reach view-local controls that are
 * NOT store state (camera reset, leaderboard expand, etc.) with the same safety
 * as the structured proposal — the host registers handlers, the agent can only
 * invoke registered ids. No arbitrary DOM.
 */

export interface UiActionArgs {
  [key: string]: unknown;
}

type UiActionHandler = (args?: UiActionArgs) => void;

/** A registered, agent-invokable UI action. */
export interface UiActionDef {
  id: string;
  /** Short label for the agent / tool schema. */
  label: string;
  handler: UiActionHandler;
}

const registry = new Map<string, UiActionDef>();

/** Register (or replace) an agent-invokable UI action. Called by the host on init. */
export function registerUiAction(id: string, label: string, handler: UiActionHandler): void {
  registry.set(id, { id, label, handler });
}

/** Remove a registered action (host teardown). */
export function unregisterUiAction(id: string): void {
  registry.delete(id);
}

/** True if the agent may invoke `id`. */
export function isUiActionRegistered(id: string): boolean {
  return registry.has(id);
}

/** Invoke a registered action by id. Returns false if unregistered (ignored). */
export function dispatchUiAction(id: string, args?: UiActionArgs): boolean {
  const def = registry.get(id);
  if (!def) return false;
  try {
    def.handler(args);
  } catch {
    // A view action must never break the turn — swallow + report not-dispatched.
    return false;
  }
  return true;
}

/** All registered action ids + labels (for the agent tool schema / introspection). */
export function listUiActions(): Array<{ id: string; label: string }> {
  return [...registry.values()].map(({ id, label }) => ({ id, label }));
}

/** Dispatch a batch of {id, args} (as emitted in an AtlasProposal). */
export function dispatchUiActions(
  actions: Array<{ id: string; args?: UiActionArgs }>,
): { dispatched: string[]; unknown: string[] } {
  const dispatched: string[] = [];
  const unknown: string[] = [];
  for (const a of actions ?? []) {
    if (dispatchUiAction(a.id, a.args)) dispatched.push(a.id);
    else unknown.push(a.id);
  }
  return { dispatched, unknown };
}
