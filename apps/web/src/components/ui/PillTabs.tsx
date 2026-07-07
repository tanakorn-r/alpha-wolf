export type PillTabOption<T extends string> = { value: T; label: React.ReactNode };

export function PillTabs<T extends string>({
  value,
  options,
  onChange,
  disabled,
  className = "",
}: {
  value: T;
  options: Array<PillTabOption<T>>;
  onChange: (value: T) => void;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <div className={`flex flex-wrap gap-1 rounded-[10px] border border-[#2a2a31] bg-[#161619] p-1 ${className}`}>
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          disabled={disabled}
          onClick={() => onChange(option.value)}
          className={`inline-flex items-center justify-center rounded-[7px] px-3.5 py-2 text-[13px] font-medium transition-colors disabled:opacity-60 ${value === option.value ? "bg-[#23232a] text-[#ececee]" : "text-[#8c8c95] hover:text-[#ececee]"}`}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
