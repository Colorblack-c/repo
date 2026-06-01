/*
有道云笔记每日自动签到 - Loon Script
作者: colorblack
安全版：不内置 Cookie，需要先手动签到一次让 Loon 本地保存 Cookie
*/

const KEY_COOKIE = 'ydnote_sign_cookie_colorblack';
const KEY_BODY = 'ydnote_sign_body_colorblack';
const KEY_UA = 'ydnote_sign_ua_colorblack';

const CHECKIN_URL = 'https://note.youdao.com/yws/mapi/user?method=checkin';

function notify(title, sub, msg) {
  if (typeof $notification !== 'undefined') {
    $notification.post(title, sub || '', msg || '');
  }
}

function readStore(key) {
  const val = $persistentStore.read(key);
  return val && val.length ? val : '';
}

function saveFromRequest() {
  const headers = $request.headers || {};

  const cookie = headers['Cookie'] || headers['cookie'] || '';
  const ua = headers['User-Agent'] || headers['user-agent'] || '';
  const body = typeof $request.body === 'string' ? $request.body : '';

  if (cookie) {
    $persistentStore.write(cookie, KEY_COOKIE);
  }

  if (ua) {
    $persistentStore.write(ua, KEY_UA);
  }

  if (body) {
    $persistentStore.write(body, KEY_BODY);
  }

  console.log('[有道云笔记签到] 已保存 Cookie / UA / Body');
  notify('有道云笔记签到', 'Cookie 已保存', '以后可自动签到');
  $done({});
}

function doCheckin() {
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

  const headers = {
    'Cookie': cookie,
    'Content-Type': 'application/x-www-form-urlencoded',
    'Accept': '*/*',
    'User-Agent': ua,
    'Accept-Language': 'zh-Hans-CN;q=1',
    'Accept-Encoding': 'gzip, deflate, br'
  };

  $httpClient.post(
    {
      url: CHECKIN_URL,
      headers: headers,
      body: body
    },
    function(error, response, data) {
      if (error) {
        console.log('[有道云笔记签到] 请求失败: ' + JSON.stringify(error));
        notify('有道云笔记签到', '请求失败', String(error));
        return $done();
      }

      console.log('[有道云笔记签到] HTTP 状态: ' + (response ? response.status : '无响应'));
      console.log('[有道云笔记签到] 返回内容: ' + data);

      let msg = data || '无返回内容';

      try {
        const obj = JSON.parse(data || '{}');

        if (obj.success === true || obj.success === 1) {
          msg = '签到成功';
        } else {
          msg = obj.message || obj.msg || '可能已签到或 Cookie 失效';
        }
      } catch (e) {}

      notify('有道云笔记签到', '执行完成', msg);
      $done();
    }
  );
}

if (typeof $request !== 'undefined') {
  saveFromRequest();
} else {
  doCheckin();
}
