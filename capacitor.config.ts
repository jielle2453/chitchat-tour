import type { CapacitorConfig } from "@capacitor/cli";

const url = process.env.CAP_SERVER_URL ?? "https://chitchat-tour.vercel.app";

const config: CapacitorConfig = {
  appId: "com.chitchattour.app",
  appName: "Chitchat Tour",
  webDir: "capacitor-shell",
  server: {
    url,
    cleartext: url.startsWith("http://"),
  },
  android: {
    // Required by background-geolocation: keeps location updates alive past 5 minutes in the background.
    useLegacyBridge: true,
  },
  plugins: {
    // The app is always light: dark status-bar icons even when the phone is in dark mode.
    SystemBars: { style: "LIGHT", initialViewportFitValueHint: "cover" },
  },
};

export default config;
