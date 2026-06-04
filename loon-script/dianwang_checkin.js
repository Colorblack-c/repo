const NAME = "网上国网签到";
const STORE_KEY = "dianwang_checkin_request";
const STATUS_KEY = "dianwang_checkin_status";

const isCapture = typeof $request !== "undefined";

if (isCapture) {
  capture();
} else {
  checkin();
}

function capture() {
  const headers = normalizeHeaders($request.headers || {});
  delete headers["content-length"];
  delete headers["content-encoding"];
  delete headers["host"];

  const payload = {
    url: $request.url,
    method: $request.method || "POST",
    headers,
    body: $request.body || "",
    capturedAt: new Date().toISOString(),
  };

  const saved = readStore();
  if (/q104051/.test(payload.url)) {
    saved.action = payload;
  } else if (!saved.action) {
    saved.config = payload;
  } else {
    saved.config = payload;
  }

  $persistentStore.write(JSON.stringify(saved), STORE_KEY);
  notify("捕获成功", requestName(payload.url));
  $done({});
}

function checkin() {
  if (isDoneToday()) return $done();

  const saved = readStore();
  const payload = saved.action || saved.config;
  if (!payload) {
    notify("未捕获请求", "先打开 App 签到页并手动签到一次");
    return $done();
  }

  const options = {
    url: payload.url,
    headers: payload.headers || {},
    body: payload.body || "",
  };

  $httpClient.post(options, (error, response, data) => {
    if (error) {
      notify("签到失败", String(error));
      return $done();
    }

    const status = response && response.status ? response.status : "unknown";
    const message = parseMessage(data);

    if (isSuccessful(status, data, message)) {
      markDoneToday(status, message);
    }

    notify("签到完成", `HTTP ${status}${message ? " - " + message : ""}`);
    $done();
  });
}

function isDoneToday() {
  const raw = $persistentStore.read(STATUS_KEY);
  if (!raw) return false;
  try {
    const status = JSON.parse(raw);
    return status && status.date === todayKey() && status.done;
  } catch (_) {
    return false;
  }
}

function markDoneToday(status, message) {
  const value = {
    date: todayKey(),
    done: true,
    status,
    message: message || "",
    checkedAt: new Date().toISOString(),
  };
  $persistentStore.write(JSON.stringify(value), STATUS_KEY);
}

function todayKey() {
  const date = new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function isSuccessful(status, data, message) {
  const code = Number(status);
  if (code < 200 || code >= 300) return false;

  const text = `${data || ""} ${message || ""}`;
  if (/101009|系统正忙|失败|错误|error/i.test(text)) return false;
  return true;
}

function readStore() {
  const raw = $persistentStore.read(STORE_KEY);
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    if (parsed && parsed.url) return { action: parsed };
    return parsed || {};
  } catch (_) {
    return {};
  }
}

function normalizeHeaders(headers) {
  const normalized = {};
  for (const key in headers) {
    if (!Object.prototype.hasOwnProperty.call(headers, key)) continue;
    normalized[key.toLowerCase()] = headers[key];
  }
  return normalized;
}

function requestName(url) {
  if (/q104051/.test(url)) return "已保存签到动作接口 q104051";
  if (/signInConfig\/f90/.test(url)) return "已保存签到配置接口 signInConfig";
  return "已保存请求";
}

function parseMessage(data) {
  if (!data) return "";
  try {
    const json = JSON.parse(data);
    return json.message || json.msg || json.code || "";
  } catch (_) {
    return String(data).slice(0, 80);
  }
}

function notify(title, subtitle) {
  $notification.post(NAME, title, subtitle || "");
}
