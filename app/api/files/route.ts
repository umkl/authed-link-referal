import { type NextRequest } from "next/server";

const endpoint = process.env.NEXT_PUBLIC_ENDPOINT ?? "";
const autoIndexPath = process.env.NEXT_PUBLIC_NGINX_AUTO_INDEX_PATH ?? "/";

export const dynamic = "force-dynamic";

function normalizeDirectoryPath(pathValue: string) {
  const withLeadingSlash = pathValue.startsWith("/")
    ? pathValue
    : `/${pathValue}`;
  return withLeadingSlash.endsWith("/")
    ? withLeadingSlash
    : `${withLeadingSlash}/`;
}

function normalizeRequestPath(pathValue: string) {
  return pathValue.startsWith("/") ? pathValue : `/${pathValue}`;
}

export async function GET(request: NextRequest) {
  const authorization = request.headers.get("authorization");
  const requestPath = normalizeRequestPath(
    request.nextUrl.searchParams.get("path") ?? autoIndexPath,
  );
  const rootPath = normalizeDirectoryPath(autoIndexPath);
  const exactRootPath = rootPath.replace(/\/$/, "");

  if (!endpoint) {
    return Response.json(
      { error: "Missing endpoint." },
      {
        headers: { "x-file-proxy-source": "proxy" },
        status: 500,
      },
    );
  }

  if (!authorization) {
    return Response.json(
      { error: "Missing authorization." },
      {
        headers: { "x-file-proxy-source": "proxy" },
        status: 401,
      },
    );
  }

  if (requestPath !== exactRootPath && !requestPath.startsWith(rootPath)) {
    return Response.json(
      { error: `Path not allowed: ${requestPath}` },
      {
        headers: { "x-file-proxy-source": "proxy" },
        status: 403,
      },
    );
  }

  const upstreamUrl = new URL(requestPath, endpoint);
  const upstreamResponse = await fetch(upstreamUrl, {
    headers: {
      Authorization: authorization,
    },
    cache: "no-store",
  });

  const responseHeaders = new Headers();
  const contentType = upstreamResponse.headers.get("content-type");
  const contentLength = upstreamResponse.headers.get("content-length");

  if (contentType) {
    responseHeaders.set("content-type", contentType);
  }

  if (contentLength) {
    responseHeaders.set("content-length", contentLength);
  }

  responseHeaders.set("cache-control", "no-store");
  responseHeaders.set("x-file-proxy-source", "upstream");

  return new Response(upstreamResponse.body, {
    status: upstreamResponse.status,
    statusText: upstreamResponse.statusText,
    headers: responseHeaders,
  });
}
