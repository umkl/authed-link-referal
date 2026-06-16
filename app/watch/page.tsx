"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

const credentialsStorageKey = "authed-link-credentials";

type StoredCredentials = {
  email: string;
  password: string;
};

function getAuthorizationHeader(credentials: StoredCredentials | null) {
  if (!credentials?.email || !credentials.password) {
    return "";
  }

  return `Basic ${window.btoa(`${credentials.email}:${credentials.password}`)}`;
}

async function getResponseErrorMessage(response: Response) {
  const source = response.headers.get("x-file-proxy-source");

  if (source === "proxy") {
    try {
      const body = (await response.json()) as { error?: string };
      return body.error ?? `Proxy request failed with ${response.status}`;
    } catch {
      return `Proxy request failed with ${response.status}`;
    }
  }

  if (response.status === 403) {
    return "Upstream returned 403. Check nginx permissions/autoindex for this path.";
  }

  return `Request failed with ${response.status}`;
}

async function readBlobWithProgress(
  response: Response,
  setProgress: (progress: number | null) => void,
  setDownloadedBytes: (downloadedBytes: number) => void,
) {
  const contentLength = Number(response.headers.get("content-length") ?? 0);
  const contentType = response.headers.get("content-type") ?? "video/mp4";

  if (!response.body) {
    setProgress(null);
    return response.blob();
  }

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let receivedLength = 0;

  while (true) {
    const { done, value } = await reader.read();

    if (done) {
      break;
    }

    chunks.push(value);
    receivedLength += value.length;
    setDownloadedBytes(receivedLength);
    setProgress(
      contentLength ? Math.round((receivedLength / contentLength) * 100) : null,
    );
  }

  return new Blob(chunks as any, { type: contentType });
}

export default function WatchPage() {
  const router = useRouter();
  const [name, setName] = useState("Video");
  const [videoUrl, setVideoUrl] = useState("");
  const [status, setStatus] = useState("Downloading video.");
  const [isLoading, setIsLoading] = useState(true);
  const [progress, setProgress] = useState<number | null>(null);
  const [downloadedBytes, setDownloadedBytes] = useState(0);

  useEffect(() => {
    let objectUrl = "";
    const abortController = new AbortController();
    const params = new URLSearchParams(window.location.search);
    const path = params.get("path");
    const nextName = params.get("name") ?? "Video";
    const storedCredentials = window.localStorage.getItem(credentialsStorageKey);

    setName(nextName);

    if (!storedCredentials) {
      router.replace("/login");
      return;
    }

    if (!path) {
      setStatus("Missing video path.");
      setIsLoading(false);
      return;
    }

    async function loadVideo() {
      try {
        setDownloadedBytes(0);
        setProgress(null);
        const credentials = JSON.parse(storedCredentials as any) as StoredCredentials;
        const response = await fetch(
          `/api/files?path=${encodeURIComponent(path as string)}`,
          {
            headers: {
              Authorization: getAuthorizationHeader(credentials),
            },
            signal: abortController.signal,
          },
        );

        if (response.status === 401) {
          window.localStorage.removeItem(credentialsStorageKey);
          router.replace("/login");
          return;
        }

        if (!response.ok) {
          throw new Error(await getResponseErrorMessage(response));
        }

        const blob = await readBlobWithProgress(
          response,
          setProgress,
          setDownloadedBytes,
        );
        objectUrl = window.URL.createObjectURL(blob);
        setVideoUrl(objectUrl);
        setStatus("Ready.");
      } catch (error) {
        if (abortController.signal.aborted) {
          return;
        }

        setStatus(error instanceof Error ? error.message : "Video failed.");
      } finally {
        setIsLoading(false);
      }
    }

    loadVideo();

    return () => {
      abortController.abort();

      if (objectUrl) {
        window.URL.revokeObjectURL(objectUrl);
      }
    };
  }, [router]);

  const downloadedMegabytes = (downloadedBytes / 1024 / 1024).toFixed(1);
  const progressLabel =
    progress === null
      ? `Downloading video. ${downloadedMegabytes} MB`
      : `Downloading video. ${progress}%`;

  return (
    <main className="min-h-screen bg-neutral-950 px-4 py-6 text-neutral-100 sm:px-6">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-5">
        <header className="flex flex-col gap-4 border-b border-neutral-800 pb-5 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-sm font-medium text-cyan-300">Watch</p>
            <h1 className="mt-2 truncate text-3xl font-semibold tracking-normal">
              {name}
            </h1>
          </div>

          <Link
            href="/"
            className="inline-flex h-10 items-center justify-center rounded-md border border-neutral-700 px-4 text-sm font-medium transition hover:border-cyan-300"
          >
            Files
          </Link>
        </header>

        {videoUrl ? (
          <video
            src={videoUrl}
            className="aspect-video w-full rounded-lg bg-black"
            controls
            autoPlay
          />
        ) : isLoading ? (
          <div className="flex aspect-video w-full flex-col items-center justify-center gap-4 rounded-lg border border-neutral-800 bg-black px-5 text-center">
            <div className="h-10 w-10 animate-spin rounded-full border-2 border-neutral-700 border-t-cyan-400" />
            <div className="flex w-full max-w-md flex-col gap-3">
              <p className="text-sm font-medium text-neutral-200">
                {progressLabel}
              </p>
              <div className="h-2 overflow-hidden rounded-full bg-neutral-800">
                <div
                  className={
                    progress === null
                      ? "h-full w-1/3 animate-pulse rounded-full bg-cyan-400"
                      : "h-full rounded-full bg-cyan-400 transition-all"
                  }
                  style={
                    progress === null ? undefined : { width: `${progress}%` }
                  }
                />
              </div>
            </div>
          </div>
        ) : (
          <div className="rounded-lg border border-neutral-800 bg-neutral-900 px-4 py-16 text-center text-sm text-neutral-400">
            {status}
          </div>
        )}
      </div>
    </main>
  );
}
