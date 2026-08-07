/**
 * Free open-source neural TTS via Kokoro-82M (Apache-2.0) in-browser.
 * No API key, no cloud bill. First speak downloads the ONNX model (~tens of MB).
 *
 * Male default: am_michael (best-graded US male in Kokoro card).
 * @see https://www.npmjs.com/package/kokoro-js
 */

import { humanizeForSpeech } from "./voice-humanize";

/** Best male English voices in Kokoro (grades from model card). */
export const KOKORO_MALE_VOICES = [
  "am_michael", // US male, grade C+
  "am_fenrir",
  "am_puck",
  "bm_george", // UK male
  "bm_fable",
  "am_onyx",
  "am_echo",
  "am_eric",
  "am_liam",
  "bm_daniel",
  "bm_lewis",
] as const;

export type KokoroMaleVoice = (typeof KOKORO_MALE_VOICES)[number];

const DEFAULT_VOICE: KokoroMaleVoice = "am_michael";
const MODEL_ID = "onnx-community/Kokoro-82M-v1.0-ONNX";

type KokoroRawAudio = {
  data?: Float32Array | number[];
  audio?: Float32Array | number[];
  sampling_rate?: number;
  sample_rate?: number;
  toBlob?: () => Blob | Promise<Blob>;
};

type KokoroInstance = {
  generate: (text: string, opts: { voice?: string; speed?: number }) => Promise<KokoroRawAudio>;
};

let ttsPromise: Promise<KokoroInstance> | null = null;
let loadProgress = 0;
let lastError: string | null = null;
let activeAudio: HTMLAudioElement | null = null;

export function getKokoroLoadProgress(): number {
  return loadProgress;
}

export function getKokoroLastError(): string | null {
  return lastError;
}

async function getKokoro(): Promise<KokoroInstance> {
  if (ttsPromise) return ttsPromise;
  ttsPromise = (async () => {
    loadProgress = 0.05;
    lastError = null;
    try {
      const { KokoroTTS } = await import("kokoro-js");
      loadProgress = 0.15;
      // Prefer WebGPU when available (faster); else WASM (CPU, free everywhere).
      const hasWebGpu =
        typeof navigator !== "undefined" && "gpu" in navigator;
      const tts = await KokoroTTS.from_pretrained(MODEL_ID, {
        dtype: hasWebGpu ? "fp32" : "q8",
        device: hasWebGpu ? "webgpu" : "wasm",
        progress_callback: (p: unknown) => {
          const prog = (p as { progress?: number } | null)?.progress;
          if (typeof prog === "number") {
            loadProgress = Math.min(0.95, 0.15 + prog * 0.8);
          }
        },
      });
      loadProgress = 1;
      return tts as unknown as KokoroInstance;
    } catch (e) {
      ttsPromise = null;
      loadProgress = 0;
      lastError = e instanceof Error ? e.message : String(e);
      throw e;
    }
  })();
  return ttsPromise;
}

/** Warm model in background after user opens Atlas (still free, just bandwidth). */
export function warmKokoroTts(): void {
  if (typeof window === "undefined") return;
  // Defer so first paint isn't blocked
  window.setTimeout(() => {
    void getKokoro().catch(() => {
      /* fallback path handles failure */
    });
  }, 2500);
}

function floatToWavBlob(samples: Float32Array, sampleRate: number): Blob {
  const numChannels = 1;
  const bytesPerSample = 2;
  const blockAlign = numChannels * bytesPerSample;
  const buffer = new ArrayBuffer(44 + samples.length * bytesPerSample);
  const view = new DataView(buffer);
  const writeStr = (off: number, s: string) => {
    for (let i = 0; i < s.length; i++) view.setUint8(off + i, s.charCodeAt(i));
  };
  writeStr(0, "RIFF");
  view.setUint32(4, 36 + samples.length * bytesPerSample, true);
  writeStr(8, "WAVE");
  writeStr(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * blockAlign, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, 16, true);
  writeStr(36, "data");
  view.setUint32(40, samples.length * bytesPerSample, true);
  let o = 44;
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]!));
    view.setInt16(o, s < 0 ? s * 0x8000 : s * 0x7fff, true);
    o += 2;
  }
  return new Blob([buffer], { type: "audio/wav" });
}

/**
 * Speak with Kokoro OSS neural TTS. Returns true on success.
 */
export async function speakWithKokoro(
  text: string,
  opts?: { voice?: KokoroMaleVoice; speed?: number },
): Promise<boolean> {
  const spoken = humanizeForSpeech(text);
  if (!spoken) return false;
  try {
    const tts = await getKokoro();
    const result = await tts.generate(spoken, {
      voice: opts?.voice ?? DEFAULT_VOICE,
      speed: opts?.speed ?? 1,
    });

    // kokoro-js returns transformers RawAudio (data + 24kHz)
    let blob: Blob;
    if (typeof result.toBlob === "function") {
      blob = await Promise.resolve(result.toBlob());
    } else {
      const raw = result.data ?? result.audio;
      if (!raw) throw new Error("Kokoro returned empty audio");
      const rate = result.sampling_rate ?? result.sample_rate ?? 24000;
      const samples = raw instanceof Float32Array ? raw : new Float32Array(raw);
      blob = floatToWavBlob(samples, rate);
    }

    const url = URL.createObjectURL(blob);
    if (activeAudio) {
      activeAudio.pause();
      activeAudio.src = "";
    }
    const el = new Audio(url);
    activeAudio = el;
    el.onended = () => {
      URL.revokeObjectURL(url);
      if (activeAudio === el) activeAudio = null;
    };
    await el.play();
    return true;
  } catch (e) {
    lastError = e instanceof Error ? e.message : String(e);
    return false;
  }
}

export function stopKokoroSpeech(): void {
  if (activeAudio) {
    activeAudio.pause();
    activeAudio.src = "";
    activeAudio = null;
  }
}
