type ParsedFlag = "unset" | true | false;

function parseEmailVerificationFlag(
  raw: string | undefined,
): ParsedFlag {
  if (raw === undefined) {
    return "unset";
  }
  const trimmed = raw.replace(/^\uFEFF/, "").trim();
  if (trimmed === "") {
    return "unset";
  }
  const normalized = trimmed.replace(/^["']|["']$/g, "").toLowerCase();
  if (
    normalized === "false" ||
    normalized === "0" ||
    normalized === "no" ||
    normalized === "off" ||
    normalized === "disabled"
  ) {
    return false;
  }
  if (
    normalized === "true" ||
    normalized === "1" ||
    normalized === "yes" ||
    normalized === "on" ||
    normalized === "enabled"
  ) {
    return true;
  }
  return "unset";
}

export function isAuthEmailVerificationEnabled(): boolean {
  const fromAuth = parseEmailVerificationFlag(
    process.env.AUTH_EMAIL_VERIFICATION_ENABLED,
  );
  const fromPublic = parseEmailVerificationFlag(
    process.env.NEXT_PUBLIC_AUTH_EMAIL_VERIFICATION_ENABLED,
  );

  if (fromAuth === false || fromPublic === false) {
    return false;
  }
  if (fromAuth === true || fromPublic === true) {
    return true;
  }
  return false;
}
