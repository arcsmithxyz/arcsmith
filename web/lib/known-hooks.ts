/**
 * Hooks whose source code is published on Arc Explorer under a contract name, checked by hand
 * (explorer.arc.io → the address → Contract tab) on 2026-10-02. These are the busy hooks that
 * Blockscout's shared source database doesn't match, so lib/server/hook-labels.ts can't find
 * them on its own. A contract name is whatever its deployer chose: it says what the code is
 * called, not who runs it.
 */
/** Whether a hook's source code is published, and under what contract name. */
export type HookSource = { published: true; name: string; exact: boolean } | { published: false };

export const KNOWN_HOOKS: Record<string, { name: string; exact: boolean }> = {
  "0xb6a65950534f061618b4ae102fbcbb8541a8e0cc": { name: "MinaraFeeHook", exact: false },
  "0x20eead6db6b3d0a4491e9073119dd0ebff166acc": { name: "LaunchHook", exact: true },
  "0x21bdc377265e2a26ba336f24381e67e768253044": { name: "WonkHook", exact: false },
  "0x47e7936ae9891e61c5123db720593c05de7120cc": { name: "LaunchpadHook", exact: true },
  "0xc780c0f4aac690908854d351b8bfda2812daefdc": { name: "PositionManager", exact: false },
};

export function knownHook(address: string) {
  return KNOWN_HOOKS[address.toLowerCase()] ?? null;
}
