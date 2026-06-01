/*
youdao云笔记每日自动签到 - Loon Script
作者: colorblack
防漏签安全版：
1. 不内置 Cookie，先手动签到一次，让 Loon 本地保存 Cookie / UA / Body。
2. 9:00 触发后随机延迟 0-60 分钟签到。
3. 10:00-23:30 每 30 分钟检查一次，如果今天没签就补签；今天已签自动跳过。
*/

const KEY_COOKIE = 'ydnote_sign_cookie_colorblack';
const KEY_BODY = 'ydnote_sign_body_colorblack';
const KEY_UA = 'ydnote_sign_ua_colorblack';
const KEY_SIGNED_DATE = 'ydnote_signed_date_colorblack';
const KEY_LAST_TRY_DATE = 'ydnote_last_try_date_colorblack';

const CHECKIN_URL = 'https://note.youdao.com/yws/mapi/user?method=checkin';
const RANDOM_START_HOUR = 9;
const RANDOM_END_HOUR = 10;
const RANDOM_MAX_DELAY_MS = 60 * 60 * 1000;

function notify(title, sub, msg) {
  if (typeof $notification !== 'undefined') {
    $notification.post(title, sub || '', msg || '');
  }
}

function readStore(key) {
  const val = $persistentStore.read(key);
  return val && val.length ? val : '';
}

function writeStore(key, val) {
  return $persistentStore.write(String(val || ''), key);
}

function todayString() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function currentHour() {
  return new Date().getHours();
}

function saveFromRequest() {
  const headers = $request.headers || {};
  const cookie = headers['Cookie'] || headers['cookie'] || '';
  const ua = headers['User-Agent'] || headers['user-agent'] || '';
  const body = typeof $request.body === 'string' ? $request.body : '';

  if (cookie) writeStore(KEY_COOKIE, cookie);
  if (ua) writeStore(KEY_UA, ua);
  if (body) writeStore(KEY_BODY, body);

  console.log('[有道云笔记签到] 已保存 Cookie / UA / Body');
  notify('有道云笔记签到', 'Cookie 已保存', '以后可自动签到');
  $done({});
}

function alreadySignedToday() {
  return readStore(KEY_SIGNED_DATE) === todayString();
}

function markSignedToday() {
  writeStore(KEY_SIGNED_DATE, todayString());
}

function shouldRandomDelay() {
  const h = currentHour();
  return h >= RANDOM_START_HOUR && h < RANDOM_END_HOUR;
}

function runWithRandomDelayIfNeeded() {
  if (alreadySignedToday()) {
    console.log('[有道云笔记签到] 今日已签到，跳过');
    return $done();
  }

  if (shouldRandomDelay()) {
    const delay = Math.floor(Math.random() * RANDOM_MAX_DELAY_MS);
    const min = Math.round(delay / 60000);
    console.log(`[有道云笔记签到] 9-10点随机模式，延迟 ${min} 分钟后签到`);
    notify('有道云笔记签到', '随机签到已安排', `约 ${min} 分钟后执行`);
    setTimeout(doCheckin, delay);
  } else {
    doCheckin();
  }
}

function doCheckin() {
  if (alreadySignedToday()) {
    console.log('[有道云笔记签到] 执行前检查：今日已签到，跳过');
    return $done();
  }

  const cookie = readStore(KEY_COOKIE);
  const ua = readStore(KEY_UA) || 'YNote/7.5.720';
  const body = readStore(KEY_BODY);

  if (!cookie) {
    notify('有道云笔记签到', '缺少 Cookie', '请先打开 App 手动签到一次');
    return $done();
  }

  if (!body) {
    notify('有道云笔记签到', '缺少 Body', '请先打开 App 手动签到一次');
    return $done();
  }

  writeStore(KEY_LAST_TRY_DATE, todayString());

  const headers = {
    'Cookie': cookie,
    'Content-Type': 'application/x-www-form-urlencoded',
    'Accept': '*/*',
    'User-Agent': ua,
    'Accept-Language': 'zh-Hans-CN;q=1',
    'Accept-Encoding': 'gzip, deflate, br'
  };

  $httpClient.post({ url: CHECKIN_URL, headers, body }, function(error, response, data) {
    if (error) {
      console.log('[有道云笔记签到] 请求失败: ' + JSON.stringify(error));
      notify('有道云笔记签到', '请求失败', String(error));
      return $done();
    }

    const status = response ? response.status : '无响应';
    console.log('[有道云笔记签到] HTTP 状态: ' + status);
    console.log('[有道云笔记签到] 返回内容: ' + data);

    let msg = data || '无返回内容';
    let signed = false;

    try {
      const obj = JSON.parse(data || '{}');
      const text = JSON.stringify(obj);

      if (obj.success === true || obj.success === 1) {
        signed = true;
        msg = '签到成功';
      } else if (/已签到|already|signed/i.test(text)) {
        signed = true;
        msg = '今日已签到';
      } else {
        msg = obj.message || obj.msg || obj.error || '可能 Cookie 失效或接口返回异常';
      }
    } catch (e) {
      if (/已签到|签到成功|success/i.test(String(data))) {
        signed = true;
        msg = '签到完成';
      }
    }

    if (signed) markSignedToday();

    notify('有道云笔记签到', signed ? '完成' : '执行完成', msg);
    $done();
  });
}

if (typeof $request !== 'undefined') {
  saveFromRequest();
} else {
  runWithRandomDelayIfNeeded();
}
