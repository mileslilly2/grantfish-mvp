export default function Home() {
  return (
    <main className="p-10">
      <h1 className="text-3xl font-bold">GrantFish</h1>
      <p className="mt-2 text-gray-600">
        AI agent that discovers and ranks grant opportunities for nonprofits.
      </p>

      <a
        href="/discover"
        className="inline-block mt-6 bg-black text-white px-4 py-2 rounded"
      >
        Discover Grants
      </a>
    </main>
  );
}