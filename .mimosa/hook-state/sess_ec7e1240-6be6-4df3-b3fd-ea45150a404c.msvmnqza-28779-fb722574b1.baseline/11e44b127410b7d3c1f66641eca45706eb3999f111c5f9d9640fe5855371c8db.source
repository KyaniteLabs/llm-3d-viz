/**
 * Atlas voice: Web Speech STT + TTS.
 * Prefer a high-quality **male** English neural/OS voice — not the browser default robot.
 *
 * Voices load async (`voiceschanged`); we cache the best male en-* voice and re-resolve on speak.
 * Gesture-gated mic; muteable speaker. STT may be vendor-mediated (disclosed in UI).
 */

export type SpeechRecognitionLike = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onresult:
    | ((ev: {
        results: {
          [i: number]: { [j: number]: { transcript: string }; isFinal?: boolean; length: number };
          length: number;
        };
      }) => void)
    | null;
  onerror: ((ev: { error?: string }) => void) | null;
  onend: (() => void) | null;
};

type SynthVoice = SpeechSynthesisVoice;

function getRecognitionCtor(): (new () => SpeechRecognitionLike) | null {
  const w = globalThis as unknown as {
    SpeechRecognition?: new () => SpeechRecognitionLike;
    webkitSpeechRecognition?: new () => SpeechRecognitionLike;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export function speechRecognitionSupported(): boolean {
  return getRecognitionCtor() != null;
}

export function speechSynthesisSupported(): boolean {
  return typeof globalThis.speechSynthesis !== "undefined";
}

const MUTE_KEY = "atlas-voice-muted";
const VOICE_URI_KEY = "atlas-voice-uri";

export function isAtlasVoiceMuted(): boolean {
  try {
    return localStorage.getItem(MUTE_KEY) === "1";
  } catch {
    return false;
  }
}

export function setAtlasVoiceMuted(muted: boolean): void {
  try {
    localStorage.setItem(MUTE_KEY, muted ? "1" : "0");
  } catch {
    /* ignore */
  }
}

/** Explicit user/OS voice URI override (optional). */
export function getPreferredVoiceUri(): string | null {
  try {
    return localStorage.getItem(VOICE_URI_KEY);
  } catch {
    return null;
  }
}

export function setPreferredVoiceUri(uri: string | null): void {
  try {
    if (!uri) localStorage.removeItem(VOICE_URI_KEY);
    else localStorage.setItem(VOICE_URI_KEY, uri);
  } catch {
    /* ignore */
  }
}

// —— Male English voice scoring (2025–26 browser catalogs) ——

/** Strongly preferred high-quality male English voices by name fragment. */
const MALE_PREFER = [
  // Microsoft Online / Natural (Edge/Windows — often best neural quality)
  "microsoft guy",
  "microsoft steffan",
  "microsoft christopher",
  "microsoft eric",
  "microsoft roger",
  "microsoft ryan",
  "microsoft davis",
  "microsoft tony",
  "microsoft jason",
  "microsoft andrew",
  "microsoft brian",
  "microsoft guy online",
  "microsoft steffan online",
  // Google cloud-backed (Chrome)
  "google uk english male",
  "google us english male",
  // Apple / macOS
  "daniel", // en-GB
  "arthur",
  "aaron",
  "reed",
  "rishi",
  "tom",
  "fred",
  "alex", // en-US classic but male
  "nathan",
  "gordon",
  "lee",
  // Generic male tags
  "english male",
  "en-us-male",
  "en-gb-male",
  " male",
];

const FEMALE_OR_ROBOT = [
  "female",
  "zira",
  "susan",
  "samantha",
  "karen",
  "moira",
  "tessa",
  "fiona",
  "veena",
  "victoria",
  "karen",
  "heather",
  "linda",
  "jenny",
  "aria",
  "michelle",
  "google us english", // often female default "Google US English"
  "google uk english female",
  "espeak",
  "compact",
  "whisper",
];

function scoreMaleEnglishVoice(v: SynthVoice): number {
  const name = (v.name || "").toLowerCase();
  const lang = (v.lang || "").toLowerCase();
  let score = 0;

  if (!lang.startsWith("en")) return -1000;

  // Prefer en-US / en-GB for Atlas product English
  if (lang.startsWith("en-us") || lang.startsWith("en_us")) score += 30;
  else if (lang.startsWith("en-gb") || lang.startsWith("en_gb")) score += 28;
  else if (lang.startsWith("en-au") || lang.startsWith("en-ie") || lang.startsWith("en-in")) score += 18;
  else score += 10;

  // Neural / online / natural quality signals
  if (/online|natural|neural|premium|enhanced|wavenet|journey|studio/.test(name)) score += 40;
  if (/microsoft/.test(name)) score += 25;
  if (/google/.test(name) && /male/.test(name)) score += 35;
  if (/google/.test(name) && !/male|female/.test(name)) score -= 15; // ambiguous Google default often female

  // Explicit male preference list
  for (let i = 0; i < MALE_PREFER.length; i++) {
    const frag = MALE_PREFER[i]!;
    if (name.includes(frag.trim())) {
      score += 50 - Math.min(i, 20); // earlier list = higher
      break;
    }
  }

  // Soft male name hits
  if (/\b(guy|daniel|david|james|mark|george|thomas|brian|eric|ryan|christopher|steffan|arthur|aaron|alex|tom|fred|nathan|lee|gordon|roger|davis|jason|tony|andrew)\b/.test(name)) {
    score += 20;
  }

  // Penalize female / robot
  for (const bad of FEMALE_OR_ROBOT) {
    if (name.includes(bad) && !(bad === "google us english" && /male/.test(name))) {
      score -= 80;
    }
  }
  if (/female|woman|zira|samantha/.test(name)) score -= 100;

  // Prefer default lang voice slightly less than named quality voices
  if (v.default && score < 40) score += 5;

  // localService true = often lower quality eSpeak-ish; prefer remote neural when available
  if (v.localService === false) score += 15;
  if (v.localService === true && /espeak|compact|robot|dummy/.test(name)) score -= 50;

  return score;
}

/** Pure score helper for tests. */
export function scoreAtlasMaleVoice(v: {
  name: string;
  lang: string;
  default?: boolean;
  localService?: boolean;
}): number {
  return scoreMaleEnglishVoice(v as SynthVoice);
}

let cachedMaleVoice: SynthVoice | null = null;
let voicesReady: Promise<SynthVoice[]> | null = null;

/** Load voices (Chrome populates async). */
export function loadAtlasVoices(): Promise<SynthVoice[]> {
  if (!speechSynthesisSupported()) return Promise.resolve([]);
  if (voicesReady) return voicesReady;

  voicesReady = new Promise((resolve) => {
    const synth = globalThis.speechSynthesis;
    const finish = () => {
      const list = synth.getVoices();
      if (list.length) {
        cachedMaleVoice = pickBestMaleVoice(list);
        resolve(list);
        return true;
      }
      return false;
    };

    if (finish()) return;

    const onChange = () => {
      if (finish()) {
        synth.removeEventListener("voiceschanged", onChange);
      }
    };
    synth.addEventListener("voiceschanged", onChange);
    // Kick Chrome
    void synth.getVoices();
    // Fallback timeout
    setTimeout(() => {
      synth.removeEventListener("voiceschanged", onChange);
      const list = synth.getVoices();
      cachedMaleVoice = pickBestMaleVoice(list);
      resolve(list);
    }, 750);
  });

  return voicesReady;
}

export function pickBestMaleVoice(voices: readonly SynthVoice[]): SynthVoice | null {
  if (!voices.length) return null;

  const preferredUri = getPreferredVoiceUri();
  if (preferredUri) {
    const hit = voices.find((v) => v.voiceURI === preferredUri || v.name === preferredUri);
    if (hit) return hit;
  }

  let best: SynthVoice | null = null;
  let bestScore = -Infinity;
  for (const v of voices) {
    const s = scoreMaleEnglishVoice(v);
    if (s > bestScore) {
      bestScore = s;
      best = v;
    }
  }
  // If everything scored terrible, still prefer any en male-ish
  if (bestScore < 0) {
    const en = voices.filter((v) => (v.lang || "").toLowerCase().startsWith("en"));
    return en[0] ?? voices[0] ?? null;
  }
  return best;
}

/** Humanize Atlas copy for TTS — less "dumb robot reading UI". */
export function humanizeForSpeech(text: string): string {
  let t = text.trim();
  // Prosody-friendly punctuation
  t = t.replace(/\s*·\s*/g, ", ");
  t = t.replace(/\s*—\s*/g, ", ");
  t = t.replace(/\s*→\s*/g, " to ");
  t = t.replace(/\$(\d+(?:\.\d+)?)\s*\/\s*M\b/gi, "$1 dollars per million tokens");
  t = t.replace(/\$(\d+(?:\.\d+)?)\b/g, "$1 dollars");
  t = t.replace(/\b(\d+)\s*tok\/s\b/gi, "$1 tokens per second");
  t = t.replace(/\bIndex\s+(\d+)\b/gi, "intelligence index $1");
  t = t.replace(/\bfloor\s+(\d+)\b/gi, "floor $1");
  t = t.replace(/\bVRAM\b/g, "V RAM");
  t = t.replace(/\bGB\b/g, "gigabytes");
  t = t.replace(/\bFAQ\b/g, "F A Q");
  // Soften confirm prompts for speech
  t = t.replace(/\bApply to update Decide\?/gi, "Say apply when you want this on the stage.");
  t = t.replace(/\bApply\?/g, "Ready to apply.");
  // Cap length for neural voices
  if (t.length > 420) t = t.slice(0, 400).replace(/\s+\S*$/, "") + ".";
  return t;
}

let activePremiumAudio: HTMLAudioElement | null = null;
let lastTtsEngine: "kokoro" | "openai" | "webspeech" | "none" = "none";

export function getLastTtsEngine(): "kokoro" | "openai" | "webspeech" | "none" {
  return lastTtsEngine;
}

/**
 * Premium path: OpenAI gpt-4o-mini-tts (male onyx) via same-origin worker
 * POST /api/atlas/tts — only works on viz.kyanitelabs.tech (worker) when secret set.
 */
export async function speakAtlasPremium(text: string): Promise<boolean> {
  if (isAtlasVoiceMuted()) return false;
  const spoken = humanizeForSpeech(text);
  if (!spoken) return false;

  try {
    const res = await fetch("/api/atlas/tts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        text: spoken,
        voice: "onyx",
        model: "gpt-4o-mini-tts",
      }),
    });
    if (!res.ok) return false;
    const ct = res.headers.get("content-type") || "";
    if (!ct.includes("audio")) return false;
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    if (activePremiumAudio) {
      activePremiumAudio.pause();
      activePremiumAudio.src = "";
    }
    if (speechSynthesisSupported()) globalThis.speechSynthesis.cancel();
    const audio = new Audio(url);
    activePremiumAudio = audio;
    audio.onended = () => {
      URL.revokeObjectURL(url);
      if (activePremiumAudio === audio) activePremiumAudio = null;
    };
    await audio.play();
    lastTtsEngine = "openai";
    return true;
  } catch {
    return false;
  }
}

function speakAtlasWebSpeech(text: string, opts?: { cancel?: boolean }): void {
  if (!speechSynthesisSupported() || isAtlasVoiceMuted()) return;
  const synth = globalThis.speechSynthesis;
  if (opts?.cancel !== false) synth.cancel();
  if (activePremiumAudio) {
    activePremiumAudio.pause();
    activePremiumAudio = null;
  }

  const reduced =
    typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
  const spoken = humanizeForSpeech(text);

  const run = (voice: SynthVoice | null) => {
    const u = new SpeechSynthesisUtterance(spoken);
    u.lang = voice?.lang || "en-US";
    if (voice) u.voice = voice;
    u.rate = reduced ? 1.02 : 0.96;
    u.pitch = 0.92;
    u.volume = 1;
    lastTtsEngine = "webspeech";
    setTimeout(() => synth.speak(u), 20);
  };

  const list = synth.getVoices();
  if (list.length) {
    cachedMaleVoice = pickBestMaleVoice(list);
    run(cachedMaleVoice);
    return;
  }

  void loadAtlasVoices().then((voices) => {
    cachedMaleVoice = pickBestMaleVoice(voices);
    run(cachedMaleVoice);
  });
}

/**
 * Prefer free open-source Kokoro neural male (in-browser), then browser Web Speech.
 * Paid OpenAI worker path is optional leftover if someone configures a key.
 */
export function speakAtlas(text: string, opts?: { cancel?: boolean }): void {
  if (isAtlasVoiceMuted()) return;
  if (opts?.cancel !== false) {
    stopAtlasSpeech();
  }
  void (async () => {
    try {
      const { speakWithKokoro } = await import("./kokoro-tts");
      const ok = await speakWithKokoro(text, { voice: "am_michael" });
      if (ok) {
        lastTtsEngine = "kokoro";
        return;
      }
    } catch {
      /* fall through */
    }
    const premium = await speakAtlasPremium(text);
    if (!premium) speakAtlasWebSpeech(text, { cancel: false });
  })();
}

/** Warm voice list on app boot (call once from panel mount). */
export function warmAtlasVoices(): void {
  void loadAtlasVoices();
}

export function stopAtlasSpeech(): void {
  if (speechSynthesisSupported()) globalThis.speechSynthesis.cancel();
  if (activePremiumAudio) {
    activePremiumAudio.pause();
    activePremiumAudio.src = "";
    activePremiumAudio = null;
  }
  void import("./kokoro-tts")
    .then((m) => m.stopKokoroSpeech())
    .catch(() => undefined);
}

export function getActiveAtlasVoiceName(): string | null {
  if (lastTtsEngine === "kokoro") return "Kokoro am_michael (OSS neural male)";
  if (lastTtsEngine === "openai") return "OpenAI onyx (neural male)";
  return cachedMaleVoice?.name ?? null;
}

export interface ListenHandle {
  stop: () => void;
}

/** Push-to-talk style listen; requires user gesture to start. */
export function listenAtlasOnce(
  onFinal: (transcript: string) => void,
  onError?: (msg: string) => void,
): ListenHandle | null {
  const Ctor = getRecognitionCtor();
  if (!Ctor) {
    onError?.("Speech recognition not supported in this browser.");
    return null;
  }
  const rec = new Ctor();
  rec.continuous = false;
  rec.interimResults = false;
  rec.lang = "en-US";
  rec.onresult = (ev) => {
    const last = ev.results[ev.results.length - 1];
    const t = last?.[0]?.transcript?.trim();
    if (t) onFinal(t);
  };
  rec.onerror = (ev) => {
    onError?.(ev.error ?? "recognition error");
  };
  rec.onend = () => {
    /* one-shot done */
  };
  try {
    rec.start();
  } catch (e) {
    onError?.(e instanceof Error ? e.message : "could not start mic");
    return null;
  }
  return {
    stop: () => {
      try {
        rec.abort();
      } catch {
        try {
          rec.stop();
        } catch {
          /* ignore */
        }
      }
    },
  };
}
