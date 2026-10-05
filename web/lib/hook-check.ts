import { abilitiesOf, decodePermissions, hookReach, summarizePermissions } from "./permissions";

/**
 * What the Hook Reader and the public hook check API (`/api/v1`) both say about a hook, built
 * in one place so the two can't disagree. Everything here comes from the hook's address alone.
 */

/** Below this much liquidity a pool is too thin to say much about its price (and is often wash traded). */
export const THIN_LIQUIDITY_USD = 100;

/** Shown with every API answer, so apps that display it also show its limits. */
export const CHECK_ABOUT =
  "These are capabilities, not verdicts. They say what a hook's address allows it to do, not what it does. " +
  "A contract's name is chosen by whoever deployed it: it says what the code is called, not who runs it.";

export function describeHook(address: string) {
  const permissions = decodePermissions(address);
  return {
    /** False when no flag is set: v4 only accepts a hook that asks for at least one callback. */
    canBeHook: permissions.some((p) => p.enabled),
    reach: hookReach(address),
    summary: summarizePermissions(address),
    abilities: abilitiesOf(address).map((a) => ({
      key: a.key,
      question: a.question,
      audience: a.audience,
      can: a.can,
      /** How much a "yes" should worry someone; only meaningful when `can` is true. */
      severity: a.severity,
      answer: a.can ? a.yes : a.no,
    })),
    permissions: permissions.map((p) => ({ key: p.key, bit: p.bit, label: p.label, enabled: p.enabled, risk: p.risk })),
  };
}

/** Just the keys of the abilities a hook has, for compact lists. */
export function abilityKeysOf(address: string) {
  return abilitiesOf(address)
    .filter((a) => a.can)
    .map((a) => a.key);
}
