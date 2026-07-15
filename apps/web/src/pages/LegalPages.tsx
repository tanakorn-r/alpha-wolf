import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { loadAuthUser, submitSupportRequest } from "../lib/api";

const EFFECTIVE_DATE = "July 15, 2026";

export function TermsPage() {
  return <LegalPage title="Terms of Use" intro="Short terms for a research-and-notes product—not a trading account.">
    <Section title="What AlphaWolf is">AlphaWolf provides portfolio notes, market-data displays, historical comparisons, and AI-generated research prompts. It does not execute trades, hold money or securities, provide brokerage services, or act as your licensed financial adviser.</Section>
    <Section title="Your decisions">AI outputs and market data can be wrong, incomplete, or delayed. Backtests are historical illustrations, not forecasts. You remain responsible for checking information and deciding whether any investment action is suitable for you.</Section>
    <Section title="Accounts">You must provide accurate account information and keep access to your Google account secure. Do not misuse the service, probe other accounts, automate abusive requests, or upload unlawful content.</Section>
    <Section title="AI tokens and payments">AI tokens pay for on-demand model runs and are not money, securities, or transferable assets. They do not expire under the current product rules. If paid checkout is enabled, Stripe processes the payment; AlphaWolf does not receive your full card number. The Refund Policy applies.</Section>
    <Section title="Availability and ownership">The service may change, experience errors, or be discontinued. AlphaWolf owns the application and branding; you retain ownership of the portfolio notes and inputs you provide.</Section>
    <Section title="Liability">To the extent permitted by law, AlphaWolf is provided “as is” and is not liable for trading losses, missed opportunities, or decisions made from AI output or delayed data. Nothing here limits rights that cannot legally be limited.</Section>
    <Section title="Changes and contact">Material changes will use a new version date. Continued account use may require renewed acceptance. Questions can be sent through Support.</Section>
  </LegalPage>;
}

export function PrivacyPage() {
  return <LegalPage title="Privacy Policy" intro="What we store, why we store it, and how to take it with you or delete it.">
    <Section title="Data we collect">When you sign in with Google, we receive your Google account identifier, name, email, and profile picture. We store the portfolio entries, transactions, watchlists, AI requests/results, token balance, support requests, and account settings you choose to use.</Section>
    <Section title="Payments and market data">Stripe processes checkout and card details; AlphaWolf stores a payment/session reference, token quantity, amount, currency, and fulfillment time. Public market information comes from external providers such as Yahoo Finance and is not personal data.</Section>
    <Section title="How we use data">We use account data to isolate your portfolio, restore saved research, calculate balances, prevent duplicate payment fulfillment, provide support, secure sessions, and operate the product.</Section>
    <Section title="Processors">Necessary data may be handled by Google for sign-in, Stripe for payments, OpenAI for requested AI analysis, and our hosting/database providers. We do not sell personal information or use portfolio data to execute trades.</Section>
    <Section title="Retention and control">Account data remains until you delete the account or retention is required to resolve security, fraud, payment, or legal issues. From Your account you can download a JSON copy and permanently delete account-scoped product data.</Section>
    <Section title="Security and children">We use secure, HTTP-only sessions and account-scoped storage, but no online service is risk-free. AlphaWolf is not intended for children under 18.</Section>
    <Section title="Questions">Use the Privacy category on Support for access, correction, export, or deletion questions.</Section>
  </LegalPage>;
}

export function RefundPage() {
  return <LegalPage title="Refund Policy" intro="A simple policy for optional AI-token packs.">
    <Section title="Current test mode">When checkout is visibly marked Stripe test or sandbox, no real payment is taken and there is nothing to refund.</Section>
    <Section title="When live payments are enabled">You may request a refund for an unused AI-token pack within 7 days of purchase. Tokens already consumed are normally non-refundable because the underlying AI service has already been delivered.</Section>
    <Section title="Exceptions">We will review duplicate charges, failed fulfillment, unauthorized payments, and any refund required by applicable law regardless of the normal rule.</Section>
    <Section title="How to request">Open Support, choose Refund, and include the account email, approximate purchase date, and reason. Do not include card numbers. If approved, refunds return through Stripe to the original payment method; bank processing time is outside AlphaWolf’s control.</Section>
    <Section title="Before deleting an account">Request any refund first. Account deletion permanently removes the local token balance and purchase references after you explicitly acknowledge forfeiture.</Section>
  </LegalPage>;
}

export function SupportPage() {
  const user = useQuery({ queryKey: ["auth-user"], queryFn: loadAuthUser, staleTime: 300_000, retry: 0 });
  const [email, setEmail] = useState("");
  const [category, setCategory] = useState<"support" | "account" | "privacy" | "refund" | "bug">("support");
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const submit = useMutation({ mutationFn: submitSupportRequest });
  const effectiveEmail = email || user.data?.email || "";
  return <LegalPage title="Support" intro="Account, privacy, refund, and product help. AlphaWolf does not provide investment advice through support.">
    {submit.isSuccess ? <div className="rounded-[12px] border border-[#3ecf8e]/35 bg-[#3ecf8e]/10 p-4 text-sm text-[#3ecf8e]">Request #{submit.data.requestId} was recorded. Keep this number for reference.</div> :
      <form className="grid gap-3 rounded-[14px] border border-[#2a2a31] bg-[#161619] p-5" onSubmit={(event) => { event.preventDefault(); submit.mutate({ email: effectiveEmail, category, subject, message }); }}>
        <Label text="Email"><input required type="email" value={effectiveEmail} onChange={(event) => setEmail(event.target.value)} className={inputClass} /></Label>
        <Label text="Category"><select value={category} onChange={(event) => setCategory(event.target.value as typeof category)} className={inputClass}><option value="support">Product support</option><option value="account">Account</option><option value="privacy">Privacy</option><option value="refund">Refund</option><option value="bug">Bug report</option></select></Label>
        <Label text="Subject"><input required minLength={3} value={subject} onChange={(event) => setSubject(event.target.value)} className={inputClass} /></Label>
        <Label text="Message"><textarea required minLength={10} rows={7} value={message} onChange={(event) => setMessage(event.target.value)} className={`${inputClass} py-2.5`} /></Label>
        {submit.isError ? <div className="text-xs text-[#f2575c]">{submit.error instanceof Error ? submit.error.message : "Support request failed."}</div> : null}
        <button disabled={submit.isPending} className="rounded-[9px] bg-[#3ecf8e] px-4 py-3 text-sm font-bold text-[#07100c] disabled:opacity-50">{submit.isPending ? "Sending…" : "Send request"}</button>
      </form>}
  </LegalPage>;
}

function LegalPage({ title, intro, children }: { title: string; intro: string; children: React.ReactNode }) {
  return <div className="min-h-screen bg-[#0e0e10] px-5 py-8 text-[#ececee]"><main className="mx-auto max-w-[780px]">
    <div className="flex items-center justify-between gap-4"><Link to="/" className="text-lg font-extrabold">Alpha<span className="text-[#3ecf8e]">Wolf</span></Link><Link to="/" className="text-xs text-[#8c8c95] hover:text-[#ececee]">Back to app</Link></div>
    <div className="mt-12 text-[10px] font-bold uppercase tracking-[.13em] text-[#3ecf8e]">Effective {EFFECTIVE_DATE}</div><h1 className="mt-2 text-3xl font-extrabold">{title}</h1><p className="mt-3 text-[15px] leading-7 text-[#9a9aa3]">{intro}</p>
    <div className="mt-8 grid gap-4">{children}</div>
    <nav className="mt-10 flex flex-wrap gap-4 border-t border-[#2a2a31] pt-5 text-xs text-[#8c8c95]"><Link to="/terms">Terms</Link><Link to="/privacy">Privacy</Link><Link to="/refunds">Refunds</Link><Link to="/support">Support</Link></nav>
  </main></div>;
}
function Section({ title, children }: { title: string; children: React.ReactNode }) { return <section className="rounded-[12px] border border-[#2a2a31] bg-[#161619] p-5"><h2 className="text-[15px] font-bold">{title}</h2><div className="mt-2 text-[13px] leading-6 text-[#9a9aa3]">{children}</div></section>; }
function Label({ text, children }: { text: string; children: React.ReactNode }) { return <label className="grid gap-1.5 text-[10px] font-bold uppercase tracking-[.07em] text-[#8c8c95]">{text}{children}</label>; }
const inputClass = "min-h-10 w-full rounded-[8px] border border-[#34343c] bg-[#0e0e10] px-3 text-sm text-[#ececee] outline-none focus:border-[#3ecf8e]";
