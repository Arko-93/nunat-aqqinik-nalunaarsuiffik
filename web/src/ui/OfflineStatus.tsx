import { useEffect, useState } from "react";
import { Badge } from "@cloudflare/kumo/components/badge";
import { Text } from "@cloudflare/kumo/components/text";
import { useI18n } from "../i18n/I18nContext.tsx";
import {
  getPackInstallState,
  subscribePackInstallState,
  type PackInstallState,
} from "../offline/corridor-pack.ts";
import type { LoadedRelease } from "../services/release.ts";

type Props = {
  release: LoadedRelease | null;
  compact?: boolean;
};

export function OfflineStatus({ release, compact = false }: Props) {
  const { t } = useI18n();
  const [online, setOnline] = useState(
    () => typeof navigator === "undefined" || navigator.onLine,
  );
  const [pack, setPack] = useState<PackInstallState>({ status: "absent" });

  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    const refresh = () => {
      void getPackInstallState().then((next) => {
        if (!cancelled) setPack(next);
      });
    };
    refresh();
    return subscribePackInstallState(() => {
      if (!cancelled) refresh();
    });
  }, []);

  if (!release) return null;

  const packLabel =
    pack.status === "installed"
      ? pack.terrainOffline
        ? t.downloadReady
        : t.downloadStubInstalled
      : null;

  return (
    <div
      className={`offline-status${compact ? " is-compact" : ""}`}
      role="status"
      aria-live="polite"
    >
      <Badge variant={online ? "secondary" : "outline"}>
        {online ? t.online : t.offline}
      </Badge>
      <Badge variant="outline">{t.offlineLocal}</Badge>
      {packLabel ? <Badge variant="outline">{packLabel}</Badge> : null}
      {!compact ? (
        <Text as="span" variant="secondary" size="xs">
          {t.releaseLabel} {release.releaseId} · {t.dataAsOf}{" "}
          {release.dataAsOf}
          {release.publishReady
            ? ` · ${t.publishReady}`
            : ` · ${release.blockerCount} ${t.publicationBlockers}`}
          {pack.status === "installed"
            ? ` · ${t.packVersion} ${pack.manifest.id}`
            : ""}
        </Text>
      ) : (
        <Text as="span" variant="secondary" size="xs">
          {release.releaseId}
        </Text>
      )}
    </div>
  );
}
