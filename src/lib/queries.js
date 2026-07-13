// src/lib/queries.js — admin panel
// Bu dosyanın "canlı site" için okuma fonksiyonları (getActiveHeroSlides, getPageContent)
// Simpa ve Superpress projelerindeki queries.js'e de aynen kopyalanmalı — onlar sadece
// okuma yapıyor, admin panel ise tam CRUD.

// ───────────────────────────── HERO SLIDES ─────────────────────────────

/** Admin panel için: bir markanın TÜM slaytları (aktif/pasif fark etmeksizin), sıralı. */
export async function getHeroSlides(db, brand) {
  const { results } = await db
    .prepare('SELECT * FROM hero_slides WHERE brand = ? ORDER BY sort_order')
    .bind(brand)
    .all();
  return results;
}

/** Tek bir slaytı id ile getirir (düzenleme formu için). */
export async function getHeroSlide(db, id) {
  return db.prepare('SELECT * FROM hero_slides WHERE id = ?').bind(id).first();
}

/**
 * Canlı site için: SADECE aktif VE o dilde gösterilmesi açık olan slaytlar,
 * dile göre doğru alanlar seçilmiş, boş alanlar null olarak kalır (render
 * tarafı "tanımlıysa göster" mantığını uygular).
 */
export async function getActiveHeroSlides(db, brand, lang) {
  const visCol = lang === 'en' ? 'show_on_en' : 'show_on_tr';
  const { results } = await db
    .prepare(`SELECT * FROM hero_slides WHERE brand = ? AND is_active = 1 AND ${visCol} = 1 ORDER BY sort_order`)
    .bind(brand)
    .all();

  return results.map((s) => ({
    id: s.id,
    mirrorLayout: !!s.mirror_layout,
    bgColor: s.bg_color,
    bgImageUrl: s.bg_image_url,
    bgImageOpacity: s.bg_image_opacity,
    badgeText: lang === 'en' ? s.badge_text_en : s.badge_text_tr,
    headline: lang === 'en' ? s.headline_en : s.headline_tr,
    highlightWord: lang === 'en' ? s.highlight_word_en : s.highlight_word_tr,
    subtext: lang === 'en' ? s.subtext_en : s.subtext_tr,
    fgImageUrl: lang === 'en' ? s.fg_image_url_en : s.fg_image_url_tr,
    ctaPrimaryText: lang === 'en' ? s.cta_primary_text_en : s.cta_primary_text_tr,
    ctaPrimaryLink: lang === 'en' ? s.cta_primary_link_en : s.cta_primary_link_tr,
    ctaSecondaryText: lang === 'en' ? s.cta_secondary_text_en : s.cta_secondary_text_tr,
    ctaSecondaryLink: lang === 'en' ? s.cta_secondary_link_en : s.cta_secondary_link_tr,
    slideLink: s.slide_link,
  }));
}

export async function createHeroSlide(db, brand) {
  const { meta } = await db
    .prepare('INSERT INTO hero_slides (brand, sort_order) VALUES (?, (SELECT COALESCE(MAX(sort_order), 0) + 1 FROM hero_slides WHERE brand = ?))')
    .bind(brand, brand)
    .run();
  return meta.last_row_id;
}

const HERO_SLIDE_FIELDS = [
  'is_active', 'mirror_layout', 'bg_color', 'bg_image_url', 'bg_image_opacity',
  'show_on_tr', 'show_on_en',
  'badge_text_tr', 'badge_text_en', 'headline_tr', 'headline_en',
  'highlight_word_tr', 'highlight_word_en', 'subtext_tr', 'subtext_en',
  'fg_image_url_tr', 'fg_image_url_en',
  'cta_primary_text_tr', 'cta_primary_text_en', 'cta_primary_link_tr', 'cta_primary_link_en',
  'cta_secondary_text_tr', 'cta_secondary_text_en', 'cta_secondary_link_tr', 'cta_secondary_link_en',
  'slide_link',
];

/** fields: yukarıdaki HERO_SLIDE_FIELDS'ten herhangi bir alt kümesi içeren obje. */
export async function updateHeroSlide(db, id, fields) {
  const keys = Object.keys(fields).filter((k) => HERO_SLIDE_FIELDS.includes(k));
  if (keys.length === 0) return;
  const setClause = keys.map((k) => `${k} = ?`).join(', ');
  const values = keys.map((k) => fields[k]);
  await db
    .prepare(`UPDATE hero_slides SET ${setClause}, updated_at = datetime('now') WHERE id = ?`)
    .bind(...values, id)
    .run();
}

export async function deleteHeroSlide(db, id) {
  await db.prepare('DELETE FROM hero_slides WHERE id = ?').bind(id).run();
}

/** ids: yeni sıraya göre dizilmiş id listesi. */
export async function reorderHeroSlides(db, ids) {
  const stmts = ids.map((id, i) => db.prepare('UPDATE hero_slides SET sort_order = ? WHERE id = ?').bind(i, id));
  await db.batch(stmts);
}

// ───────────────────────────── PAGE CONTENT ─────────────────────────────

/** Admin panel için: bir markanın bir sayfasındaki tüm bölümler, sıralı. */
export async function getPageSections(db, brand, pageKey) {
  const { results } = await db
    .prepare('SELECT * FROM page_content WHERE brand = ? AND page_key = ? ORDER BY sort_order')
    .bind(brand, pageKey)
    .all();
  return results;
}

/** Canlı site için: tek bir bölümün metnini dile göre getirir. */
export async function getPageSection(db, brand, pageKey, sectionKey, lang) {
  const row = await db
    .prepare('SELECT content_tr, content_en FROM page_content WHERE brand = ? AND page_key = ? AND section_key = ?')
    .bind(brand, pageKey, sectionKey)
    .first();
  if (!row) return null;
  return lang === 'en' ? row.content_en : row.content_tr;
}

/** Var olan bölümü günceller, yoksa oluşturur. */
export async function upsertPageSection(db, brand, pageKey, sectionKey, contentTr, contentEn, sortOrder = 0) {
  await db
    .prepare(
      `INSERT INTO page_content (brand, page_key, section_key, content_tr, content_en, sort_order, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
       ON CONFLICT(brand, page_key, section_key)
       DO UPDATE SET content_tr = excluded.content_tr, content_en = excluded.content_en,
                      sort_order = excluded.sort_order, updated_at = datetime('now')`
    )
    .bind(brand, pageKey, sectionKey, contentTr, contentEn, sortOrder)
    .run();
}

// ───────────────────────────── CATEGORIES ─────────────────────────────
// Kategoriler brand'e özel değil, tek paylaşılan liste (marka ayrımı ürün
// seviyesinde). Bu yüzden burada marka filtresi yok.

/** Admin panel için: tüm kategoriler + her markadan kaçar ürünü olduğu (silme öncesi uyarı için). */
export async function getCategoriesAdmin(db) {
  const { results } = await db
    .prepare(
      `SELECT c.*,
              (SELECT COUNT(*) FROM products p WHERE p.category_id = c.id AND p.brand = 'Simpa') as simpa_count,
              (SELECT COUNT(*) FROM products p WHERE p.category_id = c.id AND p.brand = 'Superpress') as superpress_count
       FROM categories c
       ORDER BY c.sort_order`
    )
    .all();
  return results;
}

export async function getCategoryById(db, id) {
  return db.prepare('SELECT * FROM categories WHERE id = ?').bind(id).first();
}

export async function createCategory(db) {
  const { meta } = await db
    .prepare('INSERT INTO categories (name_tr, sort_order) VALUES (?, (SELECT COALESCE(MAX(sort_order), 0) + 1 FROM categories))')
    .bind('Yeni Kategori')
    .run();
  return meta.last_row_id;
}

const CATEGORY_FIELDS = ['name_tr', 'name_en', 'slug', 'image_url'];

export async function updateCategory(db, id, fields) {
  const keys = Object.keys(fields).filter((k) => CATEGORY_FIELDS.includes(k));
  if (keys.length === 0) return;
  const setClause = keys.map((k) => `${k} = ?`).join(', ');
  const values = keys.map((k) => fields[k]);
  await db.prepare(`UPDATE categories SET ${setClause} WHERE id = ?`).bind(...values, id).run();
}

/** Slug'ın başka bir kategoride kullanılıp kullanılmadığını kontrol eder (kendisi hariç). */
export async function isSlugTaken(db, slug, excludeId) {
  const row = await db.prepare('SELECT id FROM categories WHERE slug = ? AND id != ?').bind(slug, excludeId || -1).first();
  return !!row;
}

/** Toplam ürün sayısını döner (brand fark etmeksizin) — silme öncesi güvenlik kontrolü için. */
export async function getCategoryProductCount(db, id) {
  const row = await db.prepare('SELECT COUNT(*) as n FROM products WHERE category_id = ?').bind(id).first();
  return row.n;
}

export async function deleteCategory(db, id) {
  await db.prepare('DELETE FROM categories WHERE id = ?').bind(id).run();
}

export async function reorderCategories(db, ids) {
  const stmts = ids.map((id, i) => db.prepare('UPDATE categories SET sort_order = ? WHERE id = ?').bind(i, id));
  await db.batch(stmts);
}

// ───────────────────────────── PRODUCTS ─────────────────────────────

export async function getProductsAdmin(db, { brand, categoryId, search } = {}) {
  let sql = `SELECT p.*, c.name_tr as category_name FROM products p LEFT JOIN categories c ON c.id = p.category_id WHERE 1=1`;
  const params = [];
  if (brand) { sql += ' AND p.brand = ?'; params.push(brand); }
  if (categoryId) { sql += ' AND p.category_id = ?'; params.push(Number(categoryId)); }
  if (search) { sql += ' AND (p.prod_code LIKE ? OR p.title_tr LIKE ?)'; params.push(`%${search}%`, `%${search}%`); }
  sql += ' ORDER BY p.sort_order';
  const { results } = await db.prepare(sql).bind(...params).all();
  return results;
}

export async function getProductById(db, id) {
  return db.prepare('SELECT * FROM products WHERE id = ?').bind(id).first();
}

export async function isProdCodeTaken(db, prodCode, excludeId) {
  const row = await db.prepare('SELECT id FROM products WHERE prod_code = ? AND id != ?').bind(prodCode, excludeId || -1).first();
  return !!row;
}

export async function createProduct(db, brand) {
  const { meta } = await db
    .prepare(
      `INSERT INTO products (prod_code, title_tr, brand, is_active, has_variant_table, sort_order)
       VALUES (?, ?, ?, 0, 1, (SELECT COALESCE(MAX(sort_order), 0) + 1 FROM products))`
    )
    .bind(`YENI-${Date.now().toString().slice(-6)}`, 'Yeni Ürün', brand || 'Simpa')
    .run();
  return meta.last_row_id;
}

const PRODUCT_FIELDS = ['prod_code', 'title_tr', 'title_en', 'category_id', 'brand', 'drawing_ref', 'has_variant_table', 'is_active', 'sort_order'];

export async function updateProduct(db, id, fields) {
  const keys = Object.keys(fields).filter((k) => PRODUCT_FIELDS.includes(k));
  if (keys.length === 0) return;
  const setClause = keys.map((k) => `${k} = ?`).join(', ');
  const values = keys.map((k) => fields[k]);
  await db.prepare(`UPDATE products SET ${setClause} WHERE id = ?`).bind(...values, id).run();
}

/** Ürünü ve ona bağlı TÜM ilişkili veriyi (varyant, özellik, görsel, sertifika, uyumluluk) siler. */
export async function deleteProduct(db, id) {
  const { results: variants } = await db.prepare('SELECT id FROM product_variants WHERE product_id = ?').bind(id).all();
  for (const v of variants) {
    await db.prepare('DELETE FROM variant_attributes WHERE variant_id = ?').bind(v.id).run();
  }
  await db.prepare('DELETE FROM product_variants WHERE product_id = ?').bind(id).run();
  await db.prepare('DELETE FROM product_specs WHERE product_id = ?').bind(id).run();
  await db.prepare('DELETE FROM product_images WHERE product_id = ?').bind(id).run();
  await db.prepare('DELETE FROM product_certificates WHERE product_id = ?').bind(id).run();
  await db.prepare('DELETE FROM product_compatibility WHERE product_id = ? OR compatible_product_id = ?').bind(id, id).run();
  await db.prepare('DELETE FROM products WHERE id = ?').bind(id).run();
}

// ───────────────────────────── PRODUCT SPECS (Açıklama / Özel Not) ─────────────────────────────

export async function getProductSpecsAdmin(db, productId) {
  const { results } = await db
    .prepare("SELECT attr_key, value_tr, value_en FROM product_specs WHERE product_id = ? AND attr_key IN ('OZELLIKLER','SPECIAL_NOTE')")
    .bind(productId)
    .all();
  const byKey = Object.fromEntries(results.map((r) => [r.attr_key, r]));
  return {
    ozellikler_tr: byKey.OZELLIKLER?.value_tr || '',
    ozellikler_en: byKey.OZELLIKLER?.value_en || '',
    special_note_tr: byKey.SPECIAL_NOTE?.value_tr || '',
    special_note_en: byKey.SPECIAL_NOTE?.value_en || '',
  };
}

export async function upsertProductSpec(db, productId, attrKey, valueTr, valueEn) {
  const existing = await db.prepare('SELECT id FROM product_specs WHERE product_id = ? AND attr_key = ?').bind(productId, attrKey).first();
  if (!valueTr && !valueEn) {
    if (existing) await db.prepare('DELETE FROM product_specs WHERE id = ?').bind(existing.id).run();
    return;
  }
  if (existing) {
    await db.prepare('UPDATE product_specs SET value_tr = ?, value_en = ? WHERE id = ?').bind(valueTr || null, valueEn || null, existing.id).run();
  } else {
    await db.prepare('INSERT INTO product_specs (product_id, attr_key, value_tr, value_en) VALUES (?, ?, ?, ?)').bind(productId, attrKey, valueTr || null, valueEn || null).run();
  }
}

// ───────────────────────────── VARYANT / TEKNİK VERİ (EAV) ─────────────────────────────

export async function getFieldLabels(db) {
  const { results } = await db.prepare('SELECT attr_key, label_tr, label_en, unit, sort_order FROM field_labels ORDER BY sort_order').all();
  return results;
}

/** Bir ürünün tüm varyantları + her birinin teknik özellik değerleri, düzenleme için düz obje halinde. */
export async function getProductVariantsAdmin(db, productId) {
  const { results: variants } = await db.prepare('SELECT id, variant_code, sort_order FROM product_variants WHERE product_id = ? ORDER BY sort_order').bind(productId).all();
  if (variants.length === 0) return [];
  const variantIds = variants.map((v) => v.id);
  const placeholders = variantIds.map(() => '?').join(',');
  const { results: attrs } = await db.prepare(`SELECT variant_id, attr_key, attr_value FROM variant_attributes WHERE variant_id IN (${placeholders})`).bind(...variantIds).all();

  const byVariant = new Map(variants.map((v) => [v.id, { ...v, values: {} }]));
  for (const a of attrs) {
    byVariant.get(a.variant_id).values[a.attr_key] = a.attr_value;
  }
  return [...byVariant.values()];
}

/** Tek bir varyant satırını (kod + tüm özellik değerleri) kaydeder — yoksa oluşturur. */
export async function saveVariantRow(db, productId, variantId, variantCode, sortOrder, values) {
  let id = variantId;
  if (!id) {
    const { meta } = await db.prepare('INSERT INTO product_variants (product_id, variant_code, sort_order) VALUES (?, ?, ?)').bind(productId, variantCode, sortOrder).run();
    id = meta.last_row_id;
  } else {
    await db.prepare('UPDATE product_variants SET variant_code = ?, sort_order = ? WHERE id = ?').bind(variantCode, sortOrder, id).run();
  }

  for (const [key, value] of Object.entries(values)) {
    const existing = await db.prepare('SELECT id FROM variant_attributes WHERE variant_id = ? AND attr_key = ?').bind(id, key).first();
    if (value === '' || value == null) {
      if (existing) await db.prepare('DELETE FROM variant_attributes WHERE id = ?').bind(existing.id).run();
    } else if (existing) {
      await db.prepare('UPDATE variant_attributes SET attr_value = ? WHERE id = ?').bind(value, existing.id).run();
    } else {
      // group_key artık field_labels'ta tanımlı — burada otomatik miras alınır, admin ayrıca girmez
      const field = await db.prepare('SELECT group_key FROM field_labels WHERE attr_key = ?').bind(key).first();
      await db.prepare('INSERT INTO variant_attributes (variant_id, attr_key, attr_value, group_key) VALUES (?, ?, ?, ?)').bind(id, key, value, field?.group_key || null).run();
    }
  }
  return id;
}

export async function deleteVariantRow(db, variantId) {
  await db.prepare('DELETE FROM variant_attributes WHERE variant_id = ?').bind(variantId).run();
  await db.prepare('DELETE FROM product_variants WHERE id = ?').bind(variantId).run();
}

export async function reorderVariants(db, ids) {
  const stmts = ids.map((id, i) => db.prepare('UPDATE product_variants SET sort_order = ? WHERE id = ?').bind(i, id));
  await db.batch(stmts);
}

/** Excel import'ta "bu kod zaten var mı" kontrolü için. */
export async function getVariantByCode(db, productId, variantCode) {
  return db.prepare('SELECT id FROM product_variants WHERE product_id = ? AND variant_code = ?').bind(productId, variantCode).first();
}

// ───────────────────────────── GÖRSEL GALERİSİ (product_images) ─────────────────────────────

export async function getProductImages(db, productId) {
  const { results } = await db.prepare('SELECT id, file_url, is_primary, sort_order FROM product_images WHERE product_id = ? ORDER BY sort_order').bind(productId).all();
  return results;
}

export async function addProductImage(db, productId, fileUrl) {
  const maxSort = await db.prepare('SELECT MAX(sort_order) as m FROM product_images WHERE product_id = ?').bind(productId).first();
  const isFirst = (await db.prepare('SELECT COUNT(*) as n FROM product_images WHERE product_id = ?').bind(productId).first()).n === 0;
  const { meta } = await db
    .prepare('INSERT INTO product_images (product_id, file_url, is_primary, sort_order) VALUES (?, ?, ?, ?)')
    .bind(productId, fileUrl, isFirst ? 1 : 0, (maxSort.m ?? -1) + 1)
    .run();
  return meta.last_row_id;
}

export async function deleteProductImage(db, imageId) {
  await db.prepare('DELETE FROM product_images WHERE id = ?').bind(imageId).run();
}

/** Bu görseli ana görsel yapar, aynı üründeki diğer tüm görsellerin ana görsel işaretini kaldırır. */
export async function setProductImagePrimary(db, productId, imageId) {
  await db.prepare('UPDATE product_images SET is_primary = 0 WHERE product_id = ?').bind(productId).run();
  await db.prepare('UPDATE product_images SET is_primary = 1 WHERE id = ?').bind(imageId).run();
}

export async function reorderProductImages(db, ids) {
  const stmts = ids.map((id, i) => db.prepare('UPDATE product_images SET sort_order = ? WHERE id = ?').bind(i, id));
  await db.batch(stmts);
}

// ───────────────────────────── TEKNİK ALAN TANIMLARI (field_labels + gruplar) ─────────────────────────────

/** Tüm alanlar, gruplarına göre gruplanmış. scope: 'product' | 'variant' | undefined (hepsi). */
export async function getFieldLabelsGrouped(db, scope) {
  const sql = scope
    ? `SELECT * FROM field_labels WHERE scope = ? ORDER BY (group_sort_order IS NULL), group_sort_order, sort_order`
    : `SELECT * FROM field_labels ORDER BY (group_sort_order IS NULL), group_sort_order, sort_order`;
  const { results } = scope ? await db.prepare(sql).bind(scope).all() : await db.prepare(sql).all();

  const groups = new Map();
  for (const f of results) {
    const key = f.group_key || '(gruplanmamış)';
    if (!groups.has(key)) {
      groups.set(key, { group_key: f.group_key, group_label_tr: f.group_label_tr || key, group_label_en: f.group_label_en || key, fields: [] });
    }
    groups.get(key).fields.push(f);
  }
  return [...groups.values()];
}

/** "Hangi gruba ait" dropdown'ı için: var olan gruplar, scope'a göre filtrelenmiş. */
export async function getDistinctGroups(db, scope) {
  const { results } = await db
    .prepare('SELECT DISTINCT group_key, group_label_tr, group_label_en FROM field_labels WHERE group_key IS NOT NULL AND scope = ? ORDER BY group_sort_order')
    .bind(scope)
    .all();
  return results;
}

export async function getFieldLabelByKey(db, attrKey) {
  return db.prepare('SELECT * FROM field_labels WHERE attr_key = ?').bind(attrKey).first();
}

export async function isFieldKeyTaken(db, attrKey) {
  const row = await db.prepare('SELECT attr_key FROM field_labels WHERE attr_key = ?').bind(attrKey).first();
  return !!row;
}

/** Bu alan herhangi bir varyantta kullanılıyor mu — silmeden önce güvenlik kontrolü. */
export async function getFieldUsageCount(db, attrKey) {
  const row = await db.prepare('SELECT COUNT(*) as n FROM variant_attributes WHERE attr_key = ?').bind(attrKey).first();
  return row.n;
}

export async function createFieldLabel(db, data) {
  // Yeni alan hangi mevcut gruba atandıysa, o grubun (aynı scope içinde) group_sort_order'ını miras alır;
  // tamamen yeni bir grup adıysa, en sona eklenir.
  let groupSortOrder = null;
  if (data.group_key) {
    const existingGroup = await db.prepare('SELECT group_sort_order FROM field_labels WHERE group_key = ? AND scope = ? LIMIT 1').bind(data.group_key, data.scope).first();
    if (existingGroup) {
      groupSortOrder = existingGroup.group_sort_order;
    } else {
      const maxRow = await db.prepare('SELECT MAX(group_sort_order) as m FROM field_labels WHERE scope = ?').bind(data.scope).first();
      groupSortOrder = (maxRow.m ?? -1) + 1;
    }
  }
  const maxSort = await db.prepare('SELECT MAX(sort_order) as m FROM field_labels WHERE scope = ?').bind(data.scope).first();

  await db
    .prepare(
      `INSERT INTO field_labels (attr_key, label_tr, label_en, unit, sort_order, group_key, group_label_tr, group_label_en, group_sort_order, scope)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(
      data.attr_key,
      data.label_tr,
      data.label_en || null,
      data.unit || null,
      (maxSort.m ?? -1) + 1,
      data.group_key || null,
      data.group_key ? (data.group_label_tr || data.group_key) : null,
      data.group_key ? (data.group_label_en || data.group_key) : null,
      groupSortOrder,
      data.scope
    )
    .run();
}

const FIELD_LABEL_EDITABLE = ['label_tr', 'label_en', 'unit', 'group_key', 'group_label_tr', 'group_label_en'];

export async function updateFieldLabel(db, attrKey, fields) {
  const keys = Object.keys(fields).filter((k) => FIELD_LABEL_EDITABLE.includes(k));
  if (keys.length === 0) return;
  const setClause = keys.map((k) => `${k} = ?`).join(', ');
  const values = keys.map((k) => fields[k]);
  await db.prepare(`UPDATE field_labels SET ${setClause} WHERE attr_key = ?`).bind(...values, attrKey).run();
}

export async function deleteFieldLabel(db, attrKey) {
  await db.prepare('DELETE FROM field_labels WHERE attr_key = ?').bind(attrKey).run();
}

// ───────────────────────────── KÜNYE / ÜRÜN BİLGİLERİ (product_specs, scope='product') ─────────────────────────────

/**
 * Bir ürünün künye alanlarını, tanımlı 'product' scope'lu tüm field_labels'a göre getirir
 * (OZELLIKLER/SPECIAL_NOTE hariç — onlar ayrı, sabit bir bölümde yönetiliyor).
 * Değeri girilmemiş alanlar da listede boş olarak döner (form'da input olarak gösterilsin diye).
 */
export async function getProductKunyeFields(db, productId) {
  const groups = await getFieldLabelsGrouped(db, 'product');
  const { results: values } = await db
    .prepare("SELECT attr_key, value_tr, value_en FROM product_specs WHERE product_id = ? AND attr_key NOT IN ('OZELLIKLER','SPECIAL_NOTE')")
    .bind(productId)
    .all();
  const valueMap = new Map(values.map((v) => [v.attr_key, v]));

  return groups
    .map((g) => ({
      ...g,
      fields: g.fields
        .filter((f) => f.attr_key !== 'OZELLIKLER' && f.attr_key !== 'SPECIAL_NOTE')
        .map((f) => ({ ...f, value_tr: valueMap.get(f.attr_key)?.value_tr || '', value_en: valueMap.get(f.attr_key)?.value_en || '' })),
    }))
    .filter((g) => g.fields.length > 0);
}

/** Künyedeki tek bir alanı kaydeder (OZELLIKLER/SPECIAL_NOTE için de kullanılabilir — upsertProductSpec ile aynı mantık). */
export async function saveProductSpecValue(db, productId, attrKey, valueTr, valueEn) {
  return upsertProductSpec(db, productId, attrKey, valueTr, valueEn);
}

// ───────────────────────────── SERTİFİKALAR (product_certificates, ilişki) ─────────────────────────────

export async function getAllCertificatesAdmin(db) {
  const { results } = await db.prepare('SELECT tag, name FROM certificates ORDER BY name').all();
  return results;
}

export async function getProductCertificateTags(db, productId) {
  const { results } = await db.prepare('SELECT cert_tag FROM product_certificates WHERE product_id = ?').bind(productId).all();
  return results.map((r) => r.cert_tag);
}

/** tags: seçili sertifika tag'lerinin tam listesi — mevcut ilişkiler bununla değiştirilir (silinen/eklenen otomatik hesaplanır). */
export async function saveProductCertificates(db, productId, tags) {
  await db.prepare('DELETE FROM product_certificates WHERE product_id = ?').bind(productId).run();
  for (const tag of tags) {
    await db.prepare('INSERT INTO product_certificates (product_id, cert_tag) VALUES (?, ?)').bind(productId, tag).run();
  }
}

// ───────────────────────────── UYUMLU ÜRÜNLER (product_compatibility, çift yönlü ilişki) ─────────────────────────────

export async function searchProductsForCompat(db, query, excludeId) {
  const { results } = await db
    .prepare('SELECT id, prod_code, title_tr FROM products WHERE (prod_code LIKE ? OR title_tr LIKE ?) AND id != ? LIMIT 15')
    .bind(`%${query}%`, `%${query}%`, excludeId)
    .all();
  return results;
}

export async function getProductCompatibilityList(db, productId) {
  const { results } = await db
    .prepare(
      `SELECT p.id, p.prod_code, p.title_tr FROM product_compatibility pcm
       JOIN products p ON p.id = pcm.compatible_product_id
       WHERE pcm.product_id = ?`
    )
    .bind(productId)
    .all();
  return results;
}

/** Çift yönlü ekler: A->B ve B->A aynı anda oluşturulur, sitedeki mevcut mantıkla tutarlı kalsın diye. */
export async function addProductCompatibility(db, productId, compatibleId) {
  await db.prepare('INSERT OR IGNORE INTO product_compatibility (product_id, compatible_product_id) VALUES (?, ?)').bind(productId, compatibleId).run();
  await db.prepare('INSERT OR IGNORE INTO product_compatibility (product_id, compatible_product_id) VALUES (?, ?)').bind(compatibleId, productId).run();
}

export async function removeProductCompatibility(db, productId, compatibleId) {
  await db.prepare('DELETE FROM product_compatibility WHERE product_id = ? AND compatible_product_id = ?').bind(productId, compatibleId).run();
  await db.prepare('DELETE FROM product_compatibility WHERE product_id = ? AND compatible_product_id = ?').bind(compatibleId, productId).run();
}
