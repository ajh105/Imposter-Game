import type { StoredRoom, StoredPlayer } from "@/lib/game";

const ROOM_PREFIX = "imposter-room:";
const PLAYER_PREFIX = "imposter-player:";

export function getRoomStorageKey(code: string) {
  return `${ROOM_PREFIX}${code.toUpperCase()}`;
}

export function getPlayerStorageKey(code: string) {
  return `${PLAYER_PREFIX}${code.toUpperCase()}`;
}

export function saveRoom(room: StoredRoom) {
  localStorage.setItem(getRoomStorageKey(room.code), JSON.stringify(room));
}

export function loadRoom(code: string): StoredRoom | null {
  const raw = localStorage.getItem(getRoomStorageKey(code));

  if (!raw) {
    return null;
  }

  try {
    return JSON.parse(raw) as StoredRoom;
  } catch {
    return null;
  }
}

export function saveLocalPlayer(code: string, player: StoredPlayer) {
  sessionStorage.setItem(getPlayerStorageKey(code), JSON.stringify(player));
}

export function loadLocalPlayer(code: string): StoredPlayer | null {
  const raw = sessionStorage.getItem(getPlayerStorageKey(code));

  if (!raw) {
    return null;
  }

  try {
    return JSON.parse(raw) as StoredPlayer;
  } catch {
    return null;
  }
}

export function clearLocalPlayer(code: string) {
  sessionStorage.removeItem(getPlayerStorageKey(code));
}