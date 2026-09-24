import { asNumber, asString, parseJson, parseObject } from "@paperclipai/adapter-utils/server-utils";

interface ParsedPiOutput {
  sessionId: string | null;
  messages: string[];
  errors: string[];
  usage: {
    inputTokens: number;
    outputTokens: number;
    cachedInputTokens: number;
    costUsd: number;
  };
  finalMessage: string | null;
  toolCalls: Array<{ toolCallId: string; toolName: string; args: unknown; result: string | null; isError: boolean }>;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function extractTextContent(content: string | Array<{ type: string; text?: string }>): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content
    .filter((c) => c.type === "text" && c.text)
    .map((c) => c.text!)
    .join("");
}

export function parsePiJsonl(stdout: string): ParsedPiOutput {
  const result: ParsedPiOutput = {
    sessionId: null,
    messages: [],
    errors: [],
    usage: {
      inputTokens: 0,
      outputTokens: 0,
      cachedInputTokens: 0,
      costUsd: 0,
    },
    finalMessage: null,
    toolCalls: [],
  };

  let currentToolCall: { toolCallId: string; toolName: string; args: unknown } | null = null;

  for (const rawLine of stdout.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;

    const event = parseJson(line);
    if (!event) continue;

    const eventType = asString(event.type, "");

    // Mensajes del protocolo RPC: omitirlos (detalle interno de implementación)
    if (eventType === "response" || eventType === "extension_ui_request" || eventType === "extension_ui_response" || eventType === "extension_error") {
      continue;
    }

    // Ciclo de vida del agente
    if (eventType === "agent_start") {
      continue;
    }

    if (eventType === "agent_end") {
      const messages = event.messages as Array<Record<string, unknown>> | undefined;
      if (messages && messages.length > 0) {
        const lastMessage = messages[messages.length - 1];
        if (lastMessage?.role === "assistant") {
          const content = lastMessage.content as string | Array<{ type: string; text?: string }>;
          result.finalMessage = extractTextContent(content);
        }
      }
      continue;
    }

    // Ciclo de vida del turno
    if (eventType === "turn_start") {
      continue;
    }

    if (eventType === "turn_end") {
      const message = asRecord(event.message);
      if (message) {
        const content = message.content as string | Array<{ type: string; text?: string }>;
        const text = extractTextContent(content);
        if (text) {
          result.finalMessage = text;
          result.messages.push(text);
        }
        
        // Extraer el uso y el costo del mensaje del asistente
        const usage = asRecord(message.usage);
        if (usage) {
          result.usage.inputTokens += asNumber(usage.input, 0);
          result.usage.outputTokens += asNumber(usage.output, 0);
          result.usage.cachedInputTokens += asNumber(usage.cacheRead, 0);
          
          // Pi guarda el costo en usage.cost.total (y desglosado en usage.cost.input, etc.)
          const cost = asRecord(usage.cost);
          if (cost) {
            result.usage.costUsd += asNumber(cost.total, 0);
          }
        }
      }
      
      // Los resultados de herramientas están en el arreglo toolResults
      const toolResults = event.toolResults as Array<Record<string, unknown>> | undefined;
      if (toolResults) {
        for (const tr of toolResults) {
          const toolCallId = asString(tr.toolCallId, "");
          const content = tr.content;
          const isError = tr.isError === true;
          
          // Buscar la llamada de herramienta coincidente por toolCallId
          const existingCall = result.toolCalls.find((tc) => tc.toolCallId === toolCallId);
          if (existingCall) {
            existingCall.result = typeof content === "string" ? content : JSON.stringify(content);
            existingCall.isError = isError;
          }
        }
      }
      continue;
    }

    // Actualizaciones de mensajes (streaming)
    if (eventType === "message_update") {
      const assistantEvent = asRecord(event.assistantMessageEvent);
      if (assistantEvent) {
        const msgType = asString(assistantEvent.type, "");
        if (msgType === "text_delta") {
          const delta = asString(assistantEvent.delta, "");
          if (delta) {
            // Agregar al último mensaje o crear uno nuevo
            if (result.messages.length === 0) {
              result.messages.push(delta);
            } else {
              result.messages[result.messages.length - 1] += delta;
            }
          }
        }
      }
      continue;
    }

    // Ejecución de la herramienta
    if (eventType === "tool_execution_start") {
      const toolCallId = asString(event.toolCallId, "");
      const toolName = asString(event.toolName, "");
      const args = event.args;
      currentToolCall = { toolCallId, toolName, args };
      result.toolCalls.push({
        toolCallId,
        toolName,
        args,
        result: null,
        isError: false,
      });
      continue;
    }

    if (eventType === "tool_execution_end") {
      const toolCallId = asString(event.toolCallId, "");
      const toolName = asString(event.toolName, "");
      const toolResult = event.result;
      const isError = event.isError === true;
      
      // Buscar la llamada de herramienta por toolCallId (no por toolName, para manejar múltiples llamadas a la misma herramienta)
      const existingCall = result.toolCalls.find((tc) => tc.toolCallId === toolCallId);
      if (existingCall) {
        existingCall.result = typeof toolResult === "string" ? toolResult : JSON.stringify(toolResult);
        existingCall.isError = isError;
      }
      currentToolCall = null;
      continue;
    }

    // Seguimiento del uso si está disponible en el evento (alternativa para eventos de uso independientes)
    if (eventType === "usage" || event.usage) {
      const usage = asRecord(event.usage);
      if (usage) {
        // Admite tanto el formato de Pi (input/output/cacheRead) como el formato genérico (inputTokens/outputTokens/cachedInputTokens)
        result.usage.inputTokens += asNumber(usage.inputTokens ?? usage.input, 0);
        result.usage.outputTokens += asNumber(usage.outputTokens ?? usage.output, 0);
        result.usage.cachedInputTokens += asNumber(usage.cachedInputTokens ?? usage.cacheRead, 0);
        
        // El costo puede estar en usage.costUsd (directo) o en usage.cost.total (formato de Pi)
        const cost = asRecord(usage.cost);
        if (cost) {
          result.usage.costUsd += asNumber(cost.total ?? usage.costUsd, 0);
        } else {
          result.usage.costUsd += asNumber(usage.costUsd, 0);
        }
      }
    }
  }

  return result;
}

export function isPiUnknownSessionError(stdout: string, stderr: string): boolean {
  const haystack = `${stdout}\n${stderr}`
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .join("\n");

  return /unknown\s+session|session\s+not\s+found|session\s+.*\s+not\s+found|no\s+session/i.test(haystack);
}
