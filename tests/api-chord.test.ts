import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { POST } from "@/app/api/chord/route";
import { NextRequest } from "next/server";

const mockLlmResponse = {
  choices: [
    {
      message: {
        content: JSON.stringify({ root: "C", notes: ["C", "E", "G", "B"] }),
      },
    },
  ],
};

describe("POST /api/chord", () => {
  beforeEach(() => {
    process.env.OPENAI_API_KEY = "test-key";
    vi.stubGlobal("fetch", async () => new Response(JSON.stringify(mockLlmResponse), { status: 200 }));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns parsed chord JSON", async () => {
    const req = new NextRequest(new URL("http://localhost/api/chord"), {
      method: "POST",
      body: JSON.stringify({ chord: "Cmaj7" }),
    });
    const res = await POST(req);
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.pitchClasses).toContain(0);
    expect(body.source).toBe("llm");
  });

  it("rejects missing chord", async () => {
    const req = new NextRequest(new URL("http://localhost/api/chord"), {
      method: "POST",
      body: JSON.stringify({}),
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });
});

