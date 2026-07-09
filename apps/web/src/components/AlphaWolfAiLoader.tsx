import alphaWolfLoader from "../assets/loaders/alphawolf-ai-loader.gif";

type LoaderSize = "xs" | "sm" | "md" | "lg";

const sizeClass: Record<LoaderSize, string> = {
  xs: "w-[32px]",
  sm: "w-[64px]",
  md: "w-[120px]",
  lg: "w-[220px] max-w-[72%]",
};

export function AlphaWolfAiLoader({ size = "md", className = "", alt = "AlphaWolf AI is hunting signals" }: { size?: LoaderSize; className?: string; alt?: string }) {
  return (
    <img
      src={alphaWolfLoader}
      alt={alt}
      className={`${sizeClass[size]} h-auto object-contain drop-shadow-[0_0_18px_rgba(56,211,159,0.2)] ${className}`}
      draggable={false}
    />
  );
}
