"use client";

import { useSyncExternalStore } from "react";
import { today } from "./carcare";

function subscribe(listener: () => void) {
  const timer = window.setInterval(listener, 60000);
  window.addEventListener("focus", listener);
  document.addEventListener("visibilitychange", listener);
  return () => { window.clearInterval(timer); window.removeEventListener("focus", listener); document.removeEventListener("visibilitychange", listener); };
}
const clientDate = () => today();
const serverDate = () => "";
// No clock reads during prerender/hydration. Re-check on focus and across midnight.
export const useLocalDate = () => useSyncExternalStore(subscribe, clientDate, serverDate);
