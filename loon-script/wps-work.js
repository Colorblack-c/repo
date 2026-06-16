// ==/loon==
// @name         WPS-huiyuan
// @desc         20260616适配更新
// @author       colorblack
// @version      1.2
// ==/loon==

const EXP_TIME = Math.floor(Date.now() / 1000) + 99 * 365 * 24 * 3600; // 99年后

function modifyVIP(body) {
    try {
        let obj = JSON.parse(body);

        // 处理 purchase_info 接口
        if (obj.data && obj.data.merchandises && Array.isArray(obj.data.merchandises)) {
            obj.data.merchandises.forEach(item => {
                if (item.expire_time) item.expire_time = EXP_TIME;
                if (item.vip_end_time) item.vip_end_time = EXP_TIME;
                if (item.effect_time) item.effect_time = Math.floor(Date.now() / 1000) - 86400;
            });
        }

        // 通用 vipinfo
        if (obj.vipinfo) {
            obj.vipinfo.expire_time = EXP_TIME;
            obj.vipinfo.memberid = 30;
            obj.vipinfo.name = "超级会员";
            obj.vipinfo.has_ad = 0;
        }

        if (obj.data) {
            if (obj.data.vipinfo) {
                obj.data.vipinfo.expire_time = EXP_TIME;
                obj.data.vipinfo.memberid = 30;
            }
            if (obj.data.user && obj.data.user.vipinfo) {
                obj.data.user.vipinfo.expire_time = EXP_TIME;
            }
        }

        // 数组类型处理
        if (Array.isArray(obj.data)) {
            obj.data.forEach(item => {
                if (item.expire_time !== undefined) item.expire_time = EXP_TIME;
                if (item.vip_end_time !== undefined) item.vip_end_time = EXP_TIME;
                if (item.end_time !== undefined) item.end_time = EXP_TIME;
            });
        }

        // 其他可能字段
        if (obj.expire_time) obj.expire_time = EXP_TIME;
        if (obj.vip_end_time) obj.vip_end_time = EXP_TIME;

        return JSON.stringify(obj);
    } catch (e) {
        console.log("WPS99 Error:", e.message);
        return body;
    }
}

let url = $request.url;

if (url.includes("wps.cn") || url.includes("ksord.com") || url.includes("tiance.wps.cn")) {
    let body = $response.body;
    body = modifyVIP(body);
    $done({ body });
} else {
    $done({});
}