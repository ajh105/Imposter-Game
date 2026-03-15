"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { CATEGORY_OPTIONS, MIN_PLAYERS, getRandomItem } from "@/lib/game";
import { supabase } from "@/lib/supabase";
import {
  clearLocalPlayer,
  loadLocalPlayer,
  saveLocalPlayer
} from "@/lib/storage";

type RoomRow = {
  code: string;
  category: string;
  phase: "lobby" | "reveal" | "waiting" | "voting" | "word_guess" | "results";
};

type PlayerRow = {
  id: string;
  room_code: string;
  name: string;
  is_host: boolean;
  is_ready: boolean;
};

type RoundRow = {
  room_code: string;
  category: string;
  word: string;
  imposter_player_id: string;
  imposter_guess: string | null;
  imposter_guessed_correctly: boolean | null;
};

type VoteRow = {
  id: string;
  room_code: string;
  voter_player_id: string;
  voted_for_player_id: string;
};

function getInitial(name: string) {
  return name.trim().charAt(0).toUpperCase() || "?";
}

export default function RoomPage() {
  const params = useParams();
  const router = useRouter();

  const roomCode =
    typeof params.code === "string" ? params.code.toUpperCase() : "ROOM";

  const [room, setRoom] = useState<RoomRow | null>(null);
  const [players, setPlayers] = useState<PlayerRow[]>([]);
  const [round, setRound] = useState<RoundRow | null>(null);
  const [localPlayer, setLocalPlayer] = useState<PlayerRow | null>(null);
  const [copied, setCopied] = useState(false);
  const [isBusy, setIsBusy] = useState(false);
  const [votes, setVotes] = useState<VoteRow[]>([]);
  const [selectedVoteTarget, setSelectedVoteTarget] = useState("");
  const [imposterGuess, setImposterGuess] = useState("");

  const fetchRoomState = useCallback(async () => {
    const storedPlayer = loadLocalPlayer(roomCode);

    if (!storedPlayer) {
      router.push("/join");
      return;
    }

    const [
      { data: roomData, error: roomError },
      { data: playerData, error: playerError },
      { data: roundData, error: roundError },
      { data: votesData, error: votesError }
    ] = await Promise.all([
      supabase
        .from("rooms")
        .select("code, category, phase")
        .eq("code", roomCode)
        .maybeSingle(),
      supabase
        .from("players")
        .select("id, room_code, name, is_host, is_ready")
        .eq("room_code", roomCode)
        .order("created_at", { ascending: true }),
      supabase
        .from("rounds")
        .select("room_code, category, word, imposter_player_id, imposter_guess, imposter_guessed_correctly")
        .eq("room_code", roomCode)
        .maybeSingle(),
      supabase
        .from("votes")
        .select("id, room_code, voter_player_id, voted_for_player_id")
        .eq("room_code", roomCode)
    ]);

    if (roomError || playerError || roundError || votesError || !roomData || !playerData) {
      clearLocalPlayer(roomCode);
      router.push("/join");
      return;
    }

    const currentPlayer = playerData.find((player) => player.id === storedPlayer.id);

    if (!currentPlayer) {
      clearLocalPlayer(roomCode);
      router.push("/join");
      return;
    }

    setRoom(roomData as RoomRow);
    setPlayers(playerData as PlayerRow[]);
    setRound((roundData as RoundRow | null) ?? null);
    setLocalPlayer(currentPlayer as PlayerRow);
    setVotes((votesData as VoteRow[]) ?? []);

    saveLocalPlayer(roomCode, {
      id: currentPlayer.id,
      name: currentPlayer.name,
      isHost: currentPlayer.is_host,
      isReady: currentPlayer.is_ready
    });
  }, [roomCode, router]);

  useEffect(() => {
    void fetchRoomState();

    const channel = supabase
      .channel(`room-${roomCode}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "rooms",
          filter: `code=eq.${roomCode}`
        },
        () => {
          void fetchRoomState();
        }
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "players",
          filter: `room_code=eq.${roomCode}`
        },
        () => {
          void fetchRoomState();
        }
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "rounds",
          filter: `room_code=eq.${roomCode}`
        },
        () => {
          void fetchRoomState();
        }
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "votes",
          filter: `room_code=eq.${roomCode}`
        },
        () => {
          void fetchRoomState();
        }
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [roomCode, fetchRoomState]);

  useEffect(() => {
    setSelectedVoteTarget("");
    setImposterGuess("");
  }, [room?.phase]);

  const isHost = localPlayer?.is_host ?? false;
  const readyCount = players.filter((player) => player.is_ready).length;
  const canHostStart = players.length >= MIN_PLAYERS;

  const localVote = votes.find((vote) => vote.voter_player_id === localPlayer?.id);

  function getVoteWinner() {
    const counts = new Map<string, number>();

    for (const vote of votes) {
      counts.set(
        vote.voted_for_player_id,
        (counts.get(vote.voted_for_player_id) ?? 0) + 1
      );
    }

    let winnerId = "";
    let maxVotes = 0;

    for (const [playerId, count] of counts.entries()) {
      if (count > maxVotes) {
        maxVotes = count;
        winnerId = playerId;
      }
    }

    return { winnerId, maxVotes };
  }

  const waitingMessage = useMemo(() => {
    if (!room || !localPlayer) {
      return "";
    }

    if (room.phase === "reveal") {
      return `${readyCount} of ${players.length} players ready`;
    }

    if (room.phase === "waiting") {
      return "Everyone is ready. Waiting for the host to continue.";
    }

    const playersNeeded = Math.max(0, MIN_PLAYERS - players.length);

    if (playersNeeded > 0) {
      return `Need ${playersNeeded} more ${playersNeeded === 1 ? "player" : "players"} to start`;
    }

    return isHost
      ? "You can start the round when everyone is ready"
      : "Waiting for the host to start the round";
  }, [room, localPlayer, readyCount, players.length, isHost]);

  async function handleCopyRoomCode() {
    try {
      await navigator.clipboard.writeText(roomCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      alert("Could not copy room code.");
    }
  }

  async function handleStartRound() {
    if (!room || !localPlayer || !isHost || !canHostStart || isBusy) {
      return;
    }

    try {
      setIsBusy(true);

      const availableCategories = CATEGORY_OPTIONS.filter(
        (category) => category !== "Random"
      );

      const resolvedCategory =
        room.category === "Random"
          ? getRandomItem(availableCategories)
          : room.category;

      const { data: words, error: wordsError } = await supabase
        .from("word_bank")
        .select("word")
        .eq("category", resolvedCategory)
        .eq("is_active", true);

      if (wordsError || !words || words.length === 0) {
        throw new Error("Could not find words for category");
      }

      const chosenWord = getRandomItem(words).word;
      const imposter = getRandomItem(players);

      const { error: resetReadyError } = await supabase
        .from("players")
        .update({ is_ready: false })
        .eq("room_code", room.code);

      if (resetReadyError) {
        throw resetReadyError;
      }

      const { error: deleteVotesError } = await supabase
        .from("votes")
        .delete()
        .eq("room_code", room.code);

      if (deleteVotesError) {
        throw deleteVotesError;
      }

      const { error: upsertRoundError } = await supabase
        .from("rounds")
        .upsert({
          room_code: room.code,
          category: resolvedCategory,
          word: chosenWord,
          imposter_player_id: imposter.id,
          imposter_guess: null,
          imposter_guessed_correctly: null
        });

      if (upsertRoundError) {
        throw upsertRoundError;
      }

      const { error: roomUpdateError } = await supabase
        .from("rooms")
        .update({ phase: "reveal" })
        .eq("code", room.code);

      if (roomUpdateError) {
        throw roomUpdateError;
      }

      await fetchRoomState();
    } catch (error) {
      console.error(error);
      alert("Could not start round.");
    } finally {
      setIsBusy(false);
    }
  }

  async function handleReady() {
    if (!room || !localPlayer || room.phase !== "reveal" || isBusy) {
      return;
    }

    const thisPlayer = players.find((player) => player.id === localPlayer.id);

    if (!thisPlayer || thisPlayer.is_ready) {
      return;
    }

    try {
      setIsBusy(true);

      const { error: readyError } = await supabase
        .from("players")
        .update({ is_ready: true })
        .eq("id", localPlayer.id);

      if (readyError) {
        throw readyError;
      }

      const { data: updatedPlayers, error: playersError } = await supabase
        .from("players")
        .select("id, room_code, name, is_host, is_ready")
        .eq("room_code", room.code);

      if (playersError || !updatedPlayers) {
        throw playersError;
      }

      const everyoneReady = updatedPlayers.every((player) => player.is_ready);

      if (everyoneReady) {
        const { error: roomUpdateError } = await supabase
          .from("rooms")
          .update({ phase: "waiting" })
          .eq("code", room.code);

        if (roomUpdateError) {
          throw roomUpdateError;
        }
      }

      await fetchRoomState();
    } catch (error) {
      console.error(error);
      alert("Could not mark ready.");
    } finally {
      setIsBusy(false);
    }
  }

  async function handleStartVoting() {
    if (!room || !isHost || isBusy) {
      return;
    }

    try {
      setIsBusy(true);

      const { error } = await supabase
        .from("rooms")
        .update({ phase: "voting" })
        .eq("code", room.code);

      if (error) {
        throw error;
      }

      await fetchRoomState();
    } catch (error) {
      console.error(error);
      alert("Could not start voting.");
    } finally {
      setIsBusy(false);
    }
  }

  async function handleVote() {
    if (!room || !localPlayer || !round || !selectedVoteTarget || isBusy) {
      return;
    }

    if (localVote) {
      return;
    }

    try {
      setIsBusy(true);

      const { error: insertVoteError } = await supabase
        .from("votes")
        .insert({
          room_code: room.code,
          voter_player_id: localPlayer.id,
          voted_for_player_id: selectedVoteTarget
        });

      if (insertVoteError) {
        throw insertVoteError;
      }

      const { data: updatedVotes, error: votesError } = await supabase
        .from("votes")
        .select("id, room_code, voter_player_id, voted_for_player_id")
        .eq("room_code", room.code);

      if (votesError || !updatedVotes) {
        throw votesError;
      }

      if (updatedVotes.length === players.length) {
        const counts = new Map<string, number>();

        for (const vote of updatedVotes) {
          counts.set(
            vote.voted_for_player_id,
            (counts.get(vote.voted_for_player_id) ?? 0) + 1
          );
        }

        let winnerId = "";
        let maxVotes = 0;

        for (const [playerId, count] of counts.entries()) {
          if (count > maxVotes) {
            maxVotes = count;
            winnerId = playerId;
          }
        }

        const majorityNeeded = Math.floor(players.length / 2) + 1;
        const groupCorrectlyIdentifiedImposter =
          winnerId === round.imposter_player_id && maxVotes >= majorityNeeded;

        const { error: phaseError } = await supabase
          .from("rooms")
          .update({
            phase: groupCorrectlyIdentifiedImposter ? "word_guess" : "results"
          })
          .eq("code", room.code);

        if (phaseError) {
          throw phaseError;
        }
      }

      await fetchRoomState();
    } catch (error) {
      console.error(error);
      alert("Could not submit vote.");
    } finally {
      setIsBusy(false);
    }
  }

  async function handleSubmitImposterGuess() {
    if (!room || !round || !localPlayer || isBusy) {
      return;
    }

    if (localPlayer.id !== round.imposter_player_id) {
      return;
    }

    const trimmedGuess = imposterGuess.trim();

    if (!trimmedGuess) {
      return;
    }

    try {
      setIsBusy(true);

      const guessedCorrectly =
        trimmedGuess.toLowerCase() === round.word.trim().toLowerCase();

      const { error: updateRoundError } = await supabase
        .from("rounds")
        .update({
          imposter_guess: trimmedGuess,
          imposter_guessed_correctly: guessedCorrectly
        })
        .eq("room_code", room.code);

      if (updateRoundError) {
        throw updateRoundError;
      }

      const { error: phaseError } = await supabase
        .from("rooms")
        .update({ phase: "results" })
        .eq("code", room.code);

      if (phaseError) {
        throw phaseError;
      }

      await fetchRoomState();
    } catch (error) {
      console.error(error);
      alert("Could not submit guess.");
    } finally {
      setIsBusy(false);
    }
  }

  async function handleSkipImposterGuess() {
    if (!room || !isHost || isBusy) {
      return;
    }

    try {
      setIsBusy(true);

      const { error: updateRoundError } = await supabase
        .from("rounds")
        .update({
          imposter_guess: null,
          imposter_guessed_correctly: false
        })
        .eq("room_code", room.code);

      if (updateRoundError) {
        throw updateRoundError;
      }

      const { error: phaseError } = await supabase
        .from("rooms")
        .update({ phase: "results" })
        .eq("code", room.code);

      if (phaseError) {
        throw phaseError;
      }

      await fetchRoomState();
    } catch (error) {
      console.error("Could not skip imposter guess:", error);
      alert("Could not skip imposter guess.");
    } finally {
      setIsBusy(false);
    }
  }

  async function handleReturnToLobby() {
    if (!room || !isHost || isBusy) {
      return;
    }

    try {
      setIsBusy(true);

      const { error: deleteVotesError } = await supabase
        .from("votes")
        .delete()
        .eq("room_code", room.code);

      if (deleteVotesError) {
        throw deleteVotesError;
      }
      
      const { error: deleteRoundError } = await supabase
        .from("rounds")
        .delete()
        .eq("room_code", room.code);

      if (deleteRoundError) {
        throw deleteRoundError;
      }

      const { error: resetPlayersError } = await supabase
        .from("players")
        .update({ is_ready: false })
        .eq("room_code", room.code);

      if (resetPlayersError) {
        throw resetPlayersError;
      }

      const { error: roomUpdateError } = await supabase
        .from("rooms")
        .update({ phase: "lobby" })
        .eq("code", room.code);

      if (roomUpdateError) {
        throw roomUpdateError;
      }

      await fetchRoomState();
    } catch (error) {
      console.error(error);
      alert("Could not return to lobby.");
    } finally {
      setIsBusy(false);
    }
  }

  async function handleLeaveRoom() {
    if (!room || !localPlayer || isBusy) {
      router.push("/");
      return;
    }

    try {
      setIsBusy(true);

      const wasHost = localPlayer.is_host;
      const remainingPlayers = players.filter((player) => player.id !== localPlayer.id);
      const leavingDuringActivePhase = room.phase !== "lobby";

      if (leavingDuringActivePhase) {
        const { error: deleteVotesError } = await supabase
          .from("votes")
          .delete()
          .eq("room_code", room.code);

        if (deleteVotesError) {
          throw deleteVotesError;
        }

        const { error: deleteRoundError } = await supabase
          .from("rounds")
          .delete()
          .eq("room_code", room.code);

        if (deleteRoundError) {
          throw deleteRoundError;
        }
      }

      const { error: deletePlayerError } = await supabase
        .from("players")
        .delete()
        .eq("id", localPlayer.id);

      if (deletePlayerError) {
        throw deletePlayerError;
      }

      if (remainingPlayers.length === 0) {
        const { error: deleteRoomError } = await supabase
          .from("rooms")
          .delete()
          .eq("code", room.code);

        if (deleteRoomError) {
          throw deleteRoomError;
        }
      } else {
        if (wasHost) {
          const nextHost = remainingPlayers[0];

          const { error: promoteError } = await supabase
            .from("players")
            .update({ is_host: true })
            .eq("id", nextHost.id);

          if (promoteError) {
            throw promoteError;
          }
        }

        if (leavingDuringActivePhase) {
          const { error: resetPlayersError } = await supabase
            .from("players")
            .update({ is_ready: false })
            .eq("room_code", room.code);

          if (resetPlayersError) {
            throw resetPlayersError;
          }

          const { error: roomUpdateError } = await supabase
            .from("rooms")
            .update({ phase: "lobby" })
            .eq("code", room.code);

          if (roomUpdateError) {
            throw roomUpdateError;
          }
        }
      }

      clearLocalPlayer(room.code);
      router.push("/");
    } catch (error) {
      console.error("Could not leave room:", error);
      alert("Could not leave room.");
    } finally {
      setIsBusy(false);
    }
  }

  if (!room || !localPlayer) {
    return null;
  }

  if (room.phase === "reveal") {
    const isImposter = round?.imposter_player_id === localPlayer.id;
    const thisPlayer = players.find((player) => player.id === localPlayer.id);
    const alreadyReady = thisPlayer?.is_ready ?? false;

    return (
      <main className="page-shell">
        <div className="panel max-w-2xl p-8 md:p-10">
          <div className="mb-6">
            <button onClick={handleLeaveRoom} className="helper-text hover:underline">
              ← Leave Room
            </button>
          </div>

          <div className="card p-8 md:p-10 text-center space-y-6">
            <p className="text-sm uppercase tracking-[0.25em] text-slate-400">
              {round?.category}
            </p>

            {isImposter ? (
              <>
                <h1 className="text-4xl md:text-5xl font-bold text-rose-400">
                  You are the Imposter
                </h1>
                <p className="helper-text text-lg">
                  Blend in and figure out the secret word without giving yourself away.
                </p>
              </>
            ) : (
              <>
                <h1 className="text-4xl md:text-5xl font-bold">Your word is</h1>
                <div className="rounded-3xl border border-violet-500/30 bg-violet-500/10 px-6 py-8">
                  <p className="text-4xl md:text-5xl font-extrabold tracking-wide">
                    {round?.word}
                  </p>
                </div>
                <p className="helper-text text-lg">
                  Memorize it, then tap ready so the screen can be hidden.
                </p>
              </>
            )}

            <button
              onClick={handleReady}
              className="button-primary w-full"
              disabled={alreadyReady || isBusy}
            >
              {alreadyReady ? "Waiting for others..." : "Ready"}
            </button>

            <p className="helper-text">
              {readyCount} of {players.length} players ready
            </p>
          </div>
        </div>
      </main>
    );
  }

  if (room.phase === "waiting") {
    return (
      <main className="page-shell">
        <div className="panel max-w-2xl p-8 md:p-10">
          <div className="card p-8 md:p-10 text-center space-y-6">
            <h1 className="text-4xl font-bold">Waiting for everyone...</h1>
            <p className="helper-text text-lg">
              Everyone has seen their role. Continue when your group is ready.
            </p>

            {isHost ? (
              <div className="flex flex-col sm:flex-row gap-3 justify-center">
                <button onClick={handleReturnToLobby} className="button-secondary" disabled={isBusy}>
                  Return to Lobby
                </button>
                <button onClick={handleStartVoting} className="button-primary" disabled={isBusy}>
                  Start Voting
                </button>
              </div>
            ) : (
              <p className="helper-text">Only the host can continue.</p>
            )}
          </div>
        </div>
      </main>
    );
  }

  if (room.phase === "voting") {
    return (
      <main className="page-shell">
        <div className="panel max-w-3xl p-8 md:p-10">
          <div className="card p-8 md:p-10 space-y-6">
            <div className="text-center space-y-2">
              <h1 className="text-4xl font-bold">Vote for the Imposter</h1>
              <p className="helper-text">
                Select the player you think is the imposter, then confirm your vote.
              </p>
            </div>

            <div className="space-y-3">
              {players
                .filter((player) => player.id !== localPlayer.id)
                .map((player) => {
                const selected = selectedVoteTarget === player.id;

                return (
                  <button
                    key={player.id}
                    type="button"
                    onClick={() => setSelectedVoteTarget(player.id)}
                    disabled={!!localVote}
                    className={`w-full rounded-2xl border px-4 py-4 text-left transition ${
                      selected
                        ? "border-violet-500 bg-violet-500/10"
                        : "border-slate-700 bg-slate-900/40"
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div className="flex h-11 w-11 items-center justify-center rounded-full bg-violet-600 text-white font-bold">
                        {getInitial(player.name)}
                      </div>

                      <div>
                        <p className="font-semibold">{player.name}</p>
                        <p className="helper-text text-sm">
                          {player.is_host ? "Host" : "Player"}
                        </p>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>

            {localVote ? (
              <p className="helper-text text-center">
                Vote submitted. Waiting for everyone else...
              </p>
            ) : (
              <button
                onClick={handleVote}
                className="button-primary w-full"
                disabled={!selectedVoteTarget || isBusy}
              >
                Vote
              </button>
            )}

            <p className="helper-text text-center">
              {votes.length} of {players.length} votes submitted
            </p>
          </div>
        </div>
      </main>
    );
  }

  if (room.phase === "word_guess") {
    const imposter = players.find((player) => player.id === round?.imposter_player_id);
    const isImposter = round?.imposter_player_id === localPlayer.id;

    return (
      <main className="page-shell">
        <div className="panel max-w-3xl p-8 md:p-10">
          <div className="card p-8 md:p-10 space-y-6 text-center">
            <h1 className="text-4xl font-bold">Imposter Guess</h1>

            <div className="space-y-2">
              <p className="helper-text uppercase tracking-[0.2em]">Revealed Imposter</p>
              <p className="text-3xl font-bold text-rose-400">
                {imposter?.name ?? "Unknown"}
              </p>
            </div>

            {isImposter ? (
              <>
                <p className="helper-text text-lg">
                  You were identified as the imposter. You still have one chance to guess the secret word.
                </p>

                <input
                  type="text"
                  value={imposterGuess}
                  onChange={(e) => setImposterGuess(e.target.value)}
                  placeholder="Enter your guess"
                  className="input"
                  disabled={isBusy}
                />

                <button
                  onClick={handleSubmitImposterGuess}
                  className="button-primary w-full"
                  disabled={!imposterGuess.trim() || isBusy}
                >
                  Submit Guess
                </button>
              </>
            ) : (
              <>
                <p className="helper-text text-lg">
                  The imposter is making their final guess. Waiting...
                </p>

                {isHost ? (
                  <button
                    onClick={handleSkipImposterGuess}
                    className="button-secondary w-full"
                    disabled={isBusy}
                  >
                    Skip Imposter Guess
                  </button>
                ) : null}
              </>
            )}
          </div>
        </div>
      </main>
    );
  }

  if (room.phase === "results") {
    const imposter = players.find((player) => player.id === round?.imposter_player_id);
    const { winnerId, maxVotes } = getVoteWinner();
    const votedOutPlayer = players.find((player) => player.id === winnerId);
    const majorityNeeded = Math.floor(players.length / 2) + 1;
    const groupWasCorrect =
      winnerId === round?.imposter_player_id && maxVotes >= majorityNeeded;

    return (
      <main className="page-shell">
        <div className="panel max-w-3xl p-8 md:p-10">
          <div className="card p-8 md:p-10 text-center space-y-6">
            <h1 className="text-4xl font-bold">Results</h1>

            <div className="space-y-2">
              <p className="helper-text uppercase tracking-[0.2em]">Actual Imposter</p>
              <p className="text-3xl font-bold text-rose-400">
                {imposter?.name ?? "Unknown"}
              </p>
            </div>

            <div className="space-y-2">
              <p className="helper-text uppercase tracking-[0.2em]">Most Votes</p>
              <p className="text-2xl font-semibold">
                {votedOutPlayer?.name ?? "No one"}
              </p>
              <p className="helper-text">
                {maxVotes} vote{maxVotes === 1 ? "" : "s"}
              </p>
            </div>

            {groupWasCorrect ? (
              <div className="space-y-2">
                <p className={`text-xl font-semibold ${round?.imposter_guessed_correctly ? "text-rose-400" : "text-emerald-400"}`}>
                  {round?.imposter_guessed_correctly
                    ? "The imposter guessed the word and survived!"
                    : "The group found the imposter before they could guess the word!"}
                </p>
                <p className="helper-text">
                  Imposter's guess: {round?.imposter_guess ?? "No guess submitted"}
                </p>
              </div>
            ) : (
              <p className="text-xl font-semibold text-rose-400">
                The imposter got away!
              </p>
            )}

            <div className="space-y-2">
              <p className="helper-text uppercase tracking-[0.2em]">Secret Word</p>
              <p className="text-2xl font-bold">{round?.word}</p>
            </div>

            {isHost ? (
              <div className="flex flex-col sm:flex-row gap-3 justify-center">
                <button onClick={handleReturnToLobby} className="button-secondary" disabled={isBusy}>
                  Return to Lobby
                </button>
                <button onClick={handleStartRound} className="button-primary" disabled={isBusy}>
                  Play Again
                </button>
              </div>
            ) : (
              <p className="helper-text">Waiting for the host to continue.</p>
            )}
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="page-shell">
      <div className="panel max-w-5xl p-8 md:p-10 space-y-8">
        <div className="flex items-center justify-between gap-4">
          <button onClick={handleLeaveRoom} className="helper-text hover:underline">
            ← Leave Room
          </button>

          <div className="card px-4 py-2">
            <span className="helper-text">Room Code: </span>
            <span className="font-bold tracking-widest">{room.code}</span>
          </div>
        </div>

        <div className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
          <section className="card p-6 md:p-8 space-y-6">
            <div className="space-y-2">
              <h1 className="text-3xl md:text-4xl font-bold">Lobby</h1>
              <p className="helper-text">
                Share this room code with your friends and wait for everyone to join.
              </p>
            </div>

            <div className="card p-5 space-y-4">
              <div>
                <p className="text-sm uppercase tracking-[0.2em] text-slate-400">
                  Selected Category
                </p>
              </div>

              <div className="space-y-3">
                <label htmlFor="category" className="label mb-0">
                  Category
                </label>
                <select
                  id="category"
                  value={room.category}
                  onChange={async (e) => {
                    if (!isHost || isBusy) {
                      return;
                    }

                    try {
                      setIsBusy(true);

                      const { error } = await supabase
                        .from("rooms")
                        .update({ category: e.target.value })
                        .eq("code", room.code);

                      if (error) {
                        throw error;
                      }
                    } catch (error) {
                      console.error(error);
                      alert("Could not update category.");
                    } finally {
                      setIsBusy(false);
                    }
                  }}
                  className="input"
                  disabled={!isHost || isBusy}
                >
                  {CATEGORY_OPTIONS.map((category) => (
                    <option key={category} value={category}>
                      {category}
                    </option>
                  ))}
                </select>
              </div>

              <p className="helper-text">
                {isHost
                  ? "Choose a category before starting the round."
                  : "Only the host can change the category."}
              </p>
            </div>

            <div className="flex flex-col sm:flex-row gap-3">
              {isHost ? (
                <button
                  onClick={handleStartRound}
                  className="button-primary"
                  disabled={!canHostStart || isBusy}
                >
                  Start Round
                </button>
              ) : (
                <button className="button-secondary" disabled>
                  Waiting for Host
                </button>
              )}

              <button onClick={handleCopyRoomCode} className="button-secondary">
                {copied ? "Copied!" : "Copy Room Code"}
              </button>
            </div>

            <div className="helper-text">{waitingMessage}</div>
          </section>

          <aside className="card p-6 md:p-8 space-y-5">
            <div>
              <h2 className="text-2xl font-bold">Players</h2>
              <p className="helper-text mt-1">
                Anyone with the room code can join from another device now.
              </p>
            </div>

            <div className="space-y-3">
              {players.map((player) => (
                <div
                  key={player.id}
                  className="flex items-center rounded-2xl border border-slate-700 bg-slate-900/40 px-4 py-3"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="flex h-11 w-11 items-center justify-center rounded-full bg-violet-600 text-white font-bold">
                      {getInitial(player.name)}
                    </div>

                    <div className="min-w-0">
                      <p className="font-semibold truncate">{player.name}</p>
                      <p className="helper-text text-sm">
                        {player.is_host ? "Host" : "Player"}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </aside>
        </div>
      </div>
    </main>
  );
}