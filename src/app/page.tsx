"use client";

import * as React from "react";
import AuthForm from "@/components/AuthForm";
import ChatSidebar from "@/components/ChatSidebar";
import ChatInterface, { ChatMessage, Contact } from "@/components/ChatInterface";
import VoiceCallModal from "@/components/VoiceCallModal";
import { createClient, Session, User as SupabaseUser } from "@supabase/supabase-js";

type User = {
  id: string;
  username: string;
  displayName: string;
  avatarUrl?: string | null;
};

type Conversation = {
  id: string;
  contact: User;
  lastMessage?: {
    text: string;
    createdAt: string | number | Date;
  } | null;
  unreadCount?: number;
};

export default function Page() {
  const supabase = React.useMemo(() => {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    return url && key
      ? createClient(url, key, {
          auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
        })
      : null;
  }, []);

  const [session, setSession] = React.useState<Session | null>(null);
  const [sessionUser, setSessionUser] = React.useState<SupabaseUser | null>(null);
  const [checkingAuth, setCheckingAuth] = React.useState(true);

  // App UI state
  const [sidebarOpen, setSidebarOpen] = React.useState(true);
  const [activeConversationId, setActiveConversationId] = React.useState<string | null>(null);
  const [conversations, setConversations] = React.useState<Conversation[]>([]);
  const [messagesByConv, setMessagesByConv] = React.useState<Record<string, ChatMessage[]>>({});
  const [typingByConv, setTypingByConv] = React.useState<Record<string, { userId: string; name?: string }[]>>({});
  const [isLoadingHistory, setIsLoadingHistory] = React.useState(false);

  // Voice call modal state
  const [callOpen, setCallOpen] = React.useState(false);
  const [callState, setCallState] = React.useState<"incoming" | "outgoing" | "active">("outgoing");
  const [callContact, setCallContact] = React.useState<{ name: string; username?: string; avatarUrl?: string } | null>(null);
  const [callMuted, setCallMuted] = React.useState(false);
  const [callSpeaker, setCallSpeaker] = React.useState(false);
  const [callStartedAt, setCallStartedAt] = React.useState<number | undefined>(undefined);
  const [connectionStatus, setConnectionStatus] = React.useState<"connecting" | "good" | "fair" | "poor" | "disconnected">("connecting");
  const [callPeerId, setCallPeerId] = React.useState<string | null>(null);
  const [activeCallId, setActiveCallId] = React.useState<string | null>(null);
  const callSignalChannelRef = React.useRef<any>(null);
  const [callCameraOff, setCallCameraOff] = React.useState(false);

  // WebRTC refs
  const localVideoRef = React.useRef<HTMLVideoElement>(null);
  const remoteVideoRef = React.useRef<HTMLVideoElement>(null);
  const pcRef = React.useRef<RTCPeerConnection | null>(null);
  const localStreamRef = React.useRef<MediaStream | null>(null);
  const remoteStreamRef = React.useRef<MediaStream | null>(null);
  const pendingRemoteSDPRef = React.useRef<RTCSessionDescriptionInit | null>(null);
  const isCallerRef = React.useRef<boolean>(false);

  // WebRTC helpers
  const rtcConfig = React.useRef<RTCConfiguration>({
    iceServers: [
      { urls: ["stun:stun.l.google.com:19302", "stun:global.stun.twilio.com:3478"] },
    ],
  });

  const cleanupCall = React.useCallback(() => {
    try { pcRef.current?.getSenders().forEach((s) => { try { s.track?.stop(); } catch {} }); } catch {}
    try { pcRef.current?.getReceivers().forEach((r) => { try { r.track?.stop(); } catch {} }); } catch {}
    try { pcRef.current?.close(); } catch {}
    pcRef.current = null;
    try { localStreamRef.current?.getTracks().forEach((t) => t.stop()); } catch {}
    try { remoteStreamRef.current?.getTracks().forEach((t) => t.stop()); } catch {}
    localStreamRef.current = null;
    remoteStreamRef.current = null;
    if (localVideoRef.current) localVideoRef.current.srcObject = null;
    if (remoteVideoRef.current) remoteVideoRef.current.srcObject = null;
  }, []);

  const ensureLocalMedia = React.useCallback(async () => {
    if (localStreamRef.current) return localStreamRef.current;
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: true });
    localStreamRef.current = stream;
    if (localVideoRef.current) localVideoRef.current.srcObject = stream;
    return stream;
  }, []);

  const setupPeerConnection = React.useCallback(() => {
    if (pcRef.current) return pcRef.current;
    const pc = new RTCPeerConnection(rtcConfig.current);
    pc.onicecandidate = (e) => {
      if (e.candidate && callPeerId && activeCallId && sessionUser) {
        const channel = callSignalChannelRef.current;
        if (channel) {
          channel.send({
            type: "broadcast",
            event: "ice",
            payload: {
              callId: activeCallId,
              from: sessionUser.id,
              to: callPeerId,
              candidate: e.candidate.toJSON(),
              ts: Date.now(),
            },
          });
        }
      }
    };
    pc.ontrack = (e) => {
      let remote = remoteStreamRef.current;
      if (!remote) {
        remote = new MediaStream();
        remoteStreamRef.current = remote;
        if (remoteVideoRef.current) remoteVideoRef.current.srcObject = remote;
      }
      e.streams[0]?.getTracks().forEach((t) => {
        if (!remote!.getTracks().includes(t)) remote!.addTrack(t);
      });
    };
    pc.onconnectionstatechange = () => {
      const st = pc.connectionState;
      if (st === "connected") setConnectionStatus("good");
      else if (st === "connecting") setConnectionStatus("connecting");
      else if (st === "disconnected" || st === "failed") setConnectionStatus("disconnected");
    };
    pcRef.current = pc;
    return pc;
  }, [activeCallId, callPeerId, sessionUser?.id]);

  // Setup Supabase Realtime call signaling
  React.useEffect(() => {
    if (!supabase || !sessionUser) return;

    // Create or reuse a global "calls" channel for lightweight broadcast signaling
    const channel = supabase.channel("calls");
    callSignalChannelRef.current = channel;

    const myId = sessionUser.id;

    channel
      .on("broadcast", { event: "call" }, ({ payload }) => {
        try {
          if (!payload || payload.to !== myId) return;
          // Incoming call request
          setActiveCallId(payload.callId || null);
          setCallPeerId(payload.from);
          setCallContact({ name: payload.fromName, username: payload.fromUsername, avatarUrl: payload.fromAvatarUrl });
          setCallState("incoming");
          setConnectionStatus("connecting");
          setCallMuted(false);
          setCallSpeaker(false);
          setCallStartedAt(undefined);
          // store remote SDP offer if provided
          if (payload.sdp && payload.sdp.type === "offer") {
            pendingRemoteSDPRef.current = payload.sdp as RTCSessionDescriptionInit;
          }
          setCallOpen(true);
        } catch (_e) {}
      })
      .on("broadcast", { event: "answer" }, async ({ payload }) => {
        try {
          if (!payload || payload.to !== myId) return;
          // Peer answered our call
          if (payload.sdp && payload.sdp.type === "answer" && pcRef.current) {
            await pcRef.current.setRemoteDescription(payload.sdp as RTCSessionDescriptionInit);
          }
          setCallState("active");
          setConnectionStatus("good");
          setCallStartedAt(Date.now());
        } catch (_e) {}
      })
      .on("broadcast", { event: "ice" }, async ({ payload }) => {
        try {
          if (!payload || payload.to !== myId) return;
          if (!pcRef.current || !payload.candidate) return;
          await pcRef.current.addIceCandidate(payload.candidate);
        } catch (_e) {}
      })
      .on("broadcast", { event: "decline" }, ({ payload }) => {
        try {
          if (!payload || payload.to !== myId) return;
          // Peer declined
          cleanupCall();
          setCallOpen(false);
          setCallStartedAt(undefined);
          setActiveCallId(null);
          setCallPeerId(null);
        } catch (_e) {}
      })
      .on("broadcast", { event: "hangup" }, ({ payload }) => {
        try {
          if (!payload || payload.to !== myId) return;
          // Peer hung up
          cleanupCall();
          setCallOpen(false);
          setCallStartedAt(undefined);
          setActiveCallId(null);
          setCallPeerId(null);
        } catch (_e) {}
      })
      .on("broadcast", { event: "cancel" }, ({ payload }) => {
        try {
          if (!payload || payload.to !== myId) return;
          // Caller canceled before answer
          cleanupCall();
          setCallOpen(false);
          setCallStartedAt(undefined);
          setActiveCallId(null);
          setCallPeerId(null);
        } catch (_e) {}
      })
      .subscribe((status: string) => {
        // no-op; helpful for debugging: console.log("calls channel:", status)
      });

    return () => {
      try {
        channel.unsubscribe();
      } catch {}
      callSignalChannelRef.current = null;
    };
  }, [supabase, sessionUser]);

  const sendCallEvent = React.useCallback(
    async (event: "call" | "answer" | "ice" | "decline" | "hangup" | "cancel", payload: Record<string, any>) => {
      const channel = callSignalChannelRef.current;
      if (!channel) return;
      await channel.send({ type: "broadcast", event, payload });
    },
    []
  );

  // Bootstrap auth
  React.useEffect(() => {
    let mounted = true;
    (async () => {
      if (!supabase) {
        setCheckingAuth(false);
        return;
      }
      const { data } = await supabase.auth.getSession();
      if (!mounted) return;
      setSession(data.session ?? null);
      setSessionUser(data.session?.user ?? null);
      setCheckingAuth(false);
      // subscribe to changes
      const { data: sub } = supabase.auth.onAuthStateChange((_event, newSession) => {
        setSession(newSession);
        setSessionUser(newSession?.user ?? null);
      });
      return () => {
        sub.subscription.unsubscribe();
      };
    })();
    return () => {
      mounted = false;
    };
  }, [supabase]);

  // Mock load conversations/messages when authenticated
  React.useEffect(() => {
    if (!sessionUser) {
      setConversations([]);
      setActiveConversationId(null);
      setMessagesByConv({});
      return;
    }
    // Seed demo data
    const me: User = {
      id: sessionUser.id,
      username: (sessionUser.user_metadata?.username as string) || "me",
      displayName: (sessionUser.user_metadata?.display_name as string) || "You",
      avatarUrl: sessionUser.user_metadata?.avatar_url || null,
    };
    const contacts: User[] = [
      { id: "u_alice", username: "alice", displayName: "Alice Johnson", avatarUrl: null },
      { id: "u_bob", username: "bob", displayName: "Bob Smith", avatarUrl: null },
      { id: "u_carla", username: "carla", displayName: "Carla Diaz", avatarUrl: null },
    ];
    const seededConversations: Conversation[] = contacts.map((c, idx) => ({
      id: `c_${idx + 1}`,
      contact: c,
      lastMessage: { text: idx === 0 ? "See you soon!" : "Hey there 👋", createdAt: Date.now() - (idx + 1) * 3600_000 },
      unreadCount: idx === 1 ? 3 : 0,
    }));
    const seededMessages: Record<string, ChatMessage[]> = {
      c_1: [
        {
          id: "m1",
          senderId: contacts[0]!.id,
          senderName: contacts[0]!.displayName,
          type: "text",
          content: "Hi! How's your day?",
          createdAt: new Date(Date.now() - 7200_000).toISOString(),
          status: "read",
        },
        {
          id: "m2",
          senderId: me.id,
          senderName: me.displayName,
          type: "text",
          content: "Pretty good! Working on the new chat app.",
          createdAt: new Date(Date.now() - 7100_000).toISOString(),
          status: "read",
        },
      ],
      c_2: [
        {
          id: "m3",
          senderId: contacts[1]!.id,
          senderName: contacts[1]!.displayName,
          type: "text",
          content: "Are we still on for later?",
          createdAt: new Date(Date.now() - 5400_000).toISOString(),
          status: "delivered",
        },
      ],
    };
    setConversations(seededConversations);
    setMessagesByConv(seededMessages);
    setActiveConversationId(seededConversations[0]?.id ?? null);
  }, [sessionUser]);

  const currentUser: User | null = React.useMemo(() => {
    if (!sessionUser) return null;
    return {
      id: sessionUser.id,
      username: (sessionUser.user_metadata?.username as string) || "me",
      displayName: (sessionUser.user_metadata?.display_name as string) || (sessionUser.email?.split("@")[0] ?? "You"),
      avatarUrl: sessionUser.user_metadata?.avatar_url || null,
    };
  }, [sessionUser]);

  const activeConversation = React.useMemo(() => {
    return conversations.find((c) => c.id === activeConversationId) ?? null;
  }, [conversations, activeConversationId]);

  const activeContact: Contact | null = React.useMemo(() => {
    if (!activeConversation) return null;
    return {
      id: activeConversation.contact.id,
      name: activeConversation.contact.displayName,
      username: activeConversation.contact.username,
      avatarUrl: activeConversation.contact.avatarUrl || undefined,
      online: true,
      isGroup: false,
    };
  }, [activeConversation]);

  const messages: ChatMessage[] = React.useMemo(() => {
    if (!activeConversationId) return [];
    return messagesByConv[activeConversationId] ?? [];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messagesByConv, activeConversationId, sessionUser?.id]);

  const typing = React.useMemo(() => {
    if (!activeConversationId) return [];
    return typingByConv[activeConversationId] ?? [];
  }, [typingByConv, activeConversationId]);

  // Handlers
  const handleSelectConversation = React.useCallback((conversationId: string) => {
    setActiveConversationId(conversationId);
  }, []);

  const handleSearchUsers = React.useCallback(async (query: string): Promise<User[]> => {
    if (!supabase) return [];
    const q = query.trim();
    if (!q) return [];
    const { data, error } = await supabase
      .from("profiles")
      .select("id, username, display_name, avatar_url")
      .ilike("username", `%${q}%`)
      .limit(20);
    if (error || !data) return [];
    return data.map((row: any) => ({
      id: row.id,
      username: row.username,
      displayName: row.display_name || row.username,
      avatarUrl: row.avatar_url ?? null,
    }));
  }, [supabase]);

  const handleStartChatWithUser = React.useCallback((user: User) => {
    // Create or focus existing conversation using full user data
    setConversations((prev) => {
      const exists = prev.find((c) => c.contact.id === user.id);
      if (exists) {
        setActiveConversationId(exists.id);
        return prev;
      }
      const newConv: Conversation = {
        id: `c_${Date.now()}`,
        contact: {
          id: user.id,
          username: user.username,
          displayName: user.displayName,
          avatarUrl: user.avatarUrl ?? null,
        },
        lastMessage: null,
        unreadCount: 0,
      };
      setActiveConversationId(newConv.id);
      return [newConv, ...prev];
    });
  }, []);

  const handleSendMessage = React.useCallback(
    async (text: string) => {
      if (!currentUser || !activeConversationId) return;
      const newMessage: ChatMessage = {
        id: `m_${Date.now()}`,
        senderId: currentUser.id,
        senderName: currentUser.displayName,
        type: "text",
        content: text,
        createdAt: new Date().toISOString(),
        status: "sent",
      };
      setMessagesByConv((prev) => {
        const list = prev[activeConversationId] ?? [];
        return { ...prev, [activeConversationId]: [...list, newMessage] };
      });
      setConversations((prev) =>
        prev.map((c) =>
          c.id === activeConversationId
            ? {
                ...c,
                lastMessage: { text, createdAt: new Date().toISOString() },
              }
            : c
        )
      );
    },
    [activeConversationId, currentUser]
  );

  const handleUploadFiles = React.useCallback(
    async (files: File[]) => {
      if (!currentUser || !activeConversationId) return;
      const mapped: ChatMessage[] = files.map((f, idx) => ({
        id: `f_${Date.now()}_${idx}`,
        senderId: currentUser.id,
        senderName: currentUser.displayName,
        type: "file",
        content: URL.createObjectURL(f), // placeholder; replace with uploaded URL
        fileName: f.name,
        fileSize: f.size,
        createdAt: new Date().toISOString(),
        status: "sent",
      }));
      setMessagesByConv((prev) => {
        const list = prev[activeConversationId] ?? [];
        return { ...prev, [activeConversationId]: [...list, ...mapped] };
      });
    },
    [activeConversationId, currentUser]
  );

  const handleUploadImages = React.useCallback(
    async (files: File[]) => {
      if (!currentUser || !activeConversationId) return;
      const mapped: ChatMessage[] = files.map((f, idx) => ({
        id: `i_${Date.now()}_${idx}`,
        senderId: currentUser.id,
        senderName: currentUser.displayName,
        type: "image",
        content: URL.createObjectURL(f), // placeholder; replace with uploaded URL
        imageAlt: f.name,
        createdAt: new Date().toISOString(),
        status: "sent",
      }));
      setMessagesByConv((prev) => {
        const list = prev[activeConversationId] ?? [];
        return { ...prev, [activeConversationId]: [...list, ...mapped] };
      });
    },
    [activeConversationId, currentUser]
  );

  const handleStartCall = React.useCallback(() => {
    if (!activeContact || !currentUser) return;
    const newCallId = `call_${Date.now()}`;
    setActiveCallId(newCallId);
    setCallPeerId(activeContact.id);
    setCallContact({ name: activeContact.name, username: activeContact.username, avatarUrl: activeContact.avatarUrl });
    setCallState("outgoing");
    setConnectionStatus("connecting");
    setCallMuted(false);
    setCallSpeaker(false);
    setCallCameraOff(false);
    setCallStartedAt(undefined);
    setCallOpen(true);
    isCallerRef.current = true;

    // Start WebRTC offer flow
    (async () => {
      try {
        const stream = await ensureLocalMedia();
        const pc = setupPeerConnection();
        // Attach local tracks
        stream.getTracks().forEach((t) => pc.addTrack(t, stream));
        // Create and send offer SDP
        const offer = await pc.createOffer({ offerToReceiveAudio: true, offerToReceiveVideo: true });
        await pc.setLocalDescription(offer);

        // Signal the callee with SDP
        await sendCallEvent("call", {
          callId: newCallId,
          from: currentUser.id,
          fromName: currentUser.displayName,
          fromUsername: currentUser.username,
          fromAvatarUrl: currentUser.avatarUrl ?? undefined,
          to: activeContact.id,
          sdp: offer,
          ts: Date.now(),
        });
      } catch (_e) {
        // Fallback cleanup on failure
        cleanupCall();
        setCallOpen(false);
        setActiveCallId(null);
        setCallPeerId(null);
      }
    })();
  }, [activeContact, currentUser, ensureLocalMedia, setupPeerConnection, sendCallEvent, cleanupCall]);

  const handleLogout = React.useCallback(async () => {
    if (!supabase) return;
    await supabase.auth.signOut();
    setSession(null);
    setSessionUser(null);
    setConversations([]);
    setMessagesByConv({});
    setActiveConversationId(null);
  }, [supabase]);

  // Page-level CSS variables for sidebar theming
  const themeVars: React.CSSProperties = {
    ["--sidebar-background" as any]: "hsl(var(--muted) / 0.6)",
    ["--sidebar-foreground" as any]: "hsl(var(--foreground))",
    ["--sidebar-border" as any]: "hsl(var(--border))",
    ["--sidebar-ring" as any]: "hsl(var(--ring))",
    ["--card" as any]: "hsl(var(--card))",
    ["--muted" as any]: "hsl(var(--muted))",
    ["--accent" as any]: "hsl(var(--accent) / 0.6)",
    ["--secondary" as any]: "hsl(var(--secondary))",
    ["--foreground" as any]: "hsl(var(--foreground))",
    ["--primary" as any]: "hsl(var(--primary))",
    ["--primary-foreground" as any]: "hsl(var(--primary-foreground))",
  };

  // Responsive: hide sidebar on small screens when a conversation is active
  const showSidebar = sidebarOpen || !activeConversationId;

  return (
    <main className="min-h-dvh w-full bg-background" style={themeVars}>
      {!checkingAuth && !sessionUser ? (
        <div className="mx-auto flex min-h-dvh w-full max-w-7xl items-center justify-center px-4 py-10">
          <AuthForm onSuccessRedirectTo="/" className="w-full" />
        </div>
      ) : (
        <div className="mx-auto grid min-h-dvh w-full max-w-[1400px] grid-cols-1 md:grid-cols-[360px_1fr] gap-0">
          {/* Sidebar */}
          <div className={`${showSidebar ? "block" : "hidden md:block"} border-r border-[--sidebar-border] bg-[--sidebar-background]`}>
            {currentUser && (
              <ChatSidebar
                currentUser={currentUser}
                conversations={conversations}
                isConversationsLoading={false}
                onSelectConversation={handleSelectConversation}
                onSearch={handleSearchUsers}
                onStartChatWithUser={handleStartChatWithUser}
                onOpenSettings={() => {
                  // in a real app, open settings sheet
                }}
                onLogout={handleLogout}
                onToggleSidebar={() => setSidebarOpen((s) => !s)}
                activeConversationId={activeConversationId}
                className="h-dvh"
              />
            )}
          </div>

          {/* Chat area */}
          <div className="flex h-dvh flex-col">
            <ChatInterface
              currentUserId={currentUser?.id || "anon"}
              activeContact={activeContact}
              messages={messages}
              typing={typing}
              isLoadingHistory={isLoadingHistory}
              onSendMessage={handleSendMessage}
              onUploadFiles={handleUploadFiles}
              onUploadImages={handleUploadImages}
              onStartCall={handleStartCall}
              emptyStateTitle="Welcome to Whisper"
              emptyStateDescription="Select a chat from the sidebar or search to start a new conversation."
              className="h-full"
            />
          </div>
        </div>
      )}

      {/* Voice call modal */}
      <VoiceCallModal
        open={callOpen}
        onOpenChange={setCallOpen}
        state={callState}
        name={callContact?.name || "Unknown"}
        username={callContact?.username}
        avatarUrl={callContact?.avatarUrl}
        muted={callMuted}
        speaker={callSpeaker}
        cameraOff={callCameraOff}
        onCameraToggle={(off) => {
          setCallCameraOff(off);
          try {
            const stream = localStreamRef.current;
            stream?.getVideoTracks().forEach((t) => (t.enabled = !off));
          } catch {}
        }}
        onMuteToggle={(m) => {
          setCallMuted(m);
          try {
            const stream = localStreamRef.current;
            stream?.getAudioTracks().forEach((t) => (t.enabled = !m));
          } catch {}
        }}
        onSpeakerToggle={(s) => setCallSpeaker(s)}
        onAnswer={() => {
          // Accept incoming call: set remote offer, create and send answer
          (async () => {
            try {
              isCallerRef.current = false;
              const pc = setupPeerConnection();
              const stream = await ensureLocalMedia();
              setCallCameraOff(false);
              stream.getTracks().forEach((t) => pc.addTrack(t, stream));

              const remoteSDP = pendingRemoteSDPRef.current;
              if (remoteSDP && remoteSDP.type === "offer") {
                await pc.setRemoteDescription(remoteSDP);
              }
              const answer = await pc.createAnswer();
              await pc.setLocalDescription(answer);

              setCallState("active");
              setConnectionStatus("good");
              setCallStartedAt(Date.now());

              if (callPeerId && activeCallId && currentUser) {
                await sendCallEvent("answer", { callId: activeCallId, from: currentUser.id, to: callPeerId, sdp: answer, ts: Date.now() });
              }
            } catch { /* noop */ }
          })();
        }}
        onDecline={() => {
          setCallOpen(false);
          setCallStartedAt(undefined);
          cleanupCall();
          if (callPeerId && activeCallId && currentUser) {
            sendCallEvent("decline", { callId: activeCallId, from: currentUser.id, to: callPeerId, ts: Date.now() });
          }
          setActiveCallId(null);
          setCallPeerId(null);
        }}
        onHangup={() => {
          setCallOpen(false);
          setCallStartedAt(undefined);
          cleanupCall();
          if (callPeerId && activeCallId && currentUser) {
            sendCallEvent("hangup", { callId: activeCallId, from: currentUser.id, to: callPeerId, ts: Date.now() });
          }
          setActiveCallId(null);
          setCallPeerId(null);
        }}
        onCancel={() => {
          setCallOpen(false);
          setCallStartedAt(undefined);
          cleanupCall();
          if (callPeerId && activeCallId && currentUser) {
            sendCallEvent("cancel", { callId: activeCallId, from: currentUser.id, to: callPeerId, ts: Date.now() });
          }
          setActiveCallId(null);
          setCallPeerId(null);
        }}
        startedAt={callStartedAt}
        connectionStatus={connectionStatus}
        localVideoRef={localVideoRef}
        remoteVideoRef={remoteVideoRef}
        showVideo
      />
    </main>
  );
}