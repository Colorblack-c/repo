/*
youdao-云笔记自动签到 - Loon Script
作者: colorblack 0.2

功能：
1. 打开有道云笔记 App 后，自动捕获 note.youdao.com 请求里的 Cookie / UA / Body。
2. 每小时自动巡查签到。
3. 网络变化时自动巡查签到。
4. 当天已签到成功后，后续巡查自动跳过。
5. 修正有道云笔记 success:0 代表签到成功的问题。
6. Cookie 过久未刷新会提醒。
*/

const CHECKIN_URL = 'https://note.youdao.com/yws/mapi/user?method=checkin';

const KEY_COOKIE = 'ydnote_sign_cookie_colorblack';
const KEY_UA = 'ydnote_sign_ua_colorblack';
const KEY_BODY = 'ydnote_sign_body_colorblack';
const KEY_BODY_TIME = 'ydnote_sign_body_time_colorblack';
const KEY_COOKIE_TIME = 'ydnote_sign_cookie_time_colorblack';
const KEY_LAST_SIGN_DATE = 'ydnote_last_sign_date_colorblack';
const KEY_LAST_NOTIFY_REFRESH_DATE = 'ydnote_last_notify_refresh_date_colorblack';

const APP_NAME = '有道云笔记签到';

// Cookie 超过几天没刷新就提醒
const COOKIE_STALE_DAYS = 3;

// 避免捕获无用接口时覆盖掉可用 Body。
// 如果当前请求 Body 较短，保留旧 Body。
const MIN_VALID_BODY_LENGTH = 20;

function now() {
  return Date.now();
}

function log(msg) {
  console.log('[有道云笔记签到] ' + msg);
}

function notify(title, sub, msg) {
  if (typeof $notification !== 'undefined') {
    $notification.post(title || APP_NAME, sub || '', msg || '');
  }
}

function read(key, fallback = '') {
  const val = $persistentStore.read(key);
  return val && val.length ? val : fallback;
}

function write(key, value) {
  return $persistentStore.write(String(value || ''), key);
}

function remove(key) {
  if (typeof $persistentStore.remove === 'function') {
    return $persistentStore.remove(key);
  }
  return $persistentStore.write('', key);
}

function getToday() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function daysBetween(ts) {
  if (!ts) return 999;
  const diff = now() - Number(ts);
  return Math.floor(diff / 86400000);
}

function isCheckinRequest(url) {
  return /\/yws\/mapi\/user\?method=checkin/.test(url || '');
}

function bodyLooksLikeCheckin(body) {
  return /(^|&)strategy=VIP_MULTIPLY(&|$)/.test(body || '');
}

function isUsefulYoudaoRequest(url) {
  if (!url) return false;

  // 只处理 note.youdao.com
  if (!/^https?:\/\/note\.youdao\.com\//.test(url)) return false;

  // 排除静态资源
  if (/\.(png|jpg|jpeg|gif|webp|css|js|ico|svg|woff|ttf)(\?|$)/i.test(url)) return false;

  return true;
}

function getHeader(headers, name) {
  if (!headers) return '';
  const target = name.toLowerCase();
  for (const k in headers) {
    if (k.toLowerCase() === target) return headers[k];
  }
  return '';
}

function saveCredentialFromRequest() {
  const url = $request.url || '';
  const headers = $request.headers || {};
  const method = ($request.method || '').toUpperCase();

  if (!isUsefulYoudaoRequest(url)) {
    log('非目标请求，跳过保存');
    return $done({});
  }

  const cookie = getHeader(headers, 'Cookie');
  const ua = getHeader(headers, 'User-Agent');
  const body = typeof $request.body === 'string' ? $request.body : '';

  let saved = [];

  if (cookie && cookie.indexOf('YNOTE') !== -1) {
    write(KEY_COOKIE, cookie);
    write(KEY_COOKIE_TIME, now());
    saved.push('Cookie');
  } else if (cookie) {
    // 有些接口 Cookie 不一定带 YNOTE，但仍可能有效，低优先保存
    write(KEY_COOKIE, cookie);
    write(KEY_COOKIE_TIME, now());
    saved.push('Cookie');
  }

  if (ua) {
    write(KEY_UA, ua);
    saved.push('UA');
  }

  // 有 Body 的请求才更新 Body。没有 Body 不覆盖旧 Body。
  // 签到接口本身一定要保存，因为这是最准确的签到 Body。
  // 如果已经保存过签到 Body，普通接口 Body 不再覆盖，避免丢掉 strategy=VIP_MULTIPLY。
  const savedBody = read(KEY_BODY, '');
  const shouldSaveBody =
    body &&
    (body.length >= MIN_VALID_BODY_LENGTH || isCheckinRequest(url)) &&
    (isCheckinRequest(url) || !bodyLooksLikeCheckin(savedBody));

  if (shouldSaveBody) {
    write(KEY_BODY, body);
    write(KEY_BODY_TIME, now());
    saved.push('Body');
  }

  if (saved.length > 0) {
    log('配置已保存: ' + saved.join(' / ') + '，来源: ' + method + ' ' + url);

    // 不要每次普通接口都弹通知，避免打扰。
    // 只有第一次无 Cookie，或者签到接口触发时提醒。
    const today = getToday();
    const notifyDate = read(KEY_LAST_NOTIFY_REFRESH_DATE, '');

    if (isCheckinRequest(url) || notifyDate !== today) {
      write(KEY_LAST_NOTIFY_REFRESH_DATE, today);
      notify(APP_NAME, '配置已保存', '已自动获取凭证，后续可自动巡查签到');
    }
  } else {
    log('目标请求已捕获，但没有可保存的 Cookie/UA/Body');
  }

  $done({});
}

function buildDefaultBody() {
  // 没有 Body 时的兜底。
  // 一般情况下不应该走到这里，因为打开 App 后会自动捕获 Body。
  return [
    'strategy=VIP_MULTIPLY',
    'level=user',
    'login=phone',
    'net=wifi',
    '_network=wifi',
    '_platform=ios',
    '_system=iOS',
    '_appName=ynote',
    'vendor=AppStore'
  ].join('&');
}

function getBodyForCheckin() {
  const savedBody = read(KEY_BODY, '');
  if (savedBody) {
    // 保留原请求参数，只把网络字段修正成 wifi，避免异常。
    let body = savedBody
      .replace(/(^|&)net=[^&]*/g, '$1net=wifi')
      .replace(/(^|&)_network=[^&]*/g, '$1_network=wifi');

    // 手动签到请求会带 strategy=VIP_MULTIPLY。普通接口 Body 没有这个字段，
    // 直接复用会只触发容量接口，但可能不刷新 App 签到按钮读取的活动状态。
    if (/(^|&)strategy=/.test(body)) {
      body = body.replace(/(^|&)strategy=[^&]*/g, '$1strategy=VIP_MULTIPLY');
    } else {
      body += '&strategy=VIP_MULTIPLY';
    }

    return body;
  }

  return buildDefaultBody();
}

function shouldSkipBecauseSigned() {
  const today = getToday();
  const last = read(KEY_LAST_SIGN_DATE, '');
  return last === today;
}

function markSignedToday() {
  write(KEY_LAST_SIGN_DATE, getToday());
}

function isLoginExpired(status, data) {
  const text = String(data || '').toLowerCase();

  if (status === 401 || status === 403) return true;

  return (
    text.indexOf('未登录') !== -1 ||
    text.indexOf('请登录') !== -1 ||
    text.indexOf('登录失效') !== -1 ||
    text.indexOf('login') !== -1 && text.indexOf('expired') !== -1 ||
    text.indexOf('session') !== -1 && text.indexOf('expired') !== -1
  );
}

function parseCheckinResult(data) {
  let ok = false;
  let already = false;
  let msg = data || '无返回内容';
  let raw = null;

  try {
    raw = JSON.parse(data || '{}');

    /*
      有道云笔记这个接口比较特殊：
      返回示例：
      {
        "multiple":2,
        "originSpace":3145728,
        "total":4030726144,
        "time":1780272396003,
        "success":0,
        "space":6291456
      }

      这里 success:0 不代表失败。
      只要有 space / total / originSpace / multiple 这类签到奖励字段，就按成功处理。
    */

    const hasRewardFields =
      typeof raw.space !== 'undefined' ||
      typeof raw.total !== 'undefined' ||
      typeof raw.originSpace !== 'undefined' ||
      typeof raw.multiple !== 'undefined';

    if (raw.success === 0 || raw.success === true || raw.success === 1 || hasRewardFields) {
      ok = true;

      const spaceMB = raw.space ? (Number(raw.space) / 1024 / 1024).toFixed(0) : '';
      const originMB = raw.originSpace ? (Number(raw.originSpace) / 1024 / 1024).toFixed(0) : '';
      const totalGB = raw.total ? (Number(raw.total) / 1024 / 1024 / 1024).toFixed(2) : '';

      msg = '签到成功';

      if (spaceMB) {
        msg += '，获得 ' + spaceMB + 'MB';
      } else if (originMB) {
        msg += '，获得 ' + originMB + 'MB';
      }

      if (raw.multiple) {
        msg += '，' + raw.multiple + '倍奖励';
      }

      if (totalGB) {
        msg += '，总空间 ' + totalGB + 'GB';
      }
    } else {
      const textMsg = raw.message || raw.msg || raw.error || '';

      if (/已签|已经签|今日已|重复|already/i.test(textMsg)) {
        ok = true;
        already = true;
        msg = textMsg || '今日已签到';
      } else {
        msg = textMsg || '签到异常，可能 Cookie 失效或接口变化';
      }
    }
  } catch (e) {
    // 非 JSON 兜底判断
    const text = String(data || '');

    if (
      text.indexOf('space') !== -1 &&
      text.indexOf('total') !== -1
    ) {
      ok = true;
      msg = '签到成功';
    } else if (
      text.indexOf('已签到') !== -1 ||
      text.indexOf('已经签到') !== -1 ||
      text.indexOf('今日已') !== -1
    ) {
      ok = true;
      already = true;
      msg = '今日已签到';
    }
  }

  return {
    ok,
    already,
    msg,
    raw
  };
}

function checkCookieFreshness() {
  const cookieTime = read(KEY_COOKIE_TIME, '');
  if (!cookieTime) return;

  const days = daysBetween(cookieTime);
  if (days >= COOKIE_STALE_DAYS) {
    const today = getToday();
    const notifyKey = 'ydnote_cookie_stale_notify_' + today;
    if (read(notifyKey, '') !== '1') {
      write(notifyKey, '1');
      notify(APP_NAME, 'Cookie 较久未刷新', '已超过 ' + days + ' 天，建议打开有道云笔记 App 刷新一次');
    }
  }
}

function doCheckin() {
  log('开始巡查签到');

  if (shouldSkipBecauseSigned()) {
    log('今日已签到，跳过本次巡查');
    return $done();
  }

  const cookie = read(KEY_COOKIE, '');
  const ua = read(KEY_UA, 'YNote/7.5.720');
  const body = getBodyForCheckin();

  if (!cookie) {
    log('缺少 Cookie，请先打开 App 让脚本自动获取');
    notify(APP_NAME, '缺少 Cookie', '请打开有道云笔记 App，停留几秒自动获取');
    return $done();
  }

  checkCookieFreshness();

  const headers = {
    'Cookie': cookie,
    'Content-Type': 'application/x-www-form-urlencoded',
    'Accept': '*/*',
    'User-Agent': ua,
    'Accept-Language': 'zh-Hans-CN;q=1',
    'Accept-Encoding': 'gzip, deflate, br',
    'Connection': 'keep-alive'
  };

  $httpClient.post(
    {
      url: CHECKIN_URL,
      headers: headers,
      body: body
    },
    function(error, response, data) {
      if (error) {
        log('checkin 请求失败: ' + JSON.stringify(error));
        notify(APP_NAME, '请求失败', String(error));
        return $done();
      }

      const status = response ? response.status : 0;

      log('checkin HTTP ' + status);
      log('checkin 返回: ' + data);

      if (isLoginExpired(status, data)) {
        remove(KEY_COOKIE);
        notify(APP_NAME, 'Cookie 可能失效', '请打开有道云笔记 App 刷新登录状态');
        return $done();
      }

      const result = parseCheckinResult(data);

      if (result.ok) {
        markSignedToday();
        log('签到成功，已记录今日状态');

        if (result.already) {
          notify(APP_NAME, '今日已签到', result.msg);
        } else {
          notify(APP_NAME, '签到成功', result.msg);
        }
      } else {
        log('签到异常: ' + result.msg);
        notify(APP_NAME, '签到异常', result.msg);
      }

      $done();
    }
  );
}

if (typeof $request !== 'undefined') {
  saveCredentialFromRequest();
} else {
  doCheckin();
}
