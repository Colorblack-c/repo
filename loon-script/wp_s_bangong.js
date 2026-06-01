const EXP_TIME = Math.floor(Date.now() / 1000) + 99 * 365 * 24 * 3600;
const NOW = Math.floor(Date.now() / 1000);
const EFFECT_TIME = NOW - 3600;
const VIP_NAME = "WPS超级会员基础套餐";
const VIP_NAME_SHORT = "超级会员";

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

function isObject(value) {
  return value && typeof value === "object";
}

function patchVipInfo(vipinfo) {
  if (!isObject(vipinfo)) return;
  vipinfo.expire_time = EXP_TIME;
  vipinfo.vip_end_time = EXP_TIME;
  vipinfo.end_time = EXP_TIME;
  vipinfo.memberid = 30;
  vipinfo.member_id = 30;
  vipinfo.has_ad = 0;
  vipinfo.name = vipinfo.name === "注册用户" ? VIP_NAME_SHORT : (vipinfo.name || VIP_NAME_SHORT);
  vipinfo.enabled = Array.from(new Set([].concat(vipinfo.enabled || [], PRIVILEGES)));
}

function patchPrivilegeValue(value) {
  if (!isObject(value)) return;
  value.cache_available = true;
  value.expire_time = EXP_TIME;
  if (typeof value.value === "undefined") value.value = -1;
  if (typeof value.consumed === "undefined") value.consumed = 0;
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

function patchVipCenter(obj) {
  obj.result = "ok";
  obj.msg = obj.msg || "";
  obj.data = Array.from(new Set([].concat(obj.data || [], PRIVILEGES)));
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
    if (typeof value.memberid !== "undefined") value.memberid = 30;
    if (typeof value.member_id !== "undefined") value.member_id = 30;
    if (typeof value.has_ad !== "undefined") value.has_ad = 0;
    if (typeof value.isVip !== "undefined") value.isVip = 1;
    if (typeof value.is_vip !== "undefined") value.is_vip = true;
    if (typeof value.vip !== "undefined" && typeof value.vip !== "object") value.vip = true;
  }

  keys.forEach(key => recursivePatch(value[key], key));
}

function modifyVIP(body, url) {
  try {
    const obj = JSON.parse(body);

    patchKnownContainers(obj);
    recursivePatch(obj, "");

    if (/\/query\/api\/v1\/list_purchase_info\?/.test(url)) patchPurchaseInfo(obj);
    if (/vip\.wps\.cn\/v2\/vip_center\/my\/privilege/.test(url)) patchVipCenter(obj);
    if (/drive\.wps\.cn\/api\/v3\/userinfo/.test(url)) {
      obj.vipinfo = obj.vipinfo || {};
      patchVipInfo(obj.vipinfo);
      obj.is_plus = true;
      obj.curtime = NOW;
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
