"use client";

import { useState, useEffect, useMemo } from "react";
import { ChevronLeft, Settings, LogOut, Search, ChevronRight, MessageCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";

interface User {
  id: string;
  username: string;
  displayName: string;
  avatarUrl?: string | null;
}

interface Conversation {
  id: string;
  contact: User;
  lastMessage?: {
    text: string;
    createdAt: string | number | Date;
  } | null;
  unreadCount?: number;
}

interface ChatSidebarProps {
  currentUser: User;
  conversations: Conversation[];
  isConversationsLoading: boolean;
  activeConversationId: string | null;
  onSelectConversation: (conversationId: string) => void;
  onSearch: (query: string) => Promise<User[]>;
  onStartChatWithUser: (user: User) => void;
  onOpenSettings: () => void;
  onLogout: () => void;
  onToggleSidebar: () => void;
  className?: string;
}

export default function ChatSidebar({
  currentUser,
  conversations,
  isConversationsLoading,
  activeConversationId,
  onSelectConversation,
  onSearch,
  onStartChatWithUser,
  onOpenSettings,
  onLogout,
  onToggleSidebar,
  className,
}: ChatSidebarProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<User[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [showSearchResults, setShowSearchResults] = useState(false);

  // Debounce search query
  useEffect(() => {
    const timer = setTimeout(async () => {
      if (searchQuery.trim()) {
        setIsSearching(true);
        try {
          const results = await onSearch(searchQuery);
          setSearchResults(results);
          setShowSearchResults(true);
        } catch (error) {
          console.error("Search error:", error);
          setSearchResults([]);
        } finally {
          setIsSearching(false);
        }
      } else {
        setSearchResults([]);
        setShowSearchResults(false);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [searchQuery, onSearch]);

  const formatTime = (timestamp: string | number | Date) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diffInHours = (now.getTime() - date.getTime()) / (1000 * 60 * 60);

    if (diffInHours < 1) {
      return "Just now";
    } else if (diffInHours < 24) {
      return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } else {
      return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
    }
  };

  const handleSearchResultClick = (user: User) => {
    onStartChatWithUser(user);
    setSearchQuery("");
    setSearchResults([]);
    setShowSearchResults(false);
  };

  const sortedConversations = useMemo(() => {
    return [...conversations].sort((a, b) => {
      const aTime = a.lastMessage?.createdAt ? new Date(a.lastMessage.createdAt).getTime() : 0;
      const bTime = b.lastMessage?.createdAt ? new Date(b.lastMessage.createdAt).getTime() : 0;
      return bTime - aTime;
    });
  }, [conversations]);

  return (
    <div className={cn("flex flex-col h-full bg-sidebar text-sidebar-foreground border-r border-sidebar-border", className)}>
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-sidebar-border">
        <h2 className="text-lg font-semibold">Chats</h2>
        <Button
          variant="ghost"
          size="icon"
          onClick={onToggleSidebar}
          className="text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
        >
          <ChevronLeft className="h-5 w-5" />
        </Button>
      </div>

      {/* Search */}
      <div className="p-4 border-b border-sidebar-border relative">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search users..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9 bg-sidebar-accent text-sidebar-accent-foreground placeholder:text-muted-foreground"
          />
        </div>

        {/* Search Results Dropdown */}
        {showSearchResults && (
          <div className="absolute top-full left-0 right-0 mt-1 bg-popover rounded-md shadow-lg border border-border z-50 max-h-64 overflow-y-auto">
            {isSearching ? (
              <div className="p-2">
                <Skeleton className="h-10 w-full" />
              </div>
            ) : searchResults.length > 0 ? (
              <div className="py-1">
                {searchResults.map((user) => (
                  <button
                    key={user.id}
                    onClick={() => handleSearchResultClick(user)}
                    className="w-full px-3 py-2 text-left hover:bg-accent hover:text-accent-foreground flex items-center gap-3 transition-colors"
                  >
                    <Avatar className="h-8 w-8">
                      <AvatarImage src={user.avatarUrl || undefined} />
                      <AvatarFallback>{user.displayName.charAt(0)}</AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{user.displayName}</p>
                      <p className="text-xs text-muted-foreground truncate">@{user.username}</p>
                    </div>
                  </button>
                ))}
              </div>
            ) : (
              <div className="px-3 py-2 text-sm text-muted-foreground text-center">
                No users found
              </div>
            )}
          </div>
        )}
      </div>

      {/* Conversations List */}
      <div className="flex-1 overflow-y-auto">
        {isConversationsLoading ? (
          <div className="p-4 space-y-3">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="flex items-start gap-3">
                <Skeleton className="h-10 w-10 rounded-full" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-4 w-3/4" />
                  <Skeleton className="h-3 w-full" />
                </div>
              </div>
            ))}
          </div>
        ) : sortedConversations.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
            <MessageCircle className="h-12 w-12 mb-3" />
            <p className="text-sm">No conversations yet</p>
            <p className="text-xs">Start by searching for a user</p>
          </div>
        ) : (
          <div className="py-2">
            {sortedConversations.map((conversation) => (
              <button
                key={conversation.id}
                onClick={() => onSelectConversation(conversation.id)}
                className={cn(
                  "w-full px-4 py-3 flex items-start gap-3 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground transition-colors",
                  conversation.id === activeConversationId && "bg-sidebar-accent text-sidebar-accent-foreground"
                )}
              >
                <Avatar className="h-10 w-10 flex-shrink-0">
                  <AvatarImage src={conversation.contact.avatarUrl || undefined} />
                  <AvatarFallback>{conversation.contact.displayName.charAt(0)}</AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0 text-left">
                  <div className="flex items-center justify-between mb-1">
                    <p className="text-sm font-medium truncate">{conversation.contact.displayName}</p>
                    {conversation.lastMessage && (
                      <span className="text-xs text-muted-foreground">
                        {formatTime(conversation.lastMessage.createdAt)}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center justify-between">
                    <p className="text-sm text-muted-foreground truncate">
                      {conversation.lastMessage?.text || "No messages yet"}
                    </p>
                    {conversation.unreadCount && conversation.unreadCount > 0 && (
                      <Badge variant="default" className="ml-2">
                        {conversation.unreadCount}
                      </Badge>
                    )}
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="p-4 border-t border-sidebar-border space-y-2">
        <Button
          variant="ghost"
          size="sm"
          onClick={onOpenSettings}
          className="w-full justify-start text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
        >
          <Settings className="mr-2 h-4 w-4" />
          Settings
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={onLogout}
          className="w-full justify-start text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
        >
          <LogOut className="mr-2 h-4 w-4" />
          Logout
        </Button>
      </div>
    </div>
  );
}