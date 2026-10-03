"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Send, Trash2, VolumeX } from "lucide-react";
import { useAuth } from "../../context/AuthContext";
import {
  deleteLiveChatMessage,
  getLiveViewerTicket,
  muteLiveChatUser,
} from "../../lib/api/live";

export default function LiveChat({
  sessionId,
  ended = false,
  host = false,
  onViewerCount,
}) {
  const { signedIn, user } = useAuth();
  const [messages, setMessages] = useState([]);
  const [connection, setConnection] = useState("connecting");
  const [canChat, setCanChat] = useState(false);
  const [draft, setDraft] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [mutedUsers, setMutedUsers] = useState(() => new Set());
  const socket = useRef(null);
  const submission = useRef(null);
  const ackTimer = useRef(null);
  const deletedMessages = useRef({ sessionId, ids: new Set() });
  const bottom = useRef(null);

  useEffect(() => {
    if (ended) return;
    let disposed = false;
    let reconnect;
    let heartbeat;
    let handshake;
    setMessages([]);
    submission.current = null;
    setPending(false);
    let attempt = 0;
    let roomEnded = false;
    if (deletedMessages.current.sessionId !== sessionId)
      deletedMessages.current = { sessionId, ids: new Set() };
    const deletedIds = deletedMessages.current.ids;
    const addMessages = (items) =>
      setMessages((previous) => {
        const byId = new Map(previous.map((message) => [message.id, message]));
        for (const item of items)
          if (item && !deletedIds.has(item.id)) byId.set(item.id, item);
        return [...byId.values()]
          .sort((a, b) => a.sequence - b.sequence)
          .slice(-100);
      });
    const connect = async () => {
      if (disposed || roomEnded) return;
      setConnection("connecting");
      setCanChat(false);
      try {
        const authorization = await getLiveViewerTicket(sessionId);
        if (disposed) return;
        const ws = new WebSocket(authorization.webSocketUrl);
        socket.current = ws;
        handshake = setTimeout(() => ws.close(), 20000);
        ws.onopen = () =>
          ws.send(
            JSON.stringify({
              type: "authenticate",
              ticket: authorization.ticket,
            }),
          );
        ws.onmessage = (event) => {
          if (disposed) return;
          let data;
          try {
            data = JSON.parse(event.data);
          } catch {
            return;
          }
          if (data.type === "ready") {
            clearTimeout(handshake);
            attempt = 0;
            setConnection("connected");
            setCanChat(data.canChat === true);
            setMutedUsers(new Set(data.mutedUserIds || []));
            setError("");
            setMessages([]);
            addMessages(data.messages || []);
            onViewerCount?.(data.viewerCount || 0);
            clearInterval(heartbeat);
            heartbeat = setInterval(() => {
              if (ws.readyState === WebSocket.OPEN)
                ws.send(JSON.stringify({ type: "ping" }));
            }, 20000);
          } else if (data.type === "message") addMessages([data.message]);
          else if (data.type === "viewers")
            onViewerCount?.(data.viewerCount || 0);
          else if (data.type === "message_deleted") {
            deletedIds.add(data.id);
            setMessages((items) => items.filter((item) => item.id !== data.id));
          } else if (data.type === "muted") {
            setMutedUsers((previous) => {
              const next = new Set(previous);
              if (data.muted) next.add(data.userId);
              else next.delete(data.userId);
              return next;
            });
            if (data.userId === user?.id) {
              setCanChat(!data.muted && signedIn);
              setError(
                data.muted ? "The host has muted you in this chat." : "",
              );
            }
          } else if (
            data.type === "ack" &&
            data.clientId === submission.current?.clientId
          ) {
            clearTimeout(ackTimer.current);
            setPending(false);
            setDraft("");
            submission.current = null;
          } else if (data.type === "error") {
            setError(data.message || "Chat is temporarily unavailable.");
            if (
              !data.clientId ||
              data.clientId === submission.current?.clientId
            ) {
              clearTimeout(ackTimer.current);
              setPending(false);
            }
          } else if (data.type === "ended") {
            roomEnded = true;
            setConnection("ended");
            setCanChat(false);
            setMessages([]);
            ws.close();
          }
        };
        ws.onerror = () => {
          if (!disposed)
            setError("Chat connection interrupted. Reconnecting...");
          ws.close();
        };
        ws.onclose = () => {
          clearTimeout(handshake);
          clearInterval(heartbeat);
          clearTimeout(ackTimer.current);
          if (!disposed && !roomEnded) {
            setConnection("connecting");
            setCanChat(false);
            setPending(false);
            reconnect = setTimeout(
              connect,
              Math.min(30000, 1000 * 2 ** Math.min(attempt++, 5)),
            );
          }
        };
      } catch (err) {
        if (!disposed) {
          setError(err.message || "Could not connect to chat.");
          reconnect = setTimeout(
            connect,
            Math.min(30000, 1000 * 2 ** Math.min(attempt++, 5)),
          );
        }
      }
    };
    connect();
    return () => {
      disposed = true;
      clearTimeout(reconnect);
      clearTimeout(handshake);
      clearInterval(heartbeat);
      clearTimeout(ackTimer.current);
      socket.current?.close();
      socket.current = null;
    };
  }, [sessionId, ended, signedIn, user?.id, onViewerCount]);

  useEffect(() => {
    bottom.current?.scrollIntoView({ block: "nearest" });
  }, [messages]);

  function send(event) {
    event.preventDefault();
    const text = draft.trim();
    if (
      !canChat ||
      pending ||
      !text ||
      text.length > 500 ||
      socket.current?.readyState !== WebSocket.OPEN
    )
      return;
    const payload =
      submission.current?.text === text
        ? submission.current
        : { type: "message", clientId: crypto.randomUUID(), text };
    submission.current = payload;
    setPending(true);
    setError("");
    socket.current.send(JSON.stringify(payload));
    ackTimer.current = setTimeout(() => {
      setPending(false);
      setError("Your message was not confirmed. You can try sending it again.");
    }, 10000);
  }

  async function moderate(message, mute) {
    try {
      if (mute)
        await muteLiveChatUser(
          sessionId,
          message.userId,
          !mutedUsers.has(message.userId),
        );
      else await deleteLiveChatMessage(sessionId, message.id);
    } catch (err) {
      setError(err.message || "Could not update this chat.");
    }
  }

  return (
    <section
      className="rounded-2xl border border-slate-200 bg-white p-4 text-slate-900"
      aria-label="Live chat"
    >
      <div className="mb-3 flex items-center justify-between">
        <h2 className="font-bold">Live chat</h2>
        <span className="text-xs text-slate-500">
          {ended || connection === "ended"
            ? "Session ended"
            : connection === "connected"
              ? "Connected"
              : "Connecting..."}
        </span>
      </div>
      <div
        role="log"
        aria-live="polite"
        aria-relevant="additions"
        className="max-h-64 min-h-24 space-y-3 overflow-y-auto text-sm"
      >
        {ended ? (
          <p className="text-slate-500">This chat has ended.</p>
        ) : !messages.length ? (
          <p className="text-slate-500">
            Messages appear here during the live session.
          </p>
        ) : (
          messages.map((message) => (
            <div key={message.id} className="flex gap-2">
              <p className="min-w-0 flex-1 break-words">
                <strong className="mr-2 text-blue-700">{message.name}</strong>
                {message.text}
              </p>
              {host && message.userId !== user?.id && (
                <>
                  <button
                    onClick={() => moderate(message, false)}
                    aria-label={`Remove message from ${message.name}`}
                    className="p-1 text-slate-500"
                  >
                    <Trash2 className="size-4" />
                  </button>
                  <button
                    onClick={() => moderate(message, true)}
                    aria-label={`${mutedUsers.has(message.userId) ? "Unmute" : "Mute"} ${message.name}`}
                    className="p-1 text-slate-500"
                  >
                    {mutedUsers.has(message.userId) ? (
                      <span className="text-xs">Unmute</span>
                    ) : (
                      <VolumeX className="size-4" />
                    )}
                  </button>
                </>
              )}
            </div>
          ))
        )}
        <span ref={bottom} />
      </div>
      {error && (
        <p role="alert" className="mt-3 text-xs text-red-700">
          {error}
        </p>
      )}
      {!ended &&
        connection !== "ended" &&
        (signedIn ? (
          <form onSubmit={send} className="mt-4 flex gap-2">
            <input
              aria-label="Chat message"
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              disabled={!canChat || pending}
              maxLength={500}
              placeholder={canChat ? "Say something..." : "Chat is unavailable"}
              className="min-w-0 flex-1 rounded-xl border border-slate-200 px-3 py-2 text-sm disabled:bg-slate-50"
            />
            <button
              type="submit"
              disabled={!canChat || pending || !draft.trim()}
              aria-label="Send message"
              className="rounded-xl bg-blue-600 px-3 text-white disabled:opacity-40"
            >
              <Send className="size-4" />
            </button>
          </form>
        ) : (
          <Link
            href={`/login?next=${encodeURIComponent(`/live/${sessionId}`)}`}
            className="mt-4 block rounded-xl bg-blue-50 p-3 text-center text-sm font-bold text-blue-700"
          >
            Sign in to chat
          </Link>
        ))}
    </section>
  );
}
