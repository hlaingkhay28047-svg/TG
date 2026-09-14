"use strict";
/* test/lib/free-identifiers.js — v6.89.0
   The static "X is not defined" finder.

   Why it exists: 6.88.1 removed a comparison against MODEL_PRO_IMG, a constant
   that had left panel/main.js with the Gemini engine in 6.26.0. Every Freeform
   GENERATE in Photoshop threw a ReferenceError on that line for more than
   thirty releases, and no test ever executed the real path. A ReferenceError
   is the one class of fault that is fully decidable without running anything:
   an identifier is either bound by a declaration in an enclosing scope, is a
   property of the host's global object, or it throws the moment the line
   runs. This module parses each script with acorn and resolves every
   identifier reference against the scopes the language actually creates.

   What it models (ES2024, sloppy or strict):
   - function scopes: params (any pattern, defaults visited), `arguments` for
     non-arrow functions, a named function expression's own name, `var` and
     function declarations hoisted from anywhere in the body (block-level
     functions are treated as function-scoped — the permissive web semantics,
     never a false positive);
   - block scopes: let / const / class declarations of a block, a switch's
     cases as one block, for / for-in / for-of heads, catch parameters, class
     bodies (a class's own name is visible inside it), static blocks;
   - what is NOT a reference: non-computed member properties and object /
     class keys, labels, `new.target` / `import.meta`, and the operand of a
     bare `typeof X` — the idiom the panel uses for feature guards, which is
     legal on an undeclared name.

   A branch guarded by a bare `typeof NAME` test (if / ?: / && / ||) may use
   NAME: the author has decided what happens when it is missing.

   scanScript(src, opts) returns { findings, topLevel, parseError } where a
   finding is { name, line, column, write } — write:true is an assignment to an
   undeclared name (an implicit global in sloppy code, a throw under
   "use strict", which every panel and server file declares).

   scanSurface(files, opts) treats a list of classic scripts as ONE global
   scope, as a browser does for <script> tags on the same page: every script's
   top-level declarations and every `window.X = ` / `globalThis.X = ` /
   `self.X = ` property assignment bind names for every other script. */

let acorn = null;
try { acorn = require("acorn"); } catch (e) { acorn = null; }

const ECMA = [
  "globalThis", "undefined", "NaN", "Infinity", "Object", "Function", "Array", "Number", "parseFloat", "parseInt", "Boolean",
  "String", "Symbol", "Date", "Promise", "RegExp", "Error", "AggregateError", "EvalError", "RangeError", "ReferenceError",
  "SyntaxError", "TypeError", "URIError", "JSON", "Math", "Intl", "ArrayBuffer", "SharedArrayBuffer", "Atomics", "Uint8Array",
  "Int8Array", "Uint16Array", "Int16Array", "Uint32Array", "Int32Array", "Float32Array", "Float64Array", "Uint8ClampedArray",
  "BigUint64Array", "BigInt64Array", "BigInt", "DataView", "Map", "BigInt", "Set", "WeakMap", "WeakSet", "WeakRef",
  "FinalizationRegistry", "Proxy", "Reflect", "decodeURI", "decodeURIComponent", "encodeURI", "encodeURIComponent",
  "escape", "unescape", "eval", "isFinite", "isNaN", "Iterator", "Float16Array"
];

const WEB_COMMON = [
  "console", "setTimeout", "clearTimeout", "setInterval", "clearInterval", "queueMicrotask", "structuredClone", "fetch",
  "Request", "Response", "Headers", "FormData", "Blob", "File", "FileReader", "FileList", "URL", "URLSearchParams", "TextEncoder",
  "TextDecoder", "crypto", "Crypto", "CryptoKey", "SubtleCrypto", "performance", "Performance", "AbortController",
  "AbortSignal", "atob", "btoa", "self", "Event", "EventTarget", "CustomEvent", "ErrorEvent", "PromiseRejectionEvent",
  "MessageChannel", "MessagePort", "MessageEvent", "BroadcastChannel", "ReadableStream", "WritableStream", "TransformStream",
  "CompressionStream", "DecompressionStream", "ImageData", "ImageBitmap", "createImageBitmap", "OffscreenCanvas",
  "OffscreenCanvasRenderingContext2D", "WebSocket", "reportError", "addEventListener", "removeEventListener", "dispatchEvent",
  "indexedDB", "IDBKeyRange", "caches", "CacheStorage", "Cache", "DOMException", "requestAnimationFrame", "cancelAnimationFrame",
  "navigator", "location", "origin", "isSecureContext", "Notification", "WebAssembly", "Worker", "SharedWorker", "postMessage"
];

const BROWSER = WEB_COMMON.concat([
  "window", "document", "history", "screen", "frames", "parent", "top", "opener", "localStorage", "sessionStorage", "alert",
  "confirm", "prompt", "matchMedia", "getComputedStyle", "getSelection", "devicePixelRatio", "innerWidth", "innerHeight",
  "outerWidth", "outerHeight", "scrollX", "scrollY", "pageXOffset", "pageYOffset", "scrollTo", "scrollBy", "scroll", "open",
  "close", "focus", "blur", "print", "stop", "visualViewport", "speechSynthesis", "SpeechSynthesisUtterance", "Image", "Audio",
  "Option", "Node", "NodeList", "NodeFilter", "Element", "HTMLElement", "HTMLCollection", "DocumentFragment", "Document",
  "Text", "Comment", "Range", "Selection", "DOMParser", "XMLSerializer", "XMLHttpRequest", "MutationObserver",
  "IntersectionObserver", "ResizeObserver", "PerformanceObserver", "ReportingObserver", "KeyboardEvent", "MouseEvent",
  "PointerEvent", "TouchEvent", "Touch", "WheelEvent", "FocusEvent", "InputEvent", "DragEvent", "ClipboardEvent",
  "ClipboardItem", "DataTransfer", "DataTransferItem", "AnimationEvent", "TransitionEvent", "UIEvent", "HashChangeEvent",
  "PopStateEvent", "PageTransitionEvent", "BeforeUnloadEvent", "StorageEvent", "SubmitEvent", "ToggleEvent",
  "HTMLCanvasElement", "CanvasRenderingContext2D", "CanvasGradient", "CanvasPattern", "Path2D", "DOMMatrix", "DOMPoint",
  "DOMRect", "DOMRectReadOnly", "WebGLRenderingContext", "WebGL2RenderingContext", "WebGLTexture", "WebGLProgram",
  "WebGLShader", "WebGLBuffer", "WebGLFramebuffer", "HTMLVideoElement", "HTMLImageElement", "HTMLInputElement",
  "HTMLTextAreaElement", "HTMLSelectElement", "HTMLButtonElement", "HTMLAnchorElement", "HTMLDialogElement",
  "HTMLTemplateElement", "HTMLMediaElement", "HTMLAudioElement", "HTMLIFrameElement", "HTMLFormElement", "HTMLLabelElement",
  "HTMLScriptElement", "HTMLStyleElement", "HTMLLinkElement", "HTMLSlotElement", "SVGElement", "SVGSVGElement",
  "ShadowRoot", "CSS", "CSSStyleSheet", "CSSStyleDeclaration", "StyleSheet", "customElements", "MediaSource",
  "MediaRecorder", "MediaStream", "MediaStreamTrack", "AudioContext", "webkitAudioContext", "OscillatorNode", "GainNode",
  "AudioBuffer", "ServiceWorkerRegistration", "ServiceWorker", "PushManager", "Permissions", "Clipboard", "Geolocation",
  "IdleDeadline", "requestIdleCallback", "cancelIdleCallback", "FontFace", "FontFaceSet", "TrustedTypes", "trustedTypes",
  "webkitRequestAnimationFrame", "webkitURL", "onerror", "onunhandledrejection", "onload", "onresize", "onscroll",
  "onbeforeunload", "onpopstate", "onhashchange", "onvisibilitychange", "ontouchstart", "onpointerdown", "PublicKeyCredential",
  "scheduler", "Scheduler", "TaskController", "launchQueue", "BarcodeDetector", "PaymentRequest", "screenX", "screenY",
  "screenLeft", "screenTop", "status", "name", "length", "closed", "external", "chrome", "ScreenOrientation",
  "AnimationTimeline", "Animation", "KeyframeEffect", "ViewTransition", "CSSStyleValue", "HTMLOptionElement", "HTMLLIElement",
  "HTMLUListElement", "HTMLDivElement", "HTMLSpanElement", "HTMLParagraphElement", "HTMLHeadingElement", "HTMLTableElement",
  "HTMLSourceElement", "HTMLPictureElement", "HTMLProgressElement", "HTMLMeterElement", "HTMLOutputElement",
  "HTMLFieldSetElement", "HTMLLegendElement", "HTMLDetailsElement", "HTMLSummaryElement", "HTMLTimeElement", "HTMLDataElement",
  "HTMLBRElement", "HTMLHRElement", "HTMLPreElement", "HTMLQuoteElement", "HTMLOListElement", "HTMLDListElement",
  "HTMLEmbedElement", "HTMLObjectElement", "HTMLAreaElement", "HTMLMapElement", "HTMLTrackElement", "HTMLBaseElement",
  "HTMLHeadElement", "HTMLBodyElement", "HTMLHtmlElement", "HTMLTitleElement", "HTMLMetaElement", "HTMLUnknownElement",
  "CharacterData", "ProcessingInstruction", "DocumentType", "Attr", "NamedNodeMap", "DOMTokenList", "DOMStringList",
  "DOMStringMap", "TreeWalker", "NodeIterator", "XPathEvaluator", "XPathResult", "FormDataEvent", "MediaQueryList",
  "MediaQueryListEvent", "Screen", "History", "Location", "Navigator", "Window", "Storage", "PerformanceEntry",
  "PerformanceMark", "PerformanceMeasure", "PerformanceNavigationTiming", "PerformanceResourceTiming", "TextMetrics",
  "TextTrack", "TimeRanges", "VideoFrame", "VideoPlaybackQuality", "MediaError", "MediaCapabilities", "MediaDevices",
  "MediaMetadata", "MediaSession", "WakeLock", "WakeLockSentinel", "Gamepad", "GamepadEvent", "DeviceMotionEvent",
  "DeviceOrientationEvent", "Sanitizer", "Highlight", "HighlightRegistry", "NavigateEvent", "Navigation",
  "NavigationHistoryEntry", "navigation", "cookieStore", "CookieStore", "CookieChangeEvent", "showOpenFilePicker",
  "showSaveFilePicker", "showDirectoryPicker", "FileSystemHandle", "FileSystemFileHandle", "FileSystemDirectoryHandle",
  "FileSystemWritableFileStream", "URLPattern", "CSSKeyframesRule", "CSSRule", "CSSRuleList", "CSSMediaRule",
  "CSSSupportsRule", "CSSImportRule", "CSSStyleRule", "CSSFontFaceRule", "CSSPageRule", "CSSNamespaceRule",
  "CSSKeyframeRule", "CSSLayerBlockRule", "CSSLayerStatementRule", "CSSContainerRule", "CSSPropertyRule",
  "CSSScopeRule", "CSSStartingStyleRule", "CSSNestedDeclarations", "CSSFontFeatureValuesRule", "CSSFontPaletteValuesRule",
  "CSSPositionTryRule", "CSSViewTransitionRule", "CSSCounterStyleRule", "CSSGroupingRule", "CSSConditionRule",
  "CSSTransition", "CSSAnimation", "CSSUnitValue", "CSSNumericValue", "CSSKeywordValue", "CSSMathSum", "CSSTransformValue",
  "CSSImageValue", "CSSPositionValue", "CSSUnparsedValue", "CSSVariableReferenceValue", "StylePropertyMap",
  "StylePropertyMapReadOnly", "CSSMatrixComponent", "CSSPerspective", "CSSRotate", "CSSScale", "CSSSkew", "CSSSkewX",
  "CSSSkewY", "CSSTranslate", "CSSTransformComponent"
]);

const WORKER = WEB_COMMON.concat([
  "clients", "Clients", "Client", "WindowClient", "registration", "skipWaiting", "importScripts", "ExtendableEvent", "FetchEvent",
  "InstallEvent", "ExtendableMessageEvent", "PushEvent", "PushMessageData", "NotificationEvent", "SyncEvent", "ServiceWorkerGlobalScope",
  "WorkerGlobalScope", "WorkerNavigator", "WorkerLocation", "onfetch", "oninstall", "onactivate", "onmessage", "onpush", "onsync",
  "onnotificationclick", "serviceWorker", "cookieStore", "CookieStore", "PeriodicSyncEvent", "BackgroundFetchEvent",
  "ContentIndexEvent", "PaymentRequestEvent", "CanMakePaymentEvent", "FetchEvent", "NavigationPreloadManager", "Notification"
]);

const NODE = [
  "require", "module", "exports", "__dirname", "__filename", "process", "Buffer", "global", "setImmediate", "clearImmediate",
  "console", "setTimeout", "clearTimeout", "setInterval", "clearInterval", "queueMicrotask", "structuredClone", "fetch",
  "Request", "Response", "Headers", "FormData", "Blob", "File", "URL", "URLSearchParams", "TextEncoder", "TextDecoder", "crypto",
  "performance", "AbortController", "AbortSignal", "atob", "btoa", "Event", "EventTarget", "CustomEvent", "MessageChannel",
  "MessagePort", "MessageEvent", "BroadcastChannel", "ReadableStream", "WritableStream", "TransformStream", "CompressionStream",
  "DecompressionStream", "WebSocket", "DOMException", "WebAssembly", "navigator", "Navigator", "Performance", "PerformanceObserver",
  "PerformanceEntry", "PerformanceMark", "PerformanceMeasure", "Crypto", "CryptoKey", "SubtleCrypto", "Worker"
];

/* The UXP host (Photoshop) exposes CommonJS require to classic scripts. */
const UXP = ["require", "module", "exports"];

class Scope {
  constructor(parent, fn) { this.parent = parent; this.fn = !!fn; this.names = new Set(); }
  add(n) { this.names.add(n); }
  has(n) { let s = this; while (s) { if (s.names.has(n)) return true; s = s.parent; } return false; }
}

const SKIP_KEYS = new Set(["type", "start", "end", "loc", "range", "raw"]);

function patternNames(p, out) {
  if (!p) return out;
  switch (p.type) {
    case "Identifier": out.push(p.name); break;
    case "ObjectPattern": for (const pr of p.properties) patternNames(pr.type === "RestElement" ? pr.argument : pr.value, out); break;
    case "ArrayPattern": for (const el of p.elements) if (el) patternNames(el, out); break;
    case "RestElement": patternNames(p.argument, out); break;
    case "AssignmentPattern": patternNames(p.left, out); break;
    default: break; /* MemberExpression targets bind nothing */
  }
  return out;
}

function isFunctionNode(n) { return n.type === "FunctionDeclaration" || n.type === "FunctionExpression" || n.type === "ArrowFunctionExpression"; }

/* `var` and function declarations reachable from a function body without crossing into a nested function or class. */
function hoistVars(node, scope) {
  if (!node) return;
  if (Array.isArray(node)) { for (const n of node) hoistVars(n, scope); return; }
  if (typeof node.type !== "string") return;
  switch (node.type) {
    case "VariableDeclaration":
      if (node.kind === "var") for (const d of node.declarations) for (const n of patternNames(d.id, [])) scope.add(n);
      return;
    case "FunctionDeclaration": if (node.id) scope.add(node.id.name); return;
    case "FunctionExpression": case "ArrowFunctionExpression": case "ClassDeclaration": case "ClassExpression": return;
    default:
      for (const k of Object.keys(node)) { if (SKIP_KEYS.has(k)) continue; const v = node[k]; if (v && typeof v === "object") hoistVars(v, scope); }
  }
}

/* let / const / class (and function, harmlessly) declared directly in a statement list. */
function blockDecls(stmts, scope) {
  for (const st of stmts || []) {
    if (!st) continue;
    if (st.type === "VariableDeclaration" && st.kind !== "var") for (const d of st.declarations) for (const n of patternNames(d.id, [])) scope.add(n);
    else if (st.type === "ClassDeclaration" && st.id) scope.add(st.id.name);
    else if (st.type === "FunctionDeclaration" && st.id) scope.add(st.id.name);
  }
}

function makeScanner(globals, findings) {
  function ref(node, scope, write) {
    if (scope.has(node.name) || globals.has(node.name)) return;
    findings.push({ name: node.name, line: node.loc.start.line, column: node.loc.start.column + 1, write: !!write });
  }
  /* Defaults and computed keys inside a binding pattern are expressions evaluated in `scope`. */
  function patternDefaults(p, scope) {
    if (!p) return;
    switch (p.type) {
      case "ObjectPattern": for (const pr of p.properties) { if (pr.type === "RestElement") patternDefaults(pr.argument, scope); else { if (pr.computed) visit(pr.key, scope); patternDefaults(pr.value, scope); } } break;
      case "ArrayPattern": for (const el of p.elements) if (el) patternDefaults(el, scope); break;
      case "RestElement": patternDefaults(p.argument, scope); break;
      case "AssignmentPattern": patternDefaults(p.left, scope); visit(p.right, scope); break;
      case "MemberExpression": visit(p, scope); break;
      default: break;
    }
  }
  /* A destructuring ASSIGNMENT target (no declaration): identifiers are writes to existing bindings. */
  function patternTargets(p, scope) {
    if (!p) return;
    switch (p.type) {
      case "Identifier": ref(p, scope, true); break;
      case "ObjectPattern": for (const pr of p.properties) { if (pr.type === "RestElement") patternTargets(pr.argument, scope); else { if (pr.computed) visit(pr.key, scope); patternTargets(pr.value, scope); } } break;
      case "ArrayPattern": for (const el of p.elements) if (el) patternTargets(el, scope); break;
      case "RestElement": patternTargets(p.argument, scope); break;
      case "AssignmentPattern": patternTargets(p.left, scope); visit(p.right, scope); break;
      default: visit(p, scope); break;
    }
  }
  /* Names a test expression guards with a bare `typeof NAME` — the panel's feature-guard idiom. A branch under such a
     test may use NAME: the author has already decided what happens when it is missing. */
  function typeofNames(t, out) {
    if (!t) return out;
    if (t.type === "UnaryExpression" && t.operator === "typeof" && t.argument.type === "Identifier") { out.push(t.argument.name); return out; }
    if (t.type === "LogicalExpression" || t.type === "BinaryExpression") { typeofNames(t.left, out); typeofNames(t.right, out); }
    else if (t.type === "UnaryExpression") typeofNames(t.argument, out);
    else if (t.type === "ConditionalExpression") typeofNames(t.test, out);
    else if (t.type === "SequenceExpression") for (const e of t.expressions) typeofNames(e, out);
    else if (t.type === "ChainExpression") typeofNames(t.expression, out);
    return out;
  }
  function guarded(test, scope) {
    const names = typeofNames(test, []);
    if (!names.length) return scope;
    const s = new Scope(scope, false); for (const n of names) s.add(n); return s;
  }
  function children(node, scope) {
    for (const k of Object.keys(node)) {
      if (SKIP_KEYS.has(k)) continue;
      const v = node[k];
      if (!v || typeof v !== "object") continue;
      if (Array.isArray(v)) { for (const it of v) if (it && typeof it.type === "string") visit(it, scope); }
      else if (typeof v.type === "string") visit(v, scope);
    }
  }
  function fn(node, scope) {
    const s = new Scope(scope, true);
    if (node.type === "FunctionExpression" && node.id) s.add(node.id.name);
    if (node.type !== "ArrowFunctionExpression") s.add("arguments");
    for (const p of node.params) for (const n of patternNames(p, [])) s.add(n);
    if (node.body && node.body.type === "BlockStatement") { hoistVars(node.body.body, s); blockDecls(node.body.body, s); }
    for (const p of node.params) patternDefaults(p, s);
    if (node.body && node.body.type === "BlockStatement") { for (const st of node.body.body) visit(st, s); }
    else if (node.body) visit(node.body, s);
  }
  function visit(node, scope) {
    if (!node || typeof node.type !== "string") return;
    switch (node.type) {
      case "Program": { const s = new Scope(scope, true); hoistVars(node.body, s); blockDecls(node.body, s); for (const st of node.body) visit(st, s); break; }
      case "FunctionDeclaration": case "FunctionExpression": case "ArrowFunctionExpression": fn(node, scope); break;
      case "BlockStatement": { const s = new Scope(scope, false); blockDecls(node.body, s); for (const st of node.body) visit(st, s); break; }
      case "StaticBlock": { const s = new Scope(scope, true); hoistVars(node.body, s); blockDecls(node.body, s); for (const st of node.body) visit(st, s); break; }
      case "SwitchStatement": {
        visit(node.discriminant, scope);
        const s = new Scope(scope, false); const all = [];
        for (const c of node.cases) for (const st of c.consequent) all.push(st);
        blockDecls(all, s);
        for (const c of node.cases) { if (c.test) visit(c.test, s); for (const st of c.consequent) visit(st, s); }
        break;
      }
      case "ForStatement": {
        const s = new Scope(scope, false);
        if (node.init && node.init.type === "VariableDeclaration") blockDecls([node.init], s);
        if (node.init) visit(node.init, s); if (node.test) visit(node.test, s); if (node.update) visit(node.update, s);
        visit(node.body, s); break;
      }
      case "ForInStatement": case "ForOfStatement": {
        const s = new Scope(scope, false);
        if (node.left.type === "VariableDeclaration") { blockDecls([node.left], s); visit(node.left, s); }
        else patternTargets(node.left, s);
        visit(node.right, s); visit(node.body, s); break;
      }
      case "CatchClause": {
        const s = new Scope(scope, false);
        if (node.param) { for (const n of patternNames(node.param, [])) s.add(n); patternDefaults(node.param, s); }
        visit(node.body, s); break;
      }
      case "VariableDeclaration": for (const d of node.declarations) { patternDefaults(d.id, scope); if (d.init) visit(d.init, scope); } break;
      case "ClassDeclaration": case "ClassExpression": {
        const s = new Scope(scope, false); if (node.id) s.add(node.id.name);
        if (node.superClass) visit(node.superClass, s); visit(node.body, s); break;
      }
      case "MethodDefinition": case "PropertyDefinition": if (node.computed) visit(node.key, scope); if (node.value) visit(node.value, scope); break;
      case "Property": if (node.computed) visit(node.key, scope); visit(node.value, scope); break;
      case "MemberExpression": visit(node.object, scope); if (node.computed) visit(node.property, scope); break;
      case "LabeledStatement": visit(node.body, scope); break;
      case "BreakStatement": case "ContinueStatement": case "MetaProperty": case "PrivateIdentifier": case "Literal": case "TemplateElement":
      case "ThisExpression": case "Super": case "EmptyStatement": case "DebuggerStatement": break;
      case "UnaryExpression": if (node.operator === "typeof" && node.argument.type === "Identifier") break; visit(node.argument, scope); break;
      case "IfStatement": { visit(node.test, scope); const s = guarded(node.test, scope); visit(node.consequent, s); if (node.alternate) visit(node.alternate, s); break; }
      case "ConditionalExpression": { visit(node.test, scope); const s = guarded(node.test, scope); visit(node.consequent, s); visit(node.alternate, s); break; }
      case "LogicalExpression": { visit(node.left, scope); visit(node.right, guarded(node.left, scope)); break; }
      case "AssignmentExpression":
        if (node.left.type === "Identifier") ref(node.left, scope, true);
        else if (node.left.type === "ObjectPattern" || node.left.type === "ArrayPattern") patternTargets(node.left, scope);
        else visit(node.left, scope);
        visit(node.right, scope); break;
      case "UpdateExpression": if (node.argument.type === "Identifier") ref(node.argument, scope, true); else visit(node.argument, scope); break;
      case "Identifier": ref(node, scope, false); break;
      case "ImportDeclaration": case "ExportNamedDeclaration": case "ExportDefaultDeclaration": case "ExportAllDeclaration": children(node, scope); break;
      default: children(node, scope);
    }
  }
  return visit;
}

function topLevelNames(ast) {
  const s = new Scope(null, true);
  hoistVars(ast.body, s); blockDecls(ast.body, s);
  return s.names;
}

/* Names a script binds on the shared global object by property assignment. */
function assignedGlobals(src, out) {
  const re = /\b(?:window|globalThis|self)\s*\.\s*([A-Za-z_$][\w$]*)\s*=(?!=)/g; let m;
  while ((m = re.exec(src))) out.add(m[1]);
  return out;
}

function parseScript(src, kind) {
  if (!acorn) throw new Error("acorn is not installed — run: npm install acorn@8.18.0 (CI installs it beside Playwright)");
  return acorn.parse(src, {
    ecmaVersion: "latest", sourceType: "script", locations: true, allowHashBang: true,
    allowReturnOutsideFunction: kind === "cjs"
  });
}

/* Scan one script. kind: "script" (browser classic), "cjs" (Node / UXP module: require, module, exports, __dirname, __filename bound). */
function scanScript(src, opts) {
  const o = opts || {};
  const globals = new Set(o.globals || []);
  if (o.kind === "cjs") for (const n of ["require", "module", "exports", "__dirname", "__filename"]) globals.add(n);
  for (const n of o.extraDeclared || []) globals.add(n);
  let ast;
  try { ast = parseScript(src, o.kind || "script"); }
  catch (e) { return { findings: [], topLevel: new Set(), parseError: String(e && e.message || e) }; }
  const findings = [];
  makeScanner(globals, findings)(ast, null);
  return { findings, topLevel: topLevelNames(ast), parseError: null };
}

/* Extract inline classic <script> blocks from an HTML page: [{ code, line }] with the 1-based line of the code's first line. */
function inlineScripts(htmlIn) {
  /* An HTML comment may mention "<script>" in prose (the app's CSP note does); blank comments first, keeping every newline. */
  const html = String(htmlIn).replace(/<!--[\s\S]*?-->/g, m => m.replace(/[^\n]/g, " "));
  const out = []; const re = /<script\b([^>]*)>([\s\S]*?)<\/script>/gi; let m;
  while ((m = re.exec(html))) {
    const attrs = m[1] || "";
    if (/\bsrc\s*=/i.test(attrs)) continue;
    const t = (attrs.match(/\btype\s*=\s*["']?([^"'\s>]+)/i) || [])[1];
    if (t && !/^(text\/javascript|application\/javascript|module)$/i.test(t)) continue;
    const before = html.slice(0, m.index + m[0].indexOf(">") + 1);
    const line = before.split("\n").length; /* the code starts on the tag's line */
    out.push({ code: m[2], line, module: /^module$/i.test(t || "") });
  }
  return out;
}

/* Scan classic scripts that share one page's global scope.
   files: [{ name, code, line? }] — `line` offsets reported line numbers (inline blocks).
   opts.globals: host globals; opts.extraDeclared: names the test vouches for. */
function scanSurface(files, opts) {
  const o = opts || {};
  const shared = new Set(o.extraDeclared || []);
  const parsed = files.map(f => {
    let ast = null, parseError = null;
    try { ast = parseScript(f.code, "script"); } catch (e) { parseError = String(e && e.message || e); }
    if (ast) { for (const n of topLevelNames(ast)) shared.add(n); }
    assignedGlobals(f.code, shared);
    return { f, ast, parseError };
  });
  const findings = []; const parseErrors = [];
  for (const p of parsed) {
    if (!p.ast) { parseErrors.push({ file: p.f.name, error: p.parseError }); continue; }
    const local = [];
    makeScanner(new Set([...(o.globals || []), ...shared]), local)(p.ast, null);
    for (const x of local) findings.push({ file: p.f.name, name: x.name, line: x.line + (p.f.line ? p.f.line - 1 : 0), column: x.column, write: x.write });
  }
  return { findings, parseErrors, declared: shared };
}

module.exports = { ECMA, BROWSER, WORKER, NODE, UXP, scanScript, scanSurface, inlineScripts, assignedGlobals, available: !!acorn };
