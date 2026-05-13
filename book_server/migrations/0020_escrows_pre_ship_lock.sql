-- 卖家发货前「锁单」：为 true 时买家不可通过本站修改收货地址、不可通过本站构建取消交易；链上合约不变，卖家仍可取消。
ALTER TABLE escrows
    ADD COLUMN IF NOT EXISTS pre_ship_locked BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN escrows.pre_ship_locked IS 'Paid 状态下卖家锁单备发货：买家不可改址/取消（本站）；卖家可取消';
