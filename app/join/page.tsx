"use client";

import { useSearchParams, useRouter } from "next/navigation";
import { useState } from "react";
import Link from "next/link";
import { validateName, validateRoomCode } from "@/lib/validation";
import { generateRoomCode } from "@/lib/room-code";
import { supabase } from "@/lib/supabase";
import { saveLocalPlayer } from "@/lib/storage";

export default function JoinPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const isHostMode = searchParams.get("host") === "true";

  const [name, setName] = useState("");
  const [roomCode, setRoomCode] = useState("");
  const [nameError, setNameError] = useState("");
  const [roomCodeError, setRoomCodeError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function createRoomInSupabase(playerName: string) {
    let code = "";
    let created = false;

    for (let attempt = 0; attempt < 5; attempt++) {
      const candidateCode = generateRoomCode();

      const { error } = await supabase.from("rooms").insert({
        code: candidateCode,
        category: "Food",
        phase: "lobby"
      });

      if (!error) {
        code = candidateCode;
        created = true;
        break;
      }
    }

    if (!created || !code) {
      throw new Error("Could not create room");
    }

    const { data: insertedPlayer, error: playerError } = await supabase
      .from("players")
      .insert({
        room_code: code,
        name: playerName,
        is_host: true,
        is_ready: false
      })
      .select()
      .single();

    if (playerError || !insertedPlayer) {
      throw new Error("Could not create host player");
    }

    saveLocalPlayer(code, {
      id: insertedPlayer.id,
      name: insertedPlayer.name,
      isHost: insertedPlayer.is_host,
      isReady: insertedPlayer.is_ready
    });

    router.push(`/room/${code}`);
  }

  async function joinRoomInSupabase(code: string, playerName: string) {
    const normalizedCode = code.trim().toUpperCase();

    const { data: existingRoom, error: roomLookupError } = await supabase
      .from("rooms")
      .select("code, phase")
      .eq("code", normalizedCode)
      .maybeSingle();

    if (roomLookupError) {
      throw new Error("Could not check room");
    }

    if (!existingRoom) {
      setRoomCodeError("Room not found");
      return;
    }

    if (existingRoom.phase !== "lobby") {
      setRoomCodeError("Room is already in a round");
      return;
    }

    const { data: existingPlayers, error: playerLookupError } = await supabase
      .from("players")
      .select("name")
      .eq("room_code", normalizedCode);

    if (playerLookupError) {
      throw new Error("Could not check existing players");
    }

    const duplicateName = existingPlayers?.some(
      (player) => player.name.trim().toLowerCase() === playerName.trim().toLowerCase()
    );

    if (duplicateName) {
      setNameError("That name is already taken in this room");
      return;
    }

    const { data: insertedPlayer, error: playerInsertError } = await supabase
      .from("players")
      .insert({
        room_code: normalizedCode,
        name: playerName,
        is_host: false,
        is_ready: false
      })
      .select()
      .single();

    if (playerInsertError || !insertedPlayer) {
      if (playerInsertError?.message?.toLowerCase().includes("duplicate")) {
        setNameError("That name is already taken in this room");
        return;
      }

      throw new Error("Could not join room");
    }

    saveLocalPlayer(normalizedCode, {
      id: insertedPlayer.id,
      name: insertedPlayer.name,
      isHost: insertedPlayer.is_host,
      isReady: insertedPlayer.is_ready
    });

    router.push(`/room/${normalizedCode}`);
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();

    if (isSubmitting) {
      return;
    }

    const nextNameError = validateName(name) ?? "";
    const nextRoomCodeError = isHostMode ? "" : (validateRoomCode(roomCode) ?? "");

    setNameError(nextNameError);
    setRoomCodeError(nextRoomCodeError);

    if (nextNameError || nextRoomCodeError) {
      return;
    }

    const trimmedName = name.trim();

    try {
      setIsSubmitting(true);

      if (isHostMode) {
        await createRoomInSupabase(trimmedName);
        return;
      }

      await joinRoomInSupabase(roomCode, trimmedName);
    } catch (error) {
      console.error(error);

      if (isHostMode) {
        setNameError("Could not create room. Please try again.");
      } else {
        setRoomCodeError("Could not join room. Please try again.");
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main className="page-shell">
      <div className="panel max-w-2xl p-8 md:p-10">
        <div className="mb-8">
          <Link href="/" className="helper-text hover:underline">
            ← Back
          </Link>
        </div>

        <div className="space-y-3 text-center mb-8">
          <h1 className="text-3xl md:text-4xl font-bold">
            {isHostMode ? "Create Room" : "Join Room"}
          </h1>

          <p className="helper-text">
            {isHostMode
              ? "Enter your name to create a new room."
              : "Enter your display name and room code to join your friends."}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="card p-6 md:p-8 space-y-6">
          <div>
            <label htmlFor="name" className="label">
              Display Name
            </label>

            <input
              id="name"
              type="text"
              maxLength={14}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Enter your name"
              className="input"
              disabled={isSubmitting}
            />

            <p className="helper-text mt-2">
              2-14 characters. Letters, numbers, spaces, and underscores only.
            </p>

            {nameError ? <p className="error-text mt-2">{nameError}</p> : null}
          </div>

          {!isHostMode && (
            <div>
              <label htmlFor="roomCode" className="label">
                Room Code
              </label>

              <input
                id="roomCode"
                type="text"
                maxLength={6}
                value={roomCode}
                onChange={(e) => setRoomCode(e.target.value.toUpperCase())}
                placeholder="Enter 6-character code"
                className="input uppercase tracking-widest"
                disabled={isSubmitting}
              />

              {roomCodeError ? (
                <p className="error-text mt-2">{roomCodeError}</p>
              ) : (
                <p className="helper-text mt-2">
                  Ask your host for the 6-character room code.
                </p>
              )}
            </div>
          )}

          <button type="submit" className="button-primary w-full" disabled={isSubmitting}>
            {isSubmitting
              ? isHostMode
                ? "Creating Room..."
                : "Joining Room..."
              : isHostMode
                ? "Create Room"
                : "Join Room"}
          </button>
        </form>
      </div>
    </main>
  );
}