import { Button } from "@cloudflare/kumo/components/button";
import { Text } from "@cloudflare/kumo/components/text";
import type { Placename } from "../domain/placename.ts";
import type { ReachabilityLink } from "../domain/reachability.ts";
import { useI18n } from "../i18n/I18nContext.tsx";
import type { LoadedRelease } from "../services/release.ts";
import { PlaceDossier } from "./PlaceDossier.tsx";

export type SheetState = "collapsed" | "half" | "full";

type Props = {
  place: Placename | null;
  release: LoadedRelease | null;
  reachLinks: ReadonlyArray<ReachabilityLink>;
  sheet: SheetState;
  onSheetChange: (sheet: SheetState) => void;
  onSelectPlaceId: (placeId: string) => void;
  onClose: () => void;
};

export function MobilePlaceSheet({
  place,
  release,
  reachLinks,
  sheet,
  onSheetChange,
  onSelectPlaceId,
  onClose,
}: Props) {
  const { t } = useI18n();

  if (!place) return null;

  const cycle = () => {
    if (sheet === "collapsed") onSheetChange("half");
    else if (sheet === "half") onSheetChange("full");
    else onSheetChange("half");
  };

  return (
    <div
      className={`mobile-place-sheet is-${sheet}`}
      role="dialog"
      aria-label={place.officialName}
    >
      <div className="mobile-place-sheet-handle">
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="sheet-handle-btn"
          aria-label={sheet === "full" ? t.collapseSheet : t.expandSheet}
          onClick={cycle}
        >
          <span className="sheet-grip" aria-hidden="true" />
          <Text as="span" variant="secondary" size="xs">
            {place.officialName}
          </Text>
        </Button>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          aria-label={t.closePlace}
          onClick={onClose}
        >
          ×
        </Button>
      </div>
      {sheet !== "collapsed" ? (
        <div className="mobile-place-sheet-body">
          <PlaceDossier
            place={place}
            release={release}
            reachLinks={reachLinks}
            onSelectPlaceId={onSelectPlaceId}
          />
        </div>
      ) : null}
    </div>
  );
}
