/**
 * PluginEventBus — bus de eventos tipado en proceso para el sistema de
 * plugins de Paperclip.
 *
 * Responsabilidades:
 * - Entregar eventos de dominio centrales a los workers de plugins
 *   suscritos (lado del servidor).
 * - Aplicar `EventFilter` en el servidor para que los eventos filtrados
 *   nunca lleguen al manejador.
 * - Nombrar los eventos emitidos por plugins como
 *   `plugin.<pluginId>.<eventName>`.
 * - Proteger el namespace central: los plugins no pueden emitir eventos
 *   con el prefijo `plugin.`.
 * - Aislar las suscripciones por plugin — un plugin no puede enumerar ni
 *   interferir con las suscripciones de otro plugin.
 * - Soportar suscripciones con comodín vía coincidencia de prefijo
 *   (p. ej. `plugin.acme.linear.*`).
 *
 * El bus opera en proceso. En la arquitectura completa fuera de proceso,
 * el host llama a `bus.emit()` tras recibir eventos de la capa de BD/cola,
 * y el bus los reenvía a manejadores que delegan la llamada al proceso
 * worker correspondiente vía IPC. Esa capa de IPC es separada; este módulo
 * solo maneja el enrutamiento y el filtrado.
 *
 * @see PLUGIN_SPEC.md §16 — Sistema de eventos
 * @see PLUGIN_SPEC.md §16.1 — Filtrado de eventos
 * @see PLUGIN_SPEC.md §16.2 — Eventos de plugin a plugin
 */

import type { PluginEventType } from "@paperclipai/shared";
import type { PluginEvent, EventFilter } from "@paperclipai/plugin-sdk";

// ---------------------------------------------------------------------------
// Tipos internos
// ---------------------------------------------------------------------------

/**
 * Registro de suscripción almacenado por plugin.
 */
interface Subscription {
  /** El nombre de evento o patrón de prefijo que coincide con esta suscripción. */
  eventPattern: string;
  /** Filtro opcional aplicado en el servidor antes de la entrega. */
  filter: EventFilter | null;
  /** Manejador asíncrono a invocar cuando un evento coincidente pasa el filtro. */
  handler: (event: PluginEvent) => Promise<void>;
}

// ---------------------------------------------------------------------------
// Utilidades de coincidencia de patrones
// ---------------------------------------------------------------------------

/**
 * Devuelve true si el tipo de evento coincide con el patrón de suscripción.
 *
 * Reglas de coincidencia:
 * - Coincidencia exacta: `"issue.created"` coincide con `"issue.created"`.
 * - Sufijo comodín: `"plugin.acme.*"` coincide con cualquier tipo de evento
 *   que empiece con `"plugin.acme."`. El comodín `*` solo se soporta como
 *   token final.
 *
 * No se soporta sintaxis glob completa — solo `*` al final tras un
 * separador `.`.
 */
function matchesPattern(eventType: string, pattern: string): boolean {
  if (pattern === eventType) return true;

  // Trailing wildcard: "plugin.foo.*" → prefix is "plugin.foo."
  if (pattern.endsWith(".*")) {
    const prefix = pattern.slice(0, -1); // remove the trailing "*", keep the "."
    return eventType.startsWith(prefix);
  }

  return false;
}

/**
 * Devuelve true si el evento pasa todos los campos del filtro.
 * Un filtro `null` o vacío deja pasar todos los eventos.
 *
 * **Estrategia de resolución por campo:**
 *
 * - `projectId` — se compara contra `event.entityId` cuando
 *   `entityType === "project"`, de lo contrario contra `payload.projectId`.
 *   Esto cubre tanto eventos directos de proyecto (p. ej. `project.created`)
 *   como eventos secundarios que incrustan una referencia de proyecto en su
 *   payload (p. ej. `issue.created` con `payload.projectId`).
 *
 * - `companyId` — siempre se resuelve desde `payload.companyId`. Los eventos
 *   de dominio centrales que pertenecen a una empresa incrustan el ID de la
 *   empresa en su payload.
 *
 * - `agentId` — se compara contra `event.entityId` cuando
 *   `entityType === "agent"`, de lo contrario contra `payload.agentId`.
 *   Cubre tanto eventos directos del ciclo de vida de agentes
 *   (p. ej. `agent.created`) como eventos a nivel de run con
 *   `payload.agentId` (p. ej. `agent.run.started`).
 *
 * Múltiples campos de filtro se combinan con AND — todos los campos
 * especificados deben coincidir.
 */
function passesFilter(event: PluginEvent, filter: EventFilter | null): boolean {
  if (!filter) return true;

  const payload = event.payload as Record<string, unknown> | null;

  if (filter.projectId !== undefined) {
    const projectId = event.entityType === "project"
      ? event.entityId
      : (typeof payload?.projectId === "string" ? payload.projectId : undefined);
    if (projectId !== filter.projectId) return false;
  }

  if (filter.companyId !== undefined) {
    if (event.companyId !== filter.companyId) return false;
  }

  if (filter.agentId !== undefined) {
    const agentId = event.entityType === "agent"
      ? event.entityId
      : (typeof payload?.agentId === "string" ? payload.agentId : undefined);
    if (agentId !== filter.agentId) return false;
  }

  return true;
}

// ---------------------------------------------------------------------------
// Fábrica del bus de eventos
// ---------------------------------------------------------------------------

/**
 * Crea y devuelve una nueva instancia de `PluginEventBus`.
 *
 * Una sola instancia del bus debe compartirse en todo el proceso del
 * servidor. Cada plugin interactúa con el bus a través de un manejador con
 * alcance obtenido vía {@link PluginEventBus.forPlugin}.
 *
 * @example
 * ```ts
 * const bus = createPluginEventBus();
 *
 * // Darle al plugin de Linear un manejador con alcance
 * const linearBus = bus.forPlugin("acme.linear");
 *
 * // Suscribirse desde la perspectiva del plugin
 * linearBus.subscribe("issue.created", async (event) => {
 *   // manejar el evento
 * });
 *
 * // Emitir un evento de dominio central (lo llama el host, no el plugin)
 * await bus.emit({
 *   eventId: "evt-1",
 *   eventType: "issue.created",
 *   occurredAt: new Date().toISOString(),
 *   entityId: "iss-1",
 *   entityType: "issue",
 *   payload: { title: "Fix login bug", projectId: "proj-1" },
 * });
 * ```
 */
export function createPluginEventBus(): PluginEventBus {
  // Registro de suscripciones: pluginKey → lista de suscripciones
  const registry = new Map<string, Subscription[]>();

  /**
   * Obtiene o crea la lista de suscripciones de un plugin.
   */
  function subsFor(pluginId: string): Subscription[] {
    let subs = registry.get(pluginId);
    if (!subs) {
      subs = [];
      registry.set(pluginId, subs);
    }
    return subs;
  }

  /**
   * Emite un sobre de evento a todos los suscriptores coincidentes de todos
   * los plugins.
   *
   * Los suscriptores se llaman de forma concurrente (Promise.all). Los
   * errores de cada manejador se capturan individualmente y se recogen en el
   * arreglo `errors` devuelto, para que un solo plugin con mal comportamiento
   * no pueda interrumpir la entrega a otros plugins.
   */
  async function emit(event: PluginEvent): Promise<PluginEventBusEmitResult> {
    const errors: Array<{ pluginId: string; error: unknown }> = [];
    const promises: Promise<void>[] = [];

    for (const [pluginId, subs] of registry) {
      for (const sub of subs) {
        if (!matchesPattern(event.eventType, sub.eventPattern)) continue;
        if (!passesFilter(event, sub.filter)) continue;

        // Usar Promise.resolve().then() para que los throws síncronos de los
        // manejadores también se capturen dentro de la cadena de promesas.
        // Llamar Promise.resolve(syncThrowingFn()) NO captura los throws
        // síncronos — el throw escapa antes de que Promise.resolve() pueda
        // envolverlo. Usar .then() asegura que la llamada se difiera a la
        // cola de microtareas, donde todas las excepciones se convierten en
        // rechazos. Cada .catch() absorbe el rechazo y lo registra — la
        // promesa siempre se resuelve, así Promise.all nunca rechaza.
        promises.push(
          Promise.resolve().then(() => sub.handler(event)).catch((error: unknown) => {
            errors.push({ pluginId, error });
          }),
        );
      }
    }

    await Promise.all(promises);
    return { errors };
  }

  /**
   * Elimina todas las suscripciones de un plugin (p. ej. al apagar el worker
   * o desinstalar).
   */
  function clearPlugin(pluginId: string): void {
    registry.delete(pluginId);
  }

  /**
   * Devuelve un manejador con alcance para un plugin específico. El
   * manejador expone solo la lista de suscripciones del propio plugin y
   * aplica el namespace del plugin en `emit`.
   */
  function forPlugin(pluginId: string): ScopedPluginEventBus {
    return {
      /**
       * Suscribirse a un evento de dominio central o a un evento con
       * namespace de plugin.
       *
       * Para suscripciones con comodín usa un patrón `.*` al final, p. ej.
       * `"plugin.acme.linear.*"`.
       *
       * Requiere la capacidad `events.subscribe` (la capa host aplica el
       * control de capacidades antes de llamar este método).
       */
      subscribe(
        eventPattern: PluginEventType | `plugin.${string}`,
        fnOrFilter: EventFilter | ((event: PluginEvent) => Promise<void>),
        maybeFn?: (event: PluginEvent) => Promise<void>,
      ): void {
        let filter: EventFilter | null = null;
        let handler: (event: PluginEvent) => Promise<void>;

        if (typeof fnOrFilter === "function") {
          handler = fnOrFilter;
        } else {
          filter = fnOrFilter;
          if (!maybeFn) throw new Error("Se requiere una función manejadora cuando se proporciona un filtro");
          handler = maybeFn;
        }

        subsFor(pluginId).push({ eventPattern, filter, handler });
      },

      /**
       * Emitir un evento con namespace de plugin. El tipo de evento se
       * prefija automáticamente con `plugin.<pluginId>.`, así:
       * - `emit("sync-done", payload)` se convierte en
       *   `"plugin.acme.linear.sync-done"`.
       *
       * Requiere la capacidad `events.emit` (aplicada por la capa host).
       *
       * @throws {Error} si `name` ya contiene el prefijo `plugin.`
       *   (evita suplantación entre namespaces).
       */
      async emit(name: string, companyId: string, payload: unknown): Promise<PluginEventBusEmitResult> {
        if (!name || name.trim() === "") {
          throw new Error(`El plugin "${pluginId}" debe proporcionar un nombre de evento no vacío.`);
        }

        if (!companyId || companyId.trim() === "") {
          throw new Error(`El plugin "${pluginId}" debe proporcionar un companyId al emitir eventos.`);
        }

        if (name.startsWith("plugin.")) {
          throw new Error(
            `El plugin "${pluginId}" no debe incluir el prefijo "plugin." al emitir eventos. ` +
            `Emite el nombre de evento simple (p. ej. "sync-done") y el bus lo nombrará automáticamente.`,
          );
        }

        const eventType = `plugin.${pluginId}.${name}` as const;
        const event: PluginEvent = {
          eventId: crypto.randomUUID(),
          eventType,
          companyId,
          occurredAt: new Date().toISOString(),
          actorType: "plugin",
          actorId: pluginId,
          payload,
        };

        return emit(event);
      },

      /** Elimina todas las suscripciones registradas por este plugin. */
      clear(): void {
        clearPlugin(pluginId);
      },
    };
  }

  return {
    emit,
    forPlugin,
    clearPlugin,
    /** Expone el conteo de suscripciones de un plugin (útil para pruebas y diagnóstico). */
    subscriptionCount(pluginId?: string): number {
      if (pluginId !== undefined) {
        return registry.get(pluginId)?.length ?? 0;
      }
      let total = 0;
      for (const subs of registry.values()) total += subs.length;
      return total;
    },
  };
}

// ---------------------------------------------------------------------------
// Tipos públicos
// ---------------------------------------------------------------------------

/**
 * Resultado devuelto por `emit()`. Los errores de los manejadores se recogen
 * y se devuelven en lugar de lanzarse, para que un solo plugin con mal
 * comportamiento no bloquee la entrega a otros plugins.
 */
export interface PluginEventBusEmitResult {
  /** Errores lanzados por manejadores individuales, claveados por el plugin que falló. */
  errors: Array<{ pluginId: string; error: unknown }>;
}

/**
 * El bus de eventos completo — lo mantiene el proceso host.
 *
 * Llama a `forPlugin(id)` para obtener un `ScopedPluginEventBus` para cada
 * worker de plugin.
 */
export interface PluginEventBus {
  /**
   * Emite un evento de dominio tipado a todos los suscriptores coincidentes.
   *
   * Lo llama el host cuando ocurre un evento de dominio (p. ej. desde la
   * capa de BD o la cola de mensajes). Se revisan todas las suscripciones
   * registradas en todos los plugins.
   */
  emit(event: PluginEvent): Promise<PluginEventBusEmitResult>;

  /**
   * Obtiene un manejador con alcance para un worker de plugin específico.
   *
   * El manejador con alcance aísla las suscripciones del plugin y aplica el
   * namespace del plugin en los eventos salientes.
   */
  forPlugin(pluginId: string): ScopedPluginEventBus;

  /**
   * Elimina todas las suscripciones de un plugin (se llama al apagar o
   * desinstalar el worker).
   */
  clearPlugin(pluginId: string): void;

  /**
   * Devuelve el número total de suscripciones activas, o el conteo de un
   * plugin específico si se proporciona `pluginId`.
   */
  subscriptionCount(pluginId?: string): number;
}

/**
 * Una vista con alcance de plugin del bus de eventos. Se entrega al worker
 * del plugin (o a su proxy del lado host) durante la inicialización.
 *
 * Los plugins la usan para:
 * 1. Suscribirse a eventos de dominio (con filtro opcional en el servidor).
 * 2. Emitir eventos con namespace de plugin para que otros plugins los
 *    consuman.
 *
 * Nota: las sobrecargas de `subscribe` reflejan la interfaz
 * `PluginEventsClient.on()` del SDK. `emit` devuelve intencionalmente
 * `PluginEventBusEmitResult` en lugar de `void` para que la capa host
 * pueda inspeccionar los errores de los manejadores; el
 * `PluginEventsClient.emit()` del SDK lo envuelve y devuelve `void`.
 */
export interface ScopedPluginEventBus {
  /**
   * Suscribirse a un evento de dominio central o a un evento con namespace
   * de plugin.
   *
   * **Sintaxis de patrones:**
   * - Coincidencia exacta: `"issue.created"` — recibe solo ese tipo de evento.
   * - Sufijo comodín: `"plugin.acme.linear.*"` — recibe todos los eventos
   *   emitidos por el plugin `acme.linear`. El `*` solo se soporta como
   *   token final tras un separador `.`; no se soporta otra sintaxis glob.
   * - Comodín de plugins de nivel superior: `"plugin.*"` — recibe todos los
   *   eventos emitidos por plugins sin importar cuál plugin los emitió.
   *
   * Los comodines solo aplican al namespace `plugin.*`. Los eventos de
   * dominio centrales deben suscribirse por nombre exacto
   * (p. ej. `"issue.created"`, no `"issue.*"`).
   *
   * Se puede pasar un `EventFilter` opcional como segundo argumento para
   * hacer pre-filtrado en el servidor; los eventos filtrados nunca se
   * entregan al manejador.
   */
  subscribe(
    eventPattern: PluginEventType | `plugin.${string}`,
    fn: (event: PluginEvent) => Promise<void>,
  ): void;
  subscribe(
    eventPattern: PluginEventType | `plugin.${string}`,
    filter: EventFilter,
    fn: (event: PluginEvent) => Promise<void>,
  ): void;

  /**
   * Emitir un evento con namespace de plugin. El bus antepone
   * automáticamente `plugin.<pluginId>.` al `name`, así pasar `"sync-done"`
   * desde el plugin `"acme.linear"` produce el tipo de evento
   * `"plugin.acme.linear.sync-done"`.
   *
   * @param name  Nombre de evento simple (p. ej. `"sync-done"`). Debe ser no
   *   vacío y no debe incluir el prefijo `plugin.` — el bus lo agrega
   *   automáticamente.
   * @param companyId  UUID de la empresa a la que pertenece este evento.
   * @param payload  Datos arbitrarios serializables en JSON para adjuntar al
   *   evento.
   *
   * @throws {Error} si `name` está vacío o solo tiene espacios.
   * @throws {Error} si `name` empieza con `"plugin."` (protección contra
   *   suplantación de namespace).
   */
  emit(name: string, companyId: string, payload: unknown): Promise<PluginEventBusEmitResult>;

  /**
   * Elimina todas las suscripciones registradas por este plugin.
   */
  clear(): void;
}
