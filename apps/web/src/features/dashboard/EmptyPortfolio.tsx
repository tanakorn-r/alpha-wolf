import { useNavigate } from "react-router-dom";
import alphaWolfIcon from "../../assets/icons/alphawolf-icon.png";
import { ArrowRightIcon } from "../../components/ui/icons";

export function EmptyPortfolio() {
  const navigate = useNavigate();
  return (
    <div className="flex flex-col items-center rounded-2xl border border-[#2a2a31] bg-gradient-to-b from-[#15171a] to-[#0f1011] px-6 py-16 text-center">
      <div className="mb-5 grid h-[74px] w-[74px] place-items-center overflow-hidden rounded-2xl bg-[#08090b]">
        <img src={alphaWolfIcon} alt="AlphaWolf" className="h-full w-full object-cover opacity-95" />
      </div>
      <h2 className="text-[23px] font-bold tracking-[-0.4px]">Start your AlphaWolf book</h2>
      <p className="mt-[9px] max-w-[460px] text-sm leading-[1.6] text-[#8c8c95]">
        You don&apos;t own anything yet. Find the stocks you trust, decide how much dry powder to deploy, and AlphaWolf will track the setup, the income, and the result.
      </p>
      <div className="mt-[30px] flex flex-wrap justify-center gap-3.5">
        <OnboardStep n="01" title="Hunt the field" body="Search US or Thai stocks and see which strategy setup matches the tape." />
        <OnboardStep n="02" title="Set your plan" body="Add a stock to a month and type how much capital you want ready." />
        <OnboardStep n="03" title="Track the outcome" body="Watch income dates, position value, and timing decisions in one place." />
      </div>
      <button type="button" onClick={() => navigate("/stock-hunt", { replace: true })} className="mt-[30px] flex items-center gap-2 rounded-lg bg-[#3ecf8e] px-6 py-[13px] text-sm font-bold text-[#06120c]">
        Add your first holding
        <ArrowRightIcon />
      </button>
    </div>
  );
}

function OnboardStep({ n, title, body }: { n: string; title: string; body: string }) {
  return (
    <div className="w-[200px] rounded-xl border border-[#2a2a31] bg-[#161619] p-[18px] text-left">
      <div className="font-mono text-[13px] font-semibold text-[#3ecf8e]">{n}</div>
      <div className="mt-2 text-sm font-semibold">{title}</div>
      <div className="mt-1 text-xs leading-[1.5] text-[#8c8c95]">{body}</div>
    </div>
  );
}
