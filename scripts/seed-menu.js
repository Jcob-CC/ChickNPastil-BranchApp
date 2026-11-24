// Seeds a small sample menu (sections and products with photos). Safe to run more than once:
// anything that already exists (matched by name) is left untouched.
const db = require('../lib/database');

const logo = 'assets/sales/img/logo.png';
const photo = (name) => `assets/sales/img/menu/${name}.jpg`;

// Prices come from the menu posters. Jars and drinks come from the daily stock sheet
// (sales amount / quantity sold). Photos are cropped from the posters; jars and drinks
// have no photo yet, so they use the logo.
// Each product: [name, price, description, image]
const menu = [
    {
        section: 'Pastil Cups',
        customizeRice: true,
        products: [
            ['Elite - Original', 25, 'Standard size (320cc): 1 cup rice & 1 scoop pastil', photo('elite')],
            ['Mythic - Spicy', 60, 'Large size (720cc): 2 cups rice & 2 scoops pastil', photo('mythic')],
        ],
    },
    {
        section: 'Combo Meals',
        customizeRice: true,
        products: [
            ['Master - Original', 40, 'Tipid Meal: 2 cups rice & 1 scoop original pastil', photo('master')],
            ['Epic - Spicy', 45, 'Paldo Meal: 1 cup rice & 2 scoops spicy pastil', photo('epic')],
        ],
    },
    {
        section: 'Pastil Jars',
        products: [
            ['Jar - Original', 139, 'Original pastil in a jar', logo],
        ],
    },
    {
        // Not named "Add-ons" on purpose: the POS treats a section with that name as the customization add-on list.
        section: 'Extras',
        products: [
            ['Extra Pastil', 25, 'Additional scoop of pastil', photo('pastil')],
        ],
    },
    {
        section: 'Drinks',
        products: [
            ['Coke', 22, '', logo],
            ['Mineral Water', 12, '', logo],
        ],
    },
];

const findAddonId = db.prepare(`
    SELECT addon_id FROM product_addons
    WHERE addon_category = 'rice' AND lower(addon_name) = lower(?) AND COALESCE(is_archived, 0) = 0
`);
const findSection = db.prepare('SELECT section_id FROM menu_section WHERE lower(section_name) = lower(?)');
const insertSection = db.prepare('INSERT INTO menu_section (section_name, is_available, is_archived) VALUES (?, 1, 0)');
const findProduct = db.prepare('SELECT product_id FROM menu_products WHERE section_id = ? AND lower(product_name) = lower(?)');
const insertProduct = db.prepare(`
    INSERT INTO menu_products
        (section_id, product_name, description, price, is_available, image_url, allow_quantity, is_archived,
         customization_type, customization_enabled, customization_choice_ids)
    VALUES (?, ?, ?, ?, 1, ?, 1, 0, ?, ?, ?)
`);

const seed = db.transaction(() => {
    const riceIds = ['Plain Rice', 'Garlic Rice'].map((name) => {
        const row = findAddonId.get(name);
        if (!row) throw new Error(`Rice choice "${name}" not found. Start the server once so it creates the default add-ons, then run this again.`);
        return row.addon_id;
    });

    const added = [];
    const skipped = [];
    for (const { section, customizeRice, products } of menu) {
        const existing = findSection.get(section);
        const sectionId = existing ? existing.section_id : Number(insertSection.run(section).lastInsertRowid);
        for (const [name, price, description, image] of products) {
            if (findProduct.get(sectionId, name)) {
                skipped.push(`${section} / ${name}`);
                continue;
            }
            insertProduct.run(
                sectionId, name, description, price, image,
                customizeRice ? 'pastil' : 'none',
                customizeRice ? 1 : 0,
                JSON.stringify(customizeRice ? riceIds : []),
            );
            added.push(`${section} / ${name} - Php ${price}`);
        }
    }
    return { added, skipped };
});

const { added, skipped } = seed();
console.log(`Added ${added.length} product(s):`);
added.forEach((line) => console.log(`  + ${line}`));
if (skipped.length) {
    console.log(`Skipped ${skipped.length} that already exist:`);
    skipped.forEach((line) => console.log(`  = ${line}`));
}
