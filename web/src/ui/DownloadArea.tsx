import { useEffect, useState } from "react";
import { Button } from "@cloudflare/kumo/components/button";
import { Text } from "@cloudflare/kumo/components/text";
import { useI18n } from "../i18n/I18nContext.tsx";
import {
  CORRIDOR_PACKAGE_BASE,
  deleteCorridorPack,
  getPackInstallState,
  installCorridorPack,
  notifyPackInstallStateChanged,
  type PackInstallState,
} from "../offline/corridor-pack.ts";
import { isTerrainOfflineReady } from "../offline/manifest.ts";

type Props = {
  packageBase?: string;
};

export function DownloadArea({
  packageBase = CORRIDOR_PACKAGE_BASE,
}: Props) {
  const { t, locale } = useI18n();
  const [state, setState] = useState<PackInstallState>({ status: "absent" });
  const [actionError, setActionError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void getPackInstallState().then((next) => {
      if (!cancelled) setState(next);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const onDownload = async () => {
    setActionError(null);
    setState({
      status: "downloading",
      packId: "pending",
      progress: { path: "manifest.json", loaded: 0, total: 1 },
    });
    try {
      const manifest = await installCorridorPack(packageBase, (progress) => {
        setState({
          status: "downloading",
          packId: "pending",
          progress,
        });
      });
      setState({
        status: "installed",
        manifest,
        terrainOffline: isTerrainOfflineReady(manifest),
      });
      // The map switches its terrain sources to the pack (or back).
      notifyPackInstallStateChanged();
    } catch (cause) {
      setState({
        status: "error",
        message: cause instanceof Error ? cause.message : String(cause),
      });
    }
  };

  const onDelete = async () => {
    setActionError(null);
    try {
      await deleteCorridorPack();
      setState({ status: "absent" });
      // Map returns to remote terrain sources.
      notifyPackInstallStateChanged();
    } catch (cause) {
      setActionError(cause instanceof Error ? cause.message : String(cause));
    }
  };

  const errorText =
    actionError ?? (state.status === "error" ? state.message : null);

  return (
    <div className="download-area" aria-label={t.downloadArea}>
      <p className="download-area-hint">
        <Text as="span" variant="secondary" size="xs">
          {t.downloadAreaHint}
        </Text>
      </p>
      {state.status === "installed" ? (
        <>
          <Button type="button" size="sm" variant="secondary" disabled>
            {state.terrainOffline ? t.downloadReady : t.downloadStubInstalled}
          </Button>
          <Text as="span" variant="secondary" size="xs">
            {t.packVersion} {state.manifest.id}
          </Text>
          {!state.terrainOffline ? (
            <p className="download-area-stub-hint">
              <Text as="span" variant="secondary" size="xs">
                {state.manifest.notes?.trim() || t.downloadStubHint}
              </Text>
            </p>
          ) : (
            <>
              <Text as="p" variant="secondary" size="xs">
                {t.downloadFullHint}
              </Text>
              <Text as="p" variant="secondary" size="xs">
                {t.iosHomeScreenHint}
              </Text>
            </>
          )}
          <Button type="button" size="sm" variant="ghost" onClick={onDelete}>
            {t.downloadDelete}
          </Button>
        </>
      ) : state.status === "downloading" ? (
        <Text as="span" variant="secondary" size="sm">
          {t.downloadProgress} {state.progress.path} (
          {Math.round(
            (state.progress.loaded / Math.max(state.progress.total, 1)) * 100,
          )}
          %)
        </Text>
      ) : (
        <Button type="button" size="sm" variant="primary" onClick={onDownload}>
          {t.downloadArea}
        </Button>
      )}
      {errorText ? (
        <p className="download-area-error">
          <Text as="span" variant="secondary" size="xs">
            {errorText}
          </Text>
        </p>
      ) : null}
      {state.status === "installed" ? (
        <span className="sr-only">{state.manifest.title[locale]}</span>
      ) : null}
    </div>
  );
}
