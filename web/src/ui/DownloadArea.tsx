import { useEffect, useState } from "react";
import { Button } from "@cloudflare/kumo/components/button";
import { Text } from "@cloudflare/kumo/components/text";
import { useI18n } from "../i18n/I18nContext.tsx";
import {
  CORRIDOR_PACKAGE_BASE,
  deleteCorridorPack,
  fetchRemotePackManifest,
  getPackInstallState,
  installCorridorPack,
  notifyPackInstallStateChanged,
  subscribePackInstallState,
  type PackInstallState,
} from "../offline/corridor-pack.ts";
import {
  formatPackSizeMb,
  isTerrainOfflineReady,
  packUpdateAvailable,
  type CorridorPackManifest,
} from "../offline/manifest.ts";

type Props = {
  packageBase?: string;
};

export function DownloadArea({
  packageBase = CORRIDOR_PACKAGE_BASE,
}: Props) {
  const { t, locale } = useI18n();
  const [state, setState] = useState<PackInstallState>({ status: "absent" });
  const [remote, setRemote] = useState<CorridorPackManifest | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const refresh = () => {
      void getPackInstallState().then((next) => {
        if (!cancelled) setState(next);
      });
    };
    refresh();
    return subscribePackInstallState(() => {
      if (!cancelled) refresh();
    });
  }, []);

  useEffect(() => {
    let cancelled = false;
    void fetchRemotePackManifest(packageBase)
      .then((manifest) => {
        if (!cancelled) setRemote(manifest);
      })
      .catch(() => {
        if (!cancelled) setRemote(null);
      });
    return () => {
      cancelled = true;
    };
  }, [packageBase]);

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
      setRemote(manifest);
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
      notifyPackInstallStateChanged();
    } catch (cause) {
      setActionError(cause instanceof Error ? cause.message : String(cause));
    }
  };

  const errorText =
    actionError ?? (state.status === "error" ? state.message : null);
  const updateAvailable =
    state.status === "installed" &&
    remote != null &&
    packUpdateAvailable(state.manifest, remote);
  const sizeLabel =
    state.status === "installed"
      ? formatPackSizeMb(state.manifest.bytes)
      : remote
        ? formatPackSizeMb(remote.bytes)
        : null;

  return (
    <div className="download-area" aria-label={t.downloadArea}>
      <p className="download-area-hint">
        <Text as="span" variant="secondary" size="xs">
          {t.downloadAreaHint}
          {sizeLabel ? ` · ${sizeLabel}` : ""}
        </Text>
      </p>
      {state.status === "installed" ? (
        <>
          <p className="download-area-status" role="status">
            <Text as="span" variant="secondary" size="xs">
              {state.terrainOffline ? t.downloadReady : t.downloadStubInstalled}
              {" · "}
              {t.packVersion} {state.manifest.id}
            </Text>
          </p>
          {updateAvailable ? (
            <Button type="button" size="sm" variant="primary" onClick={onDownload}>
              {t.downloadUpdate}
            </Button>
          ) : null}
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
          {sizeLabel ? ` (${sizeLabel})` : ""}
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
