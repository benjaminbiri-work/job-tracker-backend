export function normalizeUrl(input) {
  const value = String(input || "").trim();
  if (!value) throw new Error("Job link is required.");

  const withProtocol = /^https?:\/\//i.test(value) ? value : `https://${value}`;
  const parsed = new URL(withProtocol);

  if (!["http:", "https:"].includes(parsed.protocol)) {
    throw new Error("Only http/https URLs are allowed.");
  }

  parsed.hash = "";
  parsed.searchParams.sort();

  let out = parsed.toString();
  if (out.endsWith("/")) out = out.slice(0, -1);
  return out;
}
