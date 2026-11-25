/**
 * Configuration as data (design §7.2): where spans go, first match wins; each OTLP target's URL, protocol, headers and
 * timeout from options and `OTEL_*`; sampling and the resource. Failure paths first (R-EXP-1, R-EXP-6, R-EXP-7).
 */
import { describe, expect, test } from "vitest";
import {
  DEFAULT_TIMEOUT,
  killSwitch,
  parseList,
  resolveMode,
  resolveOtlp,
  resolveTarget,
  resourceAttributes,
  samplingFromEnv,
} from "../src/server/config";

const memory = { export: () => {}, shutdown: async () => {} };

describe("bad configuration (R-EXP-6)", () => {
  test("a header entry with no `=` is skipped and reported; the others are kept", () => {
    const bad: string[] = [];
    expect(parseList("x-api-key=abc,broken,project=field%20store", (e) => bad.push(e))).toEqual({
      "x-api-key": "abc",
      project: "field store",
    });
    expect(bad).toEqual(["broken"]);
  });

  test("an entry with an empty key or a bad percent-escape is skipped, not thrown", () => {
    const bad: string[] = [];
    expect(parseList("=v,k=%E0%A4%A,ok=1", (e) => bad.push(e))).toEqual({ ok: "1" });
    expect(bad).toHaveLength(2);
  });

  test("an unknown protocol is an error naming the three valid values", () => {
    const r = resolveOtlp({}, { OTEL_EXPORTER_OTLP_ENDPOINT: "https://c.example", OTEL_EXPORTER_OTLP_PROTOCOL: "http/xml" });
    expect(r).toEqual({ error: expect.stringMatching(/"http\/xml".*"http\/json", "http\/protobuf" or "grpc"/) });
  });

  test("both endpoint forms on one target are an error (that target only)", () => {
    const target = { endpoint: "https://a.example", endpoints: { traces: "https://b.example/t" } } as never;
    expect(resolveOtlp(target, {})).toEqual({ error: expect.stringContaining("both `endpoint` and `endpoints`") });
    expect(resolveTarget(target, {})).toBe("off");
  });

  test("a target with no URL anywhere is an error", () => {
    expect(resolveOtlp({}, {})).toEqual({ error: expect.stringContaining("no URL") });
  });

  test("an HTTP URL that does not parse is an error", () => {
    expect(resolveOtlp({ endpoints: { traces: "not a url" } }, {})).toEqual({ error: expect.stringContaining("not a valid URL") });
  });

  test("a sampler ratio outside 0..1 samples everything and says so; an unknown sampler too", () => {
    const said: string[] = [];
    expect(samplingFromEnv({ OTEL_TRACES_SAMPLER: "traceidratio", OTEL_TRACES_SAMPLER_ARG: "2" }, (m) => said.push(m))).toEqual({
      type: "always",
    });
    expect(samplingFromEnv({ OTEL_TRACES_SAMPLER: "jaeger_remote" }, (m) => said.push(m))).toBeUndefined();
    expect(said).toHaveLength(2);
    expect(said[1]).toContain("always_on, always_off or traceidratio");
  });

  test("a resource entry with no `=` is skipped", () => {
    const bad: string[] = [];
    expect(resourceAttributes({}, { OTEL_RESOURCE_ATTRIBUTES: "region=eu,nonsense" }, (e) => bad.push(e))).toEqual({
      region: "eu",
      "service.name": "web-agents",
    });
    expect(bad).toEqual(["nonsense"]);
  });
});

describe("the env table (design §7.2, §7.9; R-EXP-1)", () => {
  test.each([
    [{}, "off"],
    [{ OTEL_EXPORTER_OTLP_ENDPOINT: "https://c.example" }, "https://c.example/v1/traces"],
    [{ OTEL_EXPORTER_OTLP_ENDPOINT: "https://c.example/" }, "https://c.example/v1/traces"],
    [{ OTEL_EXPORTER_OTLP_ENDPOINT: "https://api.smith.langchain.com/otel" }, "https://api.smith.langchain.com/otel/v1/traces"],
    [
      { OTEL_EXPORTER_OTLP_ENDPOINT: "https://c.example", OTEL_EXPORTER_OTLP_TRACES_ENDPOINT: "https://t.example/x?y=1" },
      "https://t.example/x?y=1",
    ],
    [{ OTEL_EXPORTER_OTLP_ENDPOINT: "https://c.example", OTEL_SDK_DISABLED: "true" }, "off"],
    [{ OTEL_EXPORTER_OTLP_ENDPOINT: "https://c.example", WEB_AGENTS_OTEL_ENABLED: "false" }, "off"],
  ])("resolves env %j → %s", (env, expected) => expect(resolveTarget({}, env)).toBe(expected));

  test("options win over the env; a base endpoint gets /v1/traces, an exact one is kept", () => {
    const env = { OTEL_EXPORTER_OTLP_ENDPOINT: "https://env.example" };
    expect(resolveTarget({ endpoint: "https://opt.example" }, env)).toBe("https://opt.example/v1/traces");
    expect(resolveTarget({ endpoints: { traces: "https://opt.example/api/?tenant=a" } }, env)).toBe("https://opt.example/api/?tenant=a");
  });

  test("headers: OTEL_EXPORTER_OTLP_HEADERS, then the traces-only variable, then the target's", () => {
    const r = resolveOtlp(
      { headers: { c: "target" } },
      {
        OTEL_EXPORTER_OTLP_ENDPOINT: "https://c.example",
        OTEL_EXPORTER_OTLP_HEADERS: "a=1,b=1,c=1",
        OTEL_EXPORTER_OTLP_TRACES_HEADERS: "b=2",
      },
    );
    expect(r).toMatchObject({ headers: { a: "1", b: "2", c: "target" } });
  });

  test("protocol and timeout: option › traces variable › general variable › default", () => {
    const env = {
      OTEL_EXPORTER_OTLP_ENDPOINT: "http://localhost:4317",
      OTEL_EXPORTER_OTLP_PROTOCOL: "http/protobuf",
      OTEL_EXPORTER_OTLP_TRACES_PROTOCOL: "grpc",
      OTEL_EXPORTER_OTLP_TIMEOUT: "1000",
    };
    // grpc takes the base endpoint as given
    expect(resolveOtlp({}, env)).toMatchObject({ protocol: "grpc", url: "http://localhost:4317", timeout: 1000 });
    expect(resolveOtlp({ protocol: "http/json", timeout: 50 }, env)).toMatchObject({ protocol: "http/json", timeout: 50 });
    expect(resolveOtlp({}, { OTEL_EXPORTER_OTLP_ENDPOINT: "https://c.example" })).toMatchObject({
      protocol: "http/json",
      timeout: DEFAULT_TIMEOUT,
    });
  });

  test("the kill switches", () => {
    expect(killSwitch({ OTEL_SDK_DISABLED: "TRUE" })).toBe("OTEL_SDK_DISABLED");
    expect(killSwitch({ WEB_AGENTS_OTEL_ENABLED: "false" })).toBe("WEB_AGENTS_OTEL_ENABLED");
    expect(killSwitch({ OTEL_SDK_DISABLED: "false", WEB_AGENTS_OTEL_ENABLED: "true" })).toBeUndefined();
  });

  test("sampling from env: always_on, always_off, traceidratio and their parentbased_* forms", () => {
    expect(samplingFromEnv({})).toBeUndefined();
    expect(samplingFromEnv({ OTEL_TRACES_SAMPLER: "always_on" })).toEqual({ type: "always" });
    expect(samplingFromEnv({ OTEL_TRACES_SAMPLER: "parentbased_always_off" })).toEqual({ type: "never" });
    expect(samplingFromEnv({ OTEL_TRACES_SAMPLER: "traceidratio", OTEL_TRACES_SAMPLER_ARG: "0.25" })).toEqual({
      type: "ratio",
      probability: 0.25,
    });
    expect(samplingFromEnv({ OTEL_TRACES_SAMPLER: "parentbased_traceidratio" })).toEqual({ type: "ratio", probability: 1 });
  });

  test("the resource: service.name defaults to web-agents; OTEL_SERVICE_NAME › the env list; options › env", () => {
    expect(resourceAttributes({}, {})).toEqual({ "service.name": "web-agents" });
    const env = { OTEL_RESOURCE_ATTRIBUTES: "service.name=from-list,deployment.environment=staging", OTEL_SERVICE_NAME: "from-var" };
    expect(resourceAttributes({}, env)).toEqual({ "service.name": "from-var", "deployment.environment": "staging" });
    expect(resourceAttributes({ serviceName: "opt", resourceAttributes: { "deployment.environment": "production" } }, env)).toEqual({
      "service.name": "opt",
      "deployment.environment": "production",
    });
  });
});

describe("where spans go, first match wins (design §7.2; R-EXP-2, R-EXP-3)", () => {
  const ENV = { OTEL_EXPORTER_OTLP_ENDPOINT: "https://c.example" };
  const provider = { getTracer: () => ({}) };

  test.each([
    ["a kill switch beats everything", { tracerProvider: provider }, { ...ENV, OTEL_SDK_DISABLED: "true" }, true, "off"],
    ["a provider passed in", { tracerProvider: provider, exporters: [memory] }, ENV, true, "provider"],
    ['"global" with one registered', { tracerProvider: "global" as const }, {}, true, "global"],
    ['"global" with none registered is off', { tracerProvider: "global" as const }, ENV, false, "off"],
    ["exporters beat a global provider", { exporters: [memory] }, {}, true, "private"],
    ["span processors alone are enough", { spanProcessors: [memory as never] }, {}, true, "private"],
    ["a global provider beats the env", {}, ENV, true, "global"],
    ['"own" never uses the global one', { tracerProvider: "own" as const }, ENV, true, "private"],
    ['"own" with nothing else is off', { tracerProvider: "own" as const }, {}, true, "off"],
    ["the env alone", {}, ENV, false, "private"],
    ["nothing at all is off", {}, {}, false, "off"],
    ["empty exporters do not count", { exporters: [] }, {}, false, "off"],
  ] as const)("%s", (_, config, env, registered, mode) => {
    expect(resolveMode(config as never, env, registered).mode).toBe(mode);
  });

  test("off says why", () => {
    expect(resolveMode({}, { OTEL_SDK_DISABLED: "true" }, false).off).toBe("kill-switch");
    expect(resolveMode({ tracerProvider: "global" }, {}, false).off).toBe("no-global-provider");
    expect(resolveMode({}, {}, false).off).toBe("nothing-configured");
  });
});
