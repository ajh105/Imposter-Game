export type RoomStatus =
  | "lobby"
  | "revealing"
  | "playing";

export interface Player {
  id: string;
  name: string;
  isHost: boolean;
  isReady: boolean;
}

export interface Room {
  id: string;
  code: string;
  status: RoomStatus;
  category?: string;
}

export interface Round {
  id: string;
  roomId: string;
  word: string;
  imposterPlayerId: string;
}