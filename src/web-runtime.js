'use strict';
function requireBrowser() {
  if (typeof window === 'undefined') {
    throw new Error('web: available only in the browser');
  }
  return window;
}

function resolveNode(target) {
  const win = requireBrowser();
  const node = typeof target === 'string'
    ? win.document.querySelector(target)
    : target;

  if (!node) {
    throw new Error('web: element not found: ' + String(target));
  }
  return node;
}

const browserapi = {
  localstorage: 'localStorage',
  sessionstorage: 'sessionStorage',
  indexeddb: 'indexedDB',
  urlsearchparams: 'URLSearchParams',
  abortcontroller: 'AbortController',
  intersectionobserver: 'IntersectionObserver',
  mutationobserver: 'MutationObserver',
  resizeobserver: 'ResizeObserver',
  websocket: 'WebSocket',
  sharedworker: 'SharedWorker',
  broadcastchannel: 'BroadcastChannel',
  textencoder: 'TextEncoder',
  textdecoder: 'TextDecoder',
  formdata: 'FormData',
  filereader: 'FileReader'
};

const boundMethods = new WeakMap();
const ctorCache = new WeakMap();

function looksLikeConstructor(fn) {
  if (ctorCache.has(fn)) return ctorCache.get(fn);

  let ok = false;
  try {
  
    Reflect.construct(function () {}, [], fn);
    ok = true;
  } catch {
    ok = false;
  }

  ctorCache.set(fn, ok);
  return ok;
}

function readWindowProp(prop) {
  const win = requireBrowser();

  if (prop === 'serviceworker') {
    return win.navigator.serviceWorker;
  }

  const name = typeof prop === 'string' && browserapi[prop] ? browserapi[prop] : prop;
  const val = Reflect.get(win, name, win);

  if (typeof val !== 'function' || looksLikeConstructor(val)) {
    return val;
  }

  let bound = boundMethods.get(val);
  if (!bound) {
    bound = val.bind(win);
    boundMethods.set(val, bound);
  }
  return bound;
}

const baseApi = {
  get document() {
    return requireBrowser().document;
  },

  get window() {
    return requireBrowser();
  },

  element(target) {
    return resolveNode(target);
  },

  text(target, value) {
    resolveNode(target).textContent = String(value);
  },

  value(target, nextValue) {
    const node = resolveNode(target);

    if (arguments.length === 1) {
      return node.value;
    }

    node.value = String(nextValue);
    return node.value;
  },

  on(target, event, callback, options) {
    if (typeof callback !== 'function') {
      throw new TypeError('web.on: need a callback');
    }

    const node = resolveNode(target);
    node.addEventListener(event, callback, options);
    return node;
  },

  off(target, event, callback, options) {
    const node = resolveNode(target);
    node.removeEventListener(event, callback, options);
    return node;
  },

  ready(callback) {
    if (typeof callback !== 'function') {
      throw new TypeError('web.ready: need a callback');
    }

    const doc = requireBrowser().document;

    if (doc.readyState === 'loading') {
      doc.addEventListener('DOMContentLoaded', callback, { once: true });
    } else {
      callback();
    }
  },

  button(target) {
    const node = resolveNode(target);

    return {
      onClick(callback) {
        if (typeof callback !== 'function') {
          throw new TypeError('web.button.onClick: need a callback');
        }
        node.addEventListener('click', callback);
        return this;
      },

      text(value) {
        node.textContent = String(value);
        return this;
      },

      disable(flag = true) {
        node.disabled = Boolean(flag);
        return this;
      }
    };
  },

  alert(message) {
    requireBrowser().alert(String(message));
  }
};

const web = new Proxy(baseApi, {
  get(target, prop, receiver) {
    if (Reflect.has(target, prop)) {
      return Reflect.get(target, prop, receiver);
    }
    return readWindowProp(prop);
  },

  set(target, prop, value, receiver) {
    if (Reflect.has(target, prop)) {
      return Reflect.set(target, prop, value, receiver);
    }

    const win = requireBrowser();
    if (prop === 'serviceworker') {
      return Reflect.set(win.navigator, 'serviceWorker', value, win.navigator);
    }

    const name = typeof prop === 'string' && browserapi[prop] ? browserapi[prop] : prop;
    return Reflect.set(win, name, value, win);
  },

  has(target, prop) {
    if (Reflect.has(target, prop)) return true;

    const win = requireBrowser();

    if (prop === 'serviceworker') {
      return 'serviceWorker' in win.navigator;
    }

    const name = typeof prop === 'string' && browserapi[prop] ? browserapi[prop] : prop;
    return name in win;
  }
});

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { web };
}

if (typeof window !== 'undefined') {
  Object.defineProperty(window, 'web', {
    value: web,
    writable: true,
    configurable: true
  });
}