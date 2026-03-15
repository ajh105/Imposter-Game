import { generateRoomCode } from "@/lib/room-code";

export type StoredPlayer = {
  id: string;
  name: string;
  isHost: boolean;
  isReady: boolean;
};

export type StoredRound = {
  category: string;
  word: string;
  imposterPlayerId: string;
};

export type StoredRoomPhase = "lobby" | "reveal" | "waiting";

export type StoredRoom = {
  code: string;
  category: string;
  phase: StoredRoomPhase;
  players: StoredPlayer[];
  round: StoredRound | null;
};

export const CATEGORY_OPTIONS = [
  "Random",
  "Everyday Life",
  "Entertainment",
  "Geography",
  "Technology",
  "Nature",
  "People & Jobs",
  "Food & Drink",
  "Fun & Games"
] as const;

export const MIN_PLAYERS = 3;

export function getRandomItem<T>(items: T[]): T {
  const array = new Uint32Array(1);
  crypto.getRandomValues(array);
  const index = array[0] % items.length;
  return items[index];
}

export function createPlayer(name: string, isHost: boolean): StoredPlayer {
  return {
    id: crypto.randomUUID(),
    name,
    isHost,
    isReady: false
  };
}

export function createRoom(hostName: string): {
  room: StoredRoom;
  hostPlayer: StoredPlayer;
} {
  const hostPlayer = createPlayer(hostName, true);

  const room: StoredRoom = {
    code: generateRoomCode(),
    category: "Random",
    phase: "lobby",
    players: [hostPlayer],
    round: null
  };

  return { room, hostPlayer };
}

export function canStartRound(room: StoredRoom): boolean {
  return room.players.length >= MIN_PLAYERS;
}

export function markPlayerReady(room: StoredRoom, playerId: string): StoredRoom {
  if (room.phase !== "reveal") {
    return room;
  }

  const updatedPlayers = room.players.map((player) =>
    player.id === playerId ? { ...player, isReady: true } : player
  );

  const everyoneReady = updatedPlayers.every((player) => player.isReady);

  return {
    ...room,
    phase: everyoneReady ? "waiting" : "reveal",
    players: updatedPlayers
  };
}

export function returnRoomToLobby(room: StoredRoom): StoredRoom {
  return {
    ...room,
    phase: "lobby",
    players: room.players.map((player) => ({
      ...player,
      isReady: false
    })),
    round: null
  };
}

export function countReadyPlayers(room: StoredRoom): number {
  return room.players.filter((player) => player.isReady).length;
}

export function getPlayerById(room: StoredRoom, playerId: string): StoredPlayer | undefined {
  return room.players.find((player) => player.id === playerId);
}