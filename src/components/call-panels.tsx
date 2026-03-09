"use client";

import type { RefObject } from "react";

import {
  Mic,
  MicOff,
  Phone,
  PhoneOff,
  Video,
  VideoOff,
} from "lucide-react";

import { Avatar } from "@/components/chat-ui";
import type {
  ActiveCallState,
  IncomingCallState,
} from "@/hooks/use-call-manager";

type CallPanelsProps = {
  activeCall: ActiveCallState | null;
  incomingCall: IncomingCallState | null;
  localVideoRef: RefObject<HTMLVideoElement | null>;
  remoteVideoRef: RefObject<HTMLVideoElement | null>;
  remoteAudioRef: RefObject<HTMLAudioElement | null>;
  onAccept: () => void;
  onDecline: () => void;
  onEnd: () => void;
  onToggleMute: () => void;
  onToggleVideo: () => void;
};

export function CallPanels({
  activeCall,
  incomingCall,
  localVideoRef,
  remoteVideoRef,
  remoteAudioRef,
  onAccept,
  onDecline,
  onEnd,
  onToggleMute,
  onToggleVideo,
}: CallPanelsProps) {
  return (
    <>
      {incomingCall ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/55 px-4 py-6 backdrop-blur-md">
          <div className="glass-panel w-full max-w-md rounded-[32px] p-8 text-center shadow-2xl shadow-slate-950/25">
            <div className="mx-auto mb-5 w-fit rounded-full bg-[linear-gradient(135deg,#0f172a,#0f766e)] p-1">
              <Avatar
                name={incomingCall.fromUserName}
                size="lg"
                src={incomingCall.fromUserAvatarPath}
              />
            </div>
            <p className="text-xs font-semibold tracking-[0.18em] text-slate-400 uppercase">
              Incoming {incomingCall.mode === "video" ? "video" : "voice"} call
            </p>
            <h2 className="mt-3 font-display text-3xl font-semibold text-slate-900">
              {incomingCall.fromUserName}
            </h2>
            <p className="mt-3 text-sm leading-7 text-slate-500">
              Answer now or decline the call.
            </p>

            <div className="mt-8 flex items-center justify-center gap-4">
              <button
                className="flex items-center gap-2 rounded-[22px] bg-emerald-500 px-5 py-3 text-sm font-semibold text-white transition hover:bg-emerald-400"
                onClick={onAccept}
                type="button"
              >
                <Phone className="h-4 w-4" />
                Accept
              </button>
              <button
                className="flex items-center gap-2 rounded-[22px] bg-rose-500 px-5 py-3 text-sm font-semibold text-white transition hover:bg-rose-400"
                onClick={onDecline}
                type="button"
              >
                <PhoneOff className="h-4 w-4" />
                Decline
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {activeCall ? (
        <div className="fixed right-4 bottom-4 z-50 w-[min(92vw,440px)] overflow-hidden rounded-[30px] border border-white/50 bg-slate-950 text-white shadow-2xl shadow-slate-950/30">
          <audio autoPlay playsInline ref={remoteAudioRef} />

          {activeCall.mode === "video" ? (
            <div className="relative aspect-[4/5] bg-slate-900">
              <video
                autoPlay
                className="h-full w-full object-cover"
                playsInline
                ref={remoteVideoRef}
              />
              <video
                autoPlay
                className="absolute right-4 bottom-4 h-28 w-20 rounded-[18px] border border-white/30 bg-slate-900 object-cover shadow-lg"
                muted
                playsInline
                ref={localVideoRef}
              />
            </div>
          ) : (
            <div className="flex items-center gap-4 bg-[radial-gradient(circle_at_top_left,_rgba(245,158,11,0.18),_transparent_35%),linear-gradient(180deg,#0f172a,#020617)] px-6 py-8">
              <Avatar
                name={activeCall.peerName}
                size="lg"
                src={activeCall.peerAvatarPath}
              />
              <div className="min-w-0">
                <p className="truncate font-display text-2xl font-semibold">
                  {activeCall.peerName}
                </p>
                <p className="mt-1 text-sm text-slate-300">{activeCall.status}</p>
              </div>
            </div>
          )}

          {activeCall.mode === "video" ? (
            <div className="border-t border-white/10 bg-slate-950/90 px-5 py-4">
              <p className="truncate font-display text-xl font-semibold">
                {activeCall.peerName}
              </p>
              <p className="mt-1 text-sm text-slate-300">{activeCall.status}</p>
            </div>
          ) : null}

          <div className="flex items-center justify-center gap-3 border-t border-white/10 bg-slate-950 px-4 py-4">
            <button
              className={`rounded-full p-3 transition ${
                activeCall.isMuted ? "bg-amber-400 text-slate-950" : "bg-white/10"
              }`}
              onClick={onToggleMute}
              type="button"
            >
              {activeCall.isMuted ? (
                <MicOff className="h-5 w-5" />
              ) : (
                <Mic className="h-5 w-5" />
              )}
            </button>

            {activeCall.mode === "video" ? (
              <button
                className={`rounded-full p-3 transition ${
                  activeCall.isVideoEnabled
                    ? "bg-white/10 text-white"
                    : "bg-amber-400 text-slate-950"
                }`}
                onClick={onToggleVideo}
                type="button"
              >
                {activeCall.isVideoEnabled ? (
                  <Video className="h-5 w-5" />
                ) : (
                  <VideoOff className="h-5 w-5" />
                )}
              </button>
            ) : null}

            <button
              className="rounded-full bg-rose-500 p-3 text-white transition hover:bg-rose-400"
              onClick={onEnd}
              type="button"
            >
              <PhoneOff className="h-5 w-5" />
            </button>
          </div>
        </div>
      ) : null}
    </>
  );
}
