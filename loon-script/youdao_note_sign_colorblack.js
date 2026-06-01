/*
youdao-云笔记自动签到 - Loon Script
作者: colorblack
 同款策略版：
1. 不需要手动点签到；打开有道云笔记 App 后，脚本会从普通接口自动保存 Cookie / UA / 通用请求参数。
2. 每小时巡查一次、网络变化巡查一次。
3. 当天已签到后，后续巡查自动跳过。
4. 如果提示缺少 Cookie 或请求参数，只需要打开有道云笔记 App 首页/签到页停留几秒，让普通接口经过 Loon 即可。
*/

const KEY_COOKIE = 'ydnote_sign_cookie_colorblack';
const KEY_BODY = 'ydnote_sign_body_colorblack';
const KEY_UA = 'ydnote_sign_ua_colorblack';
const KEY_SIGNED_DATE = 'ydnote_signed_date_colorblack';
const KEY_LOCK_TS = 'ydnote_sign_lock_ts_colorblack';
const KEY_CAPTURED_ONCE = 'ydnote_sign_captured_once_colorblack';

const CHECKIN_URL = 'https://note.youdao.com/yws/mapi/user?method=checkin';

function log(msg) {
  console.log('[有道云笔记签到] ' + msg);
}

function notify(sub, msg) {
  if (typeof $notification !== 'undefined') {
    $notification.post('有道云笔记签到', sub || '', msg || '');
  }
}

function read(key) {
  const val = $persistentStore.read(key);
  return val && val.length ? val : '';
}

function write(key, val) {
  return $persistentStore.write(String(val || ''), key);
}

function todayString() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function getHeader(headers, name) {
  if (!headers) return '';
  return headers[name] || headers[name.toLowerCase()] || headers[name.toUpperCase()] || '';
}

function getCookie(headers) {
  const c = getHeader(headers, 'Cookie');
  if (Array.isArray(c)) return c.join('; ');
  return String(c || '');
}

function getQuery(url) {
  const s = String(url || '');
  const i = s.indexOf('?');
  return i >= 0 ? s.slice(i + 1) : '';
}

function looksLikeYNoteParams(str) {
  const s = String(str || '');
  return /(^|&)client_ver=/.test(s) || /(^|&)keyfrom=note\./.test(s) || /(^|&)_appName=ynote/.test(s);
}

function removeParam(query, name) {
  if (!query) return '';
  return query
    .split('&')
    .filter(function(part) {
      if (!part) return false;
      return decodeURIComponent(part.split('=')[0] || '') !== name;
    })
    .join('&');
}

function normalizeBaseParams(params) {
  let q = String(params || '');
  q = removeParam(q, 'method');
  q = removeParam(q, 'strategy');
  return q;
}

function buildCheckinBody() {
  let base = normalizeBaseParams(read(KEY_BODY));
  if (!base) return '';
  return base + '&strategy=VIP_MULTIPLY';
}

function saveFromRequest() {
  const url = $request.url || '';
  const headers = $request.headers || {};
  const cookie = getCookie(headers);
  const ua = getHeader(headers, 'User-Agent') || getHeader(headers, 'user-agent');
  const reqBody = typeof $request.body === 'string' ? $request.body : '';
  const query = getQuery(url);

  let changed = false;

  if (cookie && /YNOTE_|JSESSIONID/i.test(cookie)) {
    write(KEY_COOKIE, cookie);
    changed = true;
  }

  if (ua) {
    write(KEY_UA, ua);
    changed = true;
  }

  if (looksLikeYNoteParams(reqBody)) {
    write(KEY_BODY, normalizeBaseParams(reqBody));
    changed = true;
  } else if (looksLikeYNoteParams(query)) {
    write(KEY_BODY, normalizeBaseParams(query));
    changed = true;
  }

  if (changed) {
    log('已自动保存 Cookie / UA / 通用请求参数');
    if (read(KEY_CAPTURED_ONCE) !== '1' && read(KEY_COOKIE) && read(KEY_BODY)) {
      write(KEY_CAPTURED_ONCE, '1');
      notify('配置已保存', '已自动获取凭证，后续可自动巡查签到');
    }
  }

  $done({});
}

function finish() {
  write(KEY_LOCK_TS, '');
  $done();
}

function markSignedToday() {
  write(KEY_SIGNED_DATE, todayString());
}

function doCheckin() {
  const today = todayString();

  if (read(KEY_SIGNED_DATE) === today) {
    log('今天已确认签到，跳过本次巡查');
    return $done();
  }

  const cookie = read(KEY_COOKIE);
  const body = buildCheckinBody();
  const ua = read(KEY_UA) || 'YNote/7.5.720 (iPhone; iOS 16.2; Scale/3.00)';

  if (!cookie) {
    notify('缺少 Cookie', '请先打开有道云笔记 App，让 Loon 自动抓取一次');
    return $done();
  }

  if (!body) {
    notify('缺少请求参数', '请先打开有道云笔记 App 首页/签到页停留几秒');
    return $done();
  }

  const lockTs = Number(read(KEY_LOCK_TS) || 0);
  const now = Date.now();
  if (lockTs && now - lockTs < 5 * 60 * 1000) {
    log('已有任务运行中，跳过');
    return $done();
  }
  write(KEY_LOCK_TS, now);

  const headers = {
    'Cookie': cookie,
    'Content-Type': 'application/x-www-form-urlencoded',
    'Accept': '*/*',
    'User-Agent': ua,
    'Accept-Language': 'zh-Hans-CN;q=1',
    'Accept-Encoding': 'gzip, deflate, br'
  };

  log('开始巡查签到');

  $httpClient.post({ url: CHECKIN_URL, headers, body }, function(error, response, data) {
    if (error) {
      log('签到请求失败: ' + JSON.stringify(error));
      notify('签到失败', String(error));
      return finish();
    }

    log('checkin HTTP ' + (response ? response.status : 'NO_RESPONSE'));
    log('checkin 返回: ' + data);

    let signed = false;
    let msg = data || '无返回内容';

    try {
      const obj = JSON.parse(data || '{}');
      const text = JSON.stringify(obj);

      if (obj.success === 1 || obj.success === true) {
        signed = true;
        const space = obj.space ? `，获得 ${(Number(obj.space) / 1024 / 1024).toFixed(0)}MB` : '';
        msg = '签到成功' + space;
      } else if (/已签到|已经签到|already|signed|重复/i.test(text)) {
        signed = true;
        msg = '今日已签到';
      } else {
        msg = obj.message || obj.msg || obj.error || '可能 Cookie 失效或接口返回异常';
      }
    } catch (e) {
      const text = String(data || '');
      if (/签到成功|已签到|success/i.test(text)) {
        signed = true;
        msg = '签到完成';
      }
    }

    if (signed) {
      markSignedToday();
      notify('完成', msg + '，后续巡查今日自动跳过');
    } else {
      notify('执行完成', msg);
    }

    finish();
  });
}

if (typeof $request !== 'undefined') {
  saveFromRequest();
} else {
  doCheckin();
}
