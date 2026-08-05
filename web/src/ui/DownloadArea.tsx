import { useEffect, useState } from "react";
import { Button } from "@cloudflare/kumo/components/button";
import { Text } from "@cloudflare/kumo/components/text";
import { useI18n } from "../i18n/I18nContext.tsx";
import {
  CORRIDOR_PACKAGE_BASE,
  deleteCorridorPack,
  getPackInstallState,
  installCorridorPack,
  type PackInstallState,
} from "../offline/corridor-pack.ts";

type Props = {
  packageBase?: string;
};

export function DownloadArea({
  packageBase = CORRIDOR_PACKAGE_BASE,
}: Props) {
  const { t, locale } = useI18n();
  const [state, setState] = useState<PackInstallState>({ status: "absent" });

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
      setState({ status: "ready", manifest });
    } catch (cause) {
      setState({
        status: "error",
        message: cause instanceof Error ? cause.message : String(cause),
      });
    }
  };

  const onDelete = async () => {
    await deleteCorridorPack();
    setState({ status: "absent" });
  };

  return (
    <div className="download-area" aria-label={t.downloadArea}>
      <p className="download-area-hint">
        <Text as="span" variant="secondary" size="xs">
          {t.downloadAreaHint}
        </Text>
      </p>
      {state.status === "ready" ? (
        <>
          <Button type="button" size="sm" variant="secondary" disabled>
            {t.downloadReady}
          </Button>
          <Text as="span" variant="secondary" size="xs">
            {t.packVersion} {state.manifest.id}
          </Text>
          <Button type="button" size="sm" variant="ghost" onClick={onDelete}>
            {t.downloadDelete}
          </Button>
          <Text as="p" variant="secondary" size="xs">
            {t.iosHomeScreenHint}
          </Text>
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
      {state.status === "error" ? (
        <p className="download-area-error">
          <Text as="span" variant="secondary" size="xs">
            {state.message}
          </Text>
        </p>
      ) : null}
      {state.status === "ready" ? (
        <span className="sr-only">{state.manifest.title[locale]}</span>
      ) : null}
    </div>
  );
}
