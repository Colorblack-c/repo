const KEY_CONFIG = "youpin.sign.config";
const KEY_SIGNED_DATE = "youpin.sign.signedDate";
const KEY_LAST_CHECK_DATE = "youpin.sign.lastCheckDate";
const DEFAULT_ACT_ID = "686b76a6ac546f0001b930c5";
const ACT_INFO_URL = "https://m.xiaomiyoupin.com/mtop/act/redPacketSign/getActInfo";
const SIGN_URL = "https://m.xiaomiyoupin.com/mtop/act/redPacketSign/clickSign";

const isRequest = typeof $request !== "undefined" && $request && $request.url;

if (isRequest) {
  captureCredential();
  $done({});
} else {
  runCheckIn();
}

function captureCredential() {
  const headers = normalizeHeaders($request.headers || {});
  const actId = extractActId($request.body) || DEFAULT_ACT_ID;
  const saved = {
    actId,
    headers: pickHeaders(headers),
    updatedAt: new Date().toISOString(),
  };

  if (!saved.headers.cookie) {
    notify("凭据捕获失败", "没有读到 Cookie，请确认已开启 MitM 并信任证书");
    return;
  }

  writeJson(KEY_CONFIG, saved);

  if ($request.url.indexOf("/clickSign") !== -1) {
    const today = todayString();
    $persistentStore.write(today, KEY_SIGNED_DATE);
  }

  notify("凭据已更新", `活动 ID: ${actId}`);
}

function runCheckIn() {
  const today = todayString();
  if ($persistentStore.read(KEY_SIGNED_DATE) === today) {
    return done(`今日已签到，跳过巡查: ${today}`);
  }

  const config = readJson(KEY_CONFIG);
  if (!config || !config.headers || !config.headers.cookie) {
    notify("小米有品签到", "未找到凭据，请先打开小米有品签到页触发一次捕获");
    return done("missing credential");
  }

  config.actId = config.actId || DEFAULT_ACT_ID;
  $persistentStore.write(today, KEY_LAST_CHECK_DATE);

  requestActInfo(config, (err, info) => {
    if (err) {
      notify("小米有品签到检查失败", err);
      return done(err);
    }

    const signed = info && info.data && info.data.signUserInfo && info.data.signUserInfo.sign === true;
    if (signed) {
      $persistentStore.write(today, KEY_SIGNED_DATE);
      return done("remote already signed");
    }

    clickSign(config, (signErr, result) => {
      if (signErr) {
        notify("小米有品签到失败", signErr);
        return done(signErr);
      }

      const data = result && result.data ? result.data : {};
      const success = result && result.code === 0 && result.success !== false && (data.code === 0 || data.msg);
      if (success) {
        $persistentStore.write(today, KEY_SIGNED_DATE);
        const amountText = data.amount ? `获得红包 ${data.amount} 元` : (data.msg || "签到成功");
        notify("小米有品签到成功", amountText);
        return done(amountText);
      }

      const msg = data.msg || result.message || result.msg || "接口返回异常";
      notify("小米有品签到失败", msg);
      done(msg);
    });
  });
}

function requestActInfo(config, callback) {
  const params = buildPostParams(ACT_INFO_URL, config);
  $httpClient.post(params, (error, response, body) => {
    handleJsonResponse(error, response, body, callback);
  });
}

function clickSign(config, callback) {
  const params = buildPostParams(SIGN_URL, config);
  $httpClient.post(params, (error, response, body) => {
    handleJsonResponse(error, response, body, callback);
  });
}

function buildPostParams(url, config) {
  const headers = Object.assign({}, config.headers);
  headers["content-type"] = headers["content-type"] || "application/json";
  headers["origin"] = headers["origin"] || "https://m.xiaomiyoupin.com";
  headers["referer"] = headers["referer"] || `https://m.xiaomiyoupin.com/hd/checkInsignIn/index.html?hideNavBar=true&channelId=${config.actId}&source=YPQD_YPMRQD`;
  delete headers["content-length"];
  delete headers["host"];

  return {
    url,
    timeout: 10000,
    headers,
    body: JSON.stringify([{}, { actId: config.actId }]),
  };
}

function handleJsonResponse(error, response, body, callback) {
  if (error) return callback(String(error));
  if (!response || response.status < 200 || response.status >= 300) {
    return callback(`HTTP ${response ? response.status : "无响应"}`);
  }

  try {
    const json = JSON.parse(body || "{}");
    if (json.code !== 0 || json.success === false) {
      return callback(json.message || json.msg || `业务码异常: ${json.code}`, json);
    }
    callback(null, json);
  } catch (e) {
    callback(`JSON 解析失败: ${e.message || e}`);
  }
}

function pickHeaders(headers) {
  const allow = [
    "accept",
    "accept-language",
    "content-type",
    "cookie",
    "origin",
    "referer",
    "user-agent",
  ];
  const picked = {};
  allow.forEach((name) => {
    if (headers[name]) picked[name] = headers[name];
  });
  return picked;
}

function normalizeHeaders(headers) {
  const normalized = {};
  Object.keys(headers).forEach((key) => {
    normalized[String(key).toLowerCase()] = headers[key];
  });
  return normalized;
}

function extractActId(body) {
  if (!body) return "";
  try {
    const payload = JSON.parse(body);
    if (Array.isArray(payload)) {
      for (const item of payload) {
        if (item && item.actId) return String(item.actId);
      }
    }
    if (payload && payload.actId) return String(payload.actId);
  } catch (e) {
    const match = String(body).match(/"actId"\s*:\s*"([^"]+)"/);
    if (match) return match[1];
  }
  return "";
}

function todayString() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function readJson(key) {
  const raw = $persistentStore.read(key);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch (e) {
    return null;
  }
}

function writeJson(key, value) {
  return $persistentStore.write(JSON.stringify(value), key);
}

function notify(subtitle, content) {
  $notification.post("小米有品自动签到", subtitle || "", content || "");
}

function done(message) {
  console.log(`[小米有品自动签到] ${message || "done"}`);
  $done();
}
