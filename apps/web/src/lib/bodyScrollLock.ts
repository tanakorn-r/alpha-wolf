let activeLocks = 0;
let originalOverflow = "";
let originalPaddingRight = "";

export function lockBodyScroll() {
  if (typeof document === "undefined") return () => undefined;

  const body = document.body;
  let released = false;
  if (activeLocks === 0) {
    originalOverflow = body.style.overflow;
    originalPaddingRight = body.style.paddingRight;
    const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth;
    if (scrollbarWidth > 0) body.style.paddingRight = `${scrollbarWidth}px`;
  }
  activeLocks += 1;
  body.style.overflow = "hidden";

  return () => {
    if (released) return;
    released = true;
    activeLocks = Math.max(0, activeLocks - 1);
    if (activeLocks === 0) {
      body.style.overflow = originalOverflow;
      body.style.paddingRight = originalPaddingRight;
    }
  };
}
