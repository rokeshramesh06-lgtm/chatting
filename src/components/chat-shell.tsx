"use client";

import {
  FormEvent,
  Fragment,
  startTransition,
  useDeferredValue,
  useEffect,
  useEffectEvent,
  useState,
} from "react";
import {
  ArrowLeft,
  Bell,
  Camera,
  CirclePlus,
  Paperclip,
  Phone,
  Search,
  SendHorizontal,
  UsersRound,
  Video,
  X,
} from "lucide-react";

import { CallPanels } from "@/components/call-panels";
import {
  AttachmentPreview,
  Avatar,
  EmptyConversation,
  Modal,
  formatPresence,
  formatShortDate,
  formatSidebarTime,
  formatTime,
  makeId,
  sameDay,
} from "@/components/chat-ui";
import { useCallManager } from "@/hooks/use-call-manager";
import type {
  BootstrapPayload,
  ChatMessage,
  ContactSummary,
  ConversationSummary,
  RealtimeEvent,
  SessionUser,
} from "@/lib/types";

type ChatShellProps = {
  initialCurrentUser: SessionUser;
  initialContacts: ContactSummary[];
  initialConversations: ConversationSummary[];
  initialMessages: ChatMessage[];
  initialConversationId: number | null;
};

type Toast = { id: string; title: string; body: string };

export function ChatShell({
  initialCurrentUser,
  initialContacts,
  initialConversations,
  initialMessages,
  initialConversationId,
}: ChatShellProps) {
  const [currentUser, setCurrentUser] = useState(initialCurrentUser);
  const [contacts, setContacts] = useState(initialContacts);
  const [conversations, setConversations] = useState(initialConversations);
  const [selectedConversationId, setSelectedConversationId] = useState<number | null>(
    initialConversationId,
  );
  const [messagesByConversation, setMessagesByConversation] = useState<
    Record<number, ChatMessage[]>
  >(initialConversationId ? { [initialConversationId]: initialMessages } : {});
  const [composerText, setComposerText] = useState("");
  const [composerFile, setComposerFile] = useState<File | null>(null);
  const [loadingConversationId, setLoadingConversationId] = useState<number | null>(
    null,
  );
  const [isSending, setIsSending] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isDirectOpen, setIsDirectOpen] = useState(false);
  const [isGroupOpen, setIsGroupOpen] = useState(false);
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [groupName, setGroupName] = useState("");
  const [groupMembers, setGroupMembers] = useState<number[]>([]);
  const [profileName, setProfileName] = useState(initialCurrentUser.username);
  const [profileStatus, setProfileStatus] = useState(initialCurrentUser.status);
  const [profileAvatar, setProfileAvatar] = useState<File | null>(null);
  const [contactFilter, setContactFilter] = useState("");
  const [banner, setBanner] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [notifications, setNotifications] = useState<
    NotificationPermission | "unsupported"
  >("unsupported");

  const deferredFilter = useDeferredValue(contactFilter);
  const selectedConversation =
    conversations.find((item) => item.id === selectedConversationId) ?? null;
  const selectedMessages =
    (selectedConversationId && messagesByConversation[selectedConversationId]) || [];
  const selectedDirectContact =
    selectedConversation?.type === "direct"
      ? selectedConversation.participants.find(
          (item) => item.id !== currentUser.id,
        ) ?? null
      : null;
  const filteredContacts = contacts.filter((contact) =>
    [contact.username, contact.status, contact.email, contact.phone]
      .filter(Boolean)
      .join(" ")
      .toLowerCase()
      .includes(deferredFilter.trim().toLowerCase()),
  );

  const conversationStatus = selectedConversation
    ? selectedConversation.type === "group"
      ? `${selectedConversation.participants.length} members`
      : selectedDirectContact?.isOnline
        ? "online now"
        : selectedDirectContact?.status || "offline"
    : "";

  function pushToast(title: string, body: string) {
    const id = makeId();
    startTransition(() => {
      setToasts((current) => [...current, { id, title, body }]);
    });
    window.setTimeout(() => {
      setToasts((current) => current.filter((toast) => toast.id !== id));
    }, 4200);
  }

  const {
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
  } = useCallManager({
    currentUser,
    selectedConversation,
    selectedDirectContact,
    onError: setError,
    onToast: pushToast,
  });

  async function refreshBootstrap(preferredId?: number | null) {
    const response = await fetch("/api/bootstrap", { cache: "no-store" });
    if (response.status === 401) {
      window.location.reload();
      return;
    }
    const payload = (await response.json()) as BootstrapPayload & { error?: string };
    if (!response.ok) {
      throw new Error(payload.error ?? "Unable to refresh chats.");
    }
    startTransition(() => {
      setCurrentUser(payload.currentUser);
      setContacts(payload.contacts);
      setConversations(payload.conversations);
      setSelectedConversationId((current) => {
        const target = preferredId ?? current;
        return target &&
          payload.conversations.some((item) => item.id === target)
          ? target
          : (payload.conversations[0]?.id ?? null);
      });
    });
  }

  async function loadMessages(conversationId: number) {
    setLoadingConversationId(conversationId);
    try {
      const response = await fetch(`/api/conversations/${conversationId}/messages`, {
        cache: "no-store",
      });
      const payload = (await response.json()) as {
        error?: string;
        messages?: ChatMessage[];
      };
      if (!response.ok || !payload.messages) {
        throw new Error(payload.error ?? "Unable to load messages.");
      }
      startTransition(() => {
        setMessagesByConversation((current) => ({
          ...current,
          [conversationId]: payload.messages ?? [],
        }));
      });
    } finally {
      setLoadingConversationId((current) =>
        current === conversationId ? null : current,
      );
    }
  }

  const sendHeartbeat = useEffectEvent(async () => {
    try {
      await fetch("/api/presence", { method: "POST" });
    } catch {}
  });

  const handleRealtime = useEffectEvent(async (event: RealtimeEvent) => {
    if (await handleRealtimeCallEvent(event)) {
      return;
    }

    if (event.kind === "message") {
      if (event.senderId !== currentUser.id) {
        pushToast(event.senderName, event.preview);
        if (
          "Notification" in window &&
          Notification.permission === "granted" &&
          (document.visibilityState === "hidden" ||
            selectedConversationId !== event.conversationId)
        ) {
          new Notification(event.senderName, { body: event.preview });
        }
      }
      await refreshBootstrap(event.conversationId);
      if (selectedConversationId === event.conversationId) {
        await loadMessages(event.conversationId);
      }
      return;
    }
    if (event.kind === "conversation") {
      await refreshBootstrap(event.conversationId);
      await loadMessages(event.conversationId);
      return;
    }
    await refreshBootstrap(selectedConversationId);
  });

  const syncSelectedConversation = useEffectEvent(() => {
    if (
      selectedConversationId &&
      !messagesByConversation[selectedConversationId] &&
      loadingConversationId !== selectedConversationId
    ) {
      void loadMessages(selectedConversationId);
    }
  });

  useEffect(() => {
    if ("Notification" in window) {
      setNotifications(Notification.permission);
    }
  }, []);

  useEffect(() => {
    if (!selectedConversationId && conversations.length > 0) {
      setSelectedConversationId(conversations[0].id);
    }
  }, [conversations, selectedConversationId]);

  useEffect(() => {
    setProfileName(currentUser.username);
    setProfileStatus(currentUser.status);
  }, [currentUser]);

  useEffect(() => {
    syncSelectedConversation();
  }, [loadingConversationId, messagesByConversation, selectedConversationId]);

  useEffect(() => {
    void sendHeartbeat();
    const intervalId = window.setInterval(() => {
      void sendHeartbeat();
    }, 25_000);
    const announcePresence = () => {
      if (document.visibilityState === "visible") {
        void sendHeartbeat();
      }
    };
    window.addEventListener("focus", announcePresence);
    document.addEventListener("visibilitychange", announcePresence);
    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener("focus", announcePresence);
      document.removeEventListener("visibilitychange", announcePresence);
    };
  }, []);

  useEffect(() => {
    const source = new EventSource("/api/stream");
    source.onmessage = (message) => {
      try {
        void handleRealtime(JSON.parse(message.data) as RealtimeEvent);
      } catch {}
    };
    return () => source.close();
  }, []);

  async function requestNotifications() {
    if (!("Notification" in window)) {
      setNotifications("unsupported");
      return;
    }
    setNotifications(await Notification.requestPermission());
  }

  async function postJson(url: string, body: object) {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    return response;
  }

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    window.location.reload();
  }

  async function handleStartDirectChat(userId: number) {
    setError(null);
    const response = await postJson("/api/conversations", { type: "direct", userId });
    const payload = (await response.json()) as { error?: string; conversationId?: number };
    if (!response.ok || !payload.conversationId) {
      setError(payload.error ?? "Unable to start that chat.");
      return;
    }
    setIsDirectOpen(false);
    setSelectedConversationId(payload.conversationId);
    setIsSidebarOpen(false);
    setBanner("Direct chat ready.");
    await refreshBootstrap(payload.conversationId);
    await loadMessages(payload.conversationId);
  }

  async function handleCreateGroup(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    const response = await postJson("/api/conversations", {
      type: "group",
      name: groupName,
      memberIds: groupMembers,
    });
    const payload = (await response.json()) as { error?: string; conversationId?: number };
    if (!response.ok || !payload.conversationId) {
      setError(payload.error ?? "Unable to create your group.");
      return;
    }
    setGroupName("");
    setGroupMembers([]);
    setIsGroupOpen(false);
    setSelectedConversationId(payload.conversationId);
    setIsSidebarOpen(false);
    setBanner("Group created successfully.");
    await refreshBootstrap(payload.conversationId);
    await loadMessages(payload.conversationId);
  }

  async function handleSaveProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    const formData = new FormData();
    formData.set("username", profileName);
    formData.set("status", profileStatus);
    if (profileAvatar) {
      formData.set("avatar", profileAvatar);
    }
    const response = await fetch("/api/me", { method: "PATCH", body: formData });
    const payload = (await response.json()) as { error?: string; user?: SessionUser };
    if (!response.ok || !payload.user) {
      setError(payload.error ?? "Unable to update profile.");
      return;
    }
    setCurrentUser(payload.user);
    setProfileAvatar(null);
    setIsProfileOpen(false);
    setBanner("Profile refreshed.");
    await refreshBootstrap(selectedConversationId);
  }

  async function handleSendMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedConversationId || isSending) {
      return;
    }
    if (!composerText.trim() && !composerFile) {
      return;
    }
    setIsSending(true);
    setError(null);
    try {
      const formData = new FormData();
      if (composerText.trim()) {
        formData.set("content", composerText.trim());
      }
      if (composerFile) {
        formData.set("attachment", composerFile);
      }
      const response = await fetch(
        `/api/conversations/${selectedConversationId}/messages`,
        { method: "POST", body: formData },
      );
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) {
        throw new Error(payload.error ?? "Unable to send message.");
      }
      setComposerText("");
      setComposerFile(null);
      await loadMessages(selectedConversationId);
      await refreshBootstrap(selectedConversationId);
    } catch (sendError) {
      setError(sendError instanceof Error ? sendError.message : "Unable to send message.");
    } finally {
      setIsSending(false);
    }
  }

  return (
    <main className="relative min-h-screen overflow-hidden px-4 py-4 sm:px-6">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,_rgba(242,174,73,0.18),_transparent_28%),radial-gradient(circle_at_bottom_right,_rgba(13,148,136,0.18),_transparent_26%)]" />
      <div className="relative mx-auto flex min-h-[calc(100vh-2rem)] max-w-7xl gap-4">
        <aside className={`glass-panel fade-up ${selectedConversationId && !isSidebarOpen ? "hidden md:flex" : "flex"} w-full flex-col rounded-[30px] p-4 shadow-2xl shadow-slate-950/10 md:w-[360px] md:min-w-[360px]`}>
          <div className="rounded-[28px] bg-slate-950 px-4 py-4 text-white shadow-xl shadow-slate-950/15">
            <div className="flex items-center gap-3">
              <Avatar name={currentUser.username} online size="lg" src={currentUser.avatarPath} />
              <div className="min-w-0">
                <p className="truncate font-display text-xl font-semibold">{currentUser.username}</p>
                <p className="truncate text-sm text-slate-300">{currentUser.status}</p>
              </div>
            </div>
            <div className="mt-4 grid grid-cols-2 gap-3">
              <button className="rounded-[20px] bg-white/10 px-4 py-3 text-sm font-semibold transition hover:bg-white/15" onClick={() => setIsProfileOpen(true)} type="button">Edit profile</button>
              <button className="rounded-[20px] border border-white/10 px-4 py-3 text-sm font-semibold transition hover:bg-white/10" onClick={handleLogout} type="button">Log out</button>
            </div>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-3">
            <button className="flex items-center justify-center gap-2 rounded-[22px] bg-amber-400 px-4 py-3 text-sm font-semibold text-slate-950 transition hover:bg-amber-300" onClick={() => { setError(null); setContactFilter(""); setIsDirectOpen(true); }} type="button"><CirclePlus className="h-4 w-4" />New chat</button>
            <button className="flex items-center justify-center gap-2 rounded-[22px] border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50" onClick={() => { setError(null); setIsGroupOpen(true); }} type="button"><UsersRound className="h-4 w-4" />New group</button>
          </div>
          <div className="mt-4 flex items-center justify-between rounded-[24px] border border-slate-200 bg-white/75 px-4 py-3">
            <div>
              <p className="text-xs font-semibold tracking-[0.18em] text-slate-400 uppercase">Notifications</p>
              <p className="text-sm text-slate-500">{notifications === "granted" ? "Desktop alerts are on" : notifications === "denied" ? "Browser alerts blocked" : notifications === "unsupported" ? "Not supported here" : "Enable message alerts"}</p>
            </div>
            <button className="rounded-full border border-slate-200 bg-white p-3 text-slate-700 transition hover:bg-slate-50" onClick={requestNotifications} type="button"><Bell className="h-4 w-4" /></button>
          </div>
          {banner ? <div className="mt-4 rounded-[22px] border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{banner}</div> : null}
          {error ? <div className="mt-4 rounded-[22px] border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-600">{error}</div> : null}
          <div className="mt-6">
            <p className="text-xs font-semibold tracking-[0.18em] text-slate-400 uppercase">Conversations</p>
            <h2 className="mt-1 font-display text-2xl font-semibold text-slate-900">Your inbox</h2>
          </div>
          <div className="message-scroll mt-4 flex-1 space-y-3 overflow-y-auto pr-1">
            {conversations.length > 0 ? conversations.map((conversation) => {
              const isActive = conversation.id === selectedConversationId;
              const other = conversation.type === "direct" ? conversation.participants.find((item) => item.id !== currentUser.id) : null;
              return (
                <button key={conversation.id} className={`w-full rounded-[24px] border px-4 py-4 text-left transition ${isActive ? "border-slate-900 bg-slate-950 text-white shadow-xl shadow-slate-950/10" : "border-slate-200 bg-white/80 text-slate-900 hover:bg-white"}`} onClick={() => { setSelectedConversationId(conversation.id); setIsSidebarOpen(false); setBanner(null); }} type="button">
                  <div className="flex items-start gap-3">
                    <Avatar name={conversation.name} online={Boolean(other?.isOnline)} src={conversation.imagePath} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-3">
                        <p className="truncate text-sm font-semibold">{conversation.name}</p>
                        <span className={`shrink-0 text-xs ${isActive ? "text-slate-300" : "text-slate-400"}`}>{formatSidebarTime(conversation.lastMessageAt)}</span>
                      </div>
                      <p className={`mt-1 text-xs ${isActive ? "text-slate-300" : "text-slate-400"}`}>{conversation.type === "group" ? `${conversation.participants.length} members` : other?.isOnline ? "online now" : "offline"}</p>
                      <p className={`mt-2 truncate text-sm ${isActive ? "text-slate-200" : "text-slate-500"}`}>{conversation.lastMessagePreview}</p>
                    </div>
                  </div>
                </button>
              );
            }) : <div className="rounded-[24px] border border-dashed border-slate-300 bg-white/70 p-6 text-sm leading-7 text-slate-500">No chats yet. Create two accounts in different browser windows to test direct and group messaging.</div>}
          </div>
        </aside>
        <section className={`glass-panel fade-up ${!selectedConversationId || isSidebarOpen ? "hidden md:flex" : "flex"} min-h-[calc(100vh-2rem)] flex-1 flex-col rounded-[30px] p-4 shadow-2xl shadow-slate-950/10 [animation-delay:120ms]`}>
          {selectedConversation ? <>
            <header className="flex flex-wrap items-center gap-4 rounded-[26px] border border-white/60 bg-white/80 px-4 py-4 shadow-lg shadow-slate-950/5">
              <button className="rounded-full border border-slate-200 p-3 text-slate-700 md:hidden" onClick={() => setIsSidebarOpen(true)} type="button"><ArrowLeft className="h-4 w-4" /></button>
              <Avatar name={selectedConversation.name} online={Boolean(selectedDirectContact?.isOnline)} size="lg" src={selectedConversation.imagePath} />
              <div className="min-w-0 flex-1">
                <h1 className="truncate font-display text-2xl font-semibold text-slate-900">{selectedConversation.name}</h1>
                <p className="mt-1 text-sm text-slate-500">{conversationStatus}</p>
              </div>
              {selectedConversation.type === "direct" ? (
                <div className="flex items-center gap-2">
                  <button
                    className="rounded-full border border-slate-200 bg-white p-3 text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                    disabled={isStartingCall || Boolean(activeCall)}
                    onClick={() => void startCall("audio")}
                    type="button"
                  >
                    <Phone className="h-4 w-4" />
                  </button>
                  <button
                    className="rounded-full border border-slate-200 bg-white p-3 text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                    disabled={isStartingCall || Boolean(activeCall)}
                    onClick={() => void startCall("video")}
                    type="button"
                  >
                    <Video className="h-4 w-4" />
                  </button>
                </div>
              ) : null}
              <div className="flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 text-xs font-semibold tracking-[0.18em] text-slate-500 uppercase"><UsersRound className="h-4 w-4" />{selectedConversation.type}</div>
            </header>
            <div className="message-scroll mt-4 flex-1 overflow-y-auto px-1">
              {loadingConversationId === selectedConversation.id && !messagesByConversation[selectedConversation.id] ? <div className="flex h-full items-center justify-center text-sm text-slate-500">Loading messages...</div> : selectedMessages.length > 0 ? <div className="space-y-4 pb-4">{selectedMessages.map((message, index) => {
                const own = message.senderId === currentUser.id;
                const showDate = index === 0 || !sameDay(selectedMessages[index - 1].createdAt, message.createdAt);
                return (
                  <Fragment key={message.id}>
                    {showDate ? <div className="my-6 flex items-center justify-center"><span className="rounded-full border border-white/70 bg-white/80 px-4 py-2 text-xs font-semibold tracking-[0.18em] text-slate-400 uppercase">{formatShortDate(message.createdAt)}</span></div> : null}
                    <div className={`flex ${own ? "justify-end" : "justify-start"}`}>
                      <div className={`max-w-[82%] rounded-[28px] px-4 py-3 shadow-lg shadow-slate-950/5 sm:max-w-[70%] ${own ? "rounded-br-md bg-slate-950 text-white" : "rounded-bl-md border border-white/70 bg-white/85 text-slate-900"}`}>
                        {!own ? <p className="mb-1 text-xs font-semibold tracking-[0.18em] text-slate-400 uppercase">{message.senderName}</p> : null}
                        {message.content ? <p className="text-sm leading-7 whitespace-pre-wrap">{message.content}</p> : null}
                        <AttachmentPreview message={message} />
                        <p className={`mt-3 text-right text-xs ${own ? "text-slate-300" : "text-slate-400"}`}>{formatTime(message.createdAt)}</p>
                      </div>
                    </div>
                  </Fragment>
                );
              })}</div> : <EmptyConversation description="Start with a note, a quick image, or a document to bring the chat to life." title="No messages yet" />}
            </div>
            <form className="mt-4 rounded-[28px] border border-white/60 bg-white/85 p-3 shadow-lg shadow-slate-950/5" onSubmit={handleSendMessage}>
              {composerFile ? <div className="mb-3 flex items-center justify-between rounded-[20px] border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600"><span className="truncate">{composerFile.name}</span><button className="rounded-full border border-slate-200 p-2 text-slate-500" onClick={() => setComposerFile(null)} type="button"><X className="h-4 w-4" /></button></div> : null}
              <div className="flex flex-col gap-3 md:flex-row md:items-end">
                <textarea className="min-h-[72px] flex-1 resize-none rounded-[22px] border border-slate-200 bg-slate-50 px-4 py-3 text-sm leading-7 text-slate-700 outline-none transition placeholder:text-slate-400 focus:border-slate-400" onChange={(event) => setComposerText(event.target.value)} placeholder="Write a message..." value={composerText} />
                <div className="flex items-center gap-3">
                  <label className="flex cursor-pointer items-center gap-2 rounded-[22px] border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"><Paperclip className="h-4 w-4" />Attach<input accept="image/*,video/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.zip" className="hidden" onChange={(event) => setComposerFile(event.target.files?.[0] ?? null)} type="file" /></label>
                  <button className="flex items-center gap-2 rounded-[22px] bg-slate-950 px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60" disabled={isSending} type="submit"><SendHorizontal className="h-4 w-4" />{isSending ? "Sending..." : "Send"}</button>
                </div>
              </div>
            </form>
          </> : <EmptyConversation description="Create a direct chat or bring together a few people in a group. The interface is ready for mobile and desktop." title="Choose a conversation" />}
        </section>
      </div>
      <Modal open={isDirectOpen} onClose={() => setIsDirectOpen(false)} subtitle="Pick a person to open a secure one-to-one conversation." title="New direct chat">
        <div className="mb-4 flex items-center gap-3 rounded-[22px] border border-slate-200 bg-white/80 px-4 py-3"><Search className="h-4 w-4 text-slate-400" /><input className="w-full bg-transparent text-sm outline-none placeholder:text-slate-400" onChange={(event) => setContactFilter(event.target.value)} placeholder="Search people" value={contactFilter} /></div>
        <div className="max-h-96 space-y-3 overflow-y-auto pr-1">{filteredContacts.length > 0 ? filteredContacts.map((contact) => <button key={contact.id} className="flex w-full items-center gap-3 rounded-[24px] border border-slate-200 bg-white/75 px-4 py-4 text-left transition hover:bg-white" onClick={() => void handleStartDirectChat(contact.id)} type="button"><Avatar name={contact.username} online={contact.isOnline} src={contact.avatarPath} /><div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold text-slate-900">{contact.username}</p><p className="truncate text-sm text-slate-500">{contact.status}</p></div><span className="text-xs text-slate-400">{contact.isOnline ? "online" : formatPresence(contact.lastSeen)}</span></button>) : <div className="rounded-[24px] border border-dashed border-slate-300 bg-slate-50 px-4 py-6 text-sm text-slate-500">No people found yet. Register another account in a separate browser window to start chatting.</div>}</div>
      </Modal>
      <Modal open={isGroupOpen} onClose={() => setIsGroupOpen(false)} subtitle="Choose at least two other people so the group can start with real momentum." title="Create group">
        <form className="space-y-5" onSubmit={handleCreateGroup}>
          <label className="block space-y-2"><span className="text-sm font-medium text-slate-600">Group name</span><input className="w-full rounded-[22px] border border-slate-200 bg-white/80 px-4 py-3 text-sm outline-none transition focus:border-slate-400" onChange={(event) => setGroupName(event.target.value)} placeholder="Weekend planners" value={groupName} /></label>
          <div className="space-y-2"><p className="text-sm font-medium text-slate-600">Members</p><div className="max-h-72 space-y-3 overflow-y-auto pr-1">{contacts.length > 0 ? contacts.map((contact) => <label key={contact.id} className="flex cursor-pointer items-center gap-3 rounded-[22px] border border-slate-200 bg-white/80 px-4 py-4"><input checked={groupMembers.includes(contact.id)} className="h-4 w-4 rounded border-slate-300 text-slate-950" onChange={(event) => setGroupMembers((current) => event.target.checked ? [...current, contact.id] : current.filter((item) => item !== contact.id))} type="checkbox" /><Avatar name={contact.username} online={contact.isOnline} size="sm" src={contact.avatarPath} /><div className="min-w-0"><p className="truncate text-sm font-semibold text-slate-900">{contact.username}</p><p className="truncate text-xs text-slate-500">{contact.status}</p></div></label>) : <div className="rounded-[24px] border border-dashed border-slate-300 bg-slate-50 px-4 py-6 text-sm text-slate-500">Register a couple more users to create a group chat.</div>}</div></div>
          <button className="w-full rounded-[22px] bg-slate-950 px-5 py-4 text-sm font-semibold text-white transition hover:bg-slate-800" type="submit">Create group</button>
        </form>
      </Modal>
      <Modal open={isProfileOpen} onClose={() => setIsProfileOpen(false)} subtitle="Adjust the details people see in sidebars, headers, and group member lists." title="Edit profile">
        <form className="space-y-5" onSubmit={handleSaveProfile}>
          <div className="flex items-center gap-4 rounded-[26px] border border-slate-200 bg-white/75 p-4"><Avatar name={currentUser.username} size="lg" src={currentUser.avatarPath} /><label className="inline-flex cursor-pointer items-center gap-2 rounded-[20px] border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"><Camera className="h-4 w-4" />Upload photo<input accept="image/*" className="hidden" onChange={(event) => setProfileAvatar(event.target.files?.[0] ?? null)} type="file" /></label></div>
          <label className="block space-y-2"><span className="text-sm font-medium text-slate-600">Username</span><input className="w-full rounded-[22px] border border-slate-200 bg-white/80 px-4 py-3 text-sm outline-none transition focus:border-slate-400" onChange={(event) => setProfileName(event.target.value)} value={profileName} /></label>
          <label className="block space-y-2"><span className="text-sm font-medium text-slate-600">Status</span><textarea className="min-h-[110px] w-full rounded-[22px] border border-slate-200 bg-white/80 px-4 py-3 text-sm leading-7 outline-none transition focus:border-slate-400" onChange={(event) => setProfileStatus(event.target.value)} value={profileStatus} /></label>
          <button className="w-full rounded-[22px] bg-slate-950 px-5 py-4 text-sm font-semibold text-white transition hover:bg-slate-800" type="submit">Save profile</button>
        </form>
      </Modal>
      <CallPanels
        activeCall={activeCall}
        incomingCall={incomingCall}
        localVideoRef={localVideoRef}
        onAccept={() => void acceptIncomingCall()}
        onDecline={() => void declineIncomingCall()}
        onEnd={() => void endCall()}
        onToggleMute={toggleMute}
        onToggleVideo={toggleVideo}
        remoteAudioRef={remoteAudioRef}
        remoteVideoRef={remoteVideoRef}
      />
      <div className="pointer-events-none fixed right-4 bottom-4 z-50 flex w-full max-w-sm flex-col gap-3">{toasts.map((toast) => <div key={toast.id} className="pointer-events-auto rounded-[24px] border border-white/50 bg-white/90 px-4 py-4 shadow-xl shadow-slate-950/10 backdrop-blur-md"><p className="text-sm font-semibold text-slate-900">{toast.title}</p><p className="mt-1 text-sm leading-6 text-slate-500">{toast.body}</p></div>)}</div>
    </main>
  );
}
