// ==/loon==
// @name         WPS 
// @desc          会员
// @author       colorblack
// @version      1.1
// ==/loon==

const EXP_TIME = Math.floor(Date.now() / 1000) + 99 * 365 * 24 * 3600; 
function modifyVIP(body) {
    try {
        let obj = JSON.parse(body);

        // 常见位置修改
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

        // 数组情况
        if (Array.isArray(obj.data)) {
            obj.data.forEach(item => {
                if (item.expire_time !== undefined) item.expire_time = EXP_TIME;
                if (item.vip_end_time !== undefined) item.vip_end_time = EXP_TIME;
            });
        }

        return JSON.stringify(obj);
    } catch (e) {
        return body;
    }
}

let url = $request.url;
if (url.includes("wps.cn")) {
    let body = $response.body;
    body = modifyVIP(body);
    $done({ body });
} else {
    $done({});
}