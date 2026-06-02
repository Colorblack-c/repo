/*
 123盘去广告
For Loon response rewrite. Upload this file to:
 2026.06.02  更新
*/

const url = $request.url;
let body = $response.body || "";

function finish(value) {
  $done({ body: typeof value === "string" ? value : JSON.stringify(value) });
}

function safeJson(text) {
  try {
    return JSON.parse(text);
  } catch (_) {
    return null;
  }
}

function noAdId() {
  return `${Date.now()}${Math.floor(Math.random() * 100000)}`;
}

if (/api\.123278\.com\/api\/app\/config\/get/.test(url)) {
  const obj = safeJson(body);
  if (obj && obj.data) {
    obj.data.isInitAd = 0;

    if (obj.data.removeAdConfig && typeof obj.data.removeAdConfig === "object") {
      const cfg = obj.data.removeAdConfig;
      const zeroKeys = [
        "BuyRemoveAds",
        "RemoveAdsTime",
        "button_download",
        "button_quit",
        "button_return_file",
        "button_splash_screen",
        "button_upload",
        "button_user_center",
        "remove_ads_effect",
        "firstPrice",
        "renewPrice"
      ];
      zeroKeys.forEach((key) => {
        if (key in cfg) cfg[key] = 0;
      });
      cfg.mainTitle = "";
      cfg.subTitle = "";
      cfg.topTitle = "";
      cfg.payButtonFirst = "";
      cfg.payButtonRenew = "";
    }
    finish(obj);
  } else {
    finish(body);
  }
} else if (/mobads\.baidu\.com\/cpro\/ui\/mads\.php/.test(url)) {
  finish({
    ad: [],
    n: 0,
    error_code: 200000,
    req_id: noAdId(),
    qk: noAdId(),
    no_ad_lurl: []
  });
} else if (/(api-access\.pangolin-sdk-toutiao(?:1)?\.com|gromore\.pangolin-sdk-toutiao\.com)\/api\/ad\/union\//.test(url)) {
  finish({
    request_id: noAdId(),
    status_code: 20001,
    reason: 112,
    desc: "no ads"
  });
} else {
  finish(body);
}
