# Imposter Game

A browser-based multiplayer party game inspired by games like **Among Us** and **Spyfall**.

Players join a room using a code, receive a secret word (except the imposters), and try to identify who doesn't belong.

---

## How the Game Works

1. One player creates a room.
2. Other players join using the room code.
3. The game randomly selects:
   - a **category**
   - a **secret word**
4. All players except the imposters see the word.
5. Players take turns describing the word without saying it directly.
6. Everyone votes for who they think the imposters are.

---

## Tech Stack

- **Next.js**
- **TypeScript**
- **Supabase** (database + realtime)
- **TailwindCSS**

---

## Local Setup

1. Install dependencies:
   npm install

2. Create a `.env.local` file with:
   NEXT_PUBLIC_SUPABASE_URL=...
   NEXT_PUBLIC_SUPABASE_ANON_KEY=...

4. Make sure your Supabase project includes the required tables:
   - rooms
   - players
   - rounds
   - votes
   - word_bank

5. Start the dev server:
   npm run dev

6. Open http://localhost:3000
