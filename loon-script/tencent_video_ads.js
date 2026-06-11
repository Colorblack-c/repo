/*
 Tencent Video ad cleaner for Loon.
 Upload target:
 https://colorblack-c.github.io/repo/loon-script/tencent_video_ads.js
*/

const url = $request.url || "";
const isRequestPhase = typeof $response === "undefined";
const rawBody = isRequestPhase ? ($request.body || "") : ($response.body || "");

function done(value) {
  if (isRequestPhase) {
    $done({
      response: {
        status: 200,
        headers: { "Content-Type": "application/json; charset=utf-8" },
        body: JSON.stringify(value || {})
      }
    });
    return;
  }

  $done({ body: typeof value === "string" ? value : JSON.stringify(value) });
}

function safeJson(text) {
  try {
    return JSON.parse(text);
  } catch (_) {
    return null;
  }
}

function maybeNestedJson(value) {
  if (typeof value !== "string") return value;
  const trimmed = value.trim();
  if (!/^[{[]/.test(trimmed)) return value;
  const parsed = safeJson(trimmed);
  return parsed === null ? value : parsed;
}

function restoreNestedJson(original, value) {
  return typeof original === "string" && typeof value !== "string" ? JSON.stringify(value) : value;
}

const adKeyPattern = /(^|_)(ad|ads|adv|advert|advertise|advertisement|gdt|splash|popup|pop|banner|promotion|promote|interstitial|miaozhen|monitor|report)(_|$)/i;
const camelAdKeyPattern = /(?:^|[A-Z])(Ad|Ads|Adv|Advert|Advertise|Advertisement|Gdt|Splash|Popup|Pop|Banner|Promotion|Promote|Interstitial|Miaozhen|Monitor|Report)(?:[A-Z]|$)/;
const keepKeyPattern = /^(address|advance|advise|video|vod|avatar|brand|broadcast)$/i;
const adUrlPattern = /(?:gdt\.qq\.com|pgdt\.gtimg\.cn|p2\.l\.qq\.com|miaozhen\.com|in-neo\.cn|reachmax\.cn|mim-x\.jd\.com|\/(?:starter|promotionTest)\/|\/ad[._/-]|advert|splash|popup|banner|promotion)/i;

function isAdKey(key) {
  if (!key || keepKeyPattern.test(key)) return false;
  return adKeyPattern.test(key) || camelAdKeyPattern.test(key);
}

function neutralValue(value) {
  if (Array.isArray(value)) return [];
  if (typeof value === "boolean") return false;
  if (typeof value === "number") return 0;
  if (typeof value === "string") return "";
  if (value && typeof value === "object") return {};
  return value;
}

function looksLikeAdObject(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const text = JSON.stringify(value);
  return adUrlPattern.test(text) || /"ad(?:vert)?[_-]?(?:id|type|url|img|image|material|position)"/i.test(text);
}

function scrub(value, depth) {
  if (!value || typeof value !== "object" || depth > 10) return value;

  if (Array.isArray(value)) {
    for (let i = value.length - 1; i >= 0; i -= 1) {
      const item = value[i];
      if (typeof item === "string" && adUrlPattern.test(item)) {
        value.splice(i, 1);
      } else if (looksLikeAdObject(item)) {
        value.splice(i, 1);
      } else {
        scrub(item, depth + 1);
      }
    }
    return value;
  }

  Object.keys(value).forEach((key) => {
    const original = value[key];
    const parsed = maybeNestedJson(original);
    value[key] = parsed;

    if (isAdKey(key)) {
      value[key] = neutralValue(parsed);
      return;
    }

    if (typeof parsed === "string" && adUrlPattern.test(parsed)) {
      value[key] = "";
      return;
    }

    if (Array.isArray(parsed)) {
      for (let i = parsed.length - 1; i >= 0; i -= 1) {
        if (looksLikeAdObject(parsed[i])) parsed.splice(i, 1);
      }
    }

    scrub(parsed, depth + 1);
    value[key] = restoreNestedJson(original, parsed);
  });

  return value;
}

function cleanKnownConfig(obj) {
  if (!obj || typeof obj !== "object") return obj;

  if (obj.control_data && typeof obj.control_data === "object") {
    obj.control_data.enable_report = false;
    obj.control_data.report_infra = 0;
  }

  if (obj.data && typeof obj.data === "object") {
    [
      "splash",
      "splash_ad",
      "splashAd",
      "startup_ad",
      "launch_ad",
      "popup",
      "popup_list",
      "banner",
      "banner_list",
      "ad_list",
      "advertisement",
      "promotion",
      "promotion_list"
    ].forEach((key) => {
      if (key in obj.data) obj.data[key] = neutralValue(obj.data[key]);
    });
  }

  return scrub(obj, 0);
}

if (isRequestPhase) {
  done({});
} else {
  const json = safeJson(rawBody);
  if (json === null) {
    $done({ body: rawBody });
  } else {
    done(cleanKnownConfig(json));
  }
}
