-- Idempotent seed: does not overwrite prices, stock, images or changes on existing products.
INSERT INTO products (id, slug, name, description, price, image_url, flavor, seasonal, active, stock, created_at, updated_at) VALUES
('original','original','Original','Vị bơ thơm dịu, giòn tan và thân quen.',22000,'/images/original.webp','original',0,1,100,1720000000000,1720000000000),
('chocolate','chocolate','Chocolate','Cacao đậm đà, một chút ngọt ấm áp.',22000,'/images/chocolate.webp','chocolate',0,1,100,1720000000001,1720000000001),
('matcha','matcha','Matcha','Trà xanh thanh nhẹ, thơm thật lâu.',24000,'/images/matcha.webp','matcha',0,1,100,1720000000002,1720000000002),
('mixed','mixed','Mixed','Một Original, một Chocolate, một Matcha.',22000,'/images/mixed.webp','mixed',0,1,100,1720000000003,1720000000003),
('mixed-mystery-face','mixed-mystery-face','Mystery Face','Mixed cookies với biểu cảm ngẫu nhiên.',28000,'/images/mystery-face.webp','mixed',0,1,100,1720000000004,1720000000004)
ON CONFLICT DO NOTHING;
