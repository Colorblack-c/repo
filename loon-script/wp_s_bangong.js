const EXP_TIME = Math.floor(Date.now() / 1000) + 99 * 365 * 24 * 3600;
const NOW = Math.floor(Date.now() / 1000);
const EFFECT_TIME = NOW - 3600;
const VIP_NAME = "WPS超级会员基础套餐";
const VIP_NAME_SHORT = "超级会员";
const VIP_LEVEL = 30;
const LEGACY_SUPER_VIP_LEVEL = 40;
const FAR_DAYS = 36500;
const UNLIMITED_TIMES = 999999;

const EXPIRE_MARKETING_RE =
  /expire_vip|ios_vip_expire|pay_remind|order[-_]?lost|待支付|立即支付|续费|立即续费|到期|过期|临期|非会员|购买会员|开通会员|买\d*年送/i;

const PRIVILEGES = [
  "ads_free", "adv_filter", "advanced_print", "art_words", "audio_conversion",
  "batch_download", "batch_export", "batch_rename", "cad_2pdf", "cloud_font",
  "cloud_space", "common_bulk", "doc_2pic", "doc_check", "doc_conversion",
  "doc_lose_weight", "doc_projection", "doc_roaming", "doc_translate",
  "download_speed_up", "et_extract_content", "et_filter", "excel_split_merge",
  "file_backup", "file_compress_share", "file_extract", "file_merge",
  "filenum_in_sync_folder", "filesize_limit", "full_text_search",
  "history_version", "img_2excel", "img_2ppt", "img_2txt", "img_2word",
  "img_batch_process", "img_bg_virtual", "img_clean_all", "img_correct",
  "img_cutout", "img_format_conv", "img_loss_compress", "img_rm_watermark",
  "long_voice_input", "ocr", "output_long_img", "pdf2doc", "pdf_2doc",
  "pdf_2et", "pdf_2html", "pdf_2img_pdf", "pdf_2ppt", "pdf_2txt",
  "pdf_compress", "pdf_edit", "pdf_merge", "pdf_ocr", "pdf_page_edit",
  "pdf_page_extract", "pdf_page_manage", "pdf_split", "pdf_watermark",
  "pic_2pdf", "ppt_2video", "pure_image_doc", "resource_capacity",
  "resource_foldernum", "resource_uploadsize", "smart_sync", "sync_folder",
  "team_join_number", "text_out_loud", "user_free_group_member_number",
  "user_free_group_number", "web_2pdf", "web_2pic"
];

const LOCAL_PRIVILEGES = Array.from(new Set(PRIVILEGES.concat([
  "data_recover", "pdf_sign", "ai_dom_pdf", "ai_points_cn"
])));

const MEMBER_TYPES = [
  { name: "超级会员", memberid: LEGACY_SUPER_VIP_LEVEL },
  { name: "WPS会员", memberid: 20 },
  { name: "稻壳会员", memberid: 12 }
];

function isObject(value) {
  return value && typeof value === "object";
}

function patchVipInfo(vipinfo) {
  if (!isObject(vipinfo)) return;
  vipinfo.expire_time = EXP_TIME;
  vipinfo.vip_end_time = EXP_TIME;
  vipinfo.end_time = EXP_TIME;
  vipinfo.memberid = VIP_LEVEL;
  vipinfo.member_id = VIP_LEVEL;
  vipinfo.has_ad = 0;
  vipinfo.is_expire = false;
  vipinfo.is_expired = false;
  vipinfo.expired = false;
  vipinfo.expire_days = FAR_DAYS;
  vipinfo.name = vipinfo.name === "注册用户" ? VIP_NAME_SHORT : (vipinfo.name || VIP_NAME_SHORT);
  vipinfo.enabled = Array.from(new Set([].concat(vipinfo.enabled || [], LOCAL_PRIVILEGES)));
}

function patchPrivilegeValue(value) {
  if (!isObject(value)) return;
  value.cache_available = true;
  value.expire_time = EXP_TIME;
  value.times = UNLIMITED_TIMES;
  if (typeof value.value === "undefined") value.value = -1;
  if (typeof value.consumed === "undefined") value.consumed = 0;
}

function buildLocalPrivilege(spid) {
  return {
    spid,
    times: UNLIMITED_TIMES,
    expire_time: EXP_TIME
  };
}

function buildEnabledMember(member) {
  return {
    name: member.name,
    expire_time: EXP_TIME,
    memberid: member.memberid
  };
}

function patchLocalVipPayload(obj) {
  obj.result = "ok";
  obj.server_time = NOW;
  obj.level = Math.max(Number(obj.level) || 0, 88);
  obj.wealth = Math.max(Number(obj.wealth) || 0, 0);
  obj.exp = Math.max(Number(obj.exp) || 0, 0);
  obj.total_cost = Math.max(Number(obj.total_cost) || 0, 0);
  obj.total_buy = Math.max(Number(obj.total_buy) || 0, 0);

  obj.vip = isObject(obj.vip) ? obj.vip : {};
  obj.vip.has_ad = 0;
  obj.vip.name = VIP_NAME_SHORT;
  obj.vip.memberid = LEGACY_SUPER_VIP_LEVEL;
  obj.vip.expire_time = EXP_TIME;
  obj.vip.enabled = MEMBER_TYPES.map(buildEnabledMember);

  obj.privilege = LOCAL_PRIVILEGES.map(buildLocalPrivilege);
}

function patchPurchaseInfo(obj) {
  if (!obj.data) obj.data = {};
  obj.data.server_time = NOW;
  if (!Array.isArray(obj.data.merchandises)) obj.data.merchandises = [];

  let vip = obj.data.merchandises.find(item => item && (item.sku_key === "vip_pro" || item.type === "vip"));
  if (!vip) {
    vip = {
      sku_key: "vip_pro",
      effect_time: EFFECT_TIME,
      expire_time: EXP_TIME,
      name: VIP_NAME,
      type: "vip"
    };
    obj.data.merchandises.unshift(vip);
  }

  obj.data.merchandises.forEach(item => {
    if (!isObject(item)) return;
    if (item.sku_key === "vip_pro" || item.type === "vip") {
      item.sku_key = "vip_pro";
      item.type = "vip";
      item.name = item.name || VIP_NAME;
      item.effect_time = item.effect_time || EFFECT_TIME;
      item.expire_time = EXP_TIME;
      item.vip_end_time = EXP_TIME;
      item.end_time = EXP_TIME;
    }
  });

  // Do not rewrite signed JWT token/trial_token fields. Keeping signatures intact is more reliable.
}

function patchPrivilegeInfo(obj, url) {
  if (!obj.data) obj.data = {};
  obj.data.server_time = NOW;
  if (!isObject(obj.data.privileges)) obj.data.privileges = {};

  const match = url.match(/[?&]privilege_ids=([^&]+)/);
  const requested = match ? decodeURIComponent(match[1]).split(",") : [];
  const ids = Array.from(new Set(requested.concat(LOCAL_PRIVILEGES)));
  ids.forEach(id => {
    obj.data.privileges[id] = obj.data.privileges[id] || {};
    patchPrivilegeValue(obj.data.privileges[id]);
  });

  // Do not rewrite signed token/trial_token fields. Add plain privileges for clients that read JSON directly.
}

function patchPartnerUsable(obj) {
  obj.result = "ok";
  obj.msg = "";
  if (!obj.data) obj.data = {};
  obj.data.expire_time = EXP_TIME;
  obj.data.now = NOW;
  obj.data.times = UNLIMITED_TIMES;
  obj.data.usable = true;
  obj.data.available = true;
}

function patchVipCenter(obj) {
  obj.result = "ok";
  obj.msg = obj.msg || "";
  obj.data = Array.from(new Set([].concat(obj.data || [], PRIVILEGES)));
}

function hasExpireMarketing(value) {
  if (!isObject(value)) return EXPIRE_MARKETING_RE.test(String(value || ""));
  try {
    return EXPIRE_MARKETING_RE.test(JSON.stringify(value));
  } catch (e) {
    return false;
  }
}

function filterExpireMarketing(value) {
  if (!isObject(value)) return;

  if (Array.isArray(value)) {
    for (let i = value.length - 1; i >= 0; i--) {
      const item = value[i];
      if (hasExpireMarketing(item)) {
        value.splice(i, 1);
      } else {
        filterExpireMarketing(item);
      }
    }
    return;
  }

  Object.keys(value).forEach(key => filterExpireMarketing(value[key]));
}

function patchMarketActivity(obj) {
  if (Array.isArray(obj.data)) filterExpireMarketing(obj.data);
  obj.result = obj.result || "ok";
  if (typeof obj.code !== "undefined") obj.code = 1000000;
  obj.msg = obj.msg || "成功";
}

function patchKnownContainers(obj) {
  patchVipInfo(obj.vipinfo);

  if (obj.data) {
    patchVipInfo(obj.data.vipinfo);
    if (obj.data.user) patchVipInfo(obj.data.user.vipinfo);
    if (obj.data.info && typeof obj.data.info.isVip !== "undefined") obj.data.info.isVip = 1;
    if (obj.data.privileges) {
      Object.keys(obj.data.privileges).forEach(key => patchPrivilegeValue(obj.data.privileges[key]));
    }
  }

  if (typeof obj.is_plus !== "undefined") obj.is_plus = true;
  if (typeof obj.is_vip !== "undefined") obj.is_vip = true;
  if (typeof obj.isVip !== "undefined") obj.isVip = 1;
  if (typeof obj.is_expire !== "undefined") obj.is_expire = false;
  if (typeof obj.is_expired !== "undefined") obj.is_expired = false;
  if (typeof obj.expired !== "undefined") obj.expired = false;
  if (typeof obj.expire_days !== "undefined") obj.expire_days = FAR_DAYS;
  if (typeof obj.curtime !== "undefined") obj.curtime = NOW;
}

function recursivePatch(value, parentKey) {
  if (!isObject(value)) return;

  if (Array.isArray(value)) {
    value.forEach(item => recursivePatch(item, parentKey));
    return;
  }

  const keys = Object.keys(value);
  const looksVip =
    /vip|member|privilege|purchase|merchandise/i.test(parentKey || "") ||
    keys.some(key => /vip|member|sku_key|expire|privilege/i.test(key));

  if (looksVip) {
    if (value.sku_key === "vip_pro" || value.type === "vip") {
      value.sku_key = "vip_pro";
      value.type = "vip";
      value.name = value.name || VIP_NAME;
      value.effect_time = value.effect_time || EFFECT_TIME;
    }

    if (typeof value.expire_time !== "undefined") value.expire_time = EXP_TIME;
    if (typeof value.vip_end_time !== "undefined") value.vip_end_time = EXP_TIME;
    if (typeof value.end_time !== "undefined") value.end_time = EXP_TIME;
    if (typeof value.deadline !== "undefined") value.deadline = EXP_TIME;
    if (typeof value.memberid !== "undefined") value.memberid = VIP_LEVEL;
    if (typeof value.member_id !== "undefined") value.member_id = VIP_LEVEL;
    if (typeof value.has_ad !== "undefined") value.has_ad = 0;
    if (typeof value.times !== "undefined") value.times = UNLIMITED_TIMES;
    if (typeof value.isVip !== "undefined") value.isVip = 1;
    if (typeof value.is_vip !== "undefined") value.is_vip = true;
    if (typeof value.vip !== "undefined" && typeof value.vip !== "object") value.vip = true;
    if (typeof value.is_expire !== "undefined") value.is_expire = false;
    if (typeof value.is_expired !== "undefined") value.is_expired = false;
    if (typeof value.expired !== "undefined") value.expired = false;
    if (typeof value.expire_days !== "undefined") value.expire_days = FAR_DAYS;
    if (typeof value.remaining_days !== "undefined") value.remaining_days = FAR_DAYS;
  }

  keys.forEach(key => recursivePatch(value[key], key));
}

function modifyVIP(body, url) {
  try {
    const obj = JSON.parse(body);

    patchKnownContainers(obj);
    recursivePatch(obj, "");

    if (/\/query\/api\/v1\/list_purchase_info\?/.test(url)) patchPurchaseInfo(obj);
    if (/\/query\/api\/v1\/list_privilege_info\?/.test(url)) patchPrivilegeInfo(obj, url);
    if (/vip\.wps\.cn\/v2\/vip_center\/my\/privilege/.test(url)) patchVipCenter(obj);
    if (/vip\.wps\.cn\/partner\/invoke\/usable/.test(url)) patchPartnerUsable(obj);
    if (/tiance\.wps\.cn\/dce\/exec\/api\/market\/activity/.test(url)) patchMarketActivity(obj);
    if (/drive\.wps\.cn\/api\/v3\/userinfo/.test(url)) {
      obj.vipinfo = obj.vipinfo || {};
      patchVipInfo(obj.vipinfo);
      obj.is_plus = true;
      obj.curtime = NOW;
    }
    if (obj.vip || Array.isArray(obj.privilege) || typeof obj.total_buy !== "undefined" || typeof obj.total_cost !== "undefined") {
      patchLocalVipPayload(obj);
    }

    return JSON.stringify(obj);
  } catch (e) {
    return body;
  }
}

const url = $request.url || "";
let body = $response.body || "";

if (/wps\.cn/.test(url) && body) {
  body = modifyVIP(body, url);
  $done({ body });
} else {
  $done({});
}
