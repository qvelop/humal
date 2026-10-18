interface HumalWebAPI {
  readonly document: Document;
  readonly localstorage: Storage;
  readonly sessionstorage: Storage;
  readonly indexeddb: IDBFactory;
  readonly websocket: typeof WebSocket;
  readonly textencoder: typeof TextEncoder;
  readonly urlsearchparams: typeof URLSearchParams;
  readonly abortcontroller: typeof AbortController;
  readonly intersectionobserver: typeof IntersectionObserver;
  readonly mutationobserver: typeof MutationObserver;
  readonly resizeobserver: typeof ResizeObserver;
  readonly sharedworker: typeof SharedWorker;
  readonly broadcastchannel: typeof BroadcastChannel;
  readonly textdecoder: typeof TextDecoder;
  readonly formdata: typeof FormData;
  readonly filereader: typeof FileReader;

  readonly window: Window & {
    __humalWeb?: HumalWebAPI;

    __humalApiAsyncProbe?: () => Promise<{
      status: number;
      ok: boolean;
      bodyLength: number;
    }>;
  };

  element(target: string | Element): Element;

  text(target: string | Element, value: unknown): void;

  value(target: string | Element): string;
  value(target: string | Element, nextValue: unknown): string;

  button(target: string | Element): {
    onClick(callback: (event: MouseEvent) => void): unknown;
    text(value: unknown): unknown;
    disable(flag?: boolean): unknown;
  };

  on(
    target: string | Element,
    event: string,
    callback: EventListener,
    options?: boolean | AddEventListenerOptions
  ): Element;

  off(
    target: string | Element,
    event: string,
    callback: EventListener,
    options?: boolean | EventListenerOptions
  ): Element;

  ready(callback: () => void): void;

  alert(message: unknown): void;

  readonly fetch: typeof fetch;
}

declare const web: HumalWebAPI;