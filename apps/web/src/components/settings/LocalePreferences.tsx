import { useEffect, useId, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { LoadingSpinner } from "../LoadingSpinner";
import { loadAuthUser, saveLocaleSettings, type AuthUser, type LocaleSettings, type MarketPreference } from "../../lib/api";
import { configureLocale, COUNTRY_CHOICES, CURRENCY_CHOICES, defaultsForCountry, detectLocaleSettings, LANGUAGE_CHOICES, LOCALE_CHOICES, MARKET_CHOICES, TIMEZONE_CHOICES } from "../../lib/locale";
import { lockBodyScroll } from "../../lib/bodyScrollLock";
import { useDialogAccessibility } from "../../lib/useDialogAccessibility";

const control = "h-[54px] w-full rounded-[12px] border border-[#303039] bg-[#0e0e10] px-4 text-[16px] text-[#ececee] outline-none focus:border-[#3ecf8e] max-[640px]:h-12 max-[640px]:text-[14px]";
const label = "mb-2 block text-[13px] font-bold text-[#9a9aa3]";
const primary = "rounded-[12px] bg-[#42d19a] px-8 py-3.5 text-[15px] font-black text-[#07110d] transition hover:bg-[#54dfaa] disabled:opacity-45";

export function LocaleGate({ children }: { children: ReactNode }) {
  const account = useQuery({ queryKey: ["auth-user"], queryFn: loadAuthUser, staleTime: 300_000, retry: 0 });
  if (account.isPending) {
    return <div className="grid min-h-screen place-items-center bg-[#0e0e10] text-[#3ecf8e]"><LoadingSpinner size={22} /></div>;
  }
  const user = account.data ?? null;
  if (user && !user.settings) return <LocaleWizard initial={detectLocaleSettings()} />;
  configureLocale(user?.settings);
  return children;
}

export function LocaleSettingsDialog({ settings, onClose }: { settings: LocaleSettings; onClose: () => void }) {
  const [guided, setGuided] = useState(false);
  const [draft, setDraft] = useState(settings);
  const save = useSettingsSave(() => onClose());
  const titleId = useId();
  const dialogRef = useDialogAccessibility(onClose);

  useEffect(() => lockBodyScroll(), []);

  if (guided) {
    return createPortal(<LocaleWizard initial={draft} onCancel={() => setGuided(false)} onSaved={() => onClose()} />, document.body);
  }

  return createPortal(
    <div className="fixed inset-0 z-[60] overflow-y-auto bg-[#0e0e10]/95 px-5 py-8 max-[640px]:px-3 max-[640px]:py-4">
      <section ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1} className="mx-auto w-full max-w-[980px] outline-none">
        <header className="mb-7 flex items-start justify-between gap-4">
          <div><h2 id={titleId} className="text-[28px] font-black tracking-[-0.5px]">Region &amp; currency settings</h2><p className="mt-1 text-[15px] text-[#8c8c95]">Change how Alpha Wolf localizes your portfolio.</p></div>
          <button type="button" onClick={onClose} className="grid h-11 w-11 flex-none place-items-center rounded-[12px] border border-[#303039] text-[23px] text-[#8c8c95]" aria-label="Close settings">×</button>
        </header>

        <SettingsSection title="Region & language">
          <div className="grid gap-5">
            <Field label="Country / region"><CountrySelect value={draft.countryCode} onChange={(value) => setDraft(defaultsForCountry(value, draft))} /></Field>
            <Field label="Display language"><LanguageSelect value={draft.displayLanguage} onChange={(value) => setDraft({ ...draft, displayLanguage: value })} /></Field>
          </div>
        </SettingsSection>

        <SettingsSection title="Currency, timezone & formats">
          <LocaleFields draft={draft} setDraft={setDraft} />
        </SettingsSection>

        <SettingsSection title="Preferred markets">
          <MarketGrid selected={draft.preferredMarkets} onChange={(preferredMarkets) => setDraft({ ...draft, preferredMarkets })} />
        </SettingsSection>

        {save.isError ? <p className="mt-4 text-[13px] text-[#f2575c]">{save.error instanceof Error ? save.error.message : "Could not save settings."}</p> : null}
        <footer className="mt-7 flex items-center justify-between gap-4 pb-10 max-[520px]:flex-col-reverse max-[520px]:items-stretch">
          <button type="button" onClick={() => setGuided(true)} className="text-left text-[14px] text-[#9a9aa3] underline underline-offset-2 max-[520px]:text-center">Run guided setup again</button>
          <button type="button" disabled={save.isPending || !draft.preferredMarkets.length} onClick={() => save.mutate(draft)} className={primary}>{save.isPending ? "Saving…" : "Save changes"}</button>
        </footer>
      </section>
    </div>,
    document.body,
  );
}

function LocaleWizard({ initial, onCancel, onSaved }: { initial: LocaleSettings; onCancel?: () => void; onSaved?: () => void }) {
  const [step, setStep] = useState(1);
  const [draft, setDraft] = useState(initial);
  const save = useSettingsSave(onSaved);
  const canFinish = draft.preferredMarkets.length > 0;

  return (
    <main className="min-h-screen bg-[#0e0e10] px-4 py-12 text-[#ececee] max-[640px]:py-7">
      <div className="mx-auto w-full max-w-[920px]">
        <div className="flex items-center justify-center gap-2 text-[18px] font-black"><span className="h-3 w-3 rounded-full bg-[#42d19a]" /><span><span className="text-[#42d19a]">Alpha</span>Wolf</span></div>
        <Progress step={step} />
        <section className="rounded-[28px] border border-[#303039] bg-[#161619] px-12 py-11 shadow-[0_28px_90px_rgba(0,0,0,0.22)] max-[700px]:rounded-[20px] max-[700px]:px-5 max-[700px]:py-7">
          <div className="mb-8 inline-flex items-center gap-2 rounded-[10px] border border-dashed border-[#34343d] px-3 py-2 font-mono text-[11px] font-bold uppercase tracking-[0.11em] text-[#42d19a]"><span aria-hidden="true">◎</span> Auto-detected — edit anything below</div>
          <div className="font-mono text-[12px] font-bold uppercase tracking-[0.2em] text-[#61616b]">Step {step} of 3</div>

          {step === 1 ? <>
            <WizardHeading title="Where are you trading from?" body="This sets sensible defaults for currency, timezone, and formats." />
            <div className="grid gap-5">
              <Field label="Country / region"><CountrySelect value={draft.countryCode} onChange={(value) => setDraft(defaultsForCountry(value, draft))} /></Field>
              <Field label="Display language"><LanguageSelect value={draft.displayLanguage} onChange={(value) => setDraft({ ...draft, displayLanguage: value })} /></Field>
            </div>
          </> : null}

          {step === 2 ? <>
            <WizardHeading title="Currency, timezone & formats" body="Portfolio totals show in this currency. Individual holdings still show their own trading currency." />
            <LocaleFields draft={draft} setDraft={setDraft} />
          </> : null}

          {step === 3 ? <>
            <WizardHeading title="Which markets do you follow?" body="Pick as many as you like — you can change this anytime in settings." />
            <MarketGrid selected={draft.preferredMarkets} onChange={(preferredMarkets) => setDraft({ ...draft, preferredMarkets })} />
          </> : null}

          {save.isError ? <p className="mt-5 text-[13px] text-[#f2575c]">{save.error instanceof Error ? save.error.message : "Could not finish setup."}</p> : null}
          <div className="mt-9 flex items-center justify-between gap-4">
            {step > 1 ? <button type="button" onClick={() => setStep(step - 1)} className="px-1 py-2 text-[14px] font-bold text-[#9a9aa3]">← Back</button> : onCancel ? <button type="button" onClick={onCancel} className="px-1 py-2 text-[14px] font-bold text-[#9a9aa3]">Cancel</button> : <span />}
            {step < 3 ? <button type="button" onClick={() => setStep(step + 1)} className={primary}>Continue</button> : <button type="button" disabled={save.isPending || !canFinish} onClick={() => save.mutate(draft)} className={primary}>{save.isPending ? "Saving…" : "Finish setup"}</button>}
          </div>
        </section>
      </div>
    </main>
  );
}

function useSettingsSave(onSaved?: () => void) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: saveLocaleSettings,
    onSuccess: (settings) => {
      configureLocale(settings);
      queryClient.setQueryData<AuthUser | null>(["auth-user"], (user) => user ? { ...user, settings } : user);
      void queryClient.invalidateQueries({ queryKey: ["portfolio"] });
      void queryClient.invalidateQueries({ queryKey: ["portfolio-quotes"] });
      void queryClient.invalidateQueries({ queryKey: ["discoveries"] });
      onSaved?.();
    },
  });
}

function Progress({ step }: { step: number }) {
  return <div className="mx-auto my-8 flex max-w-[300px] items-center">{[1, 2, 3].map((value, index) => <div key={value} className="contents"><div className={`grid h-10 w-10 flex-none place-items-center rounded-full border-2 font-mono text-[14px] font-bold ${value < step ? "border-[#42d19a] bg-[#42d19a] text-[#07110d]" : value === step ? "border-[#42d19a] text-[#42d19a]" : "border-[#303039] text-[#61616b]"}`}>{value < step ? "✓" : value}</div>{index < 2 ? <div className={`h-[2px] flex-1 ${value < step ? "bg-[#42d19a]" : "bg-[#303039]"}`} /> : null}</div>)}</div>;
}

function WizardHeading({ title, body }: { title: string; body: string }) {
  return <div className="mb-8 mt-3"><h1 className="text-[30px] font-black tracking-[-0.6px] max-[640px]:text-[24px]">{title}</h1><p className="mt-2 max-w-[760px] text-[16px] leading-[1.6] text-[#95959e] max-[640px]:text-[14px]">{body}</p></div>;
}

function SettingsSection({ title, children }: { title: string; children: ReactNode }) {
  return <section className="mb-5 rounded-[22px] border border-[#303039] bg-[#161619] p-7 max-[640px]:rounded-[16px] max-[640px]:p-5"><h3 className="mb-5 text-[14px] font-black uppercase tracking-[0.08em] text-[#9a9aa3]">{title}</h3>{children}</section>;
}

function Field({ label: text, children }: { label: string; children: ReactNode }) {
  return <label><span className={label}>{text}</span>{children}</label>;
}

function CountrySelect({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  return <select value={value} onChange={(event) => onChange(event.target.value)} className={control}>{COUNTRY_CHOICES.map((item) => <option key={item.code} value={item.code}>{item.name}</option>)}</select>;
}

function LanguageSelect({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  return <select value={value} onChange={(event) => onChange(event.target.value)} className={control}>{LANGUAGE_CHOICES.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select>;
}

function LocaleFields({ draft, setDraft }: { draft: LocaleSettings; setDraft: (value: LocaleSettings) => void }) {
  const timezoneOptions = TIMEZONE_CHOICES.includes(draft.timezone) ? TIMEZONE_CHOICES : [draft.timezone, ...TIMEZONE_CHOICES];
  return <div className="grid gap-5">
    <Field label="Portfolio base currency"><select value={draft.baseCurrency} onChange={(event) => setDraft({ ...draft, baseCurrency: event.target.value as LocaleSettings["baseCurrency"] })} className={control}>{CURRENCY_CHOICES.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></Field>
    <Field label="Timezone"><select value={draft.timezone} onChange={(event) => setDraft({ ...draft, timezone: event.target.value })} className={control}>{timezoneOptions.map((item) => <option key={item} value={item}>{item}</option>)}</select></Field>
    <div className="grid grid-cols-2 gap-5 max-[640px]:grid-cols-1">
      <Field label="Date format"><select value={draft.dateLocale} onChange={(event) => setDraft({ ...draft, dateLocale: event.target.value })} className={control}>{LOCALE_CHOICES.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select><span className="mt-2 block font-mono text-[11px] text-[#61616b]">{new Intl.DateTimeFormat(draft.dateLocale, { timeZone: draft.timezone }).format(new Date(2026, 6, 15))}</span></Field>
      <Field label="Number format"><select value={draft.numberLocale} onChange={(event) => setDraft({ ...draft, numberLocale: event.target.value })} className={control}>{LOCALE_CHOICES.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select><span className="mt-2 block font-mono text-[11px] text-[#61616b]">{new Intl.NumberFormat(draft.numberLocale, { maximumFractionDigits: 2 }).format(1_234_567.89)}</span></Field>
    </div>
  </div>;
}

function MarketGrid({ selected, onChange }: { selected: MarketPreference[]; onChange: (value: MarketPreference[]) => void }) {
  return <div className="grid grid-cols-2 gap-3 max-[640px]:grid-cols-1">{MARKET_CHOICES.map((market) => {
    const active = selected.includes(market.value);
    return <button key={market.value} type="button" aria-pressed={active} onClick={() => onChange(active ? selected.filter((value) => value !== market.value) : [...selected, market.value])} className={`relative rounded-[14px] border px-4 py-3.5 text-left transition ${active ? "border-[#42d19a] bg-[#42d19a]/10" : "border-[#303039] bg-[#0e0e10] hover:border-[#50505a]"}`}>
      <span className="block text-[15px] font-black">{market.name}</span><span className="mt-0.5 block text-[12px] text-[#95959e]">{market.exchange}</span><span className="mt-2 block font-mono text-[10px] text-[#61616b]">e.g. {market.example}</span>{active ? <span className="absolute right-4 top-4 text-[18px] text-[#42d19a]">✓</span> : null}
    </button>;
  })}</div>;
}
