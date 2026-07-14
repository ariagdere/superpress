// src/lib/queries.js
// D1 veri erişim katmanı — Superpress sitesi için.
// Simpa ile AYNI veritabanını kullanır (simpa-db); bu dosya sadece
// products.brand = 'Superpress' olan satırları görür. BRAND sabiti
// aşağıda tanımlı ve her sorguya gömülü — hiçbir çağıran fonksiyonun
// ayrıca brand geçmesi gerekmez, bu yüzden unutma riski yok.

const BRAND = 'Superpress';

/**
 * Ürünü prod_code'a göre getirir. Dil görünürlük kuralı: TR sitede title_tr
 * NULL ise, EN sitede title_en NULL ise ürün bulunamaz sayılır. Ayrıca brand
 * uyuşmuyorsa (örn. bu bir Simpa ürünüyse) da bulunamaz sayılır — bu sayede
 * biri Simpa'ya ait bir prod_code'u Superpress sitesinde denerse 404 döner.
 */
export async function getProduct(db, prodCode, lang) {
  const titleCol = lang === 'en' ? 'title_en' : 'title_tr';
  const row = await db
    .prepare(
      `SELECT p.*, c.name_tr as category_name_tr, c.name_en as category_name_en, c.slug as category_slug
       FROM products p
       LEFT JOIN categories c ON c.id = p.category_id
       WHERE p.prod_code = ? AND p.brand = ? AND p.${titleCol} IS NOT NULL AND p.is_active = 1`
    )
    .bind(prodCode, BRAND)
    .first();
  return row || null;
}

/** Künye kutusu: product_specs'ten OZELLIKLER ve SPECIAL_NOTE hariç, dolu olan alanlar, field_labels sırasına göre. */
export async function getProductSpecs(db, productId, lang) {
  const valueCol = lang === 'en' ? 'value_en' : 'value_tr';
  const { results } = await db
    .prepare(
      `SELECT ps.attr_key, ps.${valueCol} as value, fl.label_tr, fl.label_en, fl.sort_order
       FROM product_specs ps
       JOIN field_labels fl ON fl.attr_key = ps.attr_key
       WHERE ps.product_id = ?
         AND ps.attr_key NOT IN ('OZELLIKLER','SPECIAL_NOTE')
         AND ps.${valueCol} IS NOT NULL
       ORDER BY fl.sort_order`
    )
    .bind(productId)
    .all();
  return results;
}

/** Ürün Açıklaması sekmesi içeriği (Özellikler alanından). NULL ise sekme gösterilmez. */
export async function getProductDescription(db, productId, lang) {
  const valueCol = lang === 'en' ? 'value_en' : 'value_tr';
  const row = await db
    .prepare(`SELECT ${valueCol} as value FROM product_specs WHERE product_id = ? AND attr_key = 'OZELLIKLER'`)
    .bind(productId)
    .first();
  return row ? row.value : null;
}

/** Künye kutusunun hemen altındaki özel not (varsa). */
export async function getSpecialNote(db, productId, lang) {
  const valueCol = lang === 'en' ? 'value_en' : 'value_tr';
  const row = await db
    .prepare(`SELECT ${valueCol} as value FROM product_specs WHERE product_id = ? AND attr_key = 'SPECIAL_NOTE'`)
    .bind(productId)
    .first();
  return row ? row.value : null;
}

/** Teknik çizim URL'i (varsa). */
export async function getDrawing(db, drawingRef) {
  if (!drawingRef) return null;
  const row = await db
    .prepare('SELECT file_url FROM technical_drawings WHERE ref_key = ?')
    .bind(drawingRef)
    .first();
  return row ? row.file_url : null;
}

/** Ürün görselleri (galeri), sıralı. */
export async function getImages(db, productId) {
  const { results } = await db
    .prepare('SELECT file_url, is_primary FROM product_images WHERE product_id = ? ORDER BY sort_order')
    .bind(productId)
    .all();
  return results;
}

/**
 * Katalog (brand bazlı) ve fiyat listesi (genel) URL'lerini döner.
 * Simpa'daki fonksiyon zaten brand parametresi alıyordu — burada BRAND sabit.
 */
export async function getKeyDocuments(db, lang) {
  const urlCol = lang === 'en' ? 'file_url_en' : 'file_url_tr';
  const [catalog, priceList] = await Promise.all([
    db.prepare(`SELECT COALESCE(${urlCol}, file_url_tr) as url FROM documents WHERE doc_type = 'katalog' AND brand = ?`).bind(BRAND).first(),
    db.prepare(`SELECT COALESCE(${urlCol}, file_url_tr) as url FROM documents WHERE doc_type = 'fiyat_listesi' AND brand = ? LIMIT 1`).bind(BRAND).first(),
  ]);
  return {
    catalogUrl: catalog?.url || null,
    priceListUrl: priceList?.url || null,
  };
}

/**
 * Aktif hero slaytları (sadece BRAND, dosya başındaki sabit), dile göre doğru
 * alanlar seçilmiş halde. Boş alanlar null kalır — render tarafı "tanımlıysa
 * göster" mantığını uygular.
 */
export async function getActiveHeroSlides(db, lang) {
  const visCol = lang === 'en' ? 'show_on_en' : 'show_on_tr';
  const { results } = await db
    .prepare(`SELECT * FROM hero_slides WHERE brand = ? AND is_active = 1 AND ${visCol} = 1 ORDER BY sort_order`)
    .bind(BRAND)
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

/** İletişim formu ürün dropdown'ı için hafif liste (kod + başlık), sadece Superpress ürünleri. */
export async function getProductOptionsList(db, lang) {
  const titleCol = lang === 'en' ? 'title_en' : 'title_tr';
  const { results } = await db
    .prepare(`SELECT prod_code, ${titleCol} as title FROM products WHERE brand = ? AND ${titleCol} IS NOT NULL AND is_active = 1 ORDER BY sort_order`)
    .bind(BRAND)
    .all();
  return results;
}

/**
 * Sertifikalar şirket geneli (aynı tüzel kişilik) kabul edilip PAYLAŞILIYOR —
 * brand filtresi yok. Bunun yanlış olduğu ortaya çıkarsa (Superpress'in kendine
 * özel sertifikaları varsa) burayı product_certificates üzerinden brand'e göre
 * daraltmak gerekir.
 */
export async function getAllCertificates(db) {
  const { results } = await db.prepare('SELECT tag, name, file_url_tr, file_url_en, image_url FROM certificates').all();
  return results;
}

export async function getCertificates(db, productId) {
  const { results } = await db
    .prepare(
      `SELECT c.tag, c.name, c.file_url_tr, c.file_url_en FROM product_certificates pc
       JOIN certificates c ON c.tag = pc.cert_tag
       WHERE pc.product_id = ?`
    )
    .bind(productId)
    .all();
  return results;
}

/** Ana sayfa istatistik şeridi: kategori/ürün çeşidi sayıları SADECE Superpress'e göre. Sertifika sayısı şirket geneli. */
export async function getHomeStats(db) {
  const [{ catCount }, { varietyCount }, { certCount }] = await Promise.all([
    db
      .prepare(
        `SELECT COUNT(DISTINCT c.id) as catCount
         FROM categories c
         JOIN products p ON p.category_id = c.id
         WHERE p.brand = ? AND p.title_tr IS NOT NULL AND p.is_active = 1`
      )
      .bind(BRAND)
      .first(),
    db
      .prepare(
        `SELECT (SELECT COUNT(*) FROM product_variants pv JOIN products p ON p.id = pv.product_id WHERE p.brand = ?)
              + (SELECT COUNT(*) FROM products WHERE brand = ? AND has_variant_table = 0 AND title_tr IS NOT NULL) as varietyCount`
      )
      .bind(BRAND, BRAND)
      .first(),
    db.prepare('SELECT COUNT(*) as certCount FROM certificates').first(),
  ]);
  return { catCount, varietyCount, certCount };
}

/**
 * Teknik veriler tablosu: her varyant + her varyantın attribute'ları.
 * productId zaten getProduct'ta brand'e göre doğrulandığı için burada tekrar
 * brand kontrolüne gerek yok.
 */
export async function getVariantTable(db, productId, lang) {
  const labelCol = lang === 'en' ? 'label_en' : 'label_tr';

  const { results: variants } = await db
    .prepare('SELECT id, variant_code FROM product_variants WHERE product_id = ? ORDER BY sort_order')
    .bind(productId)
    .all();

  if (variants.length === 0) return { columns: [], rows: [] };

  const variantIds = variants.map((v) => v.id);
  const placeholders = variantIds.map(() => '?').join(',');
  const { results: attrs } = await db
    .prepare(
      `SELECT va.variant_id, va.attr_key, va.attr_value, va.group_key, fl.${labelCol} as label, fl.unit, fl.sort_order
       FROM variant_attributes va
       JOIN field_labels fl ON fl.attr_key = va.attr_key
       WHERE va.variant_id IN (${placeholders})
       ORDER BY fl.sort_order`
    )
    .bind(...variantIds)
    .all();

  const columnMap = new Map();
  for (const a of attrs) {
    if (!columnMap.has(a.attr_key)) {
      columnMap.set(a.attr_key, { attr_key: a.attr_key, label: a.label, unit: a.unit, group_key: a.group_key, sort_order: a.sort_order });
    }
  }
  const columns = [...columnMap.values()].sort((x, y) => x.sort_order - y.sort_order);

  const byVariant = new Map(variants.map((v) => [v.id, { variant_code: v.variant_code, values: {} }]));
  for (const a of attrs) {
    byVariant.get(a.variant_id).values[a.attr_key] = a.attr_value;
  }

  return { columns, rows: [...byVariant.values()] };
}

/** Künye kutusunda gösterilecek "Kablo Kesiti: 16-240mm²" / "Civata: M5-M16" gibi aralıklar. */
export async function getKunyeRanges(db, productId, lang) {
  const { results } = await db
    .prepare(`SELECT attr_key, attr_value FROM variant_attributes WHERE variant_id IN (SELECT id FROM product_variants WHERE product_id = ?) AND attr_key IN ('KABLO_KESITI','CIVATA')`)
    .bind(productId)
    .all();

  const kesitVals = [...new Set(results.filter((r) => r.attr_key === 'KABLO_KESITI').map((r) => r.attr_value))];
  const civataVals = [...new Set(results.filter((r) => r.attr_key === 'CIVATA').map((r) => r.attr_value))];

  const ranges = [];
  if (kesitVals.length) {
    const nums = kesitVals.map((v) => parseFloat(v.replace(',', '.'))).filter((n) => !isNaN(n)).sort((a, b) => a - b);
    const val = nums.length > 1 ? `${nums[0]}–${nums[nums.length - 1]} mm²` : `${nums[0]} mm²`;
    ranges.push({ attr_key: 'KABLO_KESITI', label: lang === 'en' ? 'Cable Section' : 'Kablo Kesiti', value: val });
  }
  if (civataVals.length) {
    const nums = civataVals.map((v) => ({ raw: v, n: parseInt(v.replace(/\D/g, ''), 10) })).filter((x) => !isNaN(x.n)).sort((a, b) => a.n - b.n);
    const val = nums.length > 1 ? `${nums[0].raw}–${nums[nums.length - 1].raw}` : nums[0].raw;
    ranges.push({ attr_key: 'CIVATA', label: lang === 'en' ? 'Bolt' : 'Civata', value: val });
  }
  return ranges;
}

/**
 * Tüm kategoriler + her birindeki Superpress ürün sayısı. product_count = 0
 * olan kategoriler (yani hiç Superpress ürünü olmayan Simpa kategorileri)
 * otomatik elenir — elle "4 kategori" listesi tutmamıza gerek yok.
 */
export async function getCategoriesWithCounts(db, lang) {
  const nameCol = lang === 'en' ? 'name_en' : 'name_tr';
  const titleCol = lang === 'en' ? 'title_en' : 'title_tr';
  const { results } = await db
    .prepare(
      `SELECT c.id, c.${nameCol} as name, c.slug, c.image_url,
              (SELECT COUNT(*) FROM products p WHERE p.category_id = c.id AND p.brand = ? AND p.${titleCol} IS NOT NULL AND p.is_active = 1) as product_count
       FROM categories c
       ORDER BY c.sort_order`
    )
    .bind(BRAND)
    .all();
  return results.filter((c) => c.product_count > 0);
}

function formatRange(set, isNumeric) {
  if (!set || set.size === 0) return null;
  const vals = [...set];
  if (isNumeric) {
    const nums = vals.map((v) => parseFloat(v.replace(',', '.'))).filter((n) => !isNaN(n)).sort((a, b) => a - b);
    return nums.length > 1 ? `${nums[0]}–${nums[nums.length - 1]}` : `${nums[0]}`;
  }
  const nums = vals.map((v) => ({ raw: v, n: parseInt(v.replace(/\D/g, ''), 10) })).filter((x) => !isNaN(x.n)).sort((a, b) => a.n - b.n);
  return nums.length > 1 ? `${nums[0].raw}–${nums[nums.length - 1].raw}` : nums[0]?.raw;
}

/** Verilen ürün listesine (her birinde .id olmalı) Kesit/Civata aralığını ekler. */
async function enrichWithRanges(db, products) {
  if (products.length === 0) return products;
  const productIds = products.map((p) => p.id);
  const placeholders = productIds.map(() => '?').join(',');
  const { results: ranges } = await db
    .prepare(
      `SELECT p.id as product_id, va.attr_key, va.attr_value
       FROM products p
       JOIN product_variants pv ON pv.product_id = p.id
       JOIN variant_attributes va ON va.variant_id = pv.id
       WHERE p.id IN (${placeholders}) AND va.attr_key IN ('KABLO_KESITI','CIVATA')`
    )
    .bind(...productIds)
    .all();

  const rangesByProduct = new Map();
  for (const r of ranges) {
    if (!rangesByProduct.has(r.product_id)) rangesByProduct.set(r.product_id, { KABLO_KESITI: new Set(), CIVATA: new Set() });
    rangesByProduct.get(r.product_id)[r.attr_key].add(r.attr_value);
  }

  return products.map((p) => {
    const r = rangesByProduct.get(p.id);
    return { ...p, kesitRange: formatRange(r?.KABLO_KESITI, true), civataRange: formatRange(r?.CIVATA, false) };
  });
}

/** Bir kategorideki tüm Superpress ürünleri, her biri için Kesit/Civata aralığı hesaplanmış halde. */
export async function getProductsInCategory(db, categorySlug, lang) {
  const titleCol = lang === 'en' ? 'title_en' : 'title_tr';
  const category = await db.prepare('SELECT id, name_tr, name_en FROM categories WHERE slug = ?').bind(categorySlug).first();
  if (!category) return { category: null, products: [] };

  const { results: products } = await db
    .prepare(
      `SELECT p.id, p.prod_code, p.${titleCol} as title,
              (SELECT file_url FROM product_images pi WHERE pi.product_id = p.id ORDER BY is_primary DESC, sort_order LIMIT 1) as image
       FROM products p
       WHERE p.category_id = ? AND p.brand = ? AND p.${titleCol} IS NOT NULL AND p.is_active = 1
       ORDER BY p.sort_order`
    )
    .bind(category.id, BRAND)
    .all();

  // Bu kategoride Superpress ürünü yoksa (aslında bir Simpa-only kategoriyse), yok say
  if (products.length === 0) return { category: null, products: [] };

  return { category, products: await enrichWithRanges(db, products) };
}

/** Kategori filtresi olmadan TÜM aktif Superpress ürünleri. */
export async function getAllProducts(db, lang) {
  const titleCol = lang === 'en' ? 'title_en' : 'title_tr';
  const { results: products } = await db
    .prepare(
      `SELECT p.id, p.prod_code, p.${titleCol} as title,
              (SELECT file_url FROM product_images pi WHERE pi.product_id = p.id ORDER BY is_primary DESC, sort_order LIMIT 1) as image
       FROM products p
       WHERE p.brand = ? AND p.${titleCol} IS NOT NULL AND p.is_active = 1
       ORDER BY p.sort_order`
    )
    .bind(BRAND)
    .all();
  return enrichWithRanges(db, products);
}

/** Uyumlu ürünler — sadece Superpress markası içinde kalır. */
export async function getCompatibleProducts(db, productId, lang) {
  const titleCol = lang === 'en' ? 'title_en' : 'title_tr';
  const { results } = await db
    .prepare(
      `SELECT p.id, p.prod_code, p.${titleCol} as title,
              (SELECT file_url FROM product_images pi WHERE pi.product_id = p.id ORDER BY is_primary DESC, sort_order LIMIT 1) as image
       FROM product_compatibility pcm
       JOIN products p ON p.id = pcm.compatible_product_id
       WHERE pcm.product_id = ? AND p.brand = ? AND p.${titleCol} IS NOT NULL AND p.is_active = 1`
    )
    .bind(productId, BRAND)
    .all();
  return enrichWithRanges(db, results);
}

/** Aynı kategorideki diğer Superpress ürünleri (mevcut ürün hariç). */
export async function getRelatedProducts(db, categoryId, excludeProductId, lang, limit = 12) {
  if (!categoryId) return [];
  const titleCol = lang === 'en' ? 'title_en' : 'title_tr';
  const { results } = await db
    .prepare(
      `SELECT p.id, p.prod_code, p.${titleCol} as title,
              (SELECT file_url FROM product_images pi WHERE pi.product_id = p.id ORDER BY is_primary DESC, sort_order LIMIT 1) as image
       FROM products p
       WHERE p.category_id = ? AND p.id != ? AND p.brand = ? AND p.${titleCol} IS NOT NULL AND p.is_active = 1
       ORDER BY p.sort_order LIMIT ?`
    )
    .bind(categoryId, excludeProductId, BRAND, limit)
    .all();
  return enrichWithRanges(db, results);
}

/** Admin panelden yönetilen statik sayfa içeriği (Hakkımızda, Gizlilik ve Güvenlik vb.). */
export async function getPageSection(db, pageKey, sectionKey, lang) {
  const row = await db
    .prepare('SELECT content_tr, content_en FROM page_content WHERE brand = ? AND page_key = ? AND section_key = ?')
    .bind(BRAND, pageKey, sectionKey)
    .first();
  if (!row) return null;
  return lang === 'en' ? row.content_en : row.content_tr;
}

/** Admin panelden yönetilen şirket künyesi (footer, header, WhatsApp butonu vb. için). */
export async function getCompanyInfo(db) {
  const info = await db.prepare('SELECT * FROM company_info WHERE brand = ?').bind(BRAND).first();
  const { results: socialLinks } = await db.prepare('SELECT platform, url FROM company_social_links WHERE brand = ? ORDER BY sort_order').bind(BRAND).all();
  return { ...(info || {}), socialLinks };
}
