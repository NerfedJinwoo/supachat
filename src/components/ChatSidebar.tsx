"use client";

import * as React from "react";
import { Search, UserRound, UserRoundPlus, PanelLeftOpen, MessagesSquare } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
  DropdownMenuLabel,
} from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";

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

type ChatSidebarProps = {
  className?: string;
  style?: React.CSSProperties;
  currentUser: User;
  conversations?: Conversation[];
  isConversationsLoading?: boolean;
  onSelectConversation?: (conversationId: string) => void;
  onSearch?: (query: string) => Promise<User[]>;
  onStartChatWithUser?: (user: User) => void;
  onOpenSettings?: () => void;
  onLogout?: () => void;
  onToggleSidebar?: () => void;
  activeConversationId?: string | null;
};

export default function ChatSidebar({
  className,
  style,
  currentUser,
  conversations = [],
  isConversationsLoading = false,
  onSelectConversation,
  onSearch,
  onStartChatWithUser,
  onOpenSettings,
  onLogout,
  onToggleSidebar,
  activeConversationId = null,
}: ChatSidebarProps) {
  const [query, setQuery] = React.useState("");
  const [searching, setSearching] = React.useState(false);
  const [results, setResults] = React.useState<User[] | null>(null);
  const [showResults, setShowResults] = React.useState(false);

  const searchBoxRef = React.useRef<HTMLDivElement>(null);

  // Close results when clicking outside
  React.useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (!searchBoxRef.current) return;
      if (!searchBoxRef.current.contains(e.target as Node)) {
        setShowResults(false);
      }
    }
    if (typeof window !== "undefined") {
      window.addEventListener("click", handleClick);
      return () => window.removeEventListener("click", handleClick);
    }
  }, []);

  // Debounced search
  React.useEffect(() => {
    if (!onSearch) return;

    const q = query.trim();
    if (q.length === 0) {
      setSearching(false);
      setResults(null);
      return;
    }

    setSearching(true);
    const id = setTimeout(async () => {
      try {
        const r = await onSearch(q);
        setResults(r);
        setShowResults(true);
      } catch (err) {
        toast.error("Failed to search users");
      } finally {
        setSearching(false);
      }
    }, 300);

    return () => clearTimeout(id);
  }, [query, onSearch]);

  function handleStartChat(user: User) {
    if (onStartChatWithUser) {
      onStartChatWithUser(user);
      setShowResults(false);
      setQuery("");
      setResults(null);
    }
  }

  return (
    <aside
      className={cn(
        "w-full max-w-full bg-[--sidebar-background] text-[--sidebar-foreground] border-r border-[--sidebar-border] rounded-none",
        "flex flex-col",
        className
      )}
      style={style}
      aria-label="Chat sidebar"
    >
      <Header
        user={currentUser}
        onOpenSettings={onOpenSettings}
        onLogout={onLogout}
        onToggleSidebar={onToggleSidebar}
      />

      <div className="px-3 sm:px-4 py-2">
        <div ref={searchBoxRef} className="relative">
          <div className="flex items-center gap-2">
            <div className="relative flex-1 min-w-0">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" aria-hidden="true" />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onFocus={() => {
                  if ((results?.length || 0) > 0) setShowResults(true);
                }}
                placeholder="Search users by username"
                aria-label="Search users"
                className={cn(
                  "pl-10 pr-3 h-10 rounded-md bg-[--card] text-foreground",
                  "placeholder:text-[--muted-foreground] border border-[--sidebar-border] focus-visible:ring-[--sidebar-ring]"
                )}
              />
            </div>
            <Button
              type="button"
              variant="secondary"
              className="h-10 shrink-0 bg-[--secondary] text-[--foreground] hover:bg-[--accent]"
              onClick={() => {
                if (!onSearch) return;
                if (query.trim().length === 0) {
                  toast.message("Type a username to search");
                  return;
                }
                setShowResults(true);
              }}
              aria-label="Search"
            >
              <Search className="size-4" />
            </Button>
          </div>

          {/* Search results popover */}
          {showResults && (query.trim().length > 0) && (
            <div
              className={cn(
                "absolute inset-x-0 mt-2 z-20",
                "rounded-lg border border-[--sidebar-border] bg-[--card] shadow-sm"
              )}
              role="listbox"
              aria-label="Search results"
            >
              {searching ? (
                <div className="p-3 space-y-2">
                  <SearchItemSkeleton />
                  <SearchItemSkeleton />
                  <SearchItemSkeleton />
                </div>
              ) : results && results.length > 0 ? (
                <ul className="py-1">
                  {results.map((u) => (
                    <li key={u.id}>
                      <button
                        type="button"
                        onClick={() => handleStartChat(u)}
                        className={cn(
                          "w-full flex items-center gap-3 px-3 py-2 transition-colors",
                          "hover:bg-[--accent] focus:bg-[--accent] focus:outline-none"
                        )}
                        role="option"
                        aria-label={`Start chat with ${u.displayName}`}
                      >
                        <Avatar className="size-8">
                          <AvatarImage
                            src={u.avatarUrl || ""}
                            alt={u.displayName}
                            className="object-cover"
                          />
                          <AvatarFallback className="bg-[--muted] text-[--foreground]">
                            <UserInitials name={u.displayName} />
                          </AvatarFallback>
                        </Avatar>
                        <div className="flex flex-col items-start min-w-0">
                          <span className="text-sm font-semibold text-foreground truncate w-full">
                            {u.displayName}
                          </span>
                          <span className="text-xs text-muted-foreground truncate w-full">
                            @{u.username}
                          </span>
                        </div>
                        <span className="ml-auto inline-flex items-center gap-1 text-[--primary] text-xs font-medium">
                          <UserRoundPlus className="size-4" />
                          Start
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              ) : (
                <div className="p-4 flex items-center gap-3">
                  <div className="rounded-md bg-[--muted] p-2">
                    <UserRound className="size-4 text-muted-foreground" aria-hidden="true" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-foreground">No users found</p>
                    <p className="text-xs text-muted-foreground">Try a different username</p>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      <Separator className="bg-[--sidebar-border]" />

      {/* Conversations */}
      <div className="px-2 sm:px-3 py-2">
        <div className="flex items-center justify-between px-1 py-2">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Chats
          </h2>
          <div className="flex items-center gap-1.5">
            <Button
              type="button"
              variant="ghost"
              className="h-8 px-2 text-muted-foreground hover:text-foreground hover:bg-[--accent]"
              onClick={() => {
                // reserved for "new chat" UI; relies on search currently
                toast.message("Use the search above to start a new chat");
              }}
            >
              <MessagesSquare className="size-4" />
              <span className="sr-only">New chat</span>
            </Button>
          </div>
        </div>

        <ScrollArea className="h-[calc(100dvh-220px)]">
          <ul className="space-y-1 pr-1">
            {isConversationsLoading ? (
              Array.from({ length: 8 }).map((_, i) => <ConversationSkeleton key={i} />)
            ) : conversations.length === 0 ? (
              <EmptyConversations />
            ) : (
              conversations.map((c) => (
                <li key={c.id}>
                  <button
                    type="button"
                    onClick={() => onSelectConversation?.(c.id)}
                    className={cn(
                      "group w-full flex items-center gap-3 rounded-md px-2 py-2 transition-colors",
                      "hover:bg-[--accent] focus:bg-[--accent] focus:outline-none",
                      activeConversationId === c.id ? "bg-[--accent]" : "bg-transparent"
                    )}
                    aria-current={activeConversationId === c.id ? "true" : "false"}
                    aria-label={`Open chat with ${c.contact.displayName}`}
                  >
                    <Avatar className="size-10 shrink-0">
                      <AvatarImage
                        src={c.contact.avatarUrl || ""}
                        alt={c.contact.displayName}
                        className="object-cover"
                      />
                      <AvatarFallback className="bg-[--muted] text-[--foreground]">
                        <UserInitials name={c.contact.displayName} />
                      </AvatarFallback>
                    </Avatar>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-semibold text-foreground truncate min-w-0">
                          {c.contact.displayName}
                        </p>
                        <span className="text-[10px] text-muted-foreground ml-auto whitespace-nowrap">
                          {formatTime(c.lastMessage?.createdAt)}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <p className="text-xs text-muted-foreground truncate min-w-0">
                          {c.lastMessage?.text ?? "Say hi 👋"}
                        </p>
                        {c.unreadCount && c.unreadCount > 0 ? (
                          <Badge
                            variant="secondary"
                            className="ml-auto shrink-0 bg-[--primary] text-[--primary-foreground] hover:bg-[--primary]"
                            aria-label={`${c.unreadCount} unread messages`}
                          >
                            {c.unreadCount}
                          </Badge>
                        ) : null}
                      </div>
                    </div>
                  </button>
                </li>
              ))
            )}
          </ul>
        </ScrollArea>
      </div>
    </aside>
  );
}

function Header({
  user,
  onOpenSettings,
  onLogout,
  onToggleSidebar,
}: {
  user: User;
  onOpenSettings?: () => void;
  onLogout?: () => void;
  onToggleSidebar?: () => void;
}) {
  return (
    <div
      className={cn(
        "flex items-center gap-3 px-3 sm:px-4 py-3",
        "bg-[--sidebar-background] border-b border-[--sidebar-border]"
      )}
    >
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="hidden sm:inline-flex h-9 w-9 text-muted-foreground hover:text-foreground hover:bg-[--accent]"
        onClick={onToggleSidebar}
      >
        <PanelLeftOpen className="size-5" aria-hidden="true" />
        <span className="sr-only">Toggle sidebar</span>
      </Button>

      <Avatar className="size-10">
        <AvatarImage
          src={user.avatarUrl || ""}
          alt={user.displayName}
          className="object-cover"
        />
        <AvatarFallback className="bg-[--muted] text-[--foreground]">
          <UserInitials name={user.displayName} />
        </AvatarFallback>
      </Avatar>

      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-foreground truncate">{user.displayName}</p>
        <p className="text-xs text-muted-foreground truncate">@{user.username}</p>
      </div>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            className="h-9 px-3 text-muted-foreground hover:text-foreground hover:bg-[--accent]"
            aria-label="Open profile menu"
          >
            <UserRound className="size-5" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="end"
          className="w-56 bg-[--card] text-foreground border-[--sidebar-border]"
        >
          <DropdownMenuLabel>Account</DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onClick={() => onOpenSettings?.()}
            className="cursor-pointer"
          >
            Profile & Settings
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onClick={() => onLogout?.()}
            className="cursor-pointer text-destructive focus:text-destructive"
          >
            Log out
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

function UserInitials({ name }: { name: string }) {
  const parts = name.trim().split(" ").filter(Boolean);
  const initials = parts.length === 0 ? "U" : parts.length === 1 ? parts[0]!.charAt(0) : (parts[0]!.charAt(0) + parts[1]!.charAt(0));
  return <span className="font-semibold text-xs">{initials.toUpperCase()}</span>;
}

function formatTime(dateLike?: string | number | Date): string {
  if (!dateLike) return "";
  const d = new Date(dateLike);
  if (Number.isNaN(d.getTime())) return "";
  const now = new Date();
  const diff = (now.getTime() - d.getTime()) / 1000; // seconds
  if (diff < 60) return "now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h`;
  if (diff < 172800) return "yesterday";
  return d.toLocaleDateString();
}

function ConversationSkeleton() {
  return (
    <li className="flex items-center gap-3 rounded-md px-2 py-2">
      <Skeleton className="h-10 w-10 rounded-full" />
      <div className="flex-1 space-y-2">
        <Skeleton className="h-3 w-2/3" />
        <Skeleton className="h-3 w-1/2" />
      </div>
      <Skeleton className="h-5 w-8 rounded-md" />
    </li>
  );
}

function SearchItemSkeleton() {
  return (
    <div className="flex items-center gap-3 px-2 py-2">
      <Skeleton className="h-8 w-8 rounded-full" />
      <div className="flex-1 space-y-2">
        <Skeleton className="h-3 w-2/5" />
        <Skeleton className="h-3 w-1/3" />
      </div>
      <Skeleton className="h-6 w-14 rounded-md" />
    </div>
  );
}

function EmptyConversations() {
  return (
    <div className="px-3 py-8 text-center">
      <div className="mx-auto mb-3 grid place-items-center size-10 rounded-full bg-[--muted]">
        <MessagesSquare className="size-5 text-muted-foreground" />
      </div>
      <p className="text-sm font-semibold text-foreground">No conversations yet</p>
      <p className="text-xs text-muted-foreground">
        Search above to start chatting with someone
      </p>
    </div>
  );
}