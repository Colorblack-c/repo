/*
威锋论坛自动签到 - Loon Script 优化版
作者: colorblack

修复点：
1. X-Request-Id 不再被普通接口覆盖。
2. 只有真正的 /v1/attendance/userSignIn 请求才保存“签到专用 X-Request-Id + Body”。
3. 普通接口只刷新 Token / X-Running-Env / UA。
4. 如果 HTTP 400 + {}，优先提示“签到专用参数缺失或已失效”，不要误判为 Token 失效。
5. 每小时巡查、网络变化巡查；当天成功后自动跳过。
*/

const APP_NAME = '威锋论坛签到';
const SIGN_URL = 'https://api.wfdata.club/v1/attendance/userSignIn';

const KEY_TOKEN = 'weifeng_access_token_colorblack';
const KEY_RUNNING_ENV = 'weifeng_running_env_colorblack';
const KEY_SIGN_REQUEST_ID = 'weifeng_sign_request_id_colorblack';
const KEY_SIGN_BODY = 'weifeng_sign_body_colorblack';
const KEY_UA = 'weifeng_ua_colorblack';
const KEY_TOKEN_TIME = 'weifeng_token_time_colorblack';
const KEY_SIGN_PARAM_TIME = 'weifeng_sign_param_time_colorblack';
const KEY_LAST_SIGN_DATE = 'weifeng_last_sign_date_colorblack';
const KEY_LAST_NOTIFY_REFRESH_DATE = 'weifeng_last_notify_refresh_date_colorblack';

const TOKEN_STALE_DAYS = 3;
const SIGN_PARAM_STALE_DAYS = 7;

function log(msg) {
  console.log('[威锋论坛签到] ' + msg);
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
  if (typeof $persistentStore.remove === 'function') return $persistentStore.remove(key);
  return $persistentStore.write('', key);
}

function now() { return Date.now(); }

function getToday() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function daysBetween(ts) {
  if (!ts) return 999;
  return Math.floor((now() - Number(ts)) / 86400000);
}

function getHeader(headers, name) {
  if (!headers) return '';
  const target = name.toLowerCase();
  for (const k in headers) {
    if (k.toLowerCase() === target) return headers[k];
  }
  return '';
}

function isApiRequest(url) {
  return /^https?:\/\/api\.wfdata\.club\//.test(url || '');
}

function isSignRequest(url) {
  return /^https?:\/\/api\.wfdata\.club\/v1\/attendance\/userSignIn/.test(url || '');
}

function saveCredentialFromRequest() {
  const url = $request.url || '';
  const headers = $request.headers || {};
  const method = ($request.method || '').toUpperCase();
  const body = typeof $request.body === 'string' ? $request.body : '';

  if (!isApiRequest(url)) {
    log('非目标请求，跳过保存');
    return $done({});
  }

  const token = getHeader(headers, 'X-Access-Token');
  const runningEnv = getHeader(headers, 'X-Running-Env');
  const requestId = getHeader(headers, 'X-Request-Id');
  const ua = getHeader(headers, 'User-Agent');

  let saved = [];

  // 普通接口只刷新通用凭证
  if (token) {
    write(KEY_TOKEN, token);
    write(KEY_TOKEN_TIME, now());
    saved.push('Token');
  }

  if (runningEnv) {
    write(KEY_RUNNING_ENV, runningEnv);
    saved.push('RunningEnv');
  }

  if (ua) {
    write(KEY_UA, ua);
    saved.push('UA');
  }

  // 关键修复：签到专用 X-Request-Id 只从 userSignIn 接口保存，不能被普通接口覆盖
  if (isSignRequest(url)) {
    if (requestId) {
      write(KEY_SIGN_REQUEST_ID, requestId);
      write(KEY_SIGN_PARAM_TIME, now());
      saved.push('SignRequestId');
    }

    if (body) {
      write(KEY_SIGN_BODY, body);
      saved.push('SignBody');
    } else {
      write(KEY_SIGN_BODY, 'time=');
      saved.push('SignBodyDefault');
    }
  }

  if (saved.length > 0) {
    log('配置已保存: ' + saved.join(' / ') + '，来源: ' + method + ' ' + url);

    const today = getToday();
    const notifyDate = read(KEY_LAST_NOTIFY_REFRESH_DATE, '');

    if (notifyDate !== today || isSignRequest(url)) {
      write(KEY_LAST_NOTIFY_REFRESH_DATE, today);
      if (isSignRequest(url)) {
        notify(APP_NAME, '签到专用参数已保存', '后续自动签到会使用这次请求参数');
      } else {
        notify(APP_NAME, 'Token 已刷新', '已自动获取通用凭证');
      }
    }
  } else {
    log('目标请求已捕获，但没有可保存的 Token/Header');
  }

  $done({});
}

function shouldSkipBecauseSigned() {
  return read(KEY_LAST_SIGN_DATE, '') === getToday();
}

function markSignedToday() {
  write(KEY_LAST_SIGN_DATE, getToday());
}

function checkFreshness() {
  const tokenTime = read(KEY_TOKEN_TIME, '');
  const signParamTime = read(KEY_SIGN_PARAM_TIME, '');
  const today = getToday();

  if (tokenTime) {
    const days = daysBetween(tokenTime);
    if (days >= TOKEN_STALE_DAYS) {
      const key = 'weifeng_token_stale_notify_' + today;
      if (read(key, '') !== '1') {
        write(key, '1');
        notify(APP_NAME, 'Token 较久未刷新', '已超过 ' + days + ' 天，建议打开威锋论坛 App 刷新一次');
      }
    }
  }

  if (signParamTime) {
    const days = daysBetween(signParamTime);
    if (days >= SIGN_PARAM_STALE_DAYS) {
      const key = 'weifeng_sign_param_stale_notify_' + today;
      if (read(key, '') !== '1') {
        write(key, '1');
        notify(APP_NAME, '签到参数较旧', '建议手动进入签到页一次，刷新签到专用参数');
      }
    }
  }
}

function isLoginExpired(status, data) {
  const text = String(data || '').toLowerCase();
  if (status === 401 || status === 403) return true;
  return (
    (text.indexOf('token') !== -1 && (
      text.indexOf('invalid') !== -1 ||
      text.indexOf('expired') !== -1 ||
      text.indexOf('失效') !== -1 ||
      text.indexOf('过期') !== -1
    )) ||
    text.indexOf('未登录') !== -1 ||
    text.indexOf('请登录') !== -1 ||
    text.indexOf('登录失效') !== -1
  );
}

function parseSignResult(data) {
  let ok = false;
  let already = false;
  let msg = data || '无返回内容';

  try {
    const obj = JSON.parse(data || '{}');
    const status = obj.status || {};
    const code = status.code;
    const statusMsg = status.message || '';
    const d = obj.data || {};

    if (code === 0 || statusMsg === 'success') {
      ok = true;

      const ticket = typeof d.getWeTicket !== 'undefined' ? d.getWeTicket : '';
      const exp = typeof d.experience !== 'undefined' ? d.experience : '';
      const rank = typeof d.rank !== 'undefined' ? d.rank : '';
      const days = typeof d.signInDays !== 'undefined' ? d.signInDays : '';

      msg = '签到成功';
      if (ticket !== '') msg += '，威票 +' + ticket;
      if (exp !== '') msg += '，经验 +' + exp;
      if (days !== '') msg += '，连续 ' + days + ' 天';
      if (rank !== '') msg += '，排名 ' + rank;
    } else {
      const textMsg = statusMsg || obj.message || obj.msg || obj.error || '';
      if (/已签|已经签|今日已|重复|already/i.test(textMsg)) {
        ok = true;
        already = true;
        msg = textMsg || '今日已签到';
      } else {
        msg = textMsg || '签到异常，可能签到参数失效或接口变化';
      }
    }
  } catch (e) {
    const text = String(data || '');
    if (/success/i.test(text) && /getWeTicket|experience|rank/.test(text)) {
      ok = true;
      msg = '签到成功';
    } else if (/已签|已经签|今日已|already/i.test(text)) {
      ok = true;
      already = true;
      msg = '今日已签到';
    }
  }

  return { ok, already, msg };
}

function doSignIn() {
  log('开始巡查签到');

  if (shouldSkipBecauseSigned()) {
    log('今日已签到，跳过本次巡查');
    return $done();
  }

  const token = read(KEY_TOKEN, '');
  const runningEnv = read(KEY_RUNNING_ENV, '');
  const signRequestId = read(KEY_SIGN_REQUEST_ID, '');
  const signBody = read(KEY_SIGN_BODY, 'time=');
  const ua = read(KEY_UA, 'WeiFeng/1 CFNetwork/1402.0.8 Darwin/22.2.0');

  if (!token) {
    log('缺少 X-Access-Token，请打开 App 自动获取');
    notify(APP_NAME, '缺少 Token', '请打开威锋论坛 App，停留几秒自动获取');
    return $done();
  }

  if (!runningEnv) {
    log('缺少 X-Running-Env，请打开 App 自动获取');
    notify(APP_NAME, '缺少运行环境参数', '请打开威锋论坛 App，停留几秒自动获取');
    return $done();
  }

  if (!signRequestId) {
    log('缺少签到专用 X-Request-Id，请手动进入签到页/手动签到一次以保存参数');
    notify(APP_NAME, '缺少签到专用参数', '请进入签到页手动签到一次，保存 userSignIn 参数');
    return $done();
  }

  checkFreshness();

  const headers = {
    'X-Access-Token': token,
    'X-Running-Env': runningEnv,
    'X-Request-Id': signRequestId,
    'Content-Type': 'application/x-www-form-urlencoded',
    'Accept': '*/*',
    'User-Agent': ua,
    'Accept-Language': 'zh-CN,zh-Hans;q=0.9',
    'Accept-Encoding': 'gzip, deflate, br',
    'Connection': 'keep-alive'
  };

  $httpClient.post(
    {
      url: SIGN_URL,
      headers: headers,
      body: signBody || 'time='
    },
    function(error, response, data) {
      if (error) {
        log('userSignIn 请求失败: ' + JSON.stringify(error));
        notify(APP_NAME, '请求失败', String(error));
        return $done();
      }

      const status = response ? response.status : 0;
      const text = String(data || '');

      log('userSignIn HTTP ' + status);
      log('userSignIn 返回: ' + text);

      if (isLoginExpired(status, text)) {
        remove(KEY_TOKEN);
        notify(APP_NAME, 'Token 可能失效', '请打开威锋论坛 App 刷新登录状态');
        return $done();
      }

      // 400 + {} 多半不是 Token 失效，而是 X-Request-Id / 签到专用参数不对
      if (status === 400 && (text === '{}' || text.trim() === '')) {
        remove(KEY_SIGN_REQUEST_ID);
        notify(APP_NAME, '签到参数可能失效', '请进入签到页手动签到一次，刷新 userSignIn 参数');
        log('HTTP 400 + 空对象，已清除签到专用 X-Request-Id，等待重新捕获');
        return $done();
      }

      const result = parseSignResult(text);

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
  doSignIn();
}
