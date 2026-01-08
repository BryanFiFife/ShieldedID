import type { ChatMessage } from "./chat-storage";

export interface CompanionOptions {
  model?: string;
}

export interface Companion {
  ready: boolean;
  mode: "llm" | "rules";
  respond: (messages: ChatMessage[]) => Promise<string>;
}

function supportsWebLLM() {
  return typeof navigator !== "undefined" && "gpu" in navigator;
}

function buildRuleResponse(messages: ChatMessage[]) {
  const last = messages.filter((msg) => msg.role === "user").slice(-1)[0];
  if (!last) return "How can I help you today?";
  const text = last.content.toLowerCase();
  if (text.includes("age") || text.includes("over 18")) {
    return "I can help you prepare age-over proofs without sharing your DOB. Use the Proof flow and select AGE_OVER.";
  }
  if (text.includes("kyc")) {
    return "KYC proofs can be shared as a level without exposing documents. I can guide you through enrollment.";
  }
  if (text.includes("safety") || text.includes("panic")) {
    return "Safety modes are on by default. You can enable decoy wallet and use panic wipe if needed.";
  }
  return "I can help you manage your identity wallet, verify proofs, and keep your data private.";
}

export async function createCompanion(options: CompanionOptions = {}): Promise<Companion> {
  if (!supportsWebLLM()) {
    return {
      ready: true,
      mode: "rules",
      respond: async (messages) => buildRuleResponse(messages)
    };
  }

  try {
    const webllm = await import("@mlc-ai/web-llm");
    const engine = new webllm.MLCEngine();
    const model = options.model ?? "Llama-3.2-1B-Instruct-q4f16_1";
    await engine.reload(model);
    return {
      ready: true,
      mode: "llm",
      respond: async (messages) => {
        const prompt = messages.map((msg) => `${msg.role}: ${msg.content}`).join("\n");
        const reply = await engine.generate(prompt, { maxTokens: 256 });
        return reply.text ?? buildRuleResponse(messages);
      }
    };
  } catch {
    return {
      ready: true,
      mode: "rules",
      respond: async (messages) => buildRuleResponse(messages)
    };
  }
}
