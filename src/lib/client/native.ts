"use client";
import { Capacitor } from "@capacitor/core";

// True inside the Capacitor Android shell; false on the web and during SSR.
export function isNativeApp(): boolean {
  try {
    return Capacitor.isNativePlatform();
  } catch {
    return false;
  }
}
