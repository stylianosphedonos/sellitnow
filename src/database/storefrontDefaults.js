const STOREFRONT_HERO = {
  heroTitle: '3D Printed Products, Made in Cyprus 🇨🇾',
  heroSubtitle:
    'Unique, practical & personalised 3D prints — produced locally and delivered anywhere in Cyprus.',
};

const LEGACY_HERO = {
  heroTitle: 'Up to 90% Off',
  heroSubtitle: 'Discover amazing deals on electronics, fashion & more',
};

const STOREFRONT_CATEGORIES = [
  {
    name: 'Home & Decor',
    slug: 'home-decor',
    description: 'Decorative prints for your home and workspace',
    category_type: 'browse',
    website_zone: 'home-main',
    display_order: 1,
  },
  {
    name: 'Gifts & Personalised',
    slug: 'gifts-personalised',
    description: 'Custom name signs, keepsakes, and thoughtful gifts',
    category_type: 'browse',
    website_zone: 'home-main',
    display_order: 2,
  },
  {
    name: 'Practical Accessories',
    slug: 'practical-accessories',
    description: 'Useful everyday prints — organisers, stands, and more',
    category_type: 'browse',
    website_zone: 'home-main',
    display_order: 3,
  },
  {
    name: 'Request a Custom Print',
    slug: 'custom-print',
    description: 'Have an idea? We design and print it for you.',
    category_type: 'icon',
    website_zone: 'home-main',
    display_order: 4,
    request_prompt:
      'Describe your idea — size, colour, quantity, or attach a reference image. We will get back to you with a quote.',
  },
];

const SAMPLE_PRODUCTS = [
  {
    sku: 'SKU-001',
    title: 'Geometric Planter',
    description: 'Modern 3D-printed planter for succulents and small plants',
    price: 14.99,
    stock: 50,
    categorySlug: 'home-decor',
  },
  {
    sku: 'SKU-002',
    title: 'Personalised Name Sign',
    description: 'Custom wall or desk name sign — choose your text and colour',
    price: 19.99,
    stock: 100,
    categorySlug: 'gifts-personalised',
  },
  {
    sku: 'SKU-003',
    title: 'Adjustable Phone Stand',
    description: 'Sturdy desk stand for phones and small tablets',
    price: 9.99,
    stock: 80,
    categorySlug: 'practical-accessories',
  },
];

async function upsertStorefrontCategories(pool) {
  for (const cat of STOREFRONT_CATEGORIES) {
    await pool.query(
      `INSERT INTO categories (name, slug, description, display_order, category_type, website_zone, request_prompt, show_on_website)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 1)
       ON CONFLICT (slug) DO UPDATE SET
         name = excluded.name,
         description = excluded.description,
         display_order = excluded.display_order,
         category_type = excluded.category_type,
         website_zone = excluded.website_zone,
         request_prompt = excluded.request_prompt,
         show_on_website = 1`,
      [
        cat.name,
        cat.slug,
        cat.description,
        cat.display_order,
        cat.category_type,
        cat.website_zone,
        cat.request_prompt || null,
      ]
    );
  }
}

async function migrateLegacyHeroCopy(pool) {
  await pool.query(
    `UPDATE brand_settings SET value = $1 WHERE key = 'heroTitle' AND value = $2`,
    [STOREFRONT_HERO.heroTitle, LEGACY_HERO.heroTitle]
  );
  await pool.query(
    `UPDATE brand_settings SET value = $1 WHERE key = 'heroSubtitle' AND value = $2`,
    [STOREFRONT_HERO.heroSubtitle, LEGACY_HERO.heroSubtitle]
  );
}

module.exports = {
  STOREFRONT_HERO,
  LEGACY_HERO,
  STOREFRONT_CATEGORIES,
  SAMPLE_PRODUCTS,
  upsertStorefrontCategories,
  migrateLegacyHeroCopy,
};
