import { useEffect, useMemo, useState } from "react";
import { initChatStore, type ChatMessage } from "../lib/chat-storage";
import { createCompanion } from "../lib/companion";
import { performOCR } from "../lib/document-capture";
import { useWalletStore } from "../store/wallet.store";

function nowIso() {
  return new Date().toISOString();
}

function extractProfileHints(text: string) {
  const profile: Record<string, string> = {};
  const nameMatch = text.match(/my name is ([a-zA-Z ]+)/i);
  if (nameMatch) {
    profile.name = nameMatch[1].trim();
  }
  const cityMatch = text.match(/i live in ([a-zA-Z ]+)/i);
  if (cityMatch) {
    profile.city = cityMatch[1].trim();
  }
  return profile;
}

export function Companion() {
  const vaultPayload = useWalletStore((state) => state.vaultPayload);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [status, setStatus] = useState("Initializing...");
  const [mode, setMode] = useState("rules");
  const [storeReady, setStoreReady] = useState(false);
  const [companionReady, setCompanionReady] = useState(false);
  const [chatStore, setChatStore] = useState<Awaited<ReturnType<typeof initChatStore>> | null>(null);
  const [companion, setCompanion] = useState<Awaited<ReturnType<typeof createCompanion>> | null>(null);

  const masterSecret = vaultPayload?.masterSecret;

  useEffect(() => {
    if (!masterSecret) return;
    let mounted = true;
    initChatStore(masterSecret).then((store) => {
      if (!mounted) return;
      setChatStore(store);
      setStoreReady(true);
      store.listMessages().then(setMessages);
    });
    return () => {
      mounted = false;
    };
  }, [masterSecret]);

  useEffect(() => {
    createCompanion().then((comp) => {
      setCompanion(comp);
      setMode(comp.mode);
      setCompanionReady(true);
      setStatus(comp.mode === "llm" ? "LLM ready" : "Rules mode");
    });
  }, []);

  const canSend = useMemo(() => storeReady && companionReady && Boolean(input.trim()), [storeReady, companionReady, input]);

  const sendMessage = async () => {
    if (!chatStore || !companion || !masterSecret) return;
    const userMessage: ChatMessage = {
      id: crypto.randomUUID(),
      role: "user",
      content: input.trim(),
      createdAt: nowIso()
    };
    await chatStore.addMessage(userMessage);
    const updatedMessages = [...messages, userMessage];
    setMessages(updatedMessages);
    setInput("");

    const profileHints = extractProfileHints(userMessage.content);
    if (Object.keys(profileHints).length > 0) {
      const currentProfile = await chatStore.getProfile();
      await chatStore.setProfile({ ...currentProfile, ...profileHints, updatedAt: nowIso() });
    }

    const reply = await companion.respond(updatedMessages);
    const assistantMessage: ChatMessage = {
      id: crypto.randomUUID(),
      role: "assistant",
      content: reply,
      createdAt: nowIso()
    };
    await chatStore.addMessage(assistantMessage);
    setMessages((prev) => [...prev, assistantMessage]);
  };

  const handleImage = async (file: File) => {
    if (!chatStore) return;
    const ocr = await performOCR(file);
    const summary = `OCR result: ${JSON.stringify(ocr)}`;
    const systemMessage: ChatMessage = {
      id: crypto.randomUUID(),
      role: "system",
      content: summary,
      createdAt: nowIso()
    };
    await chatStore.addMessage(systemMessage);
    setMessages((prev) => [...prev, systemMessage]);
  };

  if (!masterSecret) {
    return (
      <div className="panel">
        <h2>Companion</h2>
        <p>Unlock the vault to use your local companion.</p>
      </div>
    );
  }

  return (
    <div className="panel">
      <h2>Companion</h2>
      <p>Mode: {mode} • {status}</p>
      <div style={{ maxHeight: 240, overflowY: "auto", marginBottom: 12 }}>
        {messages.map((message) => (
          <div key={message.id} style={{ marginBottom: 8 }}>
            <strong>{message.role}:</strong> {message.content}
          </div>
        ))}
      </div>
      <div className="field">
        <textarea
          rows={3}
          value={input}
          onChange={(event) => setInput(event.target.value)}
          placeholder="Ask your companion..."
        />
      </div>
      <button className="primary" onClick={sendMessage} disabled={!canSend}>
        Send
      </button>
      <div className="field" style={{ marginTop: 12 }}>
        <label>Upload an image for OCR</label>
        <input
          type="file"
          accept="image/*"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) handleImage(file).catch(() => undefined);
          }}
        />
      </div>
    </div>
  );
}
