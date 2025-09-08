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
    if (!activeContact) return;
    setCallContact({ name: activeContact.name, username: activeContact.username, avatarUrl: activeContact.avatarUrl });
    setCallState("outgoing");
    setConnectionStatus("connecting");
    setCallMuted(false);
    setCallSpeaker(false);
    setCallStartedAt(undefined);
    setCallOpen(true);
    // simulate connect and active
    window.setTimeout(() => {
      setCallState("active");
      setConnectionStatus("good");
      setCallStartedAt(Date.now());
    }, 1200);
  }, [activeContact]);

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
        onMuteToggle={(m) => setCallMuted(m)}
        onSpeakerToggle={(s) => setCallSpeaker(s)}
        onAnswer={() => {
          setCallState("active");
          setConnectionStatus("good");
          setCallStartedAt(Date.now());
        }}
        onDecline={() => {
          setCallOpen(false);
          setCallStartedAt(undefined);
        }}
        onHangup={() => {
          setCallOpen(false);
          setCallStartedAt(undefined);
        }}
        onCancel={() => {
          setCallOpen(false);
          setCallStartedAt(undefined);
        }}
        startedAt={callStartedAt}
        connectionStatus={connectionStatus}
      />
    </main>
  );
}