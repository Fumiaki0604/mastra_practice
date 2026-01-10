import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  try {
    // リクエストボディを取得
    const body = await request.json();
    const { daysThreshold, channelId } = body;

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
        daysThreshold: daysThreshold || 3,
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
