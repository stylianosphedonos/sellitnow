const STOREFRONT_HERO = {
  heroTitle: '3D Printed Products, Made in Cyprus 🇨🇾',
  heroSubtitle:
    'Unique, practical & personalised 3D prints — produced locally and delivered anywhere in Cyprus.',
  heroTitleEl: '3D εκτυπωμένα προϊόντα, κατασκευασμένα στην Κύπρο 🇨🇾',
  heroSubtitleEl:
    'Μοναδικές, πρακτικές και προσωποποιημένες 3D εκτυπώσεις — παράγονται τοπικά και παραδίδονται σε όλη την Κύπρο.',
};

const LEGACY_HERO = {
  heroTitle: 'Up to 90% Off',
  heroSubtitle: 'Discover amazing deals on electronics, fashion & more',
};

const STOREFRONT_CATEGORIES = [
  {
    name: 'Home & Decor',
    name_el: 'Σπίτι & Διακόσμηση',
    slug: 'home-decor',
    description: 'Decorative prints for your home and workspace',
    description_el: 'Διακοσμητικές εκτυπώσεις για το σπίτι και τον χώρο εργασίας σας',
    category_type: 'browse',
    website_zone: 'home-main',
    display_order: 1,
  },
  {
    name: 'Gifts & Personalised',
    name_el: 'Δώρα & Προσωποποιημένα',
    slug: 'gifts-personalised',
    description: 'Custom name signs, keepsakes, and thoughtful gifts',
    description_el: 'Πινακίδες με όνομα, ενθύμια και ξεχωριστά δώρα',
    category_type: 'browse',
    website_zone: 'home-main',
    display_order: 2,
  },
  {
    name: 'Practical Accessories',
    name_el: 'Πρακτικά αξεσουάρ',
    slug: 'practical-accessories',
    description: 'Useful everyday prints — organisers, stands, and more',
    description_el: 'Χρήσιμες καθημερινές εκτυπώσεις — οργανωτές, βάσεις και άλλα',
    category_type: 'browse',
    website_zone: 'home-main',
    display_order: 3,
  },
  {
    name: 'Request a Custom Print',
    name_el: 'Ζητήστε προσαρμοσμένη εκτύπωση',
    slug: 'custom-print',
    description: 'Have an idea? We design and print it for you.',
    description_el: 'Έχετε μια ιδέα; Τη σχεδιάζουμε και την εκτυπώνουμε για εσάς.',
    category_type: 'icon',
    website_zone: 'home-main',
    display_order: 4,
    request_prompt:
      'Describe your idea — size, colour, quantity, or attach a reference image. We will get back to you with a quote.',
    request_prompt_el:
      'Περιγράψτε την ιδέα σας — μέγεθος, χρώμα, ποσότητα, ή επισυνάψτε μια φωτογραφία αναφοράς. Θα επικοινωνήσουμε μαζί σας με προσφορά.',
  },
];

const SAMPLE_PRODUCTS = [
  {
    sku: 'SKU-001',
    title: 'Geometric Planter',
    title_el: 'Γεωμετρική γλάστρα',
    description: 'Modern 3D-printed planter for succulents and small plants',
    description_el: 'Μοντέρνα 3D εκτυπωμένη γλάστρα για παχύφυτα και μικρά φυτά',
    price: 14.99,
    stock: 50,
    categorySlug: 'home-decor',
  },
  {
    sku: 'SKU-002',
    title: 'Personalised Name Sign',
    title_el: 'Προσωποποιημένη πινακίδα ονόματος',
    description: 'Custom wall or desk name sign — choose your text and colour',
    description_el: 'Πινακίδα ονόματος για τοίχο ή γραφείο — διαλέξτε κείμενο και χρώμα',
    price: 19.99,
    stock: 100,
    categorySlug: 'gifts-personalised',
  },
  {
    sku: 'SKU-003',
    title: 'Adjustable Phone Stand',
    title_el: 'Ρυθμιζόμενη βάση κινητού',
    description: 'Sturdy desk stand for phones and small tablets',
    description_el: 'Ανθεκτική βάση γραφείου για κινητά και μικρά tablet',
    price: 9.99,
    stock: 80,
    categorySlug: 'practical-accessories',
  },
];

/** Insert sample categories only when the slug is new. Never change visibility, order, or other admin settings. */
async function upsertStorefrontCategories(pool) {
  for (const cat of STOREFRONT_CATEGORIES) {
    await pool.query(
      `INSERT INTO categories (name, name_el, slug, description, description_el, display_order, category_type, website_zone, request_prompt, request_prompt_el, show_on_website)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 1)
       ON CONFLICT (slug) DO NOTHING`,
      [
        cat.name,
        cat.name_el || null,
        cat.slug,
        cat.description,
        cat.description_el || null,
        cat.display_order,
        cat.category_type,
        cat.website_zone,
        cat.request_prompt || null,
        cat.request_prompt_el || null,
      ]
    );
  }
}

/** Fill Greek copy for known default slugs when the Greek fields are still empty. */
async function seedDefaultGreekCopy(pool) {
  for (const cat of STOREFRONT_CATEGORIES) {
    await pool.query(
      `UPDATE categories
       SET name_el = COALESCE(NULLIF(TRIM(COALESCE(name_el, '')), ''), $1),
           description_el = COALESCE(NULLIF(TRIM(COALESCE(description_el, '')), ''), $2),
           request_prompt_el = COALESCE(NULLIF(TRIM(COALESCE(request_prompt_el, '')), ''), $3)
       WHERE slug = $4 AND name = $5`,
      [cat.name_el || null, cat.description_el || null, cat.request_prompt_el || null, cat.slug, cat.name]
    );
  }

  for (const product of SAMPLE_PRODUCTS) {
    await pool.query(
      `UPDATE products
       SET title_el = COALESCE(NULLIF(TRIM(COALESCE(title_el, '')), ''), $1),
           description_el = COALESCE(NULLIF(TRIM(COALESCE(description_el, '')), ''), $2)
       WHERE sku = $3 AND title = $4`,
      [product.title_el || null, product.description_el || null, product.sku, product.title]
    );
  }

  await pool.query(
    `INSERT INTO brand_settings (key, value) VALUES ($1, $2)
     ON CONFLICT (key) DO NOTHING`,
    ['heroTitleEl', STOREFRONT_HERO.heroTitleEl]
  );
  await pool.query(
    `INSERT INTO brand_settings (key, value) VALUES ($1, $2)
     ON CONFLICT (key) DO NOTHING`,
    ['heroSubtitleEl', STOREFRONT_HERO.heroSubtitleEl]
  );
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
  seedDefaultGreekCopy,
  migrateLegacyHeroCopy,
};
