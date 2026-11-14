import { afterEach, describe, expect, it } from "vitest";
import { render } from "vitest-browser-react";
import "../src/chat.css";
import { AgentChat } from "../src/components/AgentChat";
import type { AgentAdapter } from "../src/types";
import { until } from "./browser-utils";

const adapter: AgentAdapter = { id: "fake", label: "Fake", async *run() {} };
const launcher = () => document.querySelector<HTMLElement>(".wa-chat__launcher");

/** A computed colour as sRGB 0–255, whatever notation the browser reports it in. */
function rgb(color: string): [number, number, number] {
  const ctx = document.createElement("canvas").getContext("2d") as CanvasRenderingContext2D;
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, 1, 1);
  const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data;
  return [r ?? 0, g ?? 0, b ?? 0];
}
const accent = (): [number, number, number] => rgb(getComputedStyle(launcher() as HTMLElement).backgroundColor);
const ink = (): [number, number, number] => rgb(getComputedStyle(launcher() as HTMLElement).color);
const light = ([r, g, b]: [number, number, number]): number => (r + g + b) / 3;

describe("the chat's accent", () => {
  afterEach(() => {
    document.documentElement.removeAttribute("data-theme");
    document.documentElement.style.removeProperty("--agent");
    document.documentElement.style.removeProperty("--agent-ink");
  });

  it("is the agent's colour in light, and a light tint of it with dark text on the dark panel", async () => {
    document.documentElement.setAttribute("data-theme", "light");
    await render(<AgentChat adapter={adapter} />);
    await until(() => !!launcher(), 2000);
    // the default agent is near black
    expect(light(accent())).toBeLessThan(40);
    expect(light(ink())).toBeGreaterThan(220);

    document.documentElement.setAttribute("data-theme", "dark");
    expect(light(accent())).toBeGreaterThan(170); // not black on a dark panel
    expect(light(ink())).toBeLessThan(60);

    // a brand colour keeps its hue, and its own light ink is not put on the light tint
    document.documentElement.style.setProperty("--agent", "#1d4ed8");
    document.documentElement.style.setProperty("--agent-ink", "#ffffff");
    const [r, g, b] = accent();
    expect(b).toBeGreaterThan(r);
    expect(b).toBeGreaterThan(200);
    expect(light([r, g, b])).toBeGreaterThan(150);
    expect(light(ink())).toBeLessThan(60);

    document.documentElement.setAttribute("data-theme", "light");
    expect(accent()).toEqual([29, 78, 216]);
  });
});
