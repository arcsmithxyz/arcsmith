"use client";

import { useSyncExternalStore } from "react";

// One shared 1-second ticker for every countdown on the page.
const listeners = new Set<() => void>();
let timer: ReturnType<typeof setInterval> | undefined;

function subscribe(listener: () => void) {
  listeners.add(listener);
  timer ??= setInterval(() => listeners.forEach((l) => l()), 1000);
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0 && timer) {
      clearInterval(timer);
      timer = undefined;
    }
  };
}

const nowSeconds = () => Math.floor(Date.now() / 1000);

/** Current unix time in seconds, ticking every second. 0 during server rendering. */
export function useNow() {
  return useSyncExternalStore(subscribe, nowSeconds, () => 0);
}
