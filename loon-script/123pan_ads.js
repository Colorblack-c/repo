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

function isHomeAdResource(value) {
  return typeof value === "string" && (
    /\/static-by-custom\/img\/app_ad_[^/]+\.(?:png|jpe?g|webp|gif)/i.test(value) ||
    /\/manager\/advert_resource\/[^/]+\.(?:png|jpe?g|webp|gif)/i.test(value) ||
    /app_(?:home|ad)[^/]*\.(?:png|jpe?g|webp|gif)/i.test(value)
  );
}

function isHomeAdObject(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;

  const text = JSON.stringify(value);
  return (
    value.advert_position === 2001 ||
    value.business_key === "BannerAdv" ||
    value.businessKey === "BannerAdv" ||
    /BannerAdv|app_(?:home|ad)|static-by-custom\/img\/app_ad_|manager\/advert_resource/i.test(text)
  );
}

function hasHomeAdResource(value) {
  if (!value || typeof value !== "object") return isHomeAdResource(value);
  if (Array.isArray(value)) return value.some(hasHomeAdResource);
  if (isHomeAdObject(value)) return true;
  return Object.keys(value).some((key) => hasHomeAdResource(value[key]));
}

function scrubHomeAdResources(value, depth) {
  if (!value || typeof value !== "object" || depth > 8) return;

  if (Array.isArray(value)) {
    for (let i = value.length - 1; i >= 0; i -= 1) {
      if (isHomeAdObject(value[i]) || hasHomeAdResource(value[i])) {
        value.splice(i, 1);
      } else {
        scrubHomeAdResources(value[i], depth + 1);
      }
    }
    return;
  }

  Object.keys(value).forEach((key) => {
    const child = value[key];
    if (Array.isArray(child) && hasHomeAdResource(child)) {
      value[key] = [];
    } else if (isHomeAdResource(child)) {
      value[key] = "";
    } else {
      scrubHomeAdResources(child, depth + 1);
    }
  });
}

function cleanUserAdState(data) {
  if (!data || typeof data !== "object") return;

  data.IsShowAdvertisement = false;
  data.BuyRemoveAds = 0;
  data.RemoveAdsTime = 0;
  data.RemoveAdsEffect = 0;
  data.ActivityPopupConfig = "";
  data.ActivityJsUrl = "";
  data.ActivityPopupID = 0;

  scrubHomeAdResources(data, 0);
}

function cleanRemoveAdConfig(data) {
  if (!data || typeof data !== "object") return;

  data.isInitAd = 0;

  if (data.removeAdConfig && typeof data.removeAdConfig === "object") {
    const cfg = data.removeAdConfig;
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
}

function cleanProjectAdConfig(data) {
  if (!data || typeof data !== "object") return;

  data.bannerList = [];
  data.advertResource = [];
  data.advertResourceList = [];
  data.advertisementList = [];
  data.homeBannerList = [];
  data.middleBannerList = [];
  data.carouselList = [];
  data.swiperList = [];
  data.focusList = [];
  data.ownAdInfo = {};
  data.isInitAd = 0;
  data.isOpenAbortAd = false;
  data.isOpenDownloadAd = false;
  data.isOpenMineAd = false;
  data.isOpenSplash = false;
  data.isOpenUploadAd = false;
  data.allInterval = 0;
  data.expirTime = 0;
  data.interstitialInterval = 0;
  data.interstitialShowCount = 0;
  data.showCount = 0;
  data.splashInterval = 0;
  data.splashIntervalTime = 0;

  if (data.preloadConfig && typeof data.preloadConfig === "object") {
    data.preloadConfig.androidInter = 0;
    data.preloadConfig.androidSplash = 0;
    data.preloadConfig.iosInter = 0;
    data.preloadConfig.iosSplash = 0;
  }

  scrubHomeAdResources(data, 0);
}

function cleanOwnAdResourcePayload(obj) {
  if (!obj || typeof obj !== "object") return;

  const data = obj.data;
  if (data && typeof data === "object") {
    scrubHomeAdResources(data, 0);

    if (Array.isArray(data)) {
      obj.data = [];
      return;
    }

    [
      "advertResource",
      "advertResourceList",
      "advertisementList",
      "ownAdInfo",
      "ownAdInfoList",
      "resourceList",
      "list",
      "records",
      "popupList",
      "bannerList",
      "homeBannerList",
      "middleBannerList",
      "carouselList",
      "swiperList",
      "focusList"
    ].forEach((key) => {
      if (key in data) data[key] = Array.isArray(data[key]) ? [] : {};
    });
  }

  obj.code = 0;
  obj.message = obj.message || "ok";
  if (!("data" in obj)) obj.data = {};
}

function isMainApiHost() {
  return /(?:api\.123278\.com|apigate\.123295\.com|apigate\.123773\.com)\/api\//.test(url);
}

function isBootstrapConfig() {
  return /apigate\.123795\.com\/getconfig-api\/v1\/getconfig/.test(url);
}

if (isBootstrapConfig()) {
  const obj = safeJson(body);
  if (obj && obj.data) {
    scrubHomeAdResources(obj.data, 0);
    finish(obj);
  } else {
    finish(body);
  }
} else if (isMainApiHost() && /\/api\/app\/config\/get/.test(url)) {
  const obj = safeJson(body);
  if (obj && obj.data) {
    cleanRemoveAdConfig(obj.data);
    finish(obj);
  } else {
    finish(body);
  }
} else if (isMainApiHost() && /\/api\/config\/get/.test(url)) {
  const obj = safeJson(body);
  if (obj && obj.data) {
    cleanProjectAdConfig(obj.data);
    finish(obj);
  } else {
    finish(body);
  }
} else if (isMainApiHost() && /\/api\/user\/(?:info|get\/info)/.test(url)) {
  const obj = safeJson(body);
  if (obj && obj.data) {
    cleanUserAdState(obj.data);
    finish(obj);
  } else {
    finish(body);
  }
} else if (isMainApiHost() && /\/api\/restful\/goapi\/v1\/remove_ads\/config/.test(url)) {
  const obj = safeJson(body);
  if (obj) {
    if (obj.data) {
      cleanRemoveAdConfig(obj.data);
      cleanUserAdState(obj.data);
    } else {
      obj.data = {};
    }
    finish(obj);
  } else {
    finish({ code: 0, message: "ok", data: {} });
  }
} else if (isMainApiHost() && /\/api\/restful\/goapi\/v1\/app\/resource\/update/.test(url)) {
  const obj = safeJson(body);
  if (obj) {
    cleanOwnAdResourcePayload(obj);
    finish(obj);
  } else {
    finish(body);
  }
} else if (isMainApiHost() && /\/api\/v2\/advert_resource\/get/.test(url)) {
  const obj = safeJson(body);
  if (obj) {
    cleanOwnAdResourcePayload(obj);
    obj.data = Array.isArray(obj.data) ? [] : {};
    finish(obj);
  } else {
    finish({ code: 0, message: "ok", data: {} });
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
