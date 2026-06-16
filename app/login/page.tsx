"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";

const credentialsStorageKey = "authed-link-credentials";

type StoredCredentials = {
  email: string;
  password: string;
};

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  useEffect(() => {
    const storedCredentials = window.localStorage.getItem(credentialsStorageKey);

    if (!storedCredentials) {
      return;
    }

    try {
      const parsedCredentials = JSON.parse(
        storedCredentials,
      ) as StoredCredentials;
      setEmail(parsedCredentials.email ?? "");
      setPassword(parsedCredentials.password ?? "");
    } catch {
      window.localStorage.removeItem(credentialsStorageKey);
    }
  }, []);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    window.localStorage.setItem(
      credentialsStorageKey,
      JSON.stringify({ email, password }),
    );
    router.replace("/");
  }

  return (
    <main className="min-h-screen bg-neutral-950 px-4 py-8 text-neutral-100 sm:px-6">
      <div className="mx-auto flex min-h-[calc(100vh-4rem)] w-full max-w-sm flex-col justify-center gap-6">
        <div>
          <p className="text-sm font-medium text-cyan-300">Private access</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-normal">
            Sign in
          </h1>
        </div>

        <form
          onSubmit={handleSubmit}
          className="flex flex-col gap-4 rounded-lg border border-neutral-800 bg-neutral-900 p-5"
        >
          <label className="flex flex-col gap-2 text-sm font-medium">
            Email
            <input
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className="h-11 rounded-md border border-neutral-700 bg-neutral-950 px-3 text-base text-neutral-100 outline-none transition focus:border-cyan-400"
              type="email"
              autoComplete="username"
              required
            />
          </label>

          <label className="flex flex-col gap-2 text-sm font-medium">
            Password
            <input
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="h-11 rounded-md border border-neutral-700 bg-neutral-950 px-3 text-base text-neutral-100 outline-none transition focus:border-cyan-400"
              type="password"
              autoComplete="current-password"
              required
            />
          </label>

          <button
            type="submit"
            className="mt-2 h-11 rounded-md bg-cyan-400 px-4 text-sm font-semibold text-neutral-950 transition hover:bg-cyan-300"
          >
            Save credentials
          </button>
        </form>

        <Link
          href="/"
          className="text-sm font-medium text-neutral-300 transition hover:text-cyan-200"
        >
          Back to files
        </Link>
      </div>
    </main>
  );
}
