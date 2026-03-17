import Link from "next/link";

export default function Home() {
  return (
    <main className="min-h-screen bg-white px-6 py-10 text-black">
      <div className="mx-auto max-w-5xl space-y-16">
        <section className="rounded-2xl border px-6 py-12 sm:px-10">
          <div className="max-w-3xl space-y-6">
            <div className="text-sm font-medium uppercase tracking-[0.2em] text-gray-500">
              GrantHunter
            </div>
            <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">
              GrantHunter finds and ranks grant opportunities for nonprofits
              based on mission, geography, and eligibility.
            </h1>
            <p className="max-w-2xl text-lg text-gray-600">
              Stop manually digging through grant portals. GrantHunter scans
              sources, explains why a match fits, and saves ranked
              opportunities for your organization.
            </p>
            <div className="flex flex-wrap gap-3">
              <Link
                href="/discover"
                className="rounded-lg bg-black px-5 py-3 text-sm font-medium text-white"
              >
                Try GrantHunter
              </Link>
              <a
                href="mailto:your-email@example.com"
                className="rounded-lg border px-5 py-3 text-sm font-medium"
              >
                Book a Demo
              </a>
            </div>
          </div>
        </section>

        <section className="grid gap-6 md:grid-cols-[1.3fr_0.9fr]">
          <div className="rounded-2xl border p-6">
            <h2 className="text-xl font-semibold">How it works</h2>
            <ol className="mt-4 space-y-3 text-sm text-gray-700">
              <li>1. Add your organization profile</li>
              <li>2. Scan grant sources</li>
              <li>3. Review ranked opportunities</li>
              <li>4. Export or shortlist matches</li>
            </ol>
          </div>

          <div className="rounded-2xl border p-6">
            <h2 className="text-xl font-semibold">Who it&apos;s for</h2>
            <ul className="mt-4 space-y-3 text-sm text-gray-700">
              <li>Small nonprofits</li>
              <li>Grant writers</li>
              <li>Community organizations</li>
              <li>Nonprofit consultants</li>
            </ul>
          </div>
        </section>
      </div>
    </main>
  );
}
