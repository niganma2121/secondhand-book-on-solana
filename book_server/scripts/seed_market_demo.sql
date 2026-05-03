-- 本地演示数据：需先执行 migrations（含 0002_book_categories）
-- 用法示例：
--   docker exec -i postgres-server psql -U kunkun -d mydb < book_server/scripts/seed_market_demo.sql

BEGIN;

INSERT INTO users (pubkey, username, avatar, trade_count, sell_count, buy_count, created_at)
VALUES ('DemoSellerPubKey1111111111111111111111111111', '演示卖家', NULL, 0, 8, 0, 1718000000)
ON CONFLICT (pubkey) DO NOTHING;

INSERT INTO books (asset, book_pda, seller, collection, price, status, metadata_url, metadata_hash,
                   name, cover_url, author, series, category, condition, created_at, updated_at)
VALUES
  ('AssetBook00111111111111111111111111111111111',
   'PdaBook0011111111111111111111111111111111111',
   'DemoSellerPubKey1111111111111111111111111111',
   'DemoCollectionKey111111111111111111111111111',
   120000000, 'Listed',
   'https://example.com/meta/bk001.json',
   decode('0101010101010101010101010101010101010101010101010101010101010101', 'hex'),
   '三体', 'https://images.unsplash.com/photo-1544947950-fa07a98d237f?w=400', '刘慈欣', NULL,
   'scifi', 'LikeNew', 1718000100, 1718000100),
  ('AssetBook00211111111111111111111111111111111',
   'PdaBook0021111111111111111111111111111111111',
   'DemoSellerPubKey1111111111111111111111111111',
   'DemoCollectionKey111111111111111111111111111',
   80000000, 'Listed',
   'https://example.com/meta/bk002.json',
   decode('0202020202020202020202020202020202020202020202020202020202020202', 'hex'),
   '活着', 'https://images.unsplash.com/photo-1512820790803-83ca734da794?w=400', '余华', NULL,
   'literature', 'Good', 1718000200, 1718000200),
  ('AssetBook00311111111111111111111111111111111',
   'PdaBook0031111111111111111111111111111111111',
   'DemoSellerPubKey1111111111111111111111111111',
   'DemoCollectionKey111111111111111111111111111',
   150000000, 'Listed',
   'https://example.com/meta/bk003.json',
   decode('0303030303030303030303030303030303030303030303030303030303030303', 'hex'),
   '区块链革命', 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=400', '唐·塔普斯科特', NULL,
   'science', 'New', 1718000300, 1718000300),
  ('AssetBook00411111111111111111111111111111111',
   'PdaBook0041111111111111111111111111111111111',
   'DemoSellerPubKey1111111111111111111111111111',
   'DemoCollectionKey111111111111111111111111111',
   60000000, 'Listed',
   'https://example.com/meta/bk004.json',
   decode('0404040404040404040404040404040404040404040404040404040404040404', 'hex'),
   '穷爸爸富爸爸', 'https://images.unsplash.com/photo-1550399105-c4db6bd22608?w=400', '罗伯特·清崎', NULL,
   'business', 'Fair', 1718000400, 1718000400),
  ('AssetBook00511111111111111111111111111111111',
   'PdaBook0051111111111111111111111111111111111',
   'DemoSellerPubKey1111111111111111111111111111',
   'DemoCollectionKey111111111111111111111111111',
   180000000, 'Listed',
   'https://example.com/meta/bk005.json',
   decode('0505050505050505050505050505050505050505050505050505050505050505', 'hex'),
   '红楼梦', 'https://images.unsplash.com/photo-1481627834876-b7833e8f5570?w=400', '曹雪芹', NULL,
   'literature', 'LikeNew', 1718000500, 1718000500),
  ('AssetBook00611111111111111111111111111111111',
   'PdaBook0061111111111111111111111111111111111',
   'DemoSellerPubKey1111111111111111111111111111',
   'DemoCollectionKey111111111111111111111111111',
   90000000, 'Listed',
   'https://example.com/meta/bk006.json',
   decode('0606060606060606060606060606060606060606060606060606060606060606', 'hex'),
   '北京折叠', 'https://images.unsplash.com/photo-1456513080510-7bf3a84b82f8?w=400', '郝景芳', NULL,
   'scifi', 'Good', 1718000600, 1718000600)
ON CONFLICT (asset) DO NOTHING;

COMMIT;
