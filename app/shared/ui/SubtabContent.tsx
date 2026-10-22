import { useLayoutEffect, useRef, type ReactNode } from "react";

/** Animate the existing content node only when its selected subpage changes. */
export function SubtabContent({
  tab,
  order,
  children,
}: {
  tab: string;
  order: string[];
  children: ReactNode;
}) {
  const root = useRef<HTMLDivElement>(null);
  const index = order.indexOf(tab);
  const previous = useRef({ tab, index });
  useLayoutEffect(() => {
    const before = previous.current;
    previous.current = { tab, index };
    if (before.tab === tab || !root.current || window.matchMedia("(prefers-reduced-motion: reduce)").matches)
      return;
    const from = before.index;
    const to = index;
    if (from < 0 || to < 0) return;
    const animation = root.current.animate(
      [
        { opacity: 0.65, transform: `translateX(${to > from ? 16 : -16}px)` },
        { opacity: 1, transform: "translateX(0)" },
      ],
      { duration: 440, easing: "cubic-bezier(0.16, 1, 0.3, 1)" },
    );
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const stop = () => {
      if (media.matches) animation.cancel();
    };
    media.addEventListener("change", stop);
    return () => {
      animation.cancel();
      media.removeEventListener("change", stop);
    };
  }, [tab, index]);
  return (
    <div className="subtab-viewport">
      <div className="subtab-content" ref={root}>
        {children}
      </div>
    </div>
  );
}
