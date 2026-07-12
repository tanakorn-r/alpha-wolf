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

// Register service worker for PWA install support. Skipped in dev — a cache-first SW there
// means every source edit gets masked by a stale cached response, making fixes look like
// they never took effect no matter how many times the page is refreshed.
if (import.meta.env.PROD && "serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch(() => {
      // SW registration failing is non-fatal — app works fine without it
    });
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
