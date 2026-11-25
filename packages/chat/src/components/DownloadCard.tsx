import { slotProps, useChatContext, usePart } from "../customize/context";
import type { AdapterStatus } from "../types";

/** Props of the download card. */
export interface DownloadCardProps {
  status: Extract<AdapterStatus, { state: "needs-download" | "downloading" | "loading" | "error" }>;
  /** The size, kept from `needs-download` so progress can show "380 MB of 1.4 GB". */
  bytes?: number;
  /** Start (or retry) the download: the person's explicit click. */
  onDownload(): void;
  /** Abort the running download. */
  onCancel(): void;
  /** Switch to another assistant (shown when there is one). */
  onUseOther?: () => void;
  /** The other assistant's name, already worded for the page. */
  otherLabel?: string;
}

/**
 * Consent before a model download (never automatic), then determinate progress with Cancel, or Retry after a failure.
 * A model already on the device shows as loading from disk, never as a download. `components.DownloadCard` replaces it.
 */
export function DownloadCard({ status, bytes, onDownload, onCancel, onUseOther, otherLabel }: DownloadCardProps) {
  const ctx = useChatContext();
  const part = usePart();
  const { t } = ctx;
  const Custom = ctx.components.DownloadCard;
  if (Custom) {
    const props = slotProps(ctx, "downloadCard", "wa-chat__download");
    return (
      <Custom
        {...props}
        partProps={{ ...props.partProps, ...{ "data-state": status.state } }}
        status={status}
        bytes={bytes}
        start={onDownload}
        cancel={onCancel}
        useOther={onUseOther}
        otherLabel={otherLabel}
      />
    );
  }
  if (status.state === "downloading" || status.state === "loading") {
    const progress = status.state === "downloading" ? status.progress : (status.progress ?? 0);
    const fromDisk = status.state === "loading";
    const pct = Math.round(progress * 100);
    const percent = { percent: pct, formatted: t.format.percent(progress) };
    // the files are in; loading them into the GPU (or WASM) can take a while the first time, with nothing to count
    const starting = progress >= 1;
    return (
      <div {...part("downloadCard", "wa-chat__download")} data-state={status.state}>
        <p {...part("downloadTitle", "wa-chat__download-title")}>
          {starting ? t("download.starting") : fromDisk ? t("download.loadingTitle") : t("download.title")}
        </p>
        <div
          {...part("progress", "wa-chat__progress")}
          role="progressbar"
          aria-label={fromDisk ? t("download.loadingLabel") : t("download.label")}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={pct}
          aria-valuetext={percent.formatted}
        >
          <span {...part("progressBar")} style={{ transform: `scaleX(${progress})` }} />
        </div>
        <p {...part("downloadMeta", "wa-chat__download-meta")}>
          {starting
            ? fromDisk
              ? t("download.alreadyHere")
              : t("download.firstStart")
            : bytes
              ? t("download.progressBytes", { ...percent, done: t.format.bytes(bytes * progress), total: t.format.bytes(bytes) })
              : t("download.progress", percent)}
        </p>
        <button type="button" {...part("downloadButton", "wa-chat__button")} data-action="cancel" onClick={onCancel}>
          {t("download.cancel")}
        </button>
      </div>
    );
  }
  if (status.state === "error") {
    return (
      <div {...part("downloadCard", "wa-chat__download")} data-state="error" role="alert">
        <p {...part("downloadTitle", "wa-chat__download-title")}>{t("download.failed")}</p>
        <p {...part("downloadText")}>{status.error}</p>
        <button type="button" {...part("downloadButton", "wa-chat__button")} data-action="retry" data-primary="" onClick={onDownload}>
          {t("download.retry")}
        </button>
      </div>
    );
  }
  return (
    <div {...part("downloadCard", "wa-chat__download")} data-state="needs-download">
      <p {...part("downloadTitle", "wa-chat__download-title")}>{t("download.offer")}</p>
      <p {...part("downloadText")}>
        {status.bytes ? t("download.size", { size: t.format.bytes(status.bytes) }) : t("download.sizeUnknown")} {t("download.privacy")}
        {status.note ? ` ${status.note}` : ""}
      </p>
      <div {...part("downloadActions", "wa-chat__download-actions")}>
        <button type="button" {...part("downloadButton", "wa-chat__button")} data-action="start" data-primary="" onClick={onDownload}>
          {t("download.start")}
        </button>
        {onUseOther && (
          <button type="button" {...part("downloadButton", "wa-chat__button")} data-action="use-other" onClick={onUseOther}>
            {t("download.useOther", { adapter: otherLabel ?? t("download.otherFallback") })}
          </button>
        )}
      </div>
    </div>
  );
}
