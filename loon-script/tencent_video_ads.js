/*
 Tencent Video ad cleaner for Loon.
 Upload target:
 https://colorblack-c.github.io/repo/loon-script/tencent_video_ads.js
*/

const url = $request.url || "";
const isRequestPhase = typeof $response === "undefined";
const rawBody = isRequestPhase ? ($request.body || "") : ($response.body || "");

function pass() {
  $done({});
}

function respond(body, headers, status) {
  $done({
    response: {
      status: status || 200,
      headers: headers || { "Content-Type": "application/json; charset=utf-8" },
      body: body || ""
    }
  });
}

function done(value) {
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
const adUrlPattern = /(?:gdt\.qq\.com|gdtimg\.com|pgdt\.gtimg\.cn|p2\.l\.qq\.com|miaozhen\.com|in-neo\.cn|reachmax\.cn|mim-x\.jd\.com|ccc-x\.jd\.com|tanx\.com|s\.iwan\.qq\.com|\/(?:starter|promotionTest)\/|\/ad[._/-]|advert|splash|popup|banner|promotion)/i;
const directRejectHostPattern = /^https?:\/\/xs\.gdt\.qq\.com\//i;
const iVideoUrlPattern = /^https?:\/\/i\.video\.qq\.com\//i;
const promotionServicePattern = /(?:trpc\.promotion\.adapter\.adapter\/GetFloatActivity|trpc\.flow_pool\.gateway\.FlowPoolActivity\/GetPromotionGlobalConfig|trpc\.vip_ad_promotion\.access_adaptor\.CommonAccessService\/AccessPromotion|trpc\.iwan\.chosen_page_service\.ChosenPageService\/GetRecentGameSlip|trpc\.iwan\.sdk_report\.Report\/GetGameInfoV2|trpc\.iwan\.valueattribution\.ValueAttribution\/AttributionReport|trpc\.growth_raptor\.access\.AccessApi\/activity\/access\/PopupContentWithTask|trpc\.iwan\.usr_portrait\.UsrPortrait\/OnlineInsightsWarmUp)/i;
const protobufAdMarkerPattern = /(?:type\.googleapis\.com\/com\.tencent\.qqlive\.protocol\.pb\.Ad(?:FeedInfo|FocusPoster)|ad_block_[12]|_ad_insert_mix_block|ad_nfb_|material_url|view_ad_ssp_|InnerAdCommonPromotionEventActivityList|promotionTest|ad_control_config_test|review\.gdtimg\.com|pgdt\.gtimg\.cn|ccc-x\.jd\.com|s\.iwan\.qq\.com)/i;

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

function makeSameLengthBlank(source) {
  if (!source) return source;
  const prefix = source.startsWith("http://") ? "http://0.0.0.0/" : "https://0.0.0.0/";
  if (source.length <= prefix.length) return " ".repeat(source.length);
  return prefix + "#".repeat(source.length - prefix.length);
}

function scrubProtobufText(body) {
  if (typeof body !== "string" || !protobufAdMarkerPattern.test(body)) return body;

  let changed = body;

  changed = changed.replace(/https?:\/\/(?:pgdt\.gtimg\.cn|[^/\s"]+\.gdt\.qq\.com|review\.gdtimg\.com|p2\.l\.qq\.com|tytx\.m\.cn\.miaozhen\.com|t\.in-neo\.cn|v2\.reachmax\.cn|mim-x\.jd\.com|ccc-x\.jd\.com|ef-dongfeng\.tanx\.com|s\.iwan\.qq\.com)[^\s"'<>\\]+/gi, makeSameLengthBlank);
  changed = changed.replace(/https?:\/\/(?:vfiles|wfiles)\.gtimg\.cn\/(?:wuji_dashboard\/)?(?:wupload\/)?xy\/(?:starter|promotionTest)\/[^\s"'<>\\]+/gi, makeSameLengthBlank);
  changed = changed.replace(/https?:\/\/(?:ugd|ugcyz)\.gtimg\.com\/[^\s"'<>\\]+/gi, makeSameLengthBlank);

  [
    "type.googleapis.com/com.tencent.qqlive.protocol.pb.AdFeedInfo",
    "type.googleapis.com/com.tencent.qqlive.protocol.pb.AdFocusPoster",
    "InnerAdCommonPromotionEventActivityList",
    "ad_control_config_test",
    "_ad_insert_mix_block",
    "material_url"
  ].forEach((marker) => {
    changed = changed.split(marker).join(" ".repeat(marker.length));
  });

  changed = changed.replace(/ad_block_[12]/g, "ad_block_0");
  changed = changed.replace(/ad_nfb_[A-Za-z0-9_]+/g, (match) => " ".repeat(match.length));
  changed = changed.replace(/view_ad_ssp_[A-Za-z0-9_]+/g, (match) => " ".repeat(match.length));

  return changed;
}

function shouldReturnEmptyPromotion(body) {
  if (typeof body !== "string") return false;
  if (promotionServicePattern.test(body)) return true;
  if (body.length > 30000) return false;
  return /(?:InnerAdCommonPromotionEventActivityList|trpc\.vip_ad_promotion|promotionTest|s\.iwan\.qq\.com|growth_raptor)/i.test(body);
}

if (isRequestPhase) {
  if (directRejectHostPattern.test(url)) {
    respond("{}");
  } else if (iVideoUrlPattern.test(url) && promotionServicePattern.test(rawBody)) {
    respond("", { "Content-Type": "application/octet-stream" });
  } else {
    pass();
  }
} else {
  const json = safeJson(rawBody);
  if (json === null) {
    if (shouldReturnEmptyPromotion(rawBody)) {
      done("");
    } else {
      done(scrubProtobufText(rawBody));
    }
  } else {
    done(cleanKnownConfig(json));
  }
}
