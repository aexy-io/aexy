import { create } from "zustand";

const CHAT_NAV_KEY = "chat_last_nav";

function loadLastNav(): { channelId: string | null; topicId: string | null; topicName: string | null; channelSlug: string | null } {
  if (typeof window === "undefined") return { channelId: null, topicId: null, topicName: null, channelSlug: null };
  try {
    const raw = localStorage.getItem(CHAT_NAV_KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  return { channelId: null, topicId: null, topicName: null, channelSlug: null };
}

function saveLastNav(channelId: string | null, topicId: string | null, topicName: string | null, channelSlug: string | null) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(CHAT_NAV_KEY, JSON.stringify({ channelId, topicId, topicName, channelSlug }));
  } catch {}
}

interface TypingUser {
  developer_id: string;
  developer_name: string;
  topic_id: string;
  channel_id: string;
  timestamp: number;
}

interface PresenceUser {
  developer_id: string;
  status: "online" | "away" | "offline";
  developer_name: string | null;
}

interface ChatStore {
  // Navigation
  activeChannelId: string | null;
  activeTopicId: string | null;
  lastTopicName: string | null;
  lastChannelSlug: string | null;
  setActiveChannel: (channelId: string | null, slug?: string | null) => void;
  setActiveTopic: (topicId: string | null, name?: string | null) => void;

  // Typing indicators
  typingUsers: TypingUser[];
  addTypingUser: (user: TypingUser) => void;
  removeTypingUser: (developerId: string, topicId: string) => void;
  clearStaleTyping: () => void;

  // Presence
  presenceMap: Record<string, PresenceUser>;
  updatePresence: (developerId: string, status: "online" | "away" | "offline", name?: string | null) => void;
  setPresenceBulk: (users: PresenceUser[]) => void;

  // Unread counts per channel
  unreadCounts: Record<string, number>;
  setUnreadCount: (channelId: string, count: number) => void;
  incrementUnread: (channelId: string) => void;
  clearUnread: (channelId: string) => void;
}

const TYPING_TIMEOUT_MS = 5000;

const savedNav = loadLastNav();

export const useChatStore = create<ChatStore>()((set, get) => ({
  activeChannelId: savedNav.channelId,
  activeTopicId: savedNav.topicId,
  lastTopicName: savedNav.topicName,
  lastChannelSlug: savedNav.channelSlug,
  setActiveChannel: (channelId, slug) => {
    const channelSlug = slug ?? null;
    set({ activeChannelId: channelId, activeTopicId: null, lastTopicName: null, lastChannelSlug: channelSlug });
    saveLastNav(channelId, null, null, channelSlug);
  },
  setActiveTopic: (topicId, name) => {
    const topicName = name ?? null;
    const state = get();
    set({ activeTopicId: topicId, lastTopicName: topicName });
    saveLastNav(state.activeChannelId, topicId, topicName, state.lastChannelSlug);
  },

  typingUsers: [],
  addTypingUser: (user) =>
    set((state) => {
      const filtered = state.typingUsers.filter(
        (u) => !(u.developer_id === user.developer_id && u.topic_id === user.topic_id)
      );
      return { typingUsers: [...filtered, { ...user, timestamp: Date.now() }] };
    }),
  removeTypingUser: (developerId, topicId) =>
    set((state) => ({
      typingUsers: state.typingUsers.filter(
        (u) => !(u.developer_id === developerId && u.topic_id === topicId)
      ),
    })),
  clearStaleTyping: () =>
    set((state) => ({
      typingUsers: state.typingUsers.filter(
        (u) => Date.now() - u.timestamp < TYPING_TIMEOUT_MS
      ),
    })),

  presenceMap: {},
  updatePresence: (developerId, status, name) =>
    set((state) => ({
      presenceMap: {
        ...state.presenceMap,
        [developerId]: { developer_id: developerId, status, developer_name: name ?? state.presenceMap[developerId]?.developer_name ?? null },
      },
    })),
  setPresenceBulk: (users) =>
    set({
      presenceMap: Object.fromEntries(
        users.map((u) => [u.developer_id, u])
      ),
    }),

  unreadCounts: {},
  setUnreadCount: (channelId, count) =>
    set((state) => ({
      unreadCounts: { ...state.unreadCounts, [channelId]: count },
    })),
  incrementUnread: (channelId) =>
    set((state) => ({
      unreadCounts: {
        ...state.unreadCounts,
        [channelId]: (state.unreadCounts[channelId] || 0) + 1,
      },
    })),
  clearUnread: (channelId) =>
    set((state) => ({
      unreadCounts: { ...state.unreadCounts, [channelId]: 0 },
    })),
}));
