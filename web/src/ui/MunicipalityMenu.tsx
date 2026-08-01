import { useEffect, useId, useRef, useState } from "react";
import {
  MUNICIPALITY_OPTIONS,
  type MunicipalityFilter,
} from "../domain/layers.ts";

type Props = {
  value: MunicipalityFilter;
  onChange: (value: MunicipalityFilter) => void;
};

export function MunicipalityMenu({ value, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const listId = useId();
  const selected =
    MUNICIPALITY_OPTIONS.find((option) => option.value === value) ??
    MUNICIPALITY_OPTIONS[0]!;

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <div className={`menu-field${open ? " is-open" : ""}`} ref={rootRef}>
      <span className="menu-label" id={`${listId}-label`}>
        Responsibility
      </span>
      <button
        type="button"
        className="menu-trigger"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        aria-labelledby={`${listId}-label`}
        onClick={() => setOpen((current) => !current)}
      >
        <span>{selected.label}</span>
        <span className="menu-chevron" aria-hidden="true" />
      </button>
      {open ? (
        <ul
          id={listId}
          className="menu-list"
          role="listbox"
          aria-labelledby={`${listId}-label`}
        >
          {MUNICIPALITY_OPTIONS.map((option, index) => {
            const isSelected = option.value === value;
            return (
              <li
                key={String(option.value)}
                style={{ ["--stagger" as string]: String(index) }}
              >
                <button
                  type="button"
                  role="option"
                  aria-selected={isSelected}
                  className={isSelected ? "is-selected" : undefined}
                  onClick={() => {
                    onChange(option.value);
                    setOpen(false);
                  }}
                >
                  {option.label}
                </button>
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}
