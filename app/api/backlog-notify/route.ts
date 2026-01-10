import { NextRequest, NextResponse } from "next/server";

// 日本の祝日を判定する関数（簡易版）
function isJapaneseHoliday(date: Date): boolean {
  const year = date.getFullYear();
  const month = date.getMonth() + 1;
  const day = date.getDate();

  // 固定祝日のリスト（2024-2026年の主要な祝日）
  const holidays = [
    { month: 1, day: 1 }, // 元日
    { month: 2, day: 11 }, // 建国記念の日
    { month: 2, day: 23 }, // 天皇誕生日
    { month: 4, day: 29 }, // 昭和の日
    { month: 5, day: 3 }, // 憲法記念日
    { month: 5, day: 4 }, // みどりの日
    { month: 5, day: 5 }, // こどもの日
    { month: 8, day: 11 }, // 山の日
    { month: 11, day: 3 }, // 文化の日
    { month: 11, day: 23 }, // 勤労感謝の日
  ];

  // 年ごとの変動祝日（例：成人の日、海の日、敬老の日など）
  // 簡易実装のため、主要な固定祝日のみチェック
  return holidays.some((h) => h.month === month && h.day === day);
}

// 平日（土日祝日を除く）かどうかを判定
function isWeekday(date: Date): boolean {
  const dayOfWeek = date.getDay();
  // 0 = 日曜日, 6 = 土曜日
  if (dayOfWeek === 0 || dayOfWeek === 6) {
    return false;
  }
  // 祝日チェック
  if (isJapaneseHoliday(date)) {
    return false;
  }
  return true;
}

export async function POST(request: NextRequest) {
  try {
    // リクエストボディを取得
    const body = await request.json();
    const { daysThreshold, channelId, skipWeekendHoliday = true } = body;

    // 平日のみ配信する設定の場合、土日祝日はスキップ
    if (skipWeekendHoliday) {
      const now = new Date();
      if (!isWeekday(now)) {
        return NextResponse.json({
          success: true,
          message: "土日祝日のため通知をスキップしました",
          skipped: true,
          steps: [],
        });
      }
    }

    // Mastraワークフローインスタンスを取得
    const { mastra } = await import("@/src/mastra");
    const workflow = mastra.getWorkflow("backlogToSlackWorkflow");

    if (!workflow) {
      throw new Error("ワークフローが見つかりません");
    }

    // ワークフローを実行
    const run = await workflow.createRunAsync();
    const result = await run.start({
      inputData: {
        daysThreshold: daysThreshold ?? -1,
        channelId: channelId,
      },
    });

    // 返却メッセージとステータスを作成
    let message: string;
    let isSuccess: boolean;
    let messageUrl: string | undefined;

    if (result.status === "success") {
      message = "Slackへの通知が完了しました";
      isSuccess = result.result?.success || false;
      messageUrl = result.result?.messageUrl;
    } else if (result.status === "failed") {
      const errorMsg = result.error?.message || "不明なエラー";
      message = errorMsg;
      isSuccess = false;
      messageUrl = undefined;
    } else {
      // status === "suspended"
      message = "ワークフローが一時停止しました";
      isSuccess = false;
      messageUrl = undefined;
    }

    // 結果をAPIレスポンスとして返却
    return NextResponse.json({
      success: isSuccess,
      message: message,
      messageUrl: messageUrl,
      steps: result.steps
        ? Object.keys(result.steps).map((stepId) => ({
            stepId,
            status: (result.steps as any)[stepId].status,
          }))
        : [],
    });
  } catch (error) {
    // エラーをコンソールに出力
    console.error("❌ エラー発生:", error);
    console.error("スタックトレース:", error instanceof Error ? error.stack : "なし");

    // エラーをAPIレスポンスとして返却
    return NextResponse.json(
      {
        error: "ワークフローの実行中にエラーが発生しました",
        details: error instanceof Error ? error.message : "エラー",
        stack: error instanceof Error ? error.stack : undefined,
      },
      { status: 500 }
    );
  }
}
