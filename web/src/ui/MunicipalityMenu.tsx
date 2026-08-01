import { useState } from "react";
import { LayerCard } from "@cloudflare/kumo/components/layer-card";
import { Select } from "@cloudflare/kumo/components/select";
import {
  MUNICIPALITY_OPTIONS,
  type MunicipalityFilter,
} from "../domain/layers.ts";

type Props = {
  value: MunicipalityFilter;
  onChange: (value: MunicipalityFilter) => void;
};

const toKey = (value: MunicipalityFilter): string =>
  value == null ? "all" : String(value);

const fromKey = (key: string): MunicipalityFilter => {
  if (key === "all") return null;
  if (key === "outside") return "outside";
  return Number(key);
};

const SELECT_ITEMS = MUNICIPALITY_OPTIONS.map((option) => ({
  value: toKey(option.value),
  label: option.label,
}));

export function MunicipalityMenu({ value, onChange }: Props) {
  const [open, setOpen] = useState(false);

  return (
    <LayerCard
      className={`chrome-field${open ? " is-open" : ""}`}
      data-chrome="responsibility"
    >
      <Select
        label="Responsibility"
        hideLabel={false}
        value={toKey(value)}
        onValueChange={(next) => {
          if (typeof next === "string") onChange(fromKey(next));
        }}
        open={open}
        onOpenChange={setOpen}
        items={SELECT_ITEMS}
      >
        {SELECT_ITEMS.map((option) => (
          <Select.Option key={option.value} value={option.value}>
            {option.label}
          </Select.Option>
        ))}
      </Select>
    </LayerCard>
  );
}
