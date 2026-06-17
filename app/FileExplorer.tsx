"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

const endpoint = process.env.NEXT_PUBLIC_ENDPOINT ?? "";
const autoIndexPath = process.env.NEXT_PUBLIC_NGINX_AUTO_INDEX_PATH ?? "/";
const credentialsStorageKey = "authed-link-credentials";

type StoredCredentials = {
  email: string;
  password: string;
};

type FileEntry = {
  name: string;
  path: string;
  isDirectory: boolean;
};

function normalizeDirectoryPath(pathValue: string) {
  const withLeadingSlash = pathValue.startsWith("/")
    ? pathValue
    : `/${pathValue}`;
  return withLeadingSlash.endsWith("/")
    ? withLeadingSlash
    : `${withLeadingSlash}/`;
}

function joinPaths(basePath: string, href: string) {
  if (href.startsWith("/")) {
    return href;
  }

  const baseDirectory = normalizeDirectoryPath(basePath);
  return new URL(href, `https://local${baseDirectory}`).pathname;
}

function getAuthorizationHeader(credentials: StoredCredentials | null) {
  if (!credentials?.email || !credentials.password) {
    return "";
  }

  return `Basic ${window.btoa(`${credentials.email}:${credentials.password}`)}`;
}

function parseAutoIndex(html: string, currentPath: string) {
  const documentValue = new DOMParser().parseFromString(html, "text/html");
  const anchors = Array.from(documentValue.querySelectorAll("a"));

  return anchors
    .map((anchor) => {
      const href = anchor.getAttribute("href") ?? "";
      const name = anchor.textContent?.trim() || decodeURIComponent(href);

      if (!href || href === "../" || href.startsWith("?")) {
        return null;
      }

      const entryPath = joinPaths(currentPath, href);

      return {
        name: name.replace(/\/$/, ""),
        path: entryPath,
        isDirectory: href.endsWith("/"),
      };
    })
    .filter((entry): entry is FileEntry => Boolean(entry));
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

export default function FileExplorer() {
  const router = useRouter();
  const rootPath = useMemo(() => normalizeDirectoryPath(autoIndexPath), []);
  const [credentials, setCredentials] = useState<StoredCredentials | null>(null);
  const [currentPath, setCurrentPath] = useState(rootPath);
  const [entries, setEntries] = useState<FileEntry[]>([]);
  const [status, setStatus] = useState("Loading credentials.");
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    const storedCredentials = window.localStorage.getItem(credentialsStorageKey);

    if (!storedCredentials) {
      router.replace("/login");
      return;
    }

    try {
      setCredentials(JSON.parse(storedCredentials) as StoredCredentials);
    } catch {
      window.localStorage.removeItem(credentialsStorageKey);
      router.replace("/login");
    }
  }, [router]);

  useEffect(() => {
    if (!credentials) {
      return;
    }

    const abortController = new AbortController();

    async function loadDirectory() {
      setIsLoading(true);
      setStatus("Loading files.");

      try {
        const response = await fetch(
          `/api/files?path=${encodeURIComponent(currentPath)}`,
          {
            headers: {
              Authorization: getAuthorizationHeader(credentials),
            },
            signal: abortController.signal,
          },
        );

        if (response.status === 401) {
          setEntries([]);
          setStatus("Credentials rejected. Update them on the login page.");
          return;
        }

        if (!response.ok) {
          throw new Error(await getResponseErrorMessage(response));
        }

        const html = await response.text();
        const nextEntries = parseAutoIndex(html, currentPath);
        setEntries(nextEntries);
        setStatus(
          nextEntries.length
            ? `${nextEntries.length} item${nextEntries.length === 1 ? "" : "s"}`
            : "No files here.",
        );
      } catch (error) {
        if (abortController.signal.aborted) {
          return;
        }

        setEntries([]);
        setStatus(error instanceof Error ? error.message : "Request failed.");
      } finally {
        setIsLoading(false);
      }
    }

    loadDirectory();

    return () => abortController.abort();
  }, [credentials, currentPath]);

  function addHiddenInput(form: HTMLFormElement, name: string, value: string) {
    const input = document.createElement("input");
    input.type = "hidden";
    input.name = name;
    input.value = value;
    form.append(input);
  }

  function downloadFile(fileEntry: FileEntry) {
    if (!credentials) {
      return;
    }

    const frameName = "native-download-frame";
    const existingFrame = document.querySelector<HTMLIFrameElement>(
      `iframe[name="${frameName}"]`,
    );
    const frame = existingFrame ?? document.createElement("iframe");
    frame.name = frameName;
    frame.hidden = true;

    if (!existingFrame) {
      document.body.append(frame);
    }

    const form = document.createElement("form");
    form.method = "POST";
    form.action = "/api/files";
    form.target = frameName;
    form.hidden = true;

    addHiddenInput(form, "path", fileEntry.path);
    addHiddenInput(form, "email", credentials.email);
    addHiddenInput(form, "password", credentials.password);

    document.body.append(form);
    form.submit();
    form.remove();
  }

  function watchFile(fileEntry: FileEntry) {
    const params = new URLSearchParams({
      path: fileEntry.path,
      name: fileEntry.name,
    });
    window.location.assign(`/watch?${params.toString()}`);
  }

  function goUp() {
    const trimmedPath = currentPath.replace(/\/$/, "");
    const parentPath = trimmedPath.slice(0, trimmedPath.lastIndexOf("/") + 1);
    setCurrentPath(parentPath.startsWith(rootPath) ? parentPath : rootPath);
  }

  const canGoUp = currentPath !== rootPath;

  return (
    <main className="min-h-screen bg-neutral-950 text-neutral-100">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-6 sm:px-6">
        <header className="flex flex-col gap-4 border-b border-neutral-800 pb-5 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-sm font-medium text-cyan-300">File explorer</p>
            <h1 className="mt-2 text-3xl font-semibold tracking-normal">
              {currentPath}
            </h1>
            <p className="mt-2 text-sm text-neutral-400">{endpoint}</p>
          </div>

          <Link
            href="/login"
            className="inline-flex h-10 items-center justify-center rounded-md border border-neutral-700 px-4 text-sm font-medium text-neutral-100 transition hover:border-cyan-300 hover:text-cyan-200"
          >
            Login
          </Link>
        </header>

        <section className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <button
              type="button"
              onClick={goUp}
              disabled={!canGoUp}
              className="h-10 rounded-md border border-neutral-700 px-4 text-sm font-medium text-neutral-100 transition hover:border-cyan-300 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Up
            </button>
            <p className="text-sm text-neutral-400">
              {isLoading ? "Loading..." : status}
            </p>
          </div>

          {isLoading ? (
            <div className="h-2 overflow-hidden rounded-full bg-neutral-800">
              <div className="h-full w-1/3 animate-pulse rounded-full bg-cyan-400" />
            </div>
          ) : null}

          <div className="overflow-hidden rounded-lg border border-neutral-800 bg-neutral-900">
            {entries.length ? (
              <ul className="divide-y divide-neutral-800">
                {entries.map((entry) => (
                  <li key={entry.path}>
                    <div className="flex flex-col gap-3 px-4 py-3 transition hover:bg-neutral-800 sm:flex-row sm:items-center sm:justify-between">
                      <button
                        type="button"
                        onClick={() =>
                          entry.isDirectory
                            ? setCurrentPath(normalizeDirectoryPath(entry.path))
                            : watchFile(entry)
                        }
                        className="flex min-w-0 flex-1 items-center justify-between gap-4 text-left"
                      >
                        <span className="min-w-0 truncate text-sm font-medium">
                          {entry.name}
                        </span>
                        <span className="shrink-0 text-xs uppercase tracking-normal text-neutral-500">
                          {entry.isDirectory ? "Folder" : "File"}
                        </span>
                      </button>

                      <div className="flex shrink-0 gap-2">
                        <button
                          type="button"
                          onClick={() => watchFile(entry)}
                          disabled={entry.isDirectory || isLoading}
                          className="h-9 rounded-md border border-neutral-700 px-3 text-sm font-medium transition hover:border-cyan-300 disabled:cursor-not-allowed disabled:opacity-40"
                        >
                          Watch
                        </button>
                        <button
                          type="button"
                          onClick={() => downloadFile(entry)}
                          disabled={entry.isDirectory || isLoading}
                          className="h-9 rounded-md border border-neutral-700 px-3 text-sm font-medium transition hover:border-cyan-300 disabled:cursor-not-allowed disabled:opacity-40"
                        >
                          Download
                        </button>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="px-4 py-12 text-center text-sm text-neutral-400">
                {status}
              </div>
            )}
          </div>
        </section>
      </div>
    </main>
  );
}
