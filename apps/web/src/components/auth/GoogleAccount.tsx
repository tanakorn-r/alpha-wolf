import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { Modal } from "../ui/Modal";
import { acceptCurrentLegal, connectGoogleAccount, deleteAccount, disconnectAccount, downloadAccountExport, loadAuthUser, loadGoogleAuthBootstrap, type AuthUser } from "../../lib/api";
import { useWolfStore } from "../../store/useWolfStore";
import { LocaleSettingsDialog } from "../settings/LocalePreferences";

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
        className="grid h-[38px] w-[38px] flex-none place-items-center rounded-[8px] border border-[#2a2a31] bg-[#161619] text-[#8c8c95] hover:border-[#5a5a62] hover:text-[#ececee] max-[899px]:h-[34px] max-[899px]:w-[34px]"
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
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [confirmation, setConfirmation] = useState("");
  const [forfeit, setForfeit] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
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
  const accept = useMutation({ mutationFn: acceptCurrentLegal, onSuccess: (next) => queryClient.setQueryData(["auth-user"], next) });
  const exportData = useMutation({ mutationFn: downloadAccountExport });
  const removeAccount = useMutation({
    mutationFn: () => deleteAccount({ confirmation, acknowledgeCreditForfeiture: forfeit }),
    onSuccess: async () => {
      await queryClient.cancelQueries();
      queryClient.clear();
      clearAccountState();
      window.location.assign("/");
    },
  });

  if (user?.settings && settingsOpen) {
    return <LocaleSettingsDialog settings={user.settings} onClose={() => setSettingsOpen(false)} />;
  }

  return (
    <Modal title={user ? "Your account" : "Sign in"} onClose={onClose}>
      {user ? (
        <div className="text-center">
          <div className="mx-auto w-fit"><AccountAvatar user={user} large /></div>
          <div className="mt-3 text-[16px] font-extrabold text-[#ececee]">{user.name}</div>
          <div className="mt-1 break-all text-[12px] text-[#8c8c95]">{user.email}</div>
          <div className="mt-4 rounded-[9px] border border-[#2a2a31] bg-[#0e0e10] px-3 py-2.5 text-[11.5px] leading-[1.5] text-[#8c8c95]">
            Your Google identity is connected to AlphaWolf. AlphaWolf stores research notes and portfolio records; it does not hold assets or execute trades.
          </div>
          {!user.legalAccepted ? <div className="mt-3 rounded-[9px] border border-[#f5c451]/35 bg-[#f5c451]/10 p-3 text-left text-[11px] leading-[1.5] text-[#d5c28c]">Review the current <Link className="text-[#74a4ff]" to="/terms" onClick={onClose}>Terms</Link> and <Link className="text-[#74a4ff]" to="/privacy" onClick={onClose}>Privacy Policy</Link>.<button type="button" disabled={accept.isPending} onClick={() => accept.mutate()} className="mt-2 block font-bold text-[#f5c451]">{accept.isPending ? "Saving…" : "Accept current versions"}</button></div> : null}
          <button type="button" onClick={() => setSettingsOpen(true)} className="mt-3 flex w-full items-center justify-between rounded-[9px] border border-[#34343c] bg-[#0e0e10] px-3 py-2.5 text-left text-[11px] font-bold text-[#bcbcc2]"><span>Region &amp; currency</span><span className="text-[#6f6f78]">Settings →</span></button>
          <div className="mt-2 grid grid-cols-2 gap-2">
            <button type="button" onClick={() => exportData.mutate()} disabled={exportData.isPending} className="rounded-[9px] border border-[#34343c] px-3 py-2.5 text-[11px] font-bold text-[#bcbcc2] disabled:opacity-50">{exportData.isPending ? "Preparing…" : "Export my data"}</button>
            <button type="button" onClick={() => setDeleteOpen((value) => !value)} className="rounded-[9px] border border-[#f2575c]/35 px-3 py-2.5 text-[11px] font-bold text-[#f2575c]">Delete account</button>
          </div>
          {exportData.isError ? <div className="mt-2 text-left text-[10.5px] text-[#f2575c]">{exportData.error instanceof Error ? exportData.error.message : "Export failed."}</div> : null}
          {deleteOpen ? <div className="mt-3 rounded-[10px] border border-[#f2575c]/35 bg-[#f2575c]/[0.06] p-3 text-left">
            <div className="text-[11px] font-bold text-[#f2575c]">Permanent deletion</div><p className="mt-1 text-[10.5px] leading-[1.5] text-[#9a9aa3]">This removes your portfolio, transactions, saved AI results, watchlist, support records, replay jobs, sessions, and token balance. Export first if you want a copy.</p>
            <input value={confirmation} onChange={(event) => setConfirmation(event.target.value)} placeholder="Type DELETE" className="mt-2 h-9 w-full rounded-[7px] border border-[#3a3034] bg-[#0e0e10] px-3 text-xs text-[#ececee] outline-none focus:border-[#f2575c]" />
            {(user.aiUsage?.tokens ?? 0) > 0 ? <label className="mt-2 flex items-start gap-2 text-[10px] leading-[1.4] text-[#9a9aa3]"><input type="checkbox" checked={forfeit} onChange={(event) => setForfeit(event.target.checked)} className="mt-0.5" />I understand deletion forfeits {user.aiUsage?.tokens} unused AI tokens, including promotional or purchased tokens. I can contact Support first for a refund question.</label> : null}
            {removeAccount.isError ? <div className="mt-2 text-[10.5px] text-[#f2575c]">{removeAccount.error instanceof Error ? removeAccount.error.message : "Deletion failed."}</div> : null}
            <button type="button" disabled={confirmation !== "DELETE" || removeAccount.isPending || ((user.aiUsage?.tokens ?? 0) > 0 && !forfeit)} onClick={() => removeAccount.mutate()} className="mt-3 w-full rounded-[8px] bg-[#f2575c] px-3 py-2 text-[11px] font-bold text-white disabled:opacity-35">{removeAccount.isPending ? "Deleting…" : "Permanently delete account"}</button>
          </div> : null}
          <nav className="mt-3 flex flex-wrap justify-center gap-3 text-[10px] text-[#6f6f78]"><Link to="/terms" onClick={onClose}>Terms</Link><Link to="/privacy" onClick={onClose}>Privacy</Link><Link to="/refunds" onClick={onClose}>Refunds</Link><Link to="/support" onClick={onClose}>Support</Link></nav>
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
  const [accepted, setAccepted] = useState(false);
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
          if (response.credential) login.mutate({ credential: response.credential, nonce: config.nonce!, acceptTerms: accepted, acceptPrivacy: accepted });
          else setError("Google did not return an account credential.");
        },
      });
      buttonRef.current.replaceChildren();
      const buttonWidth = Math.min(320, Math.max(200, Math.floor(target.getBoundingClientRect().width)));
      window.google.accounts.id.renderButton(buttonRef.current, {
        type: "standard",
        theme: "filled_black",
        size: "large",
        shape: "rectangular",
        text: "continue_with",
        width: buttonWidth,
      });
    }).catch(() => {
      if (active) setError("Google sign-in could not be loaded.");
    });
    return () => {
      active = false;
      window.google?.accounts.id.cancel();
    };
  }, [accepted, bootstrap.data, login.mutate]);

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
      <label className="mx-auto mt-4 flex max-w-[330px] items-start gap-2 text-left text-[10.5px] leading-[1.5] text-[#8c8c95]"><input type="checkbox" checked={accepted} onChange={(event) => setAccepted(event.target.checked)} className="mt-0.5" />I agree to the <Link className="text-[#74a4ff]" to="/terms">Terms</Link> and acknowledge the <Link className="text-[#74a4ff]" to="/privacy">Privacy Policy</Link>.</label>
      <div className={`mt-4 flex min-h-11 justify-center ${accepted ? "" : "pointer-events-none opacity-35"}`} ref={buttonRef} />
      {login.isPending ? <div className="mt-3 text-[11.5px] text-[#3ecf8e]">Verifying your Google account…</div> : null}
      {error ? <div className="mt-3 text-[11.5px] text-[#f2575c]">{error}</div> : null}
      <div className="mt-5 border-t border-[#2a2a31] pt-4 text-[10.5px] leading-[1.5] text-[#5a5a62]">AlphaWolf receives your Google account ID, name, email, and profile picture. Your Google password is never shared. AlphaWolf is a research-notes service and does not open a brokerage account.</div>
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
