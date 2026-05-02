import {request} from "./client";

//发起购买，让后端构建未签名的交易二进制字符串 (base64)
export async function createEscrow(asset: string): Promise<{ tx: string }> {
    return request('/escrow/create', {
        method: 'POST',
        body: JSON.stringify({asset})
    });
}

//将钱包签名后的交易发回后端进行上链广播
export async function broadcastEscrow(tx: string): Promise<{ msg: string }> {
    return request('/escrow/create/broadcast', {
        method: 'POST',
        body: JSON.stringify({tx})
    });
}