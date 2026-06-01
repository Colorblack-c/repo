/*
IT之家自动签到 - Loon Script
作者: colorblack
说明:
1. 先导入 LPX，并开启 MITM：napi.ithome.com
2. 打开 IT之家 App 的签到页面一次，让脚本保存 userHash / UA。
3. 后续每小时、网络变化时自动巡查；当天已签到则自动跳过后续巡查。
*/

const KEY_USERHASH = 'ithome_sign_userhash_colorblack';
const KEY_TYPE = 'ithome_sign_type_colorblack';
const KEY_UA = 'ithome_sign_ua_colorblack';
const KEY_SIGNED_DATE = 'ithome_sign_signed_date_colorblack';
const KEY_LOCK_TS = 'ithome_sign_lock_ts_colorblack';

const API_GET_INFO = 'https://napi.ithome.com/api/usersign/getsigninfo';
const API_SIGN = 'https://napi.ithome.com/api/usersign/sign';

function log(msg) {
  console.log('[IT之家签到] ' + msg);
}

function notify(sub, msg) {
  if (typeof $notification !== 'undefined') {
    $notification.post('IT之家签到', sub || '', msg || '');
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

function getQueryParam(url, name) {
  const reg = new RegExp('[?&]' + name + '=([^&]+)', 'i');
  const m = String(url || '').match(reg);
  return m ? m[1] : '';
}

function saveFromRequest() {
  const url = $request.url || '';
  const headers = $request.headers || {};
  const userHash = getQueryParam(url, 'userHash');
  const type = getQueryParam(url, 'type');
  const ua = headers['User-Agent'] || headers['user-agent'] || '';

  if (userHash) write(KEY_USERHASH, userHash);
  if (type) write(KEY_TYPE, type);
  if (ua) write(KEY_UA, ua);

  if (userHash) {
    log('已保存 userHash / UA');
    notify('配置已保存', '已获取签到凭证，后续可自动巡查签到');
  } else {
    log('本次请求未发现 userHash');
  }

  $done({});
}

function buildUrl(base) {
  const userHash = read(KEY_USERHASH);
  const type = read(KEY_TYPE);
  let url = base + '?userHash=' + userHash;
  if (type) url += '&type=' + type;
  return url;
}

function requestGet(url, callback) {
  const ua = read(KEY_UA) || 'ITHomeClient/9.28 (iPhone; iOS 16.2; Scale/3.00)';
  const headers = {
    'User-Agent': ua,
    'Accept': '*/*',
    'Content-Type': 'application/x-www-form-urlencoded',
    'Referer': 'https://img.ithome.com/app/newmy/apppage/user/signin.html?hidemenu=1',
    'Accept-Language': 'zh-Hans-CN;q=1',
    'Accept-Encoding': 'gzip, deflate, br'
  };

  $httpClient.get({ url, headers }, function(error, response, data) {
    callback(error, response, data);
  });
}

function parseJSON(data) {
  try {
    return JSON.parse(data || '{}');
  } catch (e) {
    return null;
  }
}

function finish() {
  write(KEY_LOCK_TS, '');
  $done();
}

function doCheck() {
  const today = todayString();

  if (read(KEY_SIGNED_DATE) === today) {
    log('今天已确认签到，跳过本次巡查');
    return $done();
  }

  const userHash = read(KEY_USERHASH);
  if (!userHash) {
    notify('缺少签到凭证', '请先打开 IT之家 App 签到页一次');
    return $done();
  }

  const lockTs = Number(read(KEY_LOCK_TS) || 0);
  const now = Date.now();
  if (lockTs && now - lockTs < 5 * 60 * 1000) {
    log('已有任务运行中，跳过');
    return $done();
  }
  write(KEY_LOCK_TS, now);

  const infoUrl = buildUrl(API_GET_INFO);
  log('开始巡查签到状态');

  requestGet(infoUrl, function(error, response, data) {
    if (error) {
      log('获取签到状态失败: ' + JSON.stringify(error));
      notify('巡查失败', String(error));
      return finish();
    }

    log('getsigninfo HTTP ' + (response ? response.status : 'NO_RESPONSE'));
    log('getsigninfo 返回: ' + data);

    const info = parseJSON(data);
    if (!info) {
      notify('巡查失败', '签到状态返回无法解析');
      return finish();
    }

    if (info.issign === true) {
      write(KEY_SIGNED_DATE, today);
      log('今天已经签到，后续巡查自动忽略');
      return finish();
    }

    const signUrl = buildUrl(API_SIGN);
    log('今天未签到，开始请求签到');

    requestGet(signUrl, function(signError, signResponse, signData) {
      if (signError) {
        log('签到请求失败: ' + JSON.stringify(signError));
        notify('签到失败', String(signError));
        return finish();
      }

      log('sign HTTP ' + (signResponse ? signResponse.status : 'NO_RESPONSE'));
      log('sign 返回: ' + signData);

      const result = parseJSON(signData);
      if (!result) {
        notify('签到完成', signData || '无返回内容');
        return finish();
      }

      if (result.ok === 1 || result.ok === true || result.success === true || result.success === 1) {
        write(KEY_SIGNED_DATE, today);
        const coin = result.coin ? `，获得 ${result.coin} 金币` : '';
        const cdays = result.cdays ? `，连续 ${result.cdays} 天` : '';
        notify('签到成功', `已完成${coin}${cdays}`);
      } else {
        const msg = result.msg || result.message || result.Message || '可能已签到或凭证失效';
        if (/已签|已经|重复|success/i.test(msg)) {
          write(KEY_SIGNED_DATE, today);
        }
        notify('签到结果', msg);
      }

      finish();
    });
  });
}

if (typeof $request !== 'undefined') {
  saveFromRequest();
} else {
  doCheck();
}
