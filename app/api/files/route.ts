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

async function proxyFile(request: NextRequest, method: "GET" | "HEAD") {
  const authorization = request.headers.get("authorization");
  const requestPath = normalizeRequestPath(getRequestPath(request));
  return proxyAuthorizedFile(requestPath, authorization, method);
}

function getRequestPath(request: NextRequest) {
  return request.nextUrl.searchParams.get("path") ?? autoIndexPath;
}

function getAttachmentName(pathValue: string) {
  const rawFileName = pathValue.split("/").filter(Boolean).pop() ?? "download";
  let fileName = rawFileName;

  try {
    fileName = decodeURIComponent(rawFileName);
  } catch {
    fileName = rawFileName;
  }

  const fallbackName = fileName.replace(/["\\\r\n]/g, "_");
  const encodedName = encodeURIComponent(fileName);

  return `attachment; filename="${fallbackName}"; filename*=UTF-8''${encodedName}`;
}

async function proxyAuthorizedFile(
  requestPathValue: string,
  authorization: string | null,
  method: "GET" | "HEAD",
  download = false,
) {
  const requestPath = normalizeRequestPath(requestPathValue);
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
    method,
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

  if (download) {
    responseHeaders.set("content-disposition", getAttachmentName(requestPath));
  }

  responseHeaders.set("cache-control", "no-store");
  responseHeaders.set("x-file-proxy-source", "upstream");

  return new Response(method === "HEAD" ? null : upstreamResponse.body, {
    status: upstreamResponse.status,
    statusText: upstreamResponse.statusText,
    headers: responseHeaders,
  });
}

export async function GET(request: NextRequest) {
  return proxyFile(request, "GET");
}

export async function HEAD(request: NextRequest) {
  return proxyFile(request, "HEAD");
}

export async function POST(request: NextRequest) {
  const formData = await request.formData();
  const email = formData.get("email");
  const password = formData.get("password");
  const pathValue = formData.get("path");

  if (typeof email !== "string" || typeof password !== "string") {
    return Response.json(
      { error: "Missing credentials." },
      {
        headers: { "x-file-proxy-source": "proxy" },
        status: 401,
      },
    );
  }

  if (typeof pathValue !== "string") {
    return Response.json(
      { error: "Missing path." },
      {
        headers: { "x-file-proxy-source": "proxy" },
        status: 400,
      },
    );
  }

  const authorization = `Basic ${Buffer.from(`${email}:${password}`).toString(
    "base64",
  )}`;

  return proxyAuthorizedFile(pathValue, authorization, "GET", true);
}
