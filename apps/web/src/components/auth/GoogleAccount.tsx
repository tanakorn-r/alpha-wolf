import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Modal } from "../ui/Modal";
import { connectGoogleAccount, disconnectAccount, loadAuthUser, loadGoogleAuthBootstrap, type AuthUser } from "../../lib/api";
import { useWolfStore } from "../../store/useWolfStore";

type GoogleCredentialResponse = { credential?: string };
type GoogleIdentity = {
  initialize: (config: { client_id: string; callback: (response: GoogleCredentialResponse) => void; nonce: string; ux_mode: "popup"; auto_select: boolean }) => void;
  renderButton: (element: HTMLElement, config: Record<string, string | number>) => void;
  cancel: () => void;
};

declare global {
  interface Window {
    google?: { accounts: { id: GoogleIdentity } };
  }
}

let googleScriptPromise: Promise<void> | null = null;

export function GoogleAccount() {
  const [open, setOpen] = useState(false);
  const account = useQuery({ queryKey: ["auth-user"], queryFn: loadAuthUser, staleTime: 300_000, retry: 0 });
  const user = account.data ?? null;
  const label = user ? `Google account, ${user.name}` : "Sign in";

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        title={label}
        className="grid h-[38px] w-[38px] flex-none place-items-center rounded-[8px] border border-[#2a2a31] bg-[#161619] text-[#8c8c95] hover:border-[#5a5a62] hover:text-[#ececee]"
        aria-label={label}
      >
        <AccountAvatar user={user} />
      </button>
      {open ? <GoogleAccountModal user={user} onClose={() => setOpen(false)} /> : null}
    </>
  );
}

export function GoogleAccountModal({ user, onClose }: { user: AuthUser | null; onClose: () => void }) {
  const queryClient = useQueryClient();
  const clearAccountState = useWolfStore((state) => state.clearAccountState);
  const logout = useMutation({
    mutationFn: disconnectAccount,
    onSuccess: async () => {
      await queryClient.cancelQueries();
      queryClient.removeQueries({ queryKey: ["portfolio"] });
      queryClient.removeQueries({ queryKey: ["portfolio-watchlist"] });
      queryClient.removeQueries({ queryKey: ["calendar"] });
      queryClient.setQueryData(["auth-user"], null);
      clearAccountState();
      onClose();
    },
  });

  return (
    <Modal title={user ? "Your account" : "Sign in"} onClose={onClose}>
      {user ? (
        <div className="text-center">
          <div className="mx-auto w-fit"><AccountAvatar user={user} large /></div>
          <div className="mt-3 text-[16px] font-extrabold text-[#ececee]">{user.name}</div>
          <div className="mt-1 text-[12px] text-[#8c8c95]">{user.email}</div>
          <div className="mt-4 rounded-[9px] border border-[#2a2a31] bg-[#0e0e10] px-3 py-2.5 text-[11.5px] leading-[1.5] text-[#8c8c95]">
            Your Google identity is connected to AlphaWolf on this device.
          </div>
          <button type="button" onClick={() => logout.mutate()} disabled={logout.isPending} className="mt-4 w-full rounded-[9px] border border-[#f2575c]/40 bg-[#f2575c]/10 px-4 py-2.5 text-[12px] font-bold text-[#f2575c] disabled:opacity-50">
            {logout.isPending ? "Signing out…" : "Sign out"}
          </button>
        </div>
      ) : (
        <GoogleSignIn onConnected={(nextUser) => {
          queryClient.removeQueries({ queryKey: ["portfolio"] });
          queryClient.removeQueries({ queryKey: ["portfolio-watchlist"] });
          queryClient.removeQueries({ queryKey: ["calendar"] });
          queryClient.setQueryData(["auth-user"], nextUser);
          clearAccountState();
          onClose();
        }} />
      )}
    </Modal>
  );
}

function GoogleSignIn({ onConnected }: { onConnected: (user: AuthUser) => void }) {
  const buttonRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState("");
  const bootstrap = useQuery({ queryKey: ["google-auth-bootstrap"], queryFn: loadGoogleAuthBootstrap, staleTime: 0, retry: 0 });
  const login = useMutation({
    mutationFn: connectGoogleAccount,
    onSuccess: onConnected,
    onError: () => setError("Google sign-in could not be verified. Please try again."),
  });

  useEffect(() => {
    const config = bootstrap.data;
    const target = buttonRef.current;
    if (!config?.configured || !config.clientId || !config.nonce || !target) return;
    let active = true;
    void loadGoogleIdentityScript().then(() => {
      if (!active || !window.google || !buttonRef.current) return;
      window.google.accounts.id.initialize({
        client_id: config.clientId!,
        nonce: config.nonce!,
        ux_mode: "popup",
        auto_select: false,
        callback: (response) => {
          if (response.credential) login.mutate({ credential: response.credential, nonce: config.nonce! });
          else setError("Google did not return an account credential.");
        },
      });
      buttonRef.current.replaceChildren();
      window.google.accounts.id.renderButton(buttonRef.current, {
        type: "standard",
        theme: "filled_black",
        size: "large",
        shape: "rectangular",
        text: "continue_with",
        width: 320,
      });
    }).catch(() => {
      if (active) setError("Google sign-in could not be loaded.");
    });
    return () => {
      active = false;
      window.google?.accounts.id.cancel();
    };
  }, [bootstrap.data, login.mutate]);

  if (bootstrap.isLoading) return <div className="py-6 text-center text-[12px] text-[#8c8c95]">Preparing secure sign-in…</div>;
  if (bootstrap.isError) return <AuthError text="The authentication service is unavailable." />;
  if (!bootstrap.data?.configured) {
    return <AuthError text="Google sign-in needs GOOGLE_CLIENT_ID configured on the API before accounts can connect." />;
  }

  return (
    <div className="text-center">
      <div className="mx-auto grid h-12 w-12 place-items-center rounded-[12px] border border-[#3ecf8e]/30 bg-[#3ecf8e]/10 text-[#3ecf8e]">
        <AccountIcon className="h-6 w-6" />
      </div>
      <h3 className="mt-3 text-[16px] font-extrabold text-[#ececee]">Sign in to AlphaWolf</h3>
      <p className="mx-auto mt-1.5 max-w-[330px] text-[12px] leading-[1.55] text-[#8c8c95]">Use your Google account to save identity and unlock account-based features.</p>
      <div className="mt-5 flex min-h-11 justify-center" ref={buttonRef} />
      {login.isPending ? <div className="mt-3 text-[11.5px] text-[#3ecf8e]">Verifying your Google account…</div> : null}
      {error ? <div className="mt-3 text-[11.5px] text-[#f2575c]">{error}</div> : null}
      <div className="mt-5 border-t border-[#2a2a31] pt-4 text-[10.5px] leading-[1.5] text-[#5a5a62]">AlphaWolf receives your Google account ID, name, email, and profile picture. Your Google password is never shared.</div>
    </div>
  );
}

function AccountAvatar({ user, large = false }: { user: AuthUser | null; large?: boolean }) {
  const size = large ? "h-16 w-16 rounded-[16px] text-[20px]" : "h-6 w-6 rounded-[6px] text-[10px]";
  return (
    <span className={`grid flex-none place-items-center overflow-hidden border border-[#3ecf8e]/35 bg-[#3ecf8e]/10 font-bold text-[#3ecf8e] ${size}`}>
      {user?.pictureUrl ? <img src={user.pictureUrl} alt="" referrerPolicy="no-referrer" className="h-full w-full object-cover" /> : user ? user.name.slice(0, 1).toUpperCase() : <AccountIcon className={large ? "h-7 w-7" : "h-4 w-4"} />}
    </span>
  );
}

function AccountIcon({ className }: { className: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={className} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 21a8 8 0 0 0-16 0" />
      <circle cx="12" cy="8" r="4" />
    </svg>
  );
}

function AuthError({ text }: { text: string }) {
  return <div className="rounded-[9px] border border-[#f5c451]/35 bg-[#f5c451]/10 px-3.5 py-3 text-[12px] leading-[1.55] text-[#f5c451]">{text}</div>;
}

function loadGoogleIdentityScript(): Promise<void> {
  if (window.google?.accounts.id) return Promise.resolve();
  if (googleScriptPromise) return googleScriptPromise;
  googleScriptPromise = new Promise((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>('script[src="https://accounts.google.com/gsi/client"]');
    if (existing) {
      existing.addEventListener("load", () => resolve(), { once: true });
      existing.addEventListener("error", () => reject(new Error("Google script failed")), { once: true });
      return;
    }
    const script = document.createElement("script");
    script.src = "https://accounts.google.com/gsi/client";
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Google script failed"));
    document.head.appendChild(script);
  });
  return googleScriptPromise;
}
