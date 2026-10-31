function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// 원본에서 확인되지 않은 기술명(개선 제안서 대상)이 재구성 본문에 들어갔는지 검사한다.
// 영숫자 경계로 비교해 "Java"가 "JavaScript" 안에서 잡히지 않게 한다. 경고용이라 "Go" 같은
// 짧은 이름이 우연히 걸리는 오탐은 감수하고, 본문을 고치지 않고 사용자에게 판단을 돌려준다
export function findLeakedStacks(texts: string[], unconfirmedStacks: string[]): string[] {
  const haystack = texts.join("\n");
  if (!haystack.trim()) return [];
  const leaked = new Set<string>();
  for (const stack of unconfirmedStacks) {
    const name = stack.trim();
    if (!name) continue;
    const pattern = new RegExp(`(?<![A-Za-z0-9])${escapeRegExp(name)}(?![A-Za-z0-9])`, "i");
    if (pattern.test(haystack)) leaked.add(stack);
  }
  return [...leaked];
}
