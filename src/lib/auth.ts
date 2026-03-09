import "server-only";

import { createHash, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

import { cookies } from "next/headers";

import {
  deleteSessionByTokenHash,
  getUserFromSessionTokenHash,
  insertSession,
} from "@/lib/db";

export const SESSION_COOKIE = "chatting_session";
const SESSION_DURATION_MS = 1000 * 60 * 60 * 24 * 30;

export function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export function getSessionCookieConfig(expiresAt: string) {
  return {
    name: SESSION_COOKIE,
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: new Date(expiresAt),
  };
}

export function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  const derived = scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${derived}`;
}

export function verifyPassword(password: string, storedHash: string) {
  const [salt, key] = storedHash.split(":");

  if (!salt || !key) {
    return false;
  }

  const incoming = scryptSync(password, salt, 64);
  const saved = Buffer.from(key, "hex");

  return saved.length === incoming.length && timingSafeEqual(saved, incoming);
}

export function createSession(userId: number) {
  const token = randomBytes(32).toString("hex");
  const tokenHash = hashToken(token);
  const expiresAt = new Date(Date.now() + SESSION_DURATION_MS).toISOString();

  insertSession({ userId, tokenHash, expiresAt });

  return {
    token,
    expiresAt,
  };
}

export async function getSessionUser() {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;

  if (!token) {
    return null;
  }

  const user = getUserFromSessionTokenHash(hashToken(token));

  if (!user) {
    return null;
  }

  return user;
}

export async function requireSessionUser() {
  const user = await getSessionUser();

  if (!user) {
    throw new Error("Unauthorized");
  }

  return user;
}

export function destroySession(token?: string) {
  if (token) {
    deleteSessionByTokenHash(hashToken(token));
  }
}
