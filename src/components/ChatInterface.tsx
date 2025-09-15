"use client";

import React, { useState, useRef, useEffect } from "react";
import { Phone, Send, Paperclip, Image } from "lucide-react";

export type ChatMessage = {
  id: string;
  senderId: string;
  senderName?: string;
  type: "text" | "image" | "file";
  content: string; // text or URL
  imageAlt?: string;
  fileName?: string;
  fileSize?: number;
  createdAt: string;
  status?: "sent" | "delivered" | "read";
};

export type Contact = {
  id: string;
  name: string;
  username?: string;
  avatarUrl?: string;
  online?: boolean;
  isGroup?: boolean;
};

interface ChatInterfaceProps {
  currentUserId: string;
  activeContact: Contact | null;
  messages: ChatMessage[];
  typing: { userId: string; name?: string }[];
  isLoadingHistory: boolean;
  onSendMessage: (text: string) => Promise<void> | void;
  onUploadFiles: (files: File[]) => Promise<void> | void;
  onUploadImages: (files: File[]) => Promise<void> | void;
  onStartCall: () => void;
  emptyStateTitle?: string;
  emptyStateDescription?: string;
  className?: string;
}

export default function ChatInterface({
  currentUserId,
  activeContact,
  messages,
  typing,
  isLoadingHistory,
  onSendMessage,
  onUploadFiles,
  onUploadImages,
  onStartCall,
  emptyStateTitle = "No conversation selected",
  emptyStateDescription = "Choose a conversation to start messaging",
  className
}: ChatInterfaceProps) {
  const [message, setMessage] = useState("");
  const [isSending, setIsSending] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleSend = async () => {
    if (!message.trim() || isSending) return;
    setIsSending(true);
    try {
      await onSendMessage(message);
      setMessage("");
    } finally {
      setIsSending(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleFileChange = (files: FileList | null, type: "file" | "image") => {
    if (!files || files.length === 0) return;
    const fileArray = Array.from(files);
    if (type === "image") {
      onUploadImages(fileArray);
    } else {
      onUploadFiles(fileArray);
    }
  };

  if (!activeContact) {
    return (
      <div className={`flex flex-col items-center justify-center h-full text-center ${className || ""}`}>
        <div className="max-w-sm mx-auto px-6">
          <h3 className="text-xl font-semibold text-muted-foreground mb-2">{emptyStateTitle}</h3>
          <p className="text-sm text-muted-foreground">{emptyStateDescription}</p>
        </div>
      </div>
    );
  }

  return (
    <div className={`flex flex-col h-full ${className || ""}`}>
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-secondary flex items-center justify-center">
            {activeContact.avatarUrl ? (
              <img src={activeContact.avatarUrl} alt={activeContact.name} className="w-10 h-10 rounded-full" />
            ) : (
              <span className="text-sm font-medium text-secondary-foreground">
                {activeContact.name.slice(0, 2).toUpperCase()}
              </span>
            )}
          </div>
          <div>
            <h2 className="font-medium text-foreground">@{activeContact.username || activeContact.name}</h2>
            {activeContact.online && <span className="text-xs text-green-600">Online</span>}
          </div>
        </div>
        <button
          onClick={onStartCall}
          className="p-2 rounded-full hover:bg-accent text-muted-foreground hover:text-foreground transition-colors"
        >
          <Phone className="w-5 h-5" />
        </button>
      </div>

      {/* Messages Area */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
        {isLoadingHistory && (
          <div className="text-center text-sm text-muted-foreground py-4">Loading history...</div>
        )}
        {messages.length === 0 && !isLoadingHistory && (
          <div className="text-center text-sm text-muted-foreground py-8">Start the conversation</div>
        )}
        {messages.map((msg) => {
          const isOwn = msg.senderId === currentUserId;
          return (
            <div key={msg.id} className={`flex ${isOwn ? "justify-end" : "justify-start"}`}>
              <div
                className={`
                  max-w-xs lg:max-w-md px-4 py-2 rounded-2xl
                  ${isOwn ? "bg-primary text-primary-foreground" : "bg-secondary text-secondary-foreground"}
                `}
              >
                {msg.type === "text" && <span className="whitespace-pre-wrap">{msg.content}</span>}
                {msg.type === "image" && (
                  <img
                    src={msg.content}
                    alt={msg.imageAlt || "Image"}
                    className="rounded-lg max-w-full object-cover"
                  />
                )}
                {msg.type === "file" && (
                  <a
                    href={msg.content}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="underline text-sm"
                  >
                    {msg.fileName || "Download file"}
                  </a>
                )}
              </div>
            </div>
          );
        })}
        {typing.length > 0 && (
          <div className="text-sm text-muted-foreground italic">
            {typing[0].name || "Someone"} is typing...
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Composer */}
      <div className="p-4 border-t border-border flex items-end gap-3">
        <input
          ref={imageInputRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={(e) => handleFileChange(e.target.files, "image")}
        />
        <input
          ref={fileInputRef}
          type="file"
          multiple
          className="hidden"
          onChange={(e) => handleFileChange(e.target.files, "file")}
        />
        <button
          onClick={() => imageInputRef.current?.click()}
          className="p-2 rounded-full hover:bg-accent text-muted-foreground hover:text-foreground transition-colors"
        >
          <Image className="w-5 h-5" />
        </button>
        <button
          onClick={() => fileInputRef.current?.click()}
          className="p-2 rounded-full hover:bg-accent text-muted-foreground hover:text-foreground transition-colors"
        >
          <Paperclip className="w-5 h-5" />
        </button>
        <textarea
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Type a message..."
          rows={1}
          className="flex-1 resize-none rounded-xl bg-muted text-foreground px-4 py-2 text-sm focus:outline-none"
        />
        <button
          onClick={handleSend}
          disabled={!message.trim() || isSending}
          className="p-2 rounded-full bg-primary text-primary-foreground disabled:opacity-50 disabled:cursor-not-allowed hover:opacity-90 transition-opacity"
        >
          <Send className="w-5 h-5" />
        </button>
      </div>
    </div>
  );
}