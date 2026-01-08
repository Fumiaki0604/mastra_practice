"use client";

import { useState } from "react";

interface NotifyResult {
  success: boolean;
  message: string;
  messageUrl?: string;
  steps?: Array<{ stepId: string; status: string }>;
  error?: string;
  details?: string;
}

const BacklogNotifyPage = () => {
  const [daysThreshold, setDaysThreshold] = useState<number>(3);
  const [channelId, setChannelId] = useState<string>("");
  const [isLoading, setIsLoading] = useState(false);
  const [result, setResult] = useState<NotifyResult | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setResult(null);

    try {
      const response = await fetch("/api/backlog-notify", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          daysThreshold,
          channelId: channelId || undefined,
        }),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      setResult(data);
    } catch (error) {
      setResult({
        success: false,
        message: "通知の実行中にエラーが発生しました",
        error: error instanceof Error ? error.message : "不明なエラー",
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-orange-50 via-white to-red-50">
      <div className="container mx-auto px-4 py-8">
        <div className="max-w-3xl mx-auto">
          <div className="bg-white/90 backdrop-blur-sm rounded-2xl shadow-xl border border-gray-100 p-8">
            <h1 className="text-3xl font-bold bg-gradient-to-r from-orange-600 to-red-600 bg-clip-text text-transparent mb-4">
              Backlog課題 Slack通知
            </h1>
            <p className="text-gray-600 mb-8">
              納期の迫ったBacklog課題をSlackに自動通知します
            </p>

            {/* 説明セクション */}
            <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 mb-6">
              <h2 className="font-semibold text-blue-900 mb-2">📋 機能説明</h2>
              <ul className="text-sm text-blue-800 space-y-1">
                <li>• 全プロジェクトから納期の迫った課題を取得</li>
                <li>• 期限が近い順に並び替えて通知</li>
                <li>• 担当者、プロジェクト名、ステータスを表示</li>
              </ul>
            </div>

            {/* フォーム */}
            <form onSubmit={handleSubmit} className="space-y-6">
              <div className="group">
                <label
                  htmlFor="daysThreshold"
                  className="block text-sm font-semibold text-gray-700 mb-2"
                >
                  📅 納期の閾値（日数）
                </label>
                <input
                  type="number"
                  id="daysThreshold"
                  value={daysThreshold}
                  onChange={(e) => setDaysThreshold(Number(e.target.value))}
                  min="1"
                  max="30"
                  className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl shadow-sm transition-all duration-200 focus:outline-none focus:ring-4 focus:ring-orange-100 focus:border-orange-500"
                  required
                />
                <p className="text-sm text-gray-500 mt-1">
                  指定した日数以内に期限が来る課題を通知します（デフォルト: 3日）
                </p>
              </div>

              <div className="group">
                <label
                  htmlFor="channelId"
                  className="block text-sm font-semibold text-gray-700 mb-2"
                >
                  💬 SlackチャンネルID（オプション）
                </label>
                <input
                  type="text"
                  id="channelId"
                  value={channelId}
                  onChange={(e) => setChannelId(e.target.value)}
                  placeholder="例: C01234567ABC（省略時は環境変数から取得）"
                  className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl shadow-sm transition-all duration-200 focus:outline-none focus:ring-4 focus:ring-orange-100 focus:border-orange-500"
                />
                <p className="text-sm text-gray-500 mt-1">
                  空欄の場合は環境変数 SLACK_CHANNEL_ID が使用されます
                </p>
              </div>

              {/* 送信ボタン */}
              <div className="flex justify-end pt-4">
                <button
                  type="submit"
                  disabled={isLoading}
                  className={`
                    px-8 py-4 rounded-xl font-semibold text-lg transition-all duration-300 transform
                    ${
                      !isLoading
                        ? "bg-gradient-to-r from-orange-600 to-red-600 text-white hover:from-orange-700 hover:to-red-700 hover:scale-105 hover:shadow-lg focus:outline-none focus:ring-4 focus:ring-orange-300"
                        : "bg-gray-200 text-gray-400 cursor-not-allowed"
                    }
                  `}
                >
                  {isLoading ? (
                    <div className="flex items-center">
                      <svg
                        className="animate-spin h-5 w-5 mr-3"
                        viewBox="0 0 24 24"
                      >
                        <circle
                          className="opacity-25"
                          cx="12"
                          cy="12"
                          r="10"
                          stroke="currentColor"
                          strokeWidth="4"
                          fill="none"
                        />
                        <path
                          className="opacity-75"
                          fill="currentColor"
                          d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                        />
                      </svg>
                      通知中...
                    </div>
                  ) : (
                    <span className="flex items-center">🚀 Slackに通知</span>
                  )}
                </button>
              </div>
            </form>

            {/* 結果表示 */}
            {result && (
              <div className="mt-8">
                <div
                  className={`rounded-xl p-6 ${
                    result.success
                      ? "bg-green-50 border border-green-200"
                      : "bg-red-50 border border-red-200"
                  }`}
                >
                  <h3
                    className={`font-semibold mb-2 ${
                      result.success ? "text-green-900" : "text-red-900"
                    }`}
                  >
                    {result.success ? "✅ 成功" : "❌ エラー"}
                  </h3>
                  <p
                    className={`text-sm ${
                      result.success ? "text-green-800" : "text-red-800"
                    }`}
                  >
                    {result.message}
                  </p>

                  {result.messageUrl && (
                    <div className="mt-4">
                      <a
                        href={result.messageUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-blue-600 hover:text-blue-800 underline text-sm"
                      >
                        📱 Slackメッセージを開く
                      </a>
                    </div>
                  )}

                  {result.error && (
                    <details className="mt-4">
                      <summary className="text-sm text-red-700 cursor-pointer hover:text-red-900">
                        詳細を表示
                      </summary>
                      <pre className="mt-2 text-xs text-red-700 bg-red-100 p-2 rounded overflow-auto">
                        {result.error}
                        {result.details && `\n${result.details}`}
                      </pre>
                    </details>
                  )}

                  {result.steps && result.steps.length > 0 && (
                    <details className="mt-4">
                      <summary className="text-sm text-gray-700 cursor-pointer hover:text-gray-900">
                        ワークフローステップ
                      </summary>
                      <div className="mt-2 space-y-1">
                        {result.steps.map((step) => (
                          <div
                            key={step.stepId}
                            className="text-xs text-gray-600"
                          >
                            <span className="font-mono">{step.stepId}</span>:{" "}
                            <span
                              className={
                                step.status === "success"
                                  ? "text-green-600"
                                  : "text-red-600"
                              }
                            >
                              {step.status}
                            </span>
                          </div>
                        ))}
                      </div>
                    </details>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default BacklogNotifyPage;
