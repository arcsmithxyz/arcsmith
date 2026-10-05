import { fetchPoolsOfHook } from "../subgraph";
import { cached } from "./cache";

/**
 * Every pool on a kernel, with its stats. Shared by the feed and the analytics page, so they
 * spend one index query between them; pools only appear on launches, so ten minutes is fresh enough.
 */
export function kernelPools(kernel: string) {
  return cached(`kernel-pools:${kernel.toLowerCase()}`, 600, () => fetchPoolsOfHook(kernel), { keep: true });
}
