import {
  useCallback,
  useId,
  useRef,
  type KeyboardEvent,
  type ReactNode,
} from "react";

export type DossierTab<T extends string> = {
  value: T;
  label: string;
};

type Props<T extends string> = {
  tabs: ReadonlyArray<DossierTab<T>>;
  value: T;
  onValueChange: (value: T) => void;
  /** Render the active tab panel body. */
  children: ReactNode;
};

/**
 * Minimal WAI-ARIA tabs for the place dossier.
 * Kumo Tabs only renders the list (no panels), so we own the full pattern here.
 */
export function DossierTabs<T extends string>({
  tabs,
  value,
  onValueChange,
  children,
}: Props<T>) {
  const baseId = useId();
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);

  const focusTab = useCallback((index: number) => {
    const next = tabRefs.current[index];
    next?.focus();
  }, []);

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const currentIndex = tabs.findIndex((tab) => tab.value === value);
    if (currentIndex < 0) return;

    let nextIndex = currentIndex;
    if (event.key === "ArrowRight" || event.key === "ArrowDown") {
      event.preventDefault();
      nextIndex = (currentIndex + 1) % tabs.length;
    } else if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
      event.preventDefault();
      nextIndex = (currentIndex - 1 + tabs.length) % tabs.length;
    } else if (event.key === "Home") {
      event.preventDefault();
      nextIndex = 0;
    } else if (event.key === "End") {
      event.preventDefault();
      nextIndex = tabs.length - 1;
    } else {
      return;
    }

    const next = tabs[nextIndex]!;
    onValueChange(next.value);
    focusTab(nextIndex);
  };

  const active = tabs.find((tab) => tab.value === value) ?? tabs[0]!;
  const tabId = (tabValue: string) => `${baseId}-tab-${tabValue}`;
  const panelId = (tabValue: string) => `${baseId}-panel-${tabValue}`;

  return (
    <div className="dossier-tabs">
      <div
        className="dossier-tablist"
        role="tablist"
        aria-orientation="horizontal"
        onKeyDown={onKeyDown}
      >
        {tabs.map((tab, index) => {
          const selected = tab.value === active.value;
          return (
            <button
              key={tab.value}
              ref={(node) => {
                tabRefs.current[index] = node;
              }}
              type="button"
              role="tab"
              id={tabId(tab.value)}
              className={`dossier-tab${selected ? " is-selected" : ""}`}
              aria-selected={selected}
              aria-controls={panelId(tab.value)}
              tabIndex={selected ? 0 : -1}
              onClick={() => onValueChange(tab.value)}
            >
              {tab.label}
            </button>
          );
        })}
      </div>
      <div
        role="tabpanel"
        id={panelId(active.value)}
        className="dossier-tabpanel"
        aria-labelledby={tabId(active.value)}
        tabIndex={0}
      >
        {children}
      </div>
    </div>
  );
}
