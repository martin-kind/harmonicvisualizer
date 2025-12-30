import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { POST } from "@/app/api/scale/route";
import { NextRequest } from "next/server";

const mockLlmResponse = {
  choices: [
    {
      message: {
        content: JSON.stringify({
          label: "Gb mixolydian",
          root: "Gb",
          notes: ["Gb", "Ab", "Bb", "Cb", "Db", "Eb", "Fb"],
        }),
      },
    },
  ],
};

describe("POST /api/scale", () => {
  beforeEach(() => {
    process.env.OPENAI_API_KEY = "test-key";
    vi.stubGlobal("fetch", async () => new Response(JSON.stringify(mockLlmResponse), { status: 200 }));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns parsed scale JSON", async () => {
    const req = new NextRequest(new URL("http://localhost/api/scale"), {
      method: "POST",
      body: JSON.stringify({ scale: "Gb mixolydian" }),
    });
    const res = await POST(req);
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.source).toBe("llm");
    expect(body.label).toBe("Gb mixolydian");
    expect(body.noteNames).toContain("Gb");
  });

  it("rejects missing scale", async () => {
    const req = new NextRequest(new URL("http://localhost/api/scale"), {
      method: "POST",
      body: JSON.stringify({}),
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });
});


