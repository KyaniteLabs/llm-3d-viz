import { describe, expect, it } from "vitest";
import {
  humanizeForSpeech,
  pickBestMaleVoice,
  scoreAtlasMaleVoice,
} from "../src/lib/atlas-agent/voice";

describe("atlas voice male selection", () => {
  it("scores Microsoft neural male above generic female defaults", () => {
    const guy = scoreAtlasMaleVoice({
      name: "Microsoft Guy Online (Natural) - English (United States)",
      lang: "en-US",
      localService: false,
    });
    const zira = scoreAtlasMaleVoice({
      name: "Microsoft Zira - English (United States)",
      lang: "en-US",
      localService: true,
    });
    const googleFemale = scoreAtlasMaleVoice({
      name: "Google US English",
      lang: "en-US",
      localService: false,
    });
    expect(guy).toBeGreaterThan(zira);
    expect(guy).toBeGreaterThan(googleFemale);
  });

  it("picks a male voice from a mixed catalog", () => {
    const voices = [
      { name: "Google US English", lang: "en-US", voiceURI: "g-f", localService: false, default: true },
      { name: "Microsoft Guy Online (Natural) - English (United States)", lang: "en-US", voiceURI: "guy", localService: false, default: false },
      { name: "Samantha", lang: "en-US", voiceURI: "sam", localService: true, default: false },
    ] as SpeechSynthesisVoice[];
    const best = pickBestMaleVoice(voices);
    expect(best?.name).toMatch(/Guy/i);
  });

  it("humanizes metrics for less robotic TTS", () => {
    const out = humanizeForSpeech("Floor 50 · Index 62 · $1.2/M · 200 tok/s. Apply?");
    expect(out.toLowerCase()).toMatch(/floor 50/);
    expect(out.toLowerCase()).toMatch(/intelligence index|index/);
    expect(out.toLowerCase()).toMatch(/dollars/);
    expect(out.toLowerCase()).toMatch(/tokens per second/);
    expect(out).not.toContain("·");
  });
});
