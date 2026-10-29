import { Platform } from "react-native";

type MemoryStore = Record<string, string>;

const memoryStore: MemoryStore = {};

export const storage = {
  async getItem(key: string): Promise<string | null> {
    if (Platform.OS === "web" && typeof window !== "undefined") {
      return window.localStorage.getItem(key);
    }
    return memoryStore[key] ?? null;
  },
  async setItem(key: string, value: string): Promise<void> {
    if (Platform.OS === "web" && typeof window !== "undefined") {
      window.localStorage.setItem(key, value);
      return;
    }
    memoryStore[key] = value;
  },
  async removeItem(key: string): Promise<void> {
    if (Platform.OS === "web" && typeof window !== "undefined") {
      window.localStorage.removeItem(key);
      return;
    }
    delete memoryStore[key];
  },
};
