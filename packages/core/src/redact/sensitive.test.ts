import { describe, expect, it } from "vitest";
import { toolSensitivity } from "./sensitive";

describe("tool sensitivity", () => {
  it("reads the option and the schema", () => {
    expect(toolSensitivity(undefined)).toEqual({ input: [], output: [], hideFromModel: false });
    // a plain list names fields on both sides
    expect(toolSensitivity({ sensitive: ["passport"] })).toEqual({ input: ["passport"], output: ["passport"], hideFromModel: false });
    expect(
      toolSensitivity({
        sensitive: { output: ["bookingReference"], hideFromModel: true },
        jsonSchema: {
          type: "object",
          properties: {
            cardNumber: { type: "string", "x-sensitive": true },
            pw: { type: "string", format: "password" },
            plain: { type: "string" },
            nested: { type: "object", properties: { cvc: { type: "string", "x-sensitive": true } } },
          },
        },
      }),
    ).toEqual({ input: ["cardNumber", "pw", "cvc"], output: ["bookingReference"], hideFromModel: true });
  });

  it("never throws on a schema getter that throws", () => {
    const tool = {
      get jsonSchema(): never {
        throw new Error("bad schema");
      },
    };
    expect(toolSensitivity(tool)).toEqual({ input: [], output: [], hideFromModel: false });
  });
});
