import ReactDOM from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter } from "react-router-dom";
import App from "./App";
import "./styles.css";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 30_000, retry: 2, refetchOnWindowFocus: false },
    mutations: { retry: 1 }
  }
});

// Alpha Wolf previously shipped a cache-first service worker that could strand Safari on
// an obsolete application bundle. The replacement /sw.js retires existing workers, while
// this cleanup covers browsers that already loaded the current bundle.
if (import.meta.env.PROD) {
  window.addEventListener("load", () => {
    if ("serviceWorker" in navigator) {
      void navigator.serviceWorker.getRegistrations()
        .then((registrations) => Promise.all(registrations.map((registration) => registration.unregister())))
        .catch(() => undefined);
    }
    if ("caches" in window) {
      void caches.keys()
        .then((keys) => Promise.all(keys.filter((key) => key.startsWith("alpha-wolf-")).map((key) => caches.delete(key))))
        .catch(() => undefined);
    }
  });
}

// StrictMode intentionally double-invokes mount effects in dev to catch bugs — that means
// every async effect (like the auth query below) runs, aborts, and reruns on first mount.
// If that first run's response lands before the abort takes effect, it's a genuine two-render
// flash that only exists in dev and has nothing to do with routing/skeleton/cache content —
// removed here to test that theory directly.
ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <QueryClientProvider client={queryClient}>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </QueryClientProvider>
);
