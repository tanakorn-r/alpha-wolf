import type { CapacitorConfig } from "@capacitor/cli";

// Native shell config. `webDir` is the Vite build output (apps/web/dist).
// For device live-reload against a running dev server, export CAP_SERVER_URL
// to your machine's LAN address before `npm run cap:sync`, e.g.
//   CAP_SERVER_URL=http://192.168.1.20:4200 npm run cap:sync
// Leave it unset for a real (bundled) build so the app serves from webDir.
const devServerUrl = process.env.CAP_SERVER_URL?.trim();

const config: CapacitorConfig = {
  appId: "com.alphawolf.app",
  appName: "Alpha Wolf",
  webDir: "dist",
  backgroundColor: "#0e0e10",
  ios: {
    backgroundColor: "#0e0e10",
    contentInset: "always",
  },
  android: {
    backgroundColor: "#0e0e10",
  },
  server: {
    androidScheme: "https",
    ...(devServerUrl ? { url: devServerUrl, cleartext: true } : {}),
  },
};

export default config;
