import { lookup } from "node:dns/promises";
import { BlockList, isIP } from "node:net";

export type UrlSafety = { ok: true; url: URL } | { ok: false; reason: string };
export type HostResolver = (hostname: string) => Promise<string[]>;

const MAX_URL_LENGTH = 2048;

// 서버가 사용자가 준 주소로 브라우저를 여는 기능이라, 서버 자신이나 내부망·클라우드 메타데이터
// 주소를 대신 읽어 오지 못하게 막는다 (SSRF). 공인 주소가 아닌 대역을 모두 차단 목록에 둔다
const BLOCKED = new BlockList();
for (const [network, prefix] of [
  ["0.0.0.0", 8],
  ["10.0.0.0", 8],
  ["100.64.0.0", 10],
  ["127.0.0.0", 8],
  ["169.254.0.0", 16],
  ["172.16.0.0", 12],
  ["192.0.0.0", 24],
  ["192.0.2.0", 24],
  ["192.88.99.0", 24],
  ["192.168.0.0", 16],
  ["198.18.0.0", 15],
  ["198.51.100.0", 24],
  ["203.0.113.0", 24],
  ["224.0.0.0", 4],
  ["240.0.0.0", 4],
] as const) {
  BLOCKED.addSubnet(network, prefix, "ipv4");
}
for (const [network, prefix] of [
  ["::", 96], // 미지정(::), 루프백(::1), 구형 IPv4 호환 주소
  ["64:ff9b::", 96], // NAT64 — 내부 IPv4로 변환될 수 있다
  ["100::", 64],
  ["2001::", 32], // Teredo
  ["2001:db8::", 32],
  ["2002::", 16], // 6to4 — IPv4 주소를 품고 있다
  ["fc00::", 7],
  ["fe80::", 10],
  ["ff00::", 8],
] as const) {
  BLOCKED.addSubnet(network, prefix, "ipv6");
}

// 점 표기 IPv4가 붙은 형태(::ffff:1.2.3.4)와 "::" 압축을 풀어 16바이트로 만든다
function ipv6ToBytes(address: string): number[] | null {
  let text = address.split("%")[0];
  const dotted = text.match(/^(.*:)(\d+\.\d+\.\d+\.\d+)$/);
  if (dotted) {
    const octets = dotted[2].split(".").map(Number);
    if (octets.some((octet) => octet > 255)) return null;
    text = `${dotted[1]}${((octets[0] << 8) | octets[1]).toString(16)}:${((octets[2] << 8) | octets[3]).toString(16)}`;
  }
  const halves = text.split("::");
  if (halves.length > 2) return null;
  const head = halves[0] ? halves[0].split(":") : [];
  const tail = halves.length === 2 && halves[1] ? halves[1].split(":") : [];
  const fill = halves.length === 2 ? 8 - head.length - tail.length : 0;
  if (fill < 0) return null;
  const groups = [...head, ...new Array<string>(fill).fill("0"), ...tail];
  if (groups.length !== 8) return null;
  const bytes: number[] = [];
  for (const group of groups) {
    if (!/^[0-9a-f]{1,4}$/i.test(group)) return null;
    const value = parseInt(group, 16);
    bytes.push(value >> 8, value & 255);
  }
  return bytes;
}

export function isPublicAddress(address: string): boolean {
  const family = isIP(address);
  if (family === 0) return false;
  if (family === 4) return !BLOCKED.check(address, "ipv4");
  const bytes = ipv6ToBytes(address);
  if (!bytes) return false;
  // Node의 BlockList도 IPv4 매핑 주소를 IPv4 규칙으로 검사하지만, 런타임 버전에 기대지 않으려고 직접 푼다
  const isV4Mapped = bytes.slice(0, 10).every((byte) => byte === 0) && bytes[10] === 0xff && bytes[11] === 0xff;
  if (isV4Mapped) return !BLOCKED.check(bytes.slice(12).join("."), "ipv4");
  return !BLOCKED.check(address, "ipv6");
}

const defaultResolver: HostResolver = async (hostname) => {
  const records = await lookup(hostname, { all: true });
  return records.map((record) => record.address);
};

function localNameReason(hostname: string): string | null {
  if (hostname === "localhost" || hostname.endsWith(".localhost")) return "localhost";
  if (/\.(local|localdomain|internal|intranet|lan|home|corp)$/.test(hostname)) return "internal-suffix";
  // 점이 없는 이름(예: metadata)은 실행 환경의 검색 도메인으로 내부 주소에 풀릴 수 있다
  if (!hostname.includes(".") && isIP(hostname) === 0) return "single-label-host";
  return null;
}

export async function checkUrlSafety(raw: unknown, resolve: HostResolver = defaultResolver): Promise<UrlSafety> {
  if (typeof raw !== "string" || raw.length === 0 || raw.length > MAX_URL_LENGTH) return { ok: false, reason: "invalid-input" };
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return { ok: false, reason: "unparseable" };
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return { ok: false, reason: "scheme" };
  if (url.username || url.password) return { ok: false, reason: "credentials" };
  // 기본 포트(80/443)만 허용한다 — 내부 서비스는 대개 다른 포트(3000, 6379 등)에서 돈다
  if (url.port !== "") return { ok: false, reason: "port" };

  const hostname = url.hostname.replace(/^\[|\]$/g, "").toLowerCase().replace(/\.+$/, "");
  if (isIP(hostname) !== 0) {
    return isPublicAddress(hostname) ? { ok: true, url } : { ok: false, reason: "private-address" };
  }
  const localReason = localNameReason(hostname);
  if (localReason) return { ok: false, reason: localReason };

  let addresses: string[];
  try {
    addresses = await resolve(hostname);
  } catch {
    return { ok: false, reason: "unresolvable" };
  }
  if (addresses.length === 0) return { ok: false, reason: "unresolvable" };
  // 하나라도 비공개 주소가 섞여 있으면 거부한다 (공인·내부 주소를 번갈아 돌려주는 DNS 대비)
  return addresses.every(isPublicAddress) ? { ok: true, url } : { ok: false, reason: "resolves-to-private-address" };
}

// 브라우저가 보내는 모든 요청(리다이렉트·하위 리소스 포함)에 적용한다. 같은 호스트는 한 번만 검사한다
export async function isRequestAllowed(
  rawUrl: string,
  verdicts: Map<string, Promise<boolean>>,
  resolve: HostResolver = defaultResolver
): Promise<boolean> {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return false;
  }
  if (["data:", "blob:", "about:"].includes(url.protocol)) return true;
  const key = `${url.protocol}//${url.host}`;
  let verdict = verdicts.get(key);
  if (!verdict) {
    verdict = checkUrlSafety(rawUrl, resolve).then((result) => result.ok);
    verdicts.set(key, verdict);
  }
  return verdict;
}
