import { isRecord, type DropReason, type FilteredPost, type Platform } from "../types.js";

const REASON_LABELS: Record<DropReason, string> = {
  sponsored: "sponsored",
  blocked: "your block list",
  "slop-list": "slop channel list",
  "comment-bait": "comment bait",
  "crypto-spam": "crypto spam",
  "short-drama": "short drama",
  "attention-trap": "attention trap",
  gossip: "gossip",
  "slop-cadence": "slop cadence",
  rehash: "rehash of something seen",
  remembered: "dropped before",
  "learned-creator": "creator usually dropped",
  ratio: "ratio'd",
  politics: "politics",
  sports: "sports",
  "pop-culture": "pop culture",
  "viral-bait": "viral clip / bait",
  llm: "llm grader",
};

const PLATFORMS: ReadonlySet<Platform> = new Set(["youtube", "x", "instagram", "tiktok"]);
const MAX_POSTS = 200;
const TOAST_MS = 4000;

const STYLE = `
:host { all: initial; }
.root {
  --bg: #ffffff;
  --fg: #000000;
  --muted: rgba(0, 0, 0, 0.56);
  --line: rgba(0, 0, 0, 0.16);
  --line-strong: rgba(0, 0, 0, 0.42);
  --surface: rgba(0, 0, 0, 0.04);
  position: fixed;
  right: 16px;
  bottom: 16px;
  z-index: 2147483646;
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 8px;
  color: var(--fg);
  font: 300 12px/1.45 ui-monospace, SFMono-Regular, Menlo, monospace;
  pointer-events: none;
}
@media (prefers-color-scheme: dark) {
  .root {
    --bg: hsl(228, 7%, 14%);
    --fg: hsl(225, 15%, 90%);
    --muted: hsla(225, 15%, 90%, 0.58);
    --line: hsla(225, 15%, 90%, 0.16);
    --line-strong: hsla(225, 15%, 90%, 0.44);
    --surface: hsla(225, 15%, 90%, 0.06);
  }
}
.root > * { pointer-events: auto; }
.box {
  background: var(--bg);
  border: 1.2px solid var(--line);
  box-shadow: 0 4px 18px rgba(0, 0, 0, 0.14);
}
button { font: inherit; color: inherit; background: none; border: 0; padding: 0; cursor: pointer; }
.pill { border-radius: 999px; padding: 6px 12px; }
.pill.pulse { animation: pulse 0.6s ease-out; }
@keyframes pulse { from { box-shadow: 0 0 0 4px var(--line-strong); } }
.toast {
  width: 320px;
  border-radius: 12px;
  padding: 8px 10px;
  text-align: left;
}
.panel {
  width: 360px;
  max-height: 60vh;
  display: flex;
  flex-direction: column;
  border-radius: 14px;
  overflow: hidden;
}
.head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 12px;
  border-bottom: 1px solid var(--line);
}
.list { overflow-y: auto; overscroll-behavior: contain; }
.item {
  display: block;
  padding: 8px 12px;
  color: inherit;
  text-decoration: none;
  border-bottom: 1px solid var(--line);
}
.item:last-child { border-bottom: 0; }
a.item:hover { background: var(--surface); }
.meta {
  display: flex;
  justify-content: space-between;
  gap: 8px;
  color: var(--muted);
  font-size: 10.5px;
}
.creator { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.reason {
  flex: none;
  border: 1px solid var(--line-strong);
  border-radius: 999px;
  padding: 0 6px;
}
.text {
  margin-top: 2px;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  overflow-wrap: anywhere;
}
.empty { padding: 12px; color: var(--muted); }
[hidden] { display: none !important; }
@media (prefers-reduced-motion: reduce) { .pill.pulse { animation: none; } }
`;

function isFilteredPost(v: unknown): v is FilteredPost {
  return (
    isRecord(v) &&
    typeof v.platform === "string" &&
    PLATFORMS.has(v.platform as Platform) &&
    typeof v.id === "string" &&
    typeof v.text === "string" &&
    typeof v.reason === "string" &&
    Object.hasOwn(REASON_LABELS, v.reason) &&
    typeof v.at === "number" &&
    (v.creator === undefined || typeof v.creator === "string") &&
    (v.url === undefined || typeof v.url === "string")
  );
}

export function readFilteredPosts(raw: unknown): FilteredPost[] {
  if (!isRecord(raw) || !Array.isArray(raw.posts)) return [];
  return raw.posts.filter(isFilteredPost);
}

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function renderPost(post: FilteredPost): HTMLElement {
  const isSafeLink = post.url?.startsWith("https://") === true;
  const item = isSafeLink ? el("a", "item") : el("div", "item");
  if (item instanceof HTMLAnchorElement && post.url) {
    item.href = post.url;
    item.target = "_blank";
    item.rel = "noopener noreferrer";
  }
  const meta = el("div", "meta");
  const creator = post.creator ? `${post.platform} · ${post.creator}` : post.platform;
  meta.append(el("span", "creator", creator), el("span", "reason", REASON_LABELS[post.reason]));
  item.append(meta, el("div", "text", post.text));
  return item;
}

export interface FilteredPanel {
  setVisible(visible: boolean): void;
  add(posts: FilteredPost[]): void;
}

export function createFilteredPanel(): FilteredPanel {
  const posts: FilteredPost[] = [];
  const seen = new Set<string>();
  let visible = false;
  let open = false;
  let toastTimer: ReturnType<typeof setTimeout> | undefined;

  const host = document.createElement("sieve-filtered");
  const shadow = host.attachShadow({ mode: "closed" });
  const style = document.createElement("style");
  style.textContent = STYLE;

  const root = el("div", "root");
  const panel = el("section", "box panel");
  const head = el("div", "head");
  const headTitle = el("span", "");
  const closeBtn = el("button", "", "close");
  closeBtn.type = "button";
  head.append(headTitle, closeBtn);
  const list = el("div", "list");
  panel.append(head, list);
  panel.hidden = true;

  const toast = el("button", "box toast");
  toast.type = "button";
  toast.hidden = true;

  const pill = el("button", "box pill");
  pill.type = "button";

  root.append(panel, toast, pill);
  shadow.append(style, root);

  function label(): string {
    return `sieve · ${posts.length} filtered`;
  }

  function renderList(): void {
    headTitle.textContent = `${posts.length} filtered on this tab`;
    if (posts.length === 0) {
      list.replaceChildren(el("div", "empty", "nothing filtered yet. keep scrolling."));
      return;
    }
    list.replaceChildren(...posts.map(renderPost).reverse());
  }

  function hideToast(): void {
    clearTimeout(toastTimer);
    toastTimer = undefined;
    toast.hidden = true;
  }

  function setOpen(next: boolean): void {
    open = next;
    panel.hidden = !open;
    if (open) {
      hideToast();
      renderList();
    }
  }

  function showToast(fresh: FilteredPost[]): void {
    const latest = fresh[fresh.length - 1];
    if (!latest) return;
    const more = fresh.length > 1 ? ` (+${fresh.length - 1} more)` : "";
    toast.replaceChildren(
      el("div", "meta", `filtered · ${REASON_LABELS[latest.reason]}${more}`),
      el("div", "text", latest.text),
    );
    toast.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(hideToast, TOAST_MS);
  }

  pill.addEventListener("click", () => setOpen(!open));
  closeBtn.addEventListener("click", () => setOpen(false));
  toast.addEventListener("click", () => setOpen(true));
  pill.textContent = label();

  function attach(): void {
    if (host.isConnected) return;
    const parent = document.documentElement;
    if (parent) {
      parent.appendChild(host);
    } else {
      document.addEventListener("DOMContentLoaded", attach, { once: true });
    }
  }

  return {
    setVisible(next) {
      visible = next;
      if (visible) {
        attach();
      } else {
        setOpen(false);
        hideToast();
        host.remove();
      }
    },
    add(incoming) {
      const fresh: FilteredPost[] = [];
      for (const post of incoming) {
        const key = `${post.platform}:${post.id}`;
        if (seen.has(key)) continue;
        seen.add(key);
        fresh.push(post);
      }
      if (fresh.length === 0) return;
      posts.push(...fresh);
      if (posts.length > MAX_POSTS) posts.splice(0, posts.length - MAX_POSTS);

      pill.textContent = label();
      if (!visible) return;
      if (open) {
        renderList();
      } else {
        showToast(fresh);
      }
      pill.classList.remove("pulse");
      void pill.offsetWidth;
      pill.classList.add("pulse");
    },
  };
}
