/*
 123盘去广告
For Loon response rewrite. Upload this file to:
 2026.06.02  更新
*/

const url = $request.url;
const isRequestPhase = typeof $response === "undefined";
let body = isRequestPhase ? ($request.body || "") : ($response.body || "");

function finish(value) {
  if (isRequestPhase && value && typeof value === "object" && value.__response) {
    $done({
      response: {
        status: 200,
        headers: {
          "Content-Type": "application/json; charset=utf-8"
        },
        body: JSON.stringify(value.__response)
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
  data.BuyRemoveAds = 0;
  data.RemoveAdsTime = 0;
  data.RemoveAdsEffect = 0;
  data.removeAdsEffect = 0;
  data.button_download = 0;
  data.button_quit = 0;
  data.button_return_file = 0;
  data.button_splash_screen = 0;
  data.button_upload = 0;
  data.button_user_center = 0;

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

  data.BannerAdv = [];
  data.bannerAdv = [];
  data.bannerList = [];
  data.adList = [];
  data.advertResource = [];
  data.advertResourceList = [];
  data.advertisementList = [];
  data.advBannerList = [];
  data.homeBannerList = [];
  data.middleBannerList = [];
  data.carouselList = [];
  data.swiperList = [];
  data.focusList = [];
  data.ownAdInfo = { 2001: [] };
  data.ownAdInfoList = [];
  data.resourceList = [];
  data.records = [];
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

    data.ownAdInfo = { 2001: [] };
    data.ownAdInfoList = [];
    data.advert_position = 0;
    data.advert_id = 0;
    data.image_url = "";
    data.jump_url = "";
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

function isBannerConfigRequest() {
  return isMainApiHost() &&
    /\/api\/config\/get/.test(url) &&
    /"business_key"\s*:\s*"BannerAdv"|"business_keys"\s*:\s*\[[^\]]*"BannerAdv"/.test(body);
}

function emptyProjectAdResponse() {
  return {
    code: 0,
    message: "ok",
    data: {
      allInterval: 0,
      bannerList: [],
      BannerAdv: [],
      bannerAdv: [],
      carouselList: [],
      swiperList: [],
      focusList: [],
      ownAdInfo: { 2001: [] },
      ownAdInfoList: [],
      dispatchSlowSpeed: 5120,
      downloadMaxTaskNum: 3,
      uploadMaxTaskNum: 3,
      expirTime: 0,
      interstitialInterval: 0,
      interstitialShowCount: 0,
      isInitAd: 0,
      isOpenAbortAd: false,
      isOpenDownloadAd: false,
      isOpenMineAd: false,
      isOpenSplash: false,
      isOpenUploadAd: false,
      preloadConfig: {
        androidInter: 0,
        androidSplash: 0,
        iosInter: 0,
        iosSplash: 0
      },
      showCount: 0,
      splashInterval: 0,
      splashIntervalTime: 0
    }
  };
}

function emptyAppAdConfigResponse() {
  return {
    code: 0,
    message: "ok",
    data: {
      continuousPay: 0,
      goodsName: "",
      iosGoodsId: "",
      isInitAd: 0,
      loadBuyEntryMode: 0,
      loadVipBuyId: 0,
      BuyRemoveAds: 0,
      RemoveAdsTime: 0,
      RemoveAdsEffect: 0,
      removeAdsEffect: 0,
      button_download: 0,
      button_quit: 0,
      button_return_file: 0,
      button_splash_screen: 0,
      button_upload: 0,
      button_user_center: 0,
      removeAdConfig: {
        BuyRemoveAds: 0,
        RemoveAdsTime: 0,
        button_download: 0,
        button_quit: 0,
        button_return_file: 0,
        button_splash_screen: 0,
        button_upload: 0,
        button_user_center: 0,
        firstPrice: 0,
        mainTitle: "",
        payButtonFirst: "",
        payButtonRenew: "",
        remove_ads_effect: 0,
        renewPrice: 0,
        subTitle: "",
        topTitle: ""
      }
    }
  };
}

function emptyAnyThinkAppResponse() {
  return {
    code: 0,
    msg: "Success",
    data: {
      scet: 3600000,
      pl_n: 0,
      c_a: 0,
      logger: {
        tk_address: "",
        da_address: "",
        tk_max_amount: 0,
        da_max_amount: 0
      },
      preinit: [],
      adx: {
        req_sw: 0,
        bid_sw: 0,
        tk_sw: 0,
        req_addr: "",
        bid_addr: "",
        tk_addr: ""
      },
      nw_eu_def: 0,
      la_sw: 0,
      crash_sw: 0,
      n_l: {},
      tmp: {},
      n_cache: {}
    }
  };
}

function emptyAnyThinkPlacementResponse() {
  return {
    code: 0,
    msg: "Success",
    data: {
      session_id: noAdId(),
      ps_id: "",
      ps_id_timeout: 0,
      ad_delivery_sw: 0,
      req_ug_num: 0,
      unit_caps_d: 0,
      unit_caps_h: 0,
      unit_pacing: 0,
      wifi_auto_sw: 0,
      show_type: 0,
      refresh: 0,
      auto_refresh: 0,
      auto_refresh_time: 0,
      auto_refresh_type: 0,
      platform: 2,
      format: 0,
      gro_id: 0,
      s_t: 0,
      l_s_t: 0,
      ps_ct: 0,
      ps_ct_out: 0,
      pucs: 0,
      hb_start_time: 0,
      hb_bid_timeout: 0,
      ug_list: [],
      hb_list: [],
      s2shb_list: [],
      adx_list: [],
      dsp_list: [],
      ol_list: [],
      inh_list: [],
      bottom_list: [],
      doffer_list: [],
      dn_c2shb_list: [],
      dn_s2shb_list: [],
      m_o: [],
      m_o_s: {},
      m_o_ks: {},
      wf_obj: "{}",
      n_cache: {}
    }
  };
}

function emptyAnyThinkBidResponse() {
  return {
    code: 0,
    msg: "success",
    data: []
  };
}

function emptyBaiduAdResponse() {
  return {
    ad: [],
    n: 0,
    error_code: 200000,
    req_id: noAdId(),
    qk: noAdId(),
    no_ad_lurl: []
  };
}

if (isRequestPhase && isBannerConfigRequest()) {
  finish({ __response: emptyProjectAdResponse() });
} else if (isRequestPhase && isMainApiHost() && /\/api\/v2\/advert_resource\/get/.test(url)) {
  finish({ __response: { code: 0, message: "ok", data: [] } });
} else if (isRequestPhase && isMainApiHost() && /\/api\/app\/config\/get/.test(url)) {
  finish({ __response: emptyAppAdConfigResponse() });
} else if (isRequestPhase && /api\.anythinktech\.com\/v2\/open\/app/.test(url)) {
  finish({ __response: emptyAnyThinkAppResponse() });
} else if (isRequestPhase && /api\.anythinktech\.com\/v2\/open\/placement/.test(url)) {
  finish({ __response: emptyAnyThinkPlacementResponse() });
} else if (isRequestPhase && /(?:adx|adx-bj|adx-bj-req)\.anythinktech\.com\/(?:request|bid)/.test(url)) {
  finish({ __response: emptyAnyThinkBidResponse() });
} else if (isRequestPhase && /mobads\.baidu\.com\/cpro\/ui\/mads\.php/.test(url)) {
  finish({ __response: emptyBaiduAdResponse() });
} else if (isRequestPhase) {
  $done({});
} else if (isBootstrapConfig()) {
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
  finish(emptyBaiduAdResponse());
} else if (/api\.anythinktech\.com\/v2\/open\/app/.test(url)) {
  finish(emptyAnyThinkAppResponse());
} else if (/api\.anythinktech\.com\/v2\/open\/placement/.test(url)) {
  finish(emptyAnyThinkPlacementResponse());
} else if (/(?:adx|adx-bj|adx-bj-req)\.anythinktech\.com\/(?:request|bid)/.test(url)) {
  finish(emptyAnyThinkBidResponse());
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
