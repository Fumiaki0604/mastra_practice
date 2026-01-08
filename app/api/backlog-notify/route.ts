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
    let message;
    let isSuccess;

    if (result.status === "success" && result.result?.success) {
      message = "Slackへの通知が完了しました";
      isSuccess = true;
    } else {
      const errorMsg = (result as any).error || result.result?.error || "不明なエラー";
      message = errorMsg;
      isSuccess = false;
    }

    // 結果をAPIレスポンスとして返却
    return NextResponse.json({
      success: isSuccess,
      message: message,
      messageUrl: result.result?.messageUrl,
      steps: result.steps
        ? Object.keys(result.steps).map((stepId) => ({
            stepId,
            status: (result.steps as any)[stepId].status,
          }))
        : [],
    });
  } catch (error) {
    // エラーをAPIレスポンスとして返却
    return NextResponse.json(
      {
        error: "ワークフローの実行中にエラーが発生しました",
        details: error instanceof Error ? error.message : "エラー",
      },
      { status: 500 }
    );
  }
}
