"use client";

import { useEffect, useRef, useState } from "react";

import type {
  CallStage,
  CallMode,
  CallSignalPayload,
  ConversationSummary,
  RealtimeEvent,
  SessionUser,
} from "@/lib/types";

const ICE_SERVERS = [
  {
    urls: ["stun:stun.l.google.com:19302", "stun:stun1.l.google.com:19302"],
  },
];

type DirectPeer = {
  id: number;
  username: string;
  avatarPath: string | null;
};

export type ActiveCallState = {
  id: string;
  conversationId: number;
  mode: CallMode;
  peerName: string;
  peerAvatarPath: string | null;
  role: "caller" | "callee";
  status: string;
  isMuted: boolean;
  isVideoEnabled: boolean;
};

export type IncomingCallState = {
  id: string;
  conversationId: number;
  mode: CallMode;
  fromUserId: number;
  fromUserName: string;
  fromUserAvatarPath: string | null;
};

type UseCallManagerArgs = {
  currentUser: SessionUser;
  selectedConversation: ConversationSummary | null;
  selectedDirectContact: DirectPeer | null;
  onError: (message: string) => void;
  onToast: (title: string, body: string) => void;
};

function makeId() {
  return typeof window !== "undefined" && "crypto" in window
    ? window.crypto.randomUUID()
    : `${Date.now()}-${Math.random()}`;
}

function serializeSessionDescription(description: RTCSessionDescriptionInit) {
  return {
    type: description.type,
    sdp: description.sdp ?? "",
  } as NonNullable<CallSignalPayload>["sdp"];
}

function serializeIceCandidate(candidate: RTCIceCandidate) {
  return {
    candidate: candidate.candidate,
    sdpMid: candidate.sdpMid,
    sdpMLineIndex: candidate.sdpMLineIndex,
    usernameFragment: candidate.usernameFragment ?? null,
  };
}

export function useCallManager({
  currentUser,
  selectedConversation,
  selectedDirectContact,
  onError,
  onToast,
}: UseCallManagerArgs) {
  const [activeCall, setActiveCall] = useState<ActiveCallState | null>(null);
  const [incomingCall, setIncomingCall] = useState<IncomingCallState | null>(null);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [isStartingCall, setIsStartingCall] = useState(false);

  const localVideoRef = useRef<HTMLVideoElement | null>(null);
  const remoteVideoRef = useRef<HTMLVideoElement | null>(null);
  const remoteAudioRef = useRef<HTMLAudioElement | null>(null);
  const peerConnectionRef = useRef<RTCPeerConnection | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const remoteStreamRef = useRef<MediaStream | null>(null);
  const activeCallRef = useRef<ActiveCallState | null>(null);
  const incomingCallRef = useRef<IncomingCallState | null>(null);
  const pendingOffersRef = useRef(
    new Map<string, NonNullable<CallSignalPayload>["sdp"]>(),
  );
  const pendingCandidatesRef = useRef(
    new Map<string, Array<NonNullable<CallSignalPayload>["candidate"]>>(),
  );
  const currentUserRef = useRef(currentUser);
  const selectedConversationRef = useRef(selectedConversation);
  const selectedDirectContactRef = useRef(selectedDirectContact);

  useEffect(() => {
    currentUserRef.current = currentUser;
  }, [currentUser]);

  useEffect(() => {
    selectedConversationRef.current = selectedConversation;
  }, [selectedConversation]);

  useEffect(() => {
    selectedDirectContactRef.current = selectedDirectContact;
  }, [selectedDirectContact]);

  useEffect(() => {
    activeCallRef.current = activeCall;
  }, [activeCall]);

  useEffect(() => {
    incomingCallRef.current = incomingCall;
  }, [incomingCall]);

  useEffect(() => {
    localStreamRef.current = localStream;
    if (localVideoRef.current) {
      localVideoRef.current.srcObject = localStream;
      if (localStream) {
        void localVideoRef.current.play().catch(() => {});
      }
    }
  }, [localStream]);

  useEffect(() => {
    remoteStreamRef.current = remoteStream;

    if (remoteVideoRef.current) {
      remoteVideoRef.current.srcObject = remoteStream;
      if (remoteStream) {
        void remoteVideoRef.current.play().catch(() => {});
      }
    }

    if (remoteAudioRef.current) {
      remoteAudioRef.current.srcObject = remoteStream;
      if (remoteStream) {
        void remoteAudioRef.current.play().catch(() => {});
      }
    }
  }, [remoteStream]);

  useEffect(() => {
    return () => {
      void cleanupCall(false);
    };
  }, []);

  function updateActiveCall(patch: Partial<ActiveCallState>) {
    setActiveCall((current) => {
      if (!current) {
        return current;
      }

      const next = { ...current, ...patch };
      activeCallRef.current = next;
      return next;
    });
  }

  function queueIceCandidate(
    callId: string,
    candidate: NonNullable<CallSignalPayload>["candidate"],
  ) {
    const existing = pendingCandidatesRef.current.get(callId) ?? [];
    existing.push(candidate);
    pendingCandidatesRef.current.set(callId, existing);
  }

  async function flushQueuedCandidates(callId: string) {
    const peerConnection = peerConnectionRef.current;
    const candidates = pendingCandidatesRef.current.get(callId) ?? [];

    if (!peerConnection || candidates.length === 0) {
      return;
    }

    for (const candidate of candidates) {
      if (candidate) {
        await peerConnection.addIceCandidate(candidate);
      }
    }

    pendingCandidatesRef.current.delete(callId);
  }

  async function postSignal(
    conversationId: number,
    body: {
      callId: string;
      mode: CallMode;
      stage: CallStage;
      payload?: CallSignalPayload;
    },
  ) {
    const response = await fetch(`/api/conversations/${conversationId}/call`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const payload = (await response.json()) as { error?: string };
      throw new Error(payload.error ?? "Unable to update the call.");
    }
  }

  function buildPeerConnection() {
    const peerConnection = new RTCPeerConnection({ iceServers: ICE_SERVERS });
    const nextRemoteStream = new MediaStream();

    setRemoteStream(nextRemoteStream);
    remoteStreamRef.current = nextRemoteStream;

    peerConnection.onicecandidate = (event) => {
      if (!event.candidate) {
        return;
      }

      const liveCall = activeCallRef.current;

      if (!liveCall) {
        return;
      }

      void postSignal(liveCall.conversationId, {
        callId: liveCall.id,
        mode: liveCall.mode,
        stage: "ice",
        payload: {
          candidate: serializeIceCandidate(event.candidate),
        },
      }).catch((error) => {
        onError(
          error instanceof Error ? error.message : "Unable to send call updates.",
        );
      });
    };

    peerConnection.ontrack = (event) => {
      const liveRemoteStream = remoteStreamRef.current ?? new MediaStream();

      for (const track of event.streams[0]?.getTracks?.() ?? [event.track]) {
        if (!liveRemoteStream.getTracks().some((item) => item.id === track.id)) {
          liveRemoteStream.addTrack(track);
        }
      }

      remoteStreamRef.current = liveRemoteStream;
      setRemoteStream(liveRemoteStream);
    };

    peerConnection.onconnectionstatechange = () => {
      switch (peerConnection.connectionState) {
        case "connected":
          updateActiveCall({ status: "Connected" });
          break;
        case "connecting":
          updateActiveCall({ status: "Connecting" });
          break;
        case "disconnected":
          updateActiveCall({ status: "Connection interrupted" });
          break;
        case "failed":
          onError("The call connection failed.");
          void cleanupCall(false);
          break;
        case "closed":
          void cleanupCall(false);
          break;
        default:
          break;
      }
    };

    peerConnectionRef.current = peerConnection;
    return peerConnection;
  }

  async function getMedia(mode: CallMode) {
    if (
      typeof navigator === "undefined" ||
      !navigator.mediaDevices ||
      !navigator.mediaDevices.getUserMedia
    ) {
      throw new Error("Calling is not supported in this browser.");
    }

    return navigator.mediaDevices.getUserMedia({
      audio: true,
      video: mode === "video",
    });
  }

  async function cleanupCall(resetIncoming: boolean) {
    const peerConnection = peerConnectionRef.current;

    if (peerConnection) {
      peerConnection.onicecandidate = null;
      peerConnection.ontrack = null;
      peerConnection.onconnectionstatechange = null;
      peerConnection.close();
      peerConnectionRef.current = null;
    }

    for (const stream of [localStreamRef.current, remoteStreamRef.current]) {
      stream?.getTracks().forEach((track) => track.stop());
    }

    localStreamRef.current = null;
    remoteStreamRef.current = null;
    activeCallRef.current = null;
    setLocalStream(null);
    setRemoteStream(null);
    setActiveCall(null);

    if (resetIncoming) {
      incomingCallRef.current = null;
      setIncomingCall(null);
    }
  }

  async function startCall(mode: CallMode) {
    const conversation = selectedConversationRef.current;
    const directPeer = selectedDirectContactRef.current;

    if (!conversation || conversation.type !== "direct" || !directPeer) {
      onError("Open a direct chat to start a call.");
      return;
    }

    if (activeCallRef.current) {
      onError("Finish the current call before starting a new one.");
      return;
    }

    setIsStartingCall(true);

    try {
      const stream = await getMedia(mode);
      const callId = makeId();
      const nextCall: ActiveCallState = {
        id: callId,
        conversationId: conversation.id,
        mode,
        peerName: directPeer.username,
        peerAvatarPath: directPeer.avatarPath,
        role: "caller",
        status: "Calling...",
        isMuted: false,
        isVideoEnabled: mode === "video",
      };

      activeCallRef.current = nextCall;
      setActiveCall(nextCall);
      setIncomingCall(null);
      setLocalStream(stream);
      localStreamRef.current = stream;

      const peerConnection = buildPeerConnection();

      for (const track of stream.getTracks()) {
        peerConnection.addTrack(track, stream);
      }

      await postSignal(conversation.id, {
        callId,
        mode,
        stage: "invite",
      });

      const offer = await peerConnection.createOffer();
      await peerConnection.setLocalDescription(offer);

      await postSignal(conversation.id, {
        callId,
        mode,
        stage: "offer",
        payload: {
          sdp: serializeSessionDescription(offer),
        },
      });
    } catch (error) {
      await cleanupCall(true);
      onError(
        error instanceof Error ? error.message : "Unable to start the call.",
      );
    } finally {
      setIsStartingCall(false);
    }
  }

  async function acceptIncomingCall() {
    const incoming = incomingCallRef.current;
    const offer = incoming
      ? pendingOffersRef.current.get(incoming.id)
      : undefined;

    if (!incoming || !offer) {
      onError("The incoming call is no longer available.");
      return;
    }

    try {
      const stream = await getMedia(incoming.mode);
      const nextCall: ActiveCallState = {
        id: incoming.id,
        conversationId: incoming.conversationId,
        mode: incoming.mode,
        peerName: incoming.fromUserName,
        peerAvatarPath: incoming.fromUserAvatarPath,
        role: "callee",
        status: "Connecting",
        isMuted: false,
        isVideoEnabled: incoming.mode === "video",
      };

      activeCallRef.current = nextCall;
      setActiveCall(nextCall);
      setIncomingCall(null);
      incomingCallRef.current = null;
      setLocalStream(stream);
      localStreamRef.current = stream;

      const peerConnection = buildPeerConnection();

      for (const track of stream.getTracks()) {
        peerConnection.addTrack(track, stream);
      }

      await peerConnection.setRemoteDescription(offer);
      await flushQueuedCandidates(incoming.id);

      await postSignal(incoming.conversationId, {
        callId: incoming.id,
        mode: incoming.mode,
        stage: "accept",
      });

      const answer = await peerConnection.createAnswer();
      await peerConnection.setLocalDescription(answer);

      await postSignal(incoming.conversationId, {
        callId: incoming.id,
        mode: incoming.mode,
        stage: "answer",
        payload: {
          sdp: serializeSessionDescription(answer),
        },
      });
    } catch (error) {
      await cleanupCall(true);
      onError(
        error instanceof Error ? error.message : "Unable to answer the call.",
      );
    }
  }

  async function declineIncomingCall() {
    const incoming = incomingCallRef.current;

    if (!incoming) {
      return;
    }

    try {
      await postSignal(incoming.conversationId, {
        callId: incoming.id,
        mode: incoming.mode,
        stage: "decline",
      });
    } catch (error) {
      onError(
        error instanceof Error ? error.message : "Unable to decline the call.",
      );
    } finally {
      pendingOffersRef.current.delete(incoming.id);
      pendingCandidatesRef.current.delete(incoming.id);
      setIncomingCall(null);
      incomingCallRef.current = null;
    }
  }

  async function endCall() {
    const liveCall = activeCallRef.current;

    if (!liveCall) {
      return;
    }

    try {
      await postSignal(liveCall.conversationId, {
        callId: liveCall.id,
        mode: liveCall.mode,
        stage: "end",
      });
    } catch (error) {
      onError(
        error instanceof Error ? error.message : "Unable to end the call cleanly.",
      );
    } finally {
      await cleanupCall(true);
    }
  }

  function toggleMute() {
    const stream = localStreamRef.current;
    const liveCall = activeCallRef.current;

    if (!stream || !liveCall) {
      return;
    }

    const nextMuted = !liveCall.isMuted;

    for (const track of stream.getAudioTracks()) {
      track.enabled = !nextMuted;
    }

    updateActiveCall({ isMuted: nextMuted });
  }

  function toggleVideo() {
    const stream = localStreamRef.current;
    const liveCall = activeCallRef.current;

    if (!stream || !liveCall || liveCall.mode !== "video") {
      return;
    }

    const nextEnabled = !liveCall.isVideoEnabled;

    for (const track of stream.getVideoTracks()) {
      track.enabled = nextEnabled;
    }

    updateActiveCall({ isVideoEnabled: nextEnabled });
  }

  async function handleRealtimeCallEvent(event: RealtimeEvent) {
    if (event.kind !== "call") {
      return false;
    }

    if (event.fromUserId === currentUserRef.current.id) {
      return true;
    }

    if (activeCallRef.current && activeCallRef.current.id !== event.callId) {
      if (event.stage === "invite") {
        void postSignal(event.conversationId, {
          callId: event.callId,
          mode: event.mode,
          stage: "decline",
        }).catch(() => {});
      }

      return true;
    }

    switch (event.stage) {
      case "invite": {
        const nextIncoming: IncomingCallState = {
          id: event.callId,
          conversationId: event.conversationId,
          mode: event.mode,
          fromUserId: event.fromUserId,
          fromUserName: event.fromUserName,
          fromUserAvatarPath: event.fromUserAvatarPath,
        };

        setIncomingCall(nextIncoming);
        incomingCallRef.current = nextIncoming;
        onToast(
          event.fromUserName,
          event.mode === "video" ? "Incoming video call" : "Incoming voice call",
        );
        break;
      }
      case "offer":
        if (event.payload?.sdp) {
          pendingOffersRef.current.set(event.callId, event.payload.sdp);

          if (!incomingCallRef.current) {
            const nextIncoming: IncomingCallState = {
              id: event.callId,
              conversationId: event.conversationId,
              mode: event.mode,
              fromUserId: event.fromUserId,
              fromUserName: event.fromUserName,
              fromUserAvatarPath: event.fromUserAvatarPath,
            };

            setIncomingCall(nextIncoming);
            incomingCallRef.current = nextIncoming;
          }
        }
        break;
      case "accept":
        updateActiveCall({ status: "Connecting" });
        break;
      case "answer":
        if (peerConnectionRef.current && event.payload?.sdp) {
          await peerConnectionRef.current.setRemoteDescription(event.payload.sdp);
          await flushQueuedCandidates(event.callId);
          updateActiveCall({ status: "Connecting" });
        }
        break;
      case "ice":
        if (event.payload?.candidate) {
          if (
            peerConnectionRef.current &&
            peerConnectionRef.current.remoteDescription
          ) {
            await peerConnectionRef.current.addIceCandidate(event.payload.candidate);
          } else {
            queueIceCandidate(event.callId, event.payload.candidate);
          }
        }
        break;
      case "decline":
        onToast(event.fromUserName, "Declined the call");
        await cleanupCall(true);
        break;
      case "end":
        onToast(event.fromUserName, "Ended the call");
        await cleanupCall(true);
        break;
      default:
        break;
    }

    return true;
  }

  return {
    activeCall,
    incomingCall,
    isStartingCall,
    localVideoRef,
    remoteAudioRef,
    remoteVideoRef,
    startCall,
    acceptIncomingCall,
    declineIncomingCall,
    endCall,
    toggleMute,
    toggleVideo,
    handleRealtimeCallEvent,
  };
}
