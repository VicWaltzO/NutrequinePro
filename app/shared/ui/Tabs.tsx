import { useLayoutEffect, useRef } from "react";

export function Tabs({
  options,
  view,
  tab,
  onSelect,
  navigate = true,
}: {
  options: [string, string][];
  view: string;
  tab: string;
  onSelect?: (tab: string) => void;
  navigate?: boolean;
}) {
  const root = useRef<HTMLDivElement>(null);
  const keys = options.map(([key]) => key).join("|");
  useLayoutEffect(() => {
    const element = root.current;
    if (!element) return;
    const measure = () => {
      const selected = element.querySelector<HTMLElement>('[aria-current="page"]');
      element.style.setProperty("--tab-left", `${selected?.offsetLeft ?? 0}px`);
      element.style.setProperty("--tab-width", `${selected?.offsetWidth ?? 0}px`);
    };
    measure();
    const selected = element.querySelector<HTMLElement>('[aria-current="page"]');
    if (
      selected &&
      (selected.offsetLeft < element.scrollLeft ||
        selected.offsetLeft + selected.offsetWidth > element.scrollLeft + element.clientWidth)
    ) {
      element.scrollLeft =
        selected.offsetLeft - Math.max(0, (element.clientWidth - selected.offsetWidth) / 2);
    }
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    for (const child of element.querySelectorAll("button")) observer.observe(child);
    const frame = requestAnimationFrame(() => {
      element.dataset.ready = "true";
    });
    return () => {
      observer.disconnect();
      cancelAnimationFrame(frame);
    };
  }, [tab, keys]);
  return (
    <div className="tabs" ref={root}>
      {options.map(([k, l]) => (
        <button
          key={k}
          type="button"
          className={tab === k ? "selected" : ""}
          aria-current={tab === k ? "page" : undefined}
          onClick={() => {
            if (k === tab) return;
            if (navigate) location.hash = k === "all" ? view : `${view}/${k}`;
            onSelect?.(k);
          }}
        >
          {l}
        </button>
      ))}
      <span className="tab-indicator" aria-hidden="true" />
    </div>
  );
}
