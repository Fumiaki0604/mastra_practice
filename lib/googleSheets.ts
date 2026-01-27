// Google Sheets APIでSlackユーザーマッピングを取得

const GOOGLE_SERVICE_ACCOUNT_EMAIL = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL || "";
const GOOGLE_PRIVATE_KEY = (process.env.GOOGLE_PRIVATE_KEY || "").replace(/\\n/g, "\n");
const GOOGLE_SPREADSHEET_ID = process.env.GOOGLE_SPREADSHEET_ID || "";
const GOOGLE_SHEET_GID = process.env.GOOGLE_SHEET_GID || "0";

type SlackUserMapping = Record<string, string>;

let cachedMapping: SlackUserMapping | null = null;
let cacheTimestamp = 0;
const CACHE_TTL = 5 * 60 * 1000; // 5分キャッシュ

async function getAccessToken(): Promise<string> {
  const header = { alg: "RS256", typ: "JWT" };
  const now = Math.floor(Date.now() / 1000);
  const claim = {
    iss: GOOGLE_SERVICE_ACCOUNT_EMAIL,
    scope: "https://www.googleapis.com/auth/spreadsheets.readonly",
    aud: "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3600,
  };

  const encoder = new TextEncoder();
  const headerB64 = btoa(JSON.stringify(header)).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
  const claimB64 = btoa(JSON.stringify(claim)).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
  const unsignedToken = `${headerB64}.${claimB64}`;

  // RSA署名
  const keyData = GOOGLE_PRIVATE_KEY
    .replace("-----BEGIN PRIVATE KEY-----", "")
    .replace("-----END PRIVATE KEY-----", "")
    .replace(/\s/g, "");
  const binaryKey = Uint8Array.from(atob(keyData), c => c.charCodeAt(0));

  const cryptoKey = await crypto.subtle.importKey(
    "pkcs8",
    binaryKey,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"]
  );

  const signature = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    cryptoKey,
    encoder.encode(unsignedToken)
  );

  const signatureB64 = btoa(String.fromCharCode(...new Uint8Array(signature)))
    .replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");

  const jwt = `${unsignedToken}.${signatureB64}`;

  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwt}`,
  });

  const tokenData = await tokenRes.json();
  return tokenData.access_token;
}

export async function getSlackUserMapping(): Promise<SlackUserMapping> {
  // キャッシュチェック
  if (cachedMapping && Date.now() - cacheTimestamp < CACHE_TTL) {
    return cachedMapping;
  }

  if (!GOOGLE_SERVICE_ACCOUNT_EMAIL || !GOOGLE_PRIVATE_KEY || !GOOGLE_SPREADSHEET_ID) {
    console.warn("Google Sheets credentials not configured");
    return {};
  }

  try {
    const accessToken = await getAccessToken();

    // シート名を取得してからデータ取得
    const metaRes = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${GOOGLE_SPREADSHEET_ID}?fields=sheets(properties(sheetId,title))`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    const metaData = await metaRes.json();

    const sheet = metaData.sheets?.find(
      (s: { properties: { sheetId: number } }) => s.properties.sheetId === parseInt(GOOGLE_SHEET_GID)
    );
    const sheetName = sheet?.properties?.title || "Sheet1";

    // データ取得（A:C列 = 氏名, フリガナ, SlackユーザーID）
    const dataRes = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${GOOGLE_SPREADSHEET_ID}/values/${encodeURIComponent(sheetName)}!A:C`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    const data = await dataRes.json();

    const mapping: SlackUserMapping = {};
    const rows = data.values || [];

    // ヘッダー行をスキップ
    for (let i = 1; i < rows.length; i++) {
      const [name, , slackId] = rows[i];
      if (name && slackId) {
        // フルネームでマッピング
        mapping[name] = slackId;
        // 姓のみでもマッピング（「佐藤 翔吾」→「佐藤」）
        const lastName = name.split(/\s+/)[0];
        if (lastName && !mapping[lastName]) {
          mapping[lastName] = slackId;
        }
      }
    }

    cachedMapping = mapping;
    cacheTimestamp = Date.now();
    return mapping;
  } catch (error) {
    console.error("Failed to fetch Slack user mapping:", error);
    return cachedMapping || {};
  }
}

export function resolveSlackMention(assigneeName: string, mapping: SlackUserMapping): string {
  if (!assigneeName) return "";

  // 完全一致
  if (mapping[assigneeName]) {
    return `<@${mapping[assigneeName]}>`;
  }

  // 括弧を除去して検索（例: 「藤原（AtoJ）」→「藤原」）
  const nameWithoutParens = assigneeName.replace(/[（(].+[）)]/g, "").trim();
  if (mapping[nameWithoutParens]) {
    return `<@${mapping[nameWithoutParens]}>`;
  }

  // 姓のみで検索
  const lastName = nameWithoutParens.split(/\s+/)[0];
  if (mapping[lastName]) {
    return `<@${mapping[lastName]}>`;
  }

  // 部分一致検索
  for (const [key, slackId] of Object.entries(mapping)) {
    if (assigneeName.includes(key) || key.includes(nameWithoutParens)) {
      return `<@${slackId}>`;
    }
  }

  return "";
}
