// Canvas video recorder that captures the WebGL canvas and produces a downloadable
// video file. Uses MediaRecorder with the best MP4-compatible codec available;
// falls back to WebM if MP4 is not supported by the browser (Firefox).

export type RecorderOptions = {
  fps?: number;
  bitrate?: number;
  filenameBase?: string;
};

export type RecorderState =
  | { kind: "idle" }
  | { kind: "recording"; startedAt: number }
  | { kind: "processing" };

type MimeChoice = { mimeType: string; ext: "mp4" | "webm" };

function pickBestMime(): MimeChoice {
  const candidates: MimeChoice[] = [
    { mimeType: "video/mp4;codecs=avc1.42E01E,mp4a.40.2", ext: "mp4" },
    { mimeType: "video/mp4;codecs=avc1", ext: "mp4" },
    { mimeType: "video/mp4", ext: "mp4" },
    { mimeType: "video/webm;codecs=vp9,opus", ext: "webm" },
    { mimeType: "video/webm;codecs=vp8,opus", ext: "webm" },
    { mimeType: "video/webm", ext: "webm" },
  ];
  for (const c of candidates) {
    try {
      if (typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(c.mimeType)) {
        return c;
      }
    } catch {
      // ignore
    }
  }
  return { mimeType: "", ext: "webm" };
}

export class CanvasRecorder {
  private recorder: MediaRecorder | null = null;
  private chunks: BlobPart[] = [];
  private mime: MimeChoice = { mimeType: "", ext: "webm" };
  private canvas: HTMLCanvasElement | null = null;
  private fps: number;
  private bitrate: number;

  constructor(opts: RecorderOptions = {}) {
    this.fps = opts.fps ?? 60;
    this.bitrate = opts.bitrate ?? 8_000_000;
  }

  isSupported(): boolean {
    if (typeof MediaRecorder === "undefined") return false;
    return true;
  }

  bestExtension(): "mp4" | "webm" {
    if (this.mime.ext) return this.mime.ext;
    return pickBestMime().ext;
  }

  start(canvas: HTMLCanvasElement) {
    if (!this.isSupported()) throw new Error("MediaRecorder no soportado");
    this.mime = pickBestMime();
    const stream = (canvas as any).captureStream ? canvas.captureStream(this.fps) : null;
    if (!stream) throw new Error("Canvas captureStream no soportado");
    this.canvas = canvas;
    this.chunks = [];

    const options: MediaRecorderOptions = {
      videoBitsPerSecond: this.bitrate,
    };
    if (this.mime.mimeType) options.mimeType = this.mime.mimeType;

    this.recorder = new MediaRecorder(stream, options);
    this.recorder.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) this.chunks.push(e.data);
    };
    this.recorder.start(100);
  }

  async stopAndDownload(baseName = "forensia2-choque"): Promise<{ blob: Blob; filename: string }> {
    if (!this.recorder) throw new Error("No recording in progress");
    const rec = this.recorder;
    const stopped = new Promise<void>((resolve) => {
      rec.onstop = () => resolve();
    });
    rec.stop();
    await stopped;

    const type = this.mime.mimeType || "video/webm";
    const ext = this.mime.ext;
    const blob = new Blob(this.chunks, { type });
    const filename = `${baseName}-${new Date().toISOString().replace(/[:.]/g, "-")}.${ext}`;
    triggerDownload(blob, filename);
    this.recorder = null;
    this.chunks = [];
    return { blob, filename };
  }

  isRecording() {
    return this.recorder?.state === "recording";
  }
}

export function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
