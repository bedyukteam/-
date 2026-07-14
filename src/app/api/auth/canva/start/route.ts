import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { randomBytes } from "crypto";
import { buildAuthorizeUrl, generatePkcePair } from "@/lib/canva-oauth";

export async function GET() {
  const state = randomBytes(16).toString("hex");
  const { verifier, challenge } = generatePkcePair();
  const cookieStore = await cookies();
  cookieStore.set("canva_oauth_state", state, { httpOnly: true, maxAge: 600, path: "/", sameSite: "lax" });
  cookieStore.set("canva_oauth_verifier", verifier, { httpOnly: true, maxAge: 600, path: "/", sameSite: "lax" });
  return NextResponse.redirect(buildAuthorizeUrl(state, challenge));
}
