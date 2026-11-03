"use client";
import { useSyncExternalStore } from "react";
import { emptyData, parseData, type Data } from "./carcare";

export const KEY = "carcare.v2";
const LEGACY_KEY = "carcare.v1";
type Snapshot = { data: Data; error: string | null; legacy: boolean };
let snapshot: Snapshot | null = null;
let storedRaw: string | null = null;
let storedLegacy: string | null = null;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach(listener => listener());
function read() {
  try {
    storedRaw = localStorage.getItem(KEY);
    storedLegacy = localStorage.getItem(LEGACY_KEY);
    const raw = storedRaw ?? storedLegacy;
    snapshot = { data: raw === null ? emptyData() : parseData(raw), error: null, legacy: storedRaw === null && storedLegacy !== null };
  } catch {
    snapshot = { data: emptyData(), error: "저장된 데이터를 읽을 수 없습니다. 브라우저 저장 권한 또는 데이터 형식을 확인해 주세요. 원본 데이터는 보존되어 있습니다.", legacy: false };
  }
}
function getSnapshot() { if (!snapshot) read(); return snapshot; }
const serverSnapshot = () => null;
function onStorage(event: StorageEvent) {
  if (event.key === KEY || event.key === LEGACY_KEY || event.key === null) { read(); emit(); }
}
function subscribe(listener: () => void) {
  listeners.add(listener);
  if (listeners.size === 1) window.addEventListener("storage", onStorage);
  return () => { listeners.delete(listener); if (!listeners.size) window.removeEventListener("storage", onStorage); };
}
export const useCarCare = () => useSyncExternalStore(subscribe, getSnapshot, serverSnapshot);
export function commit(data: Data, recover = false, expected?: Data) {
  if (!recover && expected && snapshot?.data !== expected) throw new Error("다른 탭에서 데이터가 변경되었습니다. 최신 내용을 확인한 후 다시 시도해 주세요.");
  if (snapshot?.error && !recover) throw new Error("저장된 데이터를 읽을 수 없어 변경을 중단했습니다. 원본을 확인하거나 전체 초기화를 진행해 주세요.");
  try {
    if (!recover && (localStorage.getItem(KEY) !== storedRaw || localStorage.getItem(LEGACY_KEY) !== storedLegacy)) {
      read(); emit();
      throw new Error("다른 탭에서 데이터가 변경되었습니다. 최신 내용을 확인한 후 다시 시도해 주세요.");
    }
    const raw = JSON.stringify(data);
    // Persist first: failed writes must not publish unsaved React state.
    localStorage.setItem(KEY, raw);
    storedRaw = raw;
    snapshot = { data, error: null, legacy: false };
    emit();
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("다른 탭")) throw error;
    throw new Error("데이터 저장에 실패했습니다. 브라우저 저장 공간과 권한을 확인해 주세요. 변경 사항은 적용되지 않았습니다.");
  }
}
