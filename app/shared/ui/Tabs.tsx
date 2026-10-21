export function Tabs({
  options,
  view,
  tab,
  onSelect,
}: {
  options: [string, string][];
  view: string;
  tab: string;
  onSelect: () => void;
}) {
  return (
    <div className="tabs">
      {options.map(([k, l]) => (
        <button
          key={k}
          className={tab === k ? "selected" : ""}
          aria-current={tab === k ? "page" : undefined}
          onClick={() => {
            location.hash = k === "all" ? view : `${view}/${k}`;
            onSelect();
          }}
        >
          {l}
        </button>
      ))}
    </div>
  );
}
