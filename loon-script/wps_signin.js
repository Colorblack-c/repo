/*
WPS automatic sign-in for Loon.

Open the WPS task/sign-in page once after enabling the plugin. The http-request
rule stores your live Cookie. Scheduled and network-change runs then reuse it.
*/

var STORE_PREFIX = "wps.signin.";
var KEY_COOKIE = STORE_PREFIX + "cookie";
var KEY_UA = STORE_PREFIX + "ua";
var KEY_SIGNED_DATE = STORE_PREFIX + "signed.date";
var KEY_CRYPTOJS = STORE_PREFIX + "cryptojs";
var TITLE = "WPS 自动签到";
var CRYPTO_JS_URLS = [
  "https://cdnjs.cloudflare.com/ajax/libs/crypto-js/4.2.0/crypto-js.min.js",
  "https://cdn.jsdelivr.net/npm/crypto-js@4.2.0/crypto-js.min.js",
  "https://unpkg.com/crypto-js@4.2.0/crypto-js.js"
];

function log(message) {
  console.log("[WPS SignIn] " + message);
}

function notify(subtitle, content) {
  try {
    $notification.post(TITLE, subtitle, content || "");
  } catch (e) {}
}

function read(key) {
  return $persistentStore.read(key) || "";
}

function write(value, key) {
  return $persistentStore.write(String(value || ""), key);
}

function todayNumber() {
  var d = new Date();
  var y = d.getFullYear();
  var m = String(d.getMonth() + 1).padStart(2, "0");
  var day = String(d.getDate()).padStart(2, "0");
  return "" + y + m + day;
}

function normalizeHeaders(headers) {
  var out = {};
  headers = headers || {};
  Object.keys(headers).forEach(function (key) {
    out[key.toLowerCase()] = headers[key];
  });
  return out;
}

function captureRequest() {
  var headers = normalizeHeaders($request.headers || {});
  var cookie = headers.cookie || "";
  var ua = headers["user-agent"] || "";
  var changed = false;

  if (cookie && /wps_sid=|wps_sids=|kso_sid=/.test(cookie)) {
    if (cookie !== read(KEY_COOKIE)) {
      write(cookie, KEY_COOKIE);
      changed = true;
    }
    var uid = cookie.match(/(?:^|;\s*)uid=([^;]+)/);
    if (uid) write(decodeURIComponent(uid[1]), STORE_PREFIX + "uid");
  }

  if (ua && ua !== read(KEY_UA)) {
    write(ua, KEY_UA);
    changed = true;
  }

  if (changed) {
    log("Cookie captured.");
    notify("Cookie 已更新", "后续会按小时和网络变化自动巡查签到。");
  }

  $done({});
}

function request(method, url, headers, body, callback) {
  var params = {
    url: url,
    timeout: 15000,
    headers: headers || {},
    body: body,
    "auto-cookie": false,
    alpn: "h2"
  };
  $httpClient[method.toLowerCase()](params, function (err, resp, data) {
    if (err) return callback(new Error(err));
    var status = resp && resp.status;
    if (status && (status < 200 || status >= 300)) {
      return callback(new Error("HTTP " + status + ": " + String(data || "").slice(0, 120)));
    }
    callback(null, data || "");
  });
}

function jsonRequest(method, url, headers, body, callback) {
  request(method, url, headers, body, function (err, data) {
    if (err) return callback(err);
    try {
      callback(null, JSON.parse(data));
    } catch (e) {
      callback(new Error("JSON parse failed: " + String(data).slice(0, 120)));
    }
  });
}

function getCookieUid(cookie) {
  var match = String(cookie || "").match(/(?:^|;\s*)uid=([^;]+)/);
  if (match) return decodeURIComponent(match[1]);
  return read(STORE_PREFIX + "uid");
}

function baseHeaders(cookie) {
  var ua = read(KEY_UA) || "Mozilla/5.0 (iPhone; CPU iPhone OS 16_2 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 WpsiOS/12.45.1";
  return {
    "Cookie": cookie,
    "User-Agent": ua,
    "Accept": "application/json, text/plain, */*",
    "Accept-Language": "zh-CN,zh-Hans;q=0.9",
    "Origin": "https://personal-act.wps.cn",
    "Referer": "https://personal-act.wps.cn/"
  };
}

function checkStatus(cookie, callback) {
  jsonRequest("GET", "https://personal-bus.wps.cn/sign_in/v1/user_stat?channel=", baseHeaders(cookie), null, function (err, json) {
    if (err) return callback(err);
    if (json.result !== "ok") return callback(new Error(json.msg || "user_stat failed"));
    callback(null, !!(json.data && json.data.has_signed), json);
  });
}

function getEncryptKey(cookie, callback) {
  jsonRequest("GET", "https://personal-bus.wps.cn/sign_in/v1/encrypt/key", baseHeaders(cookie), null, function (err, json) {
    if (err) return callback(err);
    if (json.result !== "ok" || !json.data) return callback(new Error(json.msg || "encrypt key missing"));
    callback(null, atobCompat(json.data));
  });
}

function loadCryptoJS(callback) {
  if (typeof CryptoJS !== "undefined") return callback(null, CryptoJS);

  var cached = read(KEY_CRYPTOJS);
  if (cached) {
    try {
      eval(cached);
      if (typeof CryptoJS !== "undefined") return callback(null, CryptoJS);
    } catch (e) {
      log("Cached CryptoJS eval failed: " + e.message);
    }
  }

  var index = 0;
  function tryNext() {
    if (index >= CRYPTO_JS_URLS.length) {
      return callback(new Error("CryptoJS load failed"));
    }
    var url = CRYPTO_JS_URLS[index++];
    request("GET", url, {"User-Agent": "Loon"}, null, function (err, code) {
      if (err || !code || code.indexOf("CryptoJS") < 0) {
        log("CryptoJS source failed: " + url);
        return tryNext();
      }
      try {
        eval(code);
        if (typeof CryptoJS === "undefined") throw new Error("CryptoJS undefined");
        write(code, KEY_CRYPTOJS);
        callback(null, CryptoJS);
      } catch (e) {
        log("CryptoJS eval failed: " + e.message);
        tryNext();
      }
    });
  }
  tryNext();
}

function randomAesKey(length) {
  length = length || 32;
  var chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  var ts = String(Math.floor(Date.now() / 1000));
  var randomLen = Math.max(1, length - ts.length);
  var out = "";
  for (var i = 0; i < randomLen; i++) {
    out += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return (out + ts).slice(0, length);
}

function makeEncryptedPayload(publicKey, plainText, callback) {
  loadCryptoJS(function (err, CryptoJSRef) {
    if (err) return callback(err);
    try {
      var aesKey = randomAesKey(32);
      var key = CryptoJSRef.enc.Utf8.parse(aesKey);
      var iv = CryptoJSRef.enc.Utf8.parse(aesKey.substr(0, 16));
      var encrypted = CryptoJSRef.AES.encrypt(plainText, key, {
        iv: iv,
        mode: CryptoJSRef.mode.CBC,
        padding: CryptoJSRef.pad.ZeroPadding
      }).toString();
      var token = rsaEncryptBase64(publicKey, aesKey);
      callback(null, {encryptData: encrypted, token: token});
    } catch (e) {
      callback(e);
    }
  });
}

function signIn(cookie, callback) {
  var uid = getCookieUid(cookie);
  if (!uid) return callback(new Error("uid not found in Cookie"));

  getEncryptKey(cookie, function (err, publicKey) {
    if (err) return callback(err);
    var plain = JSON.stringify({user_id: Number(uid), platform: 32});
    makeEncryptedPayload(publicKey, plain, function (cryptoErr, data) {
      if (cryptoErr) return callback(cryptoErr);

      var headers = baseHeaders(cookie);
      headers["Content-Type"] = "application/json";
      headers["token"] = data.token;

      var body = JSON.stringify({
        encrypt: true,
        extra: data.encryptData,
        pay_origin: "ios_ucs_rwzx sign",
        channel: ""
      });

      jsonRequest("POST", "https://personal-bus.wps.cn/sign_in/v1/sign_in", headers, body, function (postErr, json) {
        if (postErr) return callback(postErr);
        if (json.result === "ok") return callback(null, json);
        if (json.msg === "has sign" || json.ext_msg === "has sign") return callback(null, json);
        callback(new Error(json.msg || json.ext_msg || "sign_in failed"));
      });
    });
  });
}

function run() {
  var today = todayNumber();
  var signedDate = read(KEY_SIGNED_DATE);
  if (signedDate === today) {
    log("Already signed today, skip.");
    return $done();
  }

  var cookie = read(KEY_COOKIE);
  if (!cookie) {
    notify("缺少 Cookie", "请打开一次 WPS 任务中心/签到页，让插件捕获登录态。");
    log("Cookie missing.");
    return $done();
  }

  checkStatus(cookie, function (statusErr, hasSigned) {
    if (statusErr) {
      log("Status check failed: " + statusErr.message);
      return signIn(cookie, finishSign);
    }

    if (hasSigned) {
      write(today, KEY_SIGNED_DATE);
      log("Server says already signed.");
      return $done();
    }

    signIn(cookie, finishSign);
  });

  function finishSign(err, json) {
    if (err) {
      log("Sign failed: " + err.message);
      notify("签到失败", err.message);
      return $done();
    }

    write(today, KEY_SIGNED_DATE);
    var rewards = [];
    try {
      rewards = ((json.data || {}).rewards || []).map(function (item) {
        return item.reward_name;
      }).filter(Boolean);
    } catch (e) {}
    var message = rewards.length ? rewards.join("，") : (json.msg || "成功");
    log("Sign success: " + message);
    notify("签到成功", message);
    $done();
  }
}

function atobCompat(input) {
  if (typeof atob === "function") return atob(input);
  var chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=";
  var str = String(input).replace(/=+$/, "");
  var output = "";
  if (str.length % 4 === 1) throw new Error("Invalid base64");
  for (var bc = 0, bs, buffer, idx = 0; buffer = str.charAt(idx++);) {
    buffer = chars.indexOf(buffer);
    if (~buffer) {
      bs = bc % 4 ? bs * 64 + buffer : buffer;
      if (bc++ % 4) output += String.fromCharCode(255 & bs >> (-2 * bc & 6));
    }
  }
  return output;
}

function btoaCompat(binary) {
  if (typeof btoa === "function") return btoa(binary);
  var chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=";
  var output = "";
  for (var block = 0, charCode, idx = 0, map = chars; binary.charAt(idx | 0) || (map = "=", idx % 1); output += map.charAt(63 & block >> 8 - idx % 1 * 8)) {
    charCode = binary.charCodeAt(idx += 3 / 4);
    if (charCode > 0xff) throw new Error("Invalid character");
    block = block << 8 | charCode;
  }
  return output;
}

function bytesToBinary(bytes) {
  var out = "";
  for (var i = 0; i < bytes.length; i++) out += String.fromCharCode(bytes[i]);
  return out;
}

function binaryToBytes(binary) {
  var out = [];
  for (var i = 0; i < binary.length; i++) out.push(binary.charCodeAt(i) & 0xff);
  return out;
}

function derReader(bytes) {
  var pos = 0;
  function readByte() {
    if (pos >= bytes.length) throw new Error("DER overflow");
    return bytes[pos++];
  }
  function readLen() {
    var len = readByte();
    if (len < 0x80) return len;
    var count = len & 0x7f;
    len = 0;
    for (var i = 0; i < count; i++) len = (len << 8) | readByte();
    return len;
  }
  function readTLV(expectedTag) {
    var tag = readByte();
    if (expectedTag !== undefined && tag !== expectedTag) {
      throw new Error("Unexpected DER tag " + tag + ", expected " + expectedTag);
    }
    var len = readLen();
    var value = bytes.slice(pos, pos + len);
    pos += len;
    return {tag: tag, len: len, value: value};
  }
  return {readTLV: readTLV};
}

function parseRsaPublicKey(pem) {
  var body = String(pem).replace(/-----(BEGIN|END) RSA PUBLIC KEY-----/g, "")
    .replace(/-----(BEGIN|END) PUBLIC KEY-----/g, "")
    .replace(/\s+/g, "");
  var bytes = binaryToBytes(atobCompat(body));
  var root = derReader(bytes).readTLV(0x30).value;
  var rootReader = derReader(root);
  var first = rootReader.readTLV();

  var rsaBytes;
  if (first.tag === 0x30) {
    var bitString = rootReader.readTLV(0x03).value;
    rsaBytes = derReader(bitString.slice(1)).readTLV(0x30).value;
  } else if (first.tag === 0x02) {
    var nBytesDirect = trimLeadingZero(first.value);
    var eBytesDirect = trimLeadingZero(rootReader.readTLV(0x02).value);
    return {n: bytesToBigInt(nBytesDirect), e: bytesToBigInt(eBytesDirect), k: nBytesDirect.length};
  } else {
    throw new Error("Unsupported public key");
  }

  var rsaReader = derReader(rsaBytes);
  var nBytes = trimLeadingZero(rsaReader.readTLV(0x02).value);
  var eBytes = trimLeadingZero(rsaReader.readTLV(0x02).value);
  return {n: bytesToBigInt(nBytes), e: bytesToBigInt(eBytes), k: nBytes.length};
}

function trimLeadingZero(bytes) {
  while (bytes.length > 1 && bytes[0] === 0) bytes = bytes.slice(1);
  return bytes;
}

function bytesToBigInt(bytes) {
  var hex = "";
  for (var i = 0; i < bytes.length; i++) {
    hex += bytes[i].toString(16).padStart(2, "0");
  }
  return BigInt("0x" + (hex || "0"));
}

function bigIntToBytes(value, length) {
  var hex = value.toString(16);
  if (hex.length % 2) hex = "0" + hex;
  var out = [];
  for (var i = 0; i < hex.length; i += 2) out.push(parseInt(hex.slice(i, i + 2), 16));
  while (out.length < length) out.unshift(0);
  return out.slice(-length);
}

function modPow(base, exponent, modulus) {
  var result = 1n;
  base %= modulus;
  while (exponent > 0n) {
    if (exponent & 1n) result = result * base % modulus;
    exponent >>= 1n;
    base = base * base % modulus;
  }
  return result;
}

function rsaEncryptBase64(publicKeyPem, text) {
  var key = parseRsaPublicKey(publicKeyPem);
  var data = [];
  for (var i = 0; i < text.length; i++) data.push(text.charCodeAt(i) & 0xff);
  if (data.length > key.k - 11) throw new Error("RSA message too long");

  var psLen = key.k - data.length - 3;
  var block = [0, 2];
  for (var j = 0; j < psLen; j++) {
    var b = 0;
    while (!b) b = Math.floor(Math.random() * 255) + 1;
    block.push(b);
  }
  block.push(0);
  block = block.concat(data);

  var encrypted = modPow(bytesToBigInt(block), key.e, key.n);
  return btoaCompat(bytesToBinary(bigIntToBytes(encrypted, key.k)));
}

if (typeof $request !== "undefined" && $request && $request.url) {
  captureRequest();
} else {
  run();
}
