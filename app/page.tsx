import Link from "next/link";

export default function HomePage() {
  return (
    <main className="page-shell">
      <div className="panel p-10 text-center space-y-8">
        <h1 className="text-4xl font-bold">Imposter</h1>

        <div className="flex flex-col gap-4 max-w-sm mx-auto">
          <Link href="/join" className="button-primary w-full">
            Join Room
          </Link>

          <Link href="/join?host=true" className="button-secondary w-full">
            Create Room
          </Link>
        </div>
      </div>
    </main>
  );
}