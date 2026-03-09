import { NextResponse } from "next/server";

import { createSession, getSessionCookieConfig, SESSION_COOKIE, hashPassword } from "@/lib/auth";
import { createUser } from "@/lib/db";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      username?: string;
      email?: string;
      phone?: string;
      password?: string;
    };

    const password = body.password?.trim() ?? "";

    if (password.length < 8) {
      return NextResponse.json(
        { error: "Use at least 8 characters for your password." },
        { status: 400 },
      );
    }

    const user = createUser({
      username: body.username?.trim() ?? "",
      email: body.email,
      phone: body.phone,
      passwordHash: hashPassword(password),
    });

    const session = createSession(user.id);
    const response = NextResponse.json({ ok: true, user });

    response.cookies.set({
      ...getSessionCookieConfig(session.expiresAt),
      name: SESSION_COOKIE,
      value: session.token,
    });

    return response;
  } catch (error) {
    const message =
      error instanceof Error &&
      /unique|constraint/i.test(error.message)
        ? "That email, phone number, or username is already in use."
        : error instanceof Error
          ? error.message
          : "Unable to create your account right now.";

    return NextResponse.json({ error: message }, { status: 400 });
  }
}
