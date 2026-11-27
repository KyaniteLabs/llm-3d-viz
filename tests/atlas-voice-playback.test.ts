import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { loadModel } = vi.hoisted(() => ({ loadModel: vi.fn() }));
vi.mock("kokoro-js", () => ({ KokoroTTS: { from_pretrained: loadModel } }));

const audio = new Blob([new Uint8Array([1, 2])], { type: "audio/wav" });
const play = vi.fn(async () => undefined);
const fetchReply = vi.fn();

beforeEach(() => {
  vi.resetModules();
  loadModel.mockReset();
  play.mockClear();
  fetchReply.mockReset();
  const storage = new Map<string, string>();
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => storage.set(key, value),
  });
  vi.stubGlobal("navigator", {});
  vi.stubGlobal("fetch", fetchReply);
  vi.stubGlobal("Audio", class {
    onended = null;
    play = play;
    pause = vi.fn();
    constructor(public src: string) {}
    removeAttribute(attribute: string) { if (attribute === "src") this.src = ""; }
  });
});

afterEach(() => vi.unstubAllGlobals());

describe("Atlas voice playback", () => {
  it("uses CPU synthesis when the browser exposes WebGPU without a usable adapter", async () => {
    vi.stubGlobal("navigator", { gpu: { requestAdapter: async () => null } });
    loadModel.mockResolvedValue({ generate: async () => ({ toBlob: () => audio }) });
    const { speakWithKokoro, stopKokoroSpeech } = await import("../src/lib/atlas-agent/kokoro-tts");

    expect(await speakWithKokoro("Ready to apply.")).toBe(true);
    expect(loadModel).toHaveBeenCalledExactlyOnceWith(expect.any(String), expect.objectContaining({
      dtype: "q8",
      device: "wasm",
    }));
    stopKokoroSpeech();
  });

  it("retries on CPU if a WebGPU adapter is present but initialization fails", async () => {
    vi.stubGlobal("navigator", { gpu: { requestAdapter: async () => ({}) } });
    loadModel.mockRejectedValueOnce(new Error("WebGPU initialization failed"));
    loadModel.mockResolvedValueOnce({ generate: async () => ({ toBlob: () => audio }) });
    const { speakWithKokoro, stopKokoroSpeech } = await import("../src/lib/atlas-agent/kokoro-tts");

    expect(await speakWithKokoro("Ready to apply.")).toBe(true);
    expect(loadModel.mock.calls.map(([, options]) => options.device)).toEqual(["webgpu", "wasm"]);
    stopKokoroSpeech();
  });

  it("drops stale neural audio when muted, even if voice is enabled again before synthesis returns", async () => {
    let finish!: (result: { toBlob: () => Blob }) => void;
    const generation = new Promise<{ toBlob: () => Blob }>((resolve) => { finish = resolve; });
    const generate = vi.fn().mockReturnValueOnce(generation).mockResolvedValue({ toBlob: () => audio });
    loadModel.mockResolvedValue({ generate });
    const { speakAtlas, setAtlasVoiceMuted, stopAtlasSpeech } = await import("../src/lib/atlas-agent/voice");

    speakAtlas("Old reply.");
    await vi.waitFor(() => expect(generate).toHaveBeenCalledOnce());
    setAtlasVoiceMuted(true);
    stopAtlasSpeech();
    setAtlasVoiceMuted(false);
    finish({ toBlob: () => audio });
    await new Promise<void>((resolve) => setImmediate(resolve));
    expect(play).not.toHaveBeenCalled();
    expect(fetchReply).not.toHaveBeenCalled();

    speakAtlas("New reply.");
    await vi.waitFor(() => expect(play).toHaveBeenCalledOnce());
    stopAtlasSpeech();
  });

  it("drops a pending premium response after playback is stopped", async () => {
    let finish!: (response: Response) => void;
    fetchReply.mockReturnValue(new Promise<Response>((resolve) => { finish = resolve; }));
    const { speakAtlasPremium, stopAtlasSpeech } = await import("../src/lib/atlas-agent/voice");
    const started = speakAtlasPremium("Ready to apply.");
    expect(fetchReply).toHaveBeenCalledOnce();
    stopAtlasSpeech();
    finish(new Response(audio));

    expect(await started).toBe(false);
    expect(play).not.toHaveBeenCalled();
  });
});
