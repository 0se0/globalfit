export async function reportFailure(inputText: string, error: unknown): Promise<void> {
  const payload = {
    inputPreview: inputText.slice(0, 100),
    error: error instanceof Error ? error.message : String(error),
    timestamp: new Date().toISOString(),
  };

  console.error("[GlobalFit failure]", payload);

  const webhookUrl = process.env.DISCORD_WEBHOOK_URL;
  if (!webhookUrl) return;

  try {
    await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        content: `⚠️ GlobalFit 분석 실패\n입력: ${payload.inputPreview}\n에러: ${payload.error}\n시각: ${payload.timestamp}`,
      }),
    });
  } catch (webhookError) {
    // 웹훅 전송 자체가 실패해도 사용자 요청 흐름에 영향 주지 않음 — 콘솔에만 추가 기록
    console.error("[GlobalFit failure] webhook send failed", webhookError);
  }
}
