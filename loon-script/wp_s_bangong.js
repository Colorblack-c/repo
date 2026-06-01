const now = Math.floor(Date.now() / 1000);
const vipExpire = now + 99 * 365 * 24 * 60 * 60;
const vipEffect = now - 3600;
const vipName = "WPS超级会员基础套餐";

const defaultPrivileges = [
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

function b64urlDecode(input) {
  const normalized = input.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized + "=".repeat((4 - normalized.length % 4) % 4);
  return decodeURIComponent(
    Array.prototype.map.call(atob(padded), c =>
      "%" + ("00" + c.charCodeAt(0).toString(16)).slice(-2)
    ).join("")
  );
}

function b64urlEncode(input) {
  const encoded = btoa(unescape(encodeURIComponent(input)));
  return encoded.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function setPrivilege(privileges, key, value) {
  privileges[key] = Object.assign(
    { cache_available: true, expire_time: vipExpire, value: value, consumed: 0 },
    privileges[key] || {}
  );
  privileges[key].expire_time = vipExpire;
  if (typeof privileges[key].value === "undefined") privileges[key].value = value;
  if (typeof privileges[key].consumed === "undefined") privileges[key].consumed = 0;
  if (typeof privileges[key].cache_available === "undefined") privileges[key].cache_available = true;
}

function patchToken(token, extraKeys) {
  if (!token || token.split(".").length !== 3) return token;
  try {
    const parts = token.split(".");
    const payload = JSON.parse(b64urlDecode(parts[1]));
    payload.exp = vipExpire;
    payload.privileges = payload.privileges || {};

    Object.keys(payload.privileges).forEach(key => {
      if (payload.privileges[key] && typeof payload.privileges[key] === "object") {
        payload.privileges[key].expire_time = vipExpire;
      }
    });

    defaultPrivileges.concat(extraKeys || []).forEach(key => setPrivilege(payload.privileges, key, -1));
    return parts[0] + "." + b64urlEncode(JSON.stringify(payload)) + "." + parts[2];
  } catch (e) {
    return token;
  }
}

function patchPurchaseInfo(obj) {
  if (!obj.data) obj.data = {};
  obj.data.server_time = now;
  if (!Array.isArray(obj.data.merchandises)) obj.data.merchandises = [];

  let vip = obj.data.merchandises.find(item => item && item.sku_key === "vip_pro");
  if (!vip) {
    vip = { sku_key: "vip_pro", effect_time: vipEffect, expire_time: vipExpire, name: vipName, type: "vip" };
    obj.data.merchandises.unshift(vip);
  }

  obj.data.merchandises.forEach(item => {
    if (!item || typeof item !== "object") return;
    if (item.sku_key === "vip_pro" || item.type === "vip") {
      item.sku_key = item.sku_key || "vip_pro";
      item.type = "vip";
      item.name = item.name || vipName;
      item.effect_time = item.effect_time || vipEffect;
      item.expire_time = vipExpire;
    }
  });

  obj.data.token = patchToken(obj.data.token, []);
  obj.data.trial_token = patchToken(obj.data.trial_token, []);
}

function patchPrivilegeInfo(obj, url) {
  if (!obj.data) obj.data = {};
  obj.data.server_time = now;
  const ids = [];
  try {
    const query = url.split("?")[1] || "";
    query.split("&").forEach(pair => {
      const kv = pair.split("=");
      if (kv[0] === "privilege_ids") decodeURIComponent(kv[1] || "").split(",").forEach(id => ids.push(id));
    });
  } catch (e) {}
  obj.data.token = patchToken(obj.data.token, ids);
  obj.data.trial_token = patchToken(obj.data.trial_token, ids);
}

function patchUserInfo(obj) {
  obj.vipinfo = Object.assign({}, obj.vipinfo || {}, {
    expire_time: vipExpire,
    memberid: 20,
    has_ad: 0,
    name: "WPS超级会员",
    enabled: defaultPrivileges
  });
  obj.is_plus = true;
  obj.curtime = now;
}

function patchVipCenter(obj) {
  obj.result = "ok";
  obj.msg = obj.msg || "";
  obj.data = Array.from(new Set([].concat(obj.data || [], defaultPrivileges)));
}

function patchSignInfo(obj) {
  if (obj.data && obj.data.info) obj.data.info.isVip = 1;
}

let body = $response.body;
try {
  const url = $request.url || "";
  const obj = JSON.parse(body);

  if (/\/query\/api\/v1\/list_purchase_info\?/.test(url)) patchPurchaseInfo(obj);
  if (/\/query\/api\/v1\/list_privilege_info\?/.test(url)) patchPrivilegeInfo(obj, url);
  if (/drive\.wps\.cn\/api\/v3\/userinfo/.test(url)) patchUserInfo(obj);
  if (/vip\.wps\.cn\/v2\/vip_center\/my\/privilege/.test(url)) patchVipCenter(obj);
  if (/personal-bus\.wps\.cn\/sign_in\/v1\/day_info/.test(url)) patchSignInfo(obj);

  body = JSON.stringify(obj);
} catch (e) {}

$done({ body });
