import { describe, expect, it } from "vitest";
import { checkUrlSafety, isPublicAddress, isRequestAllowed, type HostResolver } from "@/lib/safe-url";

const PUBLIC = "93.184.216.34";
const resolvesTo = (...addresses: string[]): HostResolver => async () => addresses;
const never: HostResolver = async () => {
  throw new Error("DNS를 조회하면 안 되는 입력인데 조회했다");
};

async function reasonOf(url: unknown, resolver: HostResolver = resolvesTo(PUBLIC)): Promise<string> {
  const result = await checkUrlSafety(url, resolver);
  return result.ok ? "ok" : result.reason;
}

describe("checkUrlSafety — 허용", () => {
  it("공인 주소로 풀리는 일반 공고 주소는 허용한다", async () => {
    expect(await reasonOf("https://example.com/careers/123?gh_jid=1")).toBe("ok");
    expect(await reasonOf("http://jobs.example.co.kr/view")).toBe("ok");
  });

  it("명시한 기본 포트(80/443)는 허용한다", async () => {
    expect(await reasonOf("http://example.com:80/x")).toBe("ok");
    expect(await reasonOf("https://example.com:443/x")).toBe("ok");
  });

  it("공인 IP 리터럴은 DNS 조회 없이 허용한다", async () => {
    expect(await reasonOf("https://93.184.216.34/x", never)).toBe("ok");
    expect(await reasonOf("https://[2606:2800:220:1:248:1893:25c8:1946]/x", never)).toBe("ok");
  });
});

describe("checkUrlSafety — 입력 형태", () => {
  it("문자열이 아니거나 비었거나 너무 길면 거부한다", async () => {
    expect(await reasonOf(undefined)).toBe("invalid-input");
    expect(await reasonOf(42)).toBe("invalid-input");
    expect(await reasonOf("")).toBe("invalid-input");
    expect(await reasonOf(`https://example.com/${"a".repeat(2100)}`)).toBe("invalid-input");
  });

  it("http/https가 아닌 스킴은 거부한다", async () => {
    for (const url of ["file:///etc/passwd", "ftp://example.com/x", "javascript:alert(1)", "data:text/html,hi", "gopher://example.com/"]) {
      expect(await reasonOf(url), url).toBe("scheme");
    }
  });

  it("주소에 계정 정보가 들어 있으면 거부한다 (example.com@127.0.0.1 같은 혼동 방지)", async () => {
    expect(await reasonOf("http://user:pass@example.com/")).toBe("credentials");
    expect(await reasonOf("http://example.com@127.0.0.1/")).toBe("credentials");
  });

  it("기본 포트가 아니면 거부한다 (내부 서비스는 대개 다른 포트)", async () => {
    for (const port of [3000, 6379, 8080, 22, 5432]) {
      expect(await reasonOf(`http://example.com:${port}/`), String(port)).toBe("port");
    }
  });
});

describe("checkUrlSafety — 내부 주소 직접 입력", () => {
  it("루프백·사설·링크로컬·메타데이터 주소를 거부한다", async () => {
    const blocked = [
      "http://127.0.0.1/", "http://127.255.255.254/", "http://10.0.0.5/", "http://172.16.0.1/", "http://172.31.255.255/",
      "http://192.168.1.1/", "http://169.254.169.254/latest/meta-data/", "http://0.0.0.0/", "http://100.64.0.1/",
      "http://198.18.0.1/", "http://224.0.0.1/", "http://255.255.255.255/",
    ];
    for (const url of blocked) expect(await reasonOf(url, never), url).toBe("private-address");
  });

  it("십진수·16진수·8진수·축약 표기 우회를 거부한다", async () => {
    for (const url of ["http://2130706433/", "http://0x7f000001/", "http://0x7f.0.0.1/", "http://0177.0.0.1/", "http://127.1/", "http://017700000001/"]) {
      expect(await reasonOf(url, never), url).toBe("private-address");
    }
  });

  it("IPv6 루프백·사설·링크로컬을 거부한다", async () => {
    for (const url of ["http://[::1]/", "http://[::]/", "http://[fc00::1]/", "http://[fd12:3456::1]/", "http://[fe80::1]/", "http://[ff02::1]/", "http://[2001:db8::1]/"]) {
      expect(await reasonOf(url, never), url).toBe("private-address");
    }
  });

  it("IPv4를 품은 IPv6(매핑·NAT64·6to4)로 내부 주소를 숨겨도 거부한다", async () => {
    for (const url of [
      "http://[::ffff:127.0.0.1]/", "http://[::ffff:7f00:1]/", "http://[::ffff:10.0.0.1]/", "http://[::ffff:169.254.169.254]/",
      "http://[64:ff9b::7f00:1]/", "http://[2002:7f00:1::]/", "http://[::127.0.0.1]/",
    ]) {
      expect(await reasonOf(url, never), url).toBe("private-address");
    }
  });

  it("공인 주소를 품은 IPv4 매핑 IPv6는 허용한다", async () => {
    expect(await reasonOf("http://[::ffff:93.184.216.34]/", never)).toBe("ok");
  });
});

describe("checkUrlSafety — 이름으로 숨긴 내부 주소", () => {
  it("localhost와 그 변형(대문자·끝의 점·하위 도메인)을 DNS 조회 없이 거부한다", async () => {
    for (const url of ["http://localhost/", "http://LOCALHOST/", "http://localhost./", "http://app.localhost/", "http://a.b.localhost./"]) {
      expect(await reasonOf(url, never), url).toBe("localhost");
    }
  });

  it("내부용 접미사와 점 없는 이름(예: metadata)을 거부한다", async () => {
    for (const url of ["http://printer.local/", "http://metadata.google.internal/", "http://jira.corp/", "http://nas.lan/"]) {
      expect(await reasonOf(url, never), url).toBe("internal-suffix");
    }
    expect(await reasonOf("http://metadata/", never)).toBe("single-label-host");
    expect(await reasonOf("http://intranet/", never)).toBe("single-label-host");
  });

  it("공개 도메인이 내부 주소로 풀리면 거부한다 (DNS 기반 우회)", async () => {
    expect(await reasonOf("https://attacker.example/", resolvesTo("10.0.0.5"))).toBe("resolves-to-private-address");
    expect(await reasonOf("https://attacker.example/", resolvesTo("127.0.0.1"))).toBe("resolves-to-private-address");
    expect(await reasonOf("https://attacker.example/", resolvesTo("::1"))).toBe("resolves-to-private-address");
    expect(await reasonOf("https://attacker.example/", resolvesTo("169.254.169.254"))).toBe("resolves-to-private-address");
  });

  it("공인·내부 주소가 섞여 돌아오면 거부한다", async () => {
    expect(await reasonOf("https://attacker.example/", resolvesTo(PUBLIC, "127.0.0.1"))).toBe("resolves-to-private-address");
    expect(await reasonOf("https://attacker.example/", resolvesTo("127.0.0.1", PUBLIC))).toBe("resolves-to-private-address");
  });

  it("조회에 실패하거나 결과가 비면 거부한다", async () => {
    expect(await reasonOf("https://nope.example/", never)).toBe("unresolvable");
    expect(await reasonOf("https://nope.example/", resolvesTo())).toBe("unresolvable");
  });
});

describe("isPublicAddress", () => {
  it("공인 주소만 true를 반환하고, 해석할 수 없는 값은 false다", () => {
    expect(isPublicAddress("8.8.8.8")).toBe(true);
    expect(isPublicAddress("2606:4700:4700::1111")).toBe(true);
    expect(isPublicAddress("10.1.2.3")).toBe(false);
    expect(isPublicAddress("not-an-ip")).toBe(false);
    expect(isPublicAddress("")).toBe(false);
  });
});

describe("isRequestAllowed — 브라우저의 모든 요청(리다이렉트·하위 리소스)", () => {
  it("공고 사이트에서 내부 주소로 리다이렉트되는 요청을 막는다", async () => {
    const verdicts = new Map<string, Promise<boolean>>();
    expect(await isRequestAllowed("https://jobs.example.com/view/1", verdicts, resolvesTo(PUBLIC))).toBe(true);
    expect(await isRequestAllowed("http://169.254.169.254/latest/meta-data/", verdicts, never)).toBe(false);
    expect(await isRequestAllowed("http://127.0.0.1/admin", verdicts, never)).toBe(false);
  });

  it("data·blob·about 요청은 허용하고, 그 밖의 스킴은 막는다", async () => {
    const verdicts = new Map<string, Promise<boolean>>();
    expect(await isRequestAllowed("data:text/plain,hi", verdicts, never)).toBe(true);
    expect(await isRequestAllowed("blob:https://example.com/abc", verdicts, never)).toBe(true);
    expect(await isRequestAllowed("about:blank", verdicts, never)).toBe(true);
    expect(await isRequestAllowed("file:///etc/passwd", verdicts, never)).toBe(false);
    expect(await isRequestAllowed("ftp://example.com/", verdicts, never)).toBe(false);
    expect(await isRequestAllowed("not a url", verdicts, never)).toBe(false);
  });

  it("같은 호스트는 DNS를 한 번만 조회한다", async () => {
    let lookups = 0;
    const counting: HostResolver = async () => {
      lookups += 1;
      return [PUBLIC];
    };
    const verdicts = new Map<string, Promise<boolean>>();
    await Promise.all([1, 2, 3, 4, 5].map((i) => isRequestAllowed(`https://cdn.example.com/a${i}.js`, verdicts, counting)));
    expect(lookups).toBe(1);
  });
});
