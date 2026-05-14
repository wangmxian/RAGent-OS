import { NextRequest, NextResponse } from "next/server";
import { retrieve } from "@/lib/retrieval";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface SearchRequestBody {
  query: string;
  k?: number;
  fileIds?: string[];
  modalities?: Array<"text" | "image">;
  maxDistance?: number;
  useMmr?: boolean;
  mmrFetchK?: number;
  mmrLambda?: number;
}

export async function POST(req: NextRequest) {
  let body: SearchRequestBody;
  try {
    body = (await req.json()) as SearchRequestBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!body.query || typeof body.query !== "string") {
    return NextResponse.json(
      { error: "query is required" },
      { status: 400 },
    );
  }

  try {
    const { hits, dim } = await retrieve(body.query, {
      k: body.k,
      fileIds: body.fileIds,
      modalities: body.modalities,
      maxDistance: body.maxDistance,
      useMmr: body.useMmr,
      mmrFetchK: body.mmrFetchK,
      mmrLambda: body.mmrLambda,
    });
    return NextResponse.json({ hits, dim });
  } catch (e: any) {
    console.error("[search] error", e);
    return NextResponse.json(
      { error: e?.message || String(e) },
      { status: 500 },
    );
  }
}
