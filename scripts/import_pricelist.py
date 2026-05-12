#!/usr/bin/env python3
"""
Import price list spreadsheet into products table.
Matches by name (case-insensitive, fuzzy), updates price/cost/category for existing products,
and inserts new products that don't exist yet.
Generates SQL files for both updates and inserts.
"""

import json
import re
import openpyxl
from difflib import SequenceMatcher

# ==================== CATEGORY MAPPING ====================
# Map spreadsheet categories to cleaner system categories
CATEGORY_MAP = {
    'GROOMING': 'grooming',
    'GROOMING,FIRST': 'grooming',
    'FARM SUPPLIES': 'farm_supplies',
    'FLY PREVENTION': 'fly_control',
    'GRAIN & FORAGE': 'feed',
    'TACK': 'tack',
    'FIRST AID': 'first_aid',
    'VITAMINS & ELEC': 'supplement',
    'CARGILL/NUTRENA': 'feed',
    'HOOF/COAT': 'hoof_coat',
    'HAY': 'hay',
    'ANIMAL HEALTH S': 'animal_health',
    'DIGESTIVE HEALT': 'gut_health',
    'CAVALOR': 'feed',
    'CAVALOR,ANIMAL': 'animal_health',
    'CAVALOR,VITAMIN': 'supplement',
    'HAVENS': 'feed',
    'MUSCLE & JOINT': 'liniment',
    'TREATS': 'treats',
    'POULTRY': 'poultry',
    'STRESS RELIEF': 'supplement',
    'SHAVINGS': 'shavings',
    'SMALL PETS': 'small_pets',
    'MISC (TOY/CNDY)': 'misc',
    'BEVERAGES': 'beverages',
    'WORMERS': 'wormers',
    'WORMERS,POULTRY': 'wormers',
    "CONNOLLY'S RED": 'leather',
    'EQUINE AMERICA': 'supplement',
    'NUTRITION BUCKE': 'supplement',
    'POULIN GRAIN IN': 'feed',
    'TOTAL EQUINE': 'supplement',
    'EMERALD VALLEY': 'supplement',
    'KENTUCKY EQUINE': 'supplement',
    'CRYPTO AERO WHO': 'supplement',
}

def normalize_name(name):
    """Normalize product name for matching."""
    if not name:
        return ''
    n = str(name).upper().strip()
    # Remove extra whitespace
    n = re.sub(r'\s+', ' ', n)
    return n

def similarity(a, b):
    """Calculate similarity ratio between two strings."""
    return SequenceMatcher(None, a, b).ratio()

def parse_spreadsheet(filepath):
    """Parse the price list spreadsheet."""
    wb = openpyxl.load_workbook(filepath, data_only=True)
    ws = wb.active
    
    products = []
    for row in ws.iter_rows(min_row=4, values_only=True):
        cat_raw = str(row[0]).strip() if row[0] else ''
        desc = str(row[1]).strip() if row[1] else ''
        sell = row[2] if row[2] is not None else 0
        cost = row[3] if row[3] is not None else 0
        qoh = row[4] if row[4] is not None else 0
        
        if not desc or desc == 'None':
            continue
            
        # Convert to numbers
        try:
            sell = float(sell) if sell else 0
        except (ValueError, TypeError):
            sell = 0
        try:
            cost = float(cost) if cost else 0
        except (ValueError, TypeError):
            cost = 0
        try:
            qoh = int(float(qoh)) if qoh else 0
        except (ValueError, TypeError):
            qoh = 0
            
        category = CATEGORY_MAP.get(cat_raw, 'other')
        
        products.append({
            'name': desc,
            'name_normalized': normalize_name(desc),
            'category_raw': cat_raw,
            'category': category,
            'sell_price': round(sell, 2),
            'cost': round(cost, 2),
            'qoh': qoh,
        })
    
    return products

def load_existing_products(filepath):
    """Load existing products from JSON export."""
    with open(filepath) as f:
        products = json.load(f)
    for p in products:
        p['name_normalized'] = normalize_name(p['name'])
    return products

def match_products(spreadsheet_products, existing_products):
    """Match spreadsheet products to existing DB products."""
    matched = []   # (spreadsheet_item, db_item, match_score)
    unmatched = []  # spreadsheet items with no match
    
    # Build lookup by normalized name
    db_by_name = {}
    for p in existing_products:
        db_by_name[p['name_normalized']] = p
    
    # Also build lookup by partial name (first N chars)
    used_db_ids = set()
    
    for sp in spreadsheet_products:
        sp_name = sp['name_normalized']
        
        # Exact match
        if sp_name in db_by_name:
            db_item = db_by_name[sp_name]
            if db_item['id'] not in used_db_ids:
                matched.append((sp, db_item, 1.0))
                used_db_ids.add(db_item['id'])
                continue
        
        # Fuzzy match - find best match above threshold
        best_match = None
        best_score = 0
        for db_p in existing_products:
            if db_p['id'] in used_db_ids:
                continue
            score = similarity(sp_name, db_p['name_normalized'])
            if score > best_score:
                best_score = score
                best_match = db_p
        
        if best_match and best_score >= 0.85:
            matched.append((sp, best_match, best_score))
            used_db_ids.add(best_match['id'])
        else:
            unmatched.append(sp)
    
    return matched, unmatched

def escape_sql(s):
    """Escape single quotes in SQL strings."""
    if s is None:
        return 'NULL'
    return "'" + str(s).replace("'", "''") + "'"

def generate_update_sql(matched):
    """Generate UPDATE statements for matched products."""
    stmts = []
    for sp, db_p, score in matched:
        parts = []
        # Always update price and cost from spreadsheet
        parts.append(f"price = {sp['sell_price']}")
        parts.append(f"cost = {sp['cost']}")
        
        # Update category if current is 'other' and spreadsheet has something better
        if db_p['category'] == 'other' and sp['category'] != 'other':
            parts.append(f"category = {escape_sql(sp['category'])}")
        
        if parts:
            stmt = f"UPDATE products SET {', '.join(parts)} WHERE id = {db_p['id']}; -- {db_p['name']}"
            if score < 1.0:
                stmt += f" [fuzzy match {score:.2f}: {sp['name']}]"
            stmts.append(stmt)
    
    return stmts

def guess_unit_type(name, category):
    """Guess unit_type from product name and category."""
    name_upper = name.upper()
    if category in ('hay',):
        return 'bale'
    if category in ('shavings',):
        return 'bag'
    if 'GALLON' in name_upper or 'GAL ' in name_upper or 'GAL.' in name_upper:
        return 'gallon'
    if 'QUART' in name_upper or 'QRT' in name_upper or '32OZ' in name_upper:
        return 'bottle'
    if any(x in name_upper for x in ['BUCKET', 'TUB', '5GAL']):
        return 'tub'
    if any(x in name_upper for x in ['SPRAY', 'BOTTLE', '16OZ', '8OZ', '4OZ', '12OZ', '22OZ', '32OZ']):
        return 'bottle'
    if any(x in name_upper for x in ['TUBE', 'SYRINGE', 'PASTE']):
        return 'tube'
    if any(x in name_upper for x in ['BAG', 'LB)', 'LBS', '50LB', '40LB', '25LB']):
        return 'bag'
    if any(x in name_upper for x in ['PELLET', 'GRAIN', 'FEED', 'CRUMBLE']):
        return 'bag'
    return 'each'

def generate_insert_sql(unmatched):
    """Generate INSERT statements for new products."""
    stmts = []
    for sp in unmatched:
        name = escape_sql(sp['name'])
        category = escape_sql(sp['category'])
        unit_type = escape_sql(guess_unit_type(sp['name'], sp['category']))
        price = sp['sell_price']
        cost = sp['cost']
        
        stmt = (f"INSERT INTO products (name, category, unit_type, price, cost, active) "
                f"VALUES ({name}, {category}, {unit_type}, {price}, {cost}, 1);")
        stmts.append(stmt)
    
    return stmts

def main():
    print("=== Price List Import Script ===\n")
    
    # Parse spreadsheet
    sp_products = parse_spreadsheet('/home/user/price_list.xlsx')
    print(f"Spreadsheet products: {len(sp_products)}")
    
    # Load existing products
    db_products = load_existing_products('/tmp/prod_products.json')
    print(f"Existing DB products: {len(db_products)}")
    
    # Match
    matched, unmatched = match_products(sp_products, db_products)
    print(f"\nMatched: {len(matched)} (exact + fuzzy >= 0.85)")
    print(f"Unmatched (new): {len(unmatched)}")
    
    # Show fuzzy matches for review
    fuzzy = [(sp, db, score) for sp, db, score in matched if score < 1.0]
    print(f"\nFuzzy matches (< 1.0 score): {len(fuzzy)}")
    for sp, db, score in fuzzy[:20]:
        print(f"  {score:.2f}: '{sp['name']}' → '{db['name']}' (id={db['id']})")
    if len(fuzzy) > 20:
        print(f"  ... and {len(fuzzy) - 20} more")
    
    # Show category distribution for new products
    cat_counts = {}
    for sp in unmatched:
        cat_counts[sp['category']] = cat_counts.get(sp['category'], 0) + 1
    print(f"\nNew products by category:")
    for cat, cnt in sorted(cat_counts.items(), key=lambda x: -x[1]):
        print(f"  {cat}: {cnt}")
    
    # Generate SQL
    update_stmts = generate_update_sql(matched)
    insert_stmts = generate_insert_sql(unmatched)
    
    # Write update SQL
    with open('/home/user/bf-ops/scripts/update_prices.sql', 'w') as f:
        f.write("-- Auto-generated: Update existing product prices and costs from spreadsheet\n")
        f.write(f"-- {len(update_stmts)} products to update\n\n")
        for stmt in update_stmts:
            f.write(stmt + "\n")
    
    # Write insert SQL
    with open('/home/user/bf-ops/scripts/insert_new_products.sql', 'w') as f:
        f.write("-- Auto-generated: Insert new products from spreadsheet\n")
        f.write(f"-- {len(insert_stmts)} new products to insert\n\n")
        for stmt in insert_stmts:
            f.write(stmt + "\n")
    
    # Write combined SQL for wrangler execution
    with open('/home/user/bf-ops/scripts/all_price_updates.sql', 'w') as f:
        f.write("-- Combined price/cost updates + new product inserts\n")
        f.write(f"-- Updates: {len(update_stmts)}, Inserts: {len(insert_stmts)}\n\n")
        f.write("-- === UPDATES ===\n")
        for stmt in update_stmts:
            # Strip comments for execution
            sql_only = stmt.split('--')[0].strip()
            f.write(sql_only + "\n")
        f.write("\n-- === INSERTS ===\n")
        for stmt in insert_stmts:
            f.write(stmt + "\n")
    
    print(f"\nGenerated SQL files:")
    print(f"  scripts/update_prices.sql      ({len(update_stmts)} updates)")
    print(f"  scripts/insert_new_products.sql ({len(insert_stmts)} inserts)")
    print(f"  scripts/all_price_updates.sql   (combined)")
    
    # Summary stats
    price_changes = 0
    for sp, db, score in matched:
        if abs(sp['sell_price'] - (db['price'] or 0)) > 0.01:
            price_changes += 1
    print(f"\nPrice changes: {price_changes} products will get updated prices")
    
    cat_updates = sum(1 for sp, db, _ in matched if db['category'] == 'other' and sp['category'] != 'other')
    print(f"Category fixes: {cat_updates} products will get proper categories (from 'other')")

if __name__ == '__main__':
    main()
