INSERT OR IGNORE INTO categories
  (id, name, slug, description, icon, sort_order, is_active, created_at, updated_at)
VALUES
  ('00000000-0000-4000-8000-000000000001', '游戏账号', 'game-accounts', '各类游戏账号', '🎮', 1, 1, unixepoch(), unixepoch()),
  ('00000000-0000-4000-8000-000000000002', '会员充值', 'membership', '各平台会员充值卡', '💎', 2, 1, unixepoch(), unixepoch()),
  ('00000000-0000-4000-8000-000000000003', '软件授权', 'software', '正版软件授权码', '💻', 3, 1, unixepoch(), unixepoch()),
  ('00000000-0000-4000-8000-000000000005', 'AI', 'ai', 'AI 工具、订阅与服务', '✨', 4, 1, unixepoch(), unixepoch()),
  ('00000000-0000-4000-8000-000000000004', '其他', 'others', '其他虚拟商品', '📦', 99, 1, unixepoch(), unixepoch());

INSERT OR IGNORE INTO announcements
  (id, title, content, is_active, sort_order, created_at, updated_at)
VALUES
  ('00000000-0000-4000-8000-000000000010', '欢迎使用', '欢迎使用 Game3DTech 自动发卡系统，购买商品后将自动发放卡密到您的邮箱。', 1, 1, unixepoch(), unixepoch());
