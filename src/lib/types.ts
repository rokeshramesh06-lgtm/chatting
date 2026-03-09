export type AttachmentKind = "image" | "video" | "document";
export type CallMode = "audio" | "video";
export type CallStage =
  | "invite"
  | "accept"
  | "decline"
  | "end"
  | "offer"
  | "answer"
  | "ice";

export type CallSignalPayload = {
  sdp?: {
    type: "offer" | "answer" | "pranswer" | "rollback";
    sdp: string;
  };
  candidate?: {
    candidate: string;
    sdpMid: string | null;
    sdpMLineIndex: number | null;
    usernameFragment?: string | null;
  } | null;
} | null;

export type SessionUser = {
  id: number;
  email: string | null;
  phone: string | null;
  username: string;
  status: string;
  avatarPath: string | null;
  lastSeen: string;
  createdAt: string;
};

export type ContactSummary = {
  id: number;
  username: string;
  status: string;
  avatarPath: string | null;
  email: string | null;
  phone: string | null;
  isOnline: boolean;
  lastSeen: string;
};

export type ConversationParticipant = {
  id: number;
  username: string;
  status: string;
  avatarPath: string | null;
  isOnline: boolean;
};

export type ConversationSummary = {
  id: number;
  type: "direct" | "group";
  name: string;
  imagePath: string | null;
  updatedAt: string;
  lastMessagePreview: string;
  lastMessageAt: string | null;
  participants: ConversationParticipant[];
};

export type ChatMessage = {
  id: number;
  conversationId: number;
  senderId: number;
  senderName: string;
  senderAvatarPath: string | null;
  content: string;
  attachmentPath: string | null;
  attachmentName: string | null;
  attachmentKind: AttachmentKind | null;
  createdAt: string;
};

export type BootstrapPayload = {
  currentUser: SessionUser;
  contacts: ContactSummary[];
  conversations: ConversationSummary[];
};

export type RealtimeEvent =
  | {
      kind: "message";
      userIds: number[];
      conversationId: number;
      senderId: number;
      senderName: string;
      preview: string;
    }
  | {
      kind: "conversation";
      userIds: number[];
      conversationId: number;
      actorId: number;
    }
  | {
      kind: "presence";
      broadcast: true;
      userId: number;
    }
  | {
      kind: "profile";
      broadcast: true;
      userId: number;
    }
  | {
      kind: "call";
      userIds: number[];
      conversationId: number;
      callId: string;
      mode: CallMode;
      stage: CallStage;
      fromUserId: number;
      fromUserName: string;
      fromUserAvatarPath: string | null;
      payload?: CallSignalPayload;
    };
