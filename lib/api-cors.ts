import { NextResponse } from "next/server";

function headers(request: Request): HeadersInit {
  const origin = request.headers.get("origin");
  const allowed = process.env.CORS_ORIGIN;
  return {
    ...(origin && allowed && origin === allowed ? { "Access-Control-Allow-Origin": origin, Vary: "Origin" } : {}),
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };
}

export function corsJson(request: Request, data: unknown, init?: ResponseInit) {
  const response = NextResponse.json(data, init);
  const cors = headers(request);
  for (const [key, value] of Object.entries(cors)) response.headers.set(key, value);
  return response;
}

export function corsOptions(request: Request) {
  return new NextResponse(null, { status: 204, headers: headers(request) });
}
