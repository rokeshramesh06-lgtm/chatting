import { NextResponse } from "next/server";

import { requireSessionUser } from "@/lib/session";
import { describeConversation, listParticipantIds } from "@/lib/db";
import { emitRealtimeEvent } from "@/lib/realtime";
import type { CallMode, CallSignalPayload, CallStage } from "@/lib/types";

export const runtime = "nodejs";

function getConversationId(rawValue: string) {
  const conversationId = Number(rawValue);

  if (!Number.isInteger(conversationId) || conversationId <= 0) {
    throw new Error("Invalid conversation id.");
  }

  return conversationId;
}

export async function POST(
  request: Request,
  context: { params: Promise<{ conversationId: string }> },
) {
  try {
    const user = await requireSessionUser();
    const { conversationId: rawConversationId } = await context.params;
    const conversationId = getConversationId(rawConversationId);
    const conversation = describeConversation(user.id, conversationId);
    const body = (await request.json()) as {
      callId?: string;
      mode?: CallMode;
      stage?: CallStage;
      payload?: CallSignalPayload;
    };

    if (!body.callId?.trim()) {
      throw new Error("Call id is required.");
    }

    if (!body.mode || !["audio", "video"].includes(body.mode)) {
      throw new Error("Call mode is required.");
    }

    if (
      !body.stage ||
      !["invite", "accept", "decline", "end", "offer", "answer", "ice"].includes(
        body.stage,
      )
    ) {
      throw new Error("Call stage is required.");
    }

    if (conversation.type !== "direct") {
      throw new Error("Voice and video calling is available in direct chats only.");
    }

    emitRealtimeEvent({
      kind: "call",
      userIds: listParticipantIds(conversationId),
      conversationId,
      callId: body.callId,
      mode: body.mode,
      stage: body.stage,
      fromUserId: user.id,
      fromUserName: user.username,
      fromUserAvatarPath: user.avatarPath,
      payload: body.payload ?? null,
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Unable to process that call request.",
      },
      { status: 400 },
    );
  }
}
