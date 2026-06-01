/*
威锋论坛自动签到 - Loon Script
作者: colorblack

功能：
1. 打开威锋论坛 App 后，自动捕获 api.wfdata.club 请求里的 X-Access-Token / X-Running-Env / X-Request-Id / UA。
2. 每小时自动巡查签到。
3. 网络变化时自动巡查签到。
4. 当天签到成功后，后续巡查自动跳过。
5. Token 较久未刷新会提醒打开 App 刷新。
*/

const APP_NAME = '威锋论坛签到';
const SIGN_URL = 'https://api.wfdata.club/v1/attendance/userSignIn';

const KEY_TOKEN = 'weifeng_access_token_colorblack';
const KEY_RUNNING_ENV = 'weifeng_running_env_colorblack';
const KEY_REQUEST_ID = 'weifeng_request_id_colorblack';
const KEY_UA = 'weifeng_ua_colorblack';
const KEY_TOKEN_TIME = 'weifeng_token_time_colorblack';
const KEY_LAST_SIGN_DATE = 'weifeng_last_sign_date_colorblack';
const KEY_LAST_NOTIFY_REFRESH_DATE = 'weifeng_last_notify_refresh_date_colorblack';

const TOKEN_STALE_DAYS = 3;

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
  if (typeof $persistentStore.remove === 'function') {
    return $persistentStore.remove(key);
  }
  return $persistentStore.write('', key);
}

function now() {
  return Date.now();
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

function isUsefulWeifengRequest(url) {
  return /^https?:\/\/api\.wfdata\.club\//.test(url || '');
}

function saveCredentialFromRequest() {
  const url = $request.url || '';
  const headers = $request.headers || {};
  const method = ($request.method || '').toUpperCase();

  if (!isUsefulWeifengRequest(url)) {
    log('非目标请求，跳过保存');
    return $done({});
  }

  const token = getHeader(headers, 'X-Access-Token');
  const runningEnv = getHeader(headers, 'X-Running-Env');
  const requestId = getHeader(headers, 'X-Request-Id');
  const ua = getHeader(headers, 'User-Agent');

  let saved = [];

  if (token) {
    write(KEY_TOKEN, token);
    write(KEY_TOKEN_TIME, now());
    saved.push('Token');
  }

  if (runningEnv) {
    write(KEY_RUNNING_ENV, runningEnv);
    saved.push('RunningEnv');
  }

  if (requestId) {
    write(KEY_REQUEST_ID, requestId);
    saved.push('RequestId');
  }

  if (ua) {
    write(KEY_UA, ua);
    saved.push('UA');
  }

  if (saved.length > 0) {
    log('配置已保存: ' + saved.join(' / ') + '，来源: ' + method + ' ' + url);

    const today = getToday();
    const notifyDate = read(KEY_LAST_NOTIFY_REFRESH_DATE, '');

    if (notifyDate !== today || /\/attendance\/userSignIn/.test(url)) {
      write(KEY_LAST_NOTIFY_REFRESH_DATE, today);
      notify(APP_NAME, '配置已保存', '已自动获取签到凭证，后续可自动巡查签到');
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

function checkTokenFreshness() {
  const tokenTime = read(KEY_TOKEN_TIME, '');
  if (!tokenTime) return;

  const days = daysBetween(tokenTime);
  if (days >= TOKEN_STALE_DAYS) {
    const today = getToday();
    const notifyKey = 'weifeng_token_stale_notify_' + today;
    if (read(notifyKey, '') !== '1') {
      write(notifyKey, '1');
      notify(APP_NAME, 'Token 较久未刷新', '已超过 ' + days + ' 天，建议打开威锋论坛 App 刷新一次');
    }
  }
}

function isLoginExpired(status, data) {
  const text = String(data || '').toLowerCase();

  if (status === 401 || status === 403) return true;

  return (
    text.indexOf('token') !== -1 && (
      text.indexOf('invalid') !== -1 ||
      text.indexOf('expired') !== -1 ||
      text.indexOf('失效') !== -1 ||
      text.indexOf('过期') !== -1
    ) ||
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
        msg = textMsg || '签到异常，可能 Token 失效或接口变化';
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
  const requestId = read(KEY_REQUEST_ID, '');
  const ua = read(KEY_UA, 'WeiFeng/1 CFNetwork/1402.0.8 Darwin/22.2.0');

  if (!token) {
    log('缺少 X-Access-Token，请先打开 App 让脚本自动获取');
    notify(APP_NAME, '缺少 Token', '请打开威锋论坛 App，停留几秒自动获取');
    return $done();
  }

  checkTokenFreshness();

  const headers = {
    'X-Access-Token': token,
    'Content-Type': 'application/x-www-form-urlencoded',
    'Accept': '*/*',
    'User-Agent': ua,
    'Accept-Language': 'zh-CN,zh-Hans;q=0.9',
    'Accept-Encoding': 'gzip, deflate, br',
    'Connection': 'keep-alive'
  };

  if (runningEnv) headers['X-Running-Env'] = runningEnv;
  if (requestId) headers['X-Request-Id'] = requestId;

  $httpClient.post(
    {
      url: SIGN_URL,
      headers: headers,
      body: 'time='
    },
    function(error, response, data) {
      if (error) {
        log('userSignIn 请求失败: ' + JSON.stringify(error));
        notify(APP_NAME, '请求失败', String(error));
        return $done();
      }

      const status = response ? response.status : 0;

      log('userSignIn HTTP ' + status);
      log('userSignIn 返回: ' + data);

      if (isLoginExpired(status, data)) {
        remove(KEY_TOKEN);
        notify(APP_NAME, 'Token 可能失效', '请打开威锋论坛 App 刷新登录状态');
        return $done();
      }

      const result = parseSignResult(data);

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
