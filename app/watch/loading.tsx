export default function WatchLoading() {
  return (
    <main className="min-h-screen bg-neutral-950 px-4 py-6 text-neutral-100 sm:px-6">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-5">
        <header className="flex flex-col gap-4 border-b border-neutral-800 pb-5 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-sm font-medium text-cyan-300">Watch</p>
            <div className="mt-2 h-9 w-64 max-w-full animate-pulse rounded-md bg-neutral-800" />
          </div>
        </header>

        <div className="flex aspect-video w-full flex-col items-center justify-center gap-4 rounded-lg border border-neutral-800 bg-black px-5 text-center">
          <div className="h-10 w-10 animate-spin rounded-full border-2 border-neutral-700 border-t-cyan-400" />
          <div className="flex w-full max-w-md flex-col gap-3">
            <p className="text-sm font-medium text-neutral-200">
              Downloading video. 0.0 MB
            </p>
            <div className="h-2 overflow-hidden rounded-full bg-neutral-800">
              <div className="h-full w-1/3 animate-pulse rounded-full bg-cyan-400" />
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
