#!/usr/bin/env python3
"""
Loxahatchee Retail Store (LOX, location_id=1) Inventory Import
Extracted from 25+ physical count sheet photos.

This script:
1. Maps all extracted counts to existing product IDs
2. Identifies new products that need creation
3. Generates SQL for new products + inventory_stock + audit_log entries
"""

import json, re

# Load existing products from production DB export
text = open('/tmp/all_products.json').read()
start = text.find('[')
data = json.loads(text[start:])
results = data[0]['results']

# Build lookup dictionaries
products_by_id = {}
products_by_name = {}  # uppercase name -> product
products_by_sku = {}
for r in results:
    products_by_id[r['id']] = r
    norm = r['name'].upper().strip()
    products_by_name[norm] = r
    if r['sku']:
        products_by_sku[r['sku']] = r

# ============================================================
# MASTER INVENTORY DATA - Extracted from all photos
# Format: (product_description, qty, existing_product_id_or_None)
# ============================================================

# Helper: find product by partial name match
def find_product(search_terms):
    """Try to find an existing product matching search terms"""
    search = search_terms.upper().strip()
    # Exact match first
    if search in products_by_name:
        return products_by_name[search]['id']
    # Try partial matches
    for name, p in products_by_name.items():
        if search in name or name in search:
            return p['id']
    return None

# ============================================================
# SHEET 1: "Other Products" - Hay/Straw (handwritten)
# ============================================================
hay_straw = [
    ("1st cut 3 String", 35, 73),      # HAY- 1ST CUT 3 STRING TIMOTHY
    ("1st cut Alberta", 116, 101),      # HAY - FIRST CUT ALBERTA TIMOTHY
    ("2nd cut Alberta", 47, 98),        # HAY- 2ND CUT ALBERTA
    ("3 String Alfalfa", 310, 32),      # HAY - 3 STRING ALFALFA
    ("3 String Grassy", 18, 104),       # HAY- GRASSY 2ND CUT TIMOTHY 3STRING
    ("3 String Timothy", 18, 72),       # HAY- 2ND CUT 3 STRING TIMOTHY
    ("Compressed T/A", 55, 116),        # COMPRESSED T/A
    ("Orchard", 33, 42),               # HAY - 3 STRING ORCHARD
    ("Premium T/A", 55, 37),           # HAY - PREMIUM TA
    ("Quebec", 241, 31),               # HAY - QUEBEC T/A
    ("Special Reserve", 356, 53),       # HAY - SPECIAL RESERVE T/A
    ("Straw", 56, 82),                 # BALED STRAW
    ("Supergrass", 49, 52),            # HAY - SUPERGRASS
    ("Teff", 6, 125),                  # 3 STRING TEFF
    ("Twyla", 50, 132),               # HAY - TWYLA
    ("Valley Green", 99, 48),          # HAY - VALLEY GREEN
    ("2025 Timothy", 102, None),        # NEW PRODUCT
    ("Compressed Tim", 48, 154),        # COMPRESSED 2ND CUT TIMOTHY 55lb
]

# ============================================================
# SHEET 3: "Personnel Drivers" - Shavings/Bedding (handwritten)
# ============================================================
shavings_bedding = [
    ("Showtime", 1959, 38),            # SHOWTIME LARGE FLAKE
    ("Red Grandis", 1079, 153),         # RED GRANDIS FINE SHAVINGS
    ("WD Pellets", 998, 30),           # WD PELLETED BEDDING
    ("WD Fines", 562, 66),             # WD FINE SHAVINGS
    ("Fast Track Fine", 199, 56),       # FAST TRACK FINE SHAVINGS
    ("Fast Track Blend", 467, 54),      # FAST TRACK BLEND SHAVINGS (RED)
    ("WD Flake", 892, 108),            # WD FLAKE SHAVINGS
    ("King", 130, 69),                 # KING LARGE FLAKE
    ("Beaver", 862, 28),              # BEAVER SHAVINGS
    # WD Flake 345 - second entry, possibly different location within store
    # We'll add to the 892 total = 1237? Or keep separate as batch?
    # For now, use 892 as the primary count (first listed)
    ("OBEC", 168, 87),                # OBEC LARGE SHAVINGS
    ("Compressed Alfalfa", 360, 57),    # COMPRESSED ALFALFA
    ("Peanut", 180, 198),             # HAY - PEANUT
]

# ============================================================
# SHEET 2: Multi-Vendor Feed Products
# ============================================================
vendor_feed = [
    # CARGILL / NUTRENA
    ("Empower Digestive", 4, 172),                  # EMPOWER DIGESTIVE BALANCE
    ("Empower Topline Balance", 7, 119),            # EMPOWER TOPLINE BALANCE 40LB
    ("ProElite Grass Advantage", 16, 71),           # PROELITE GRASS ADVANTAGE
    ("ProElite Growth", 4, 193),                    # PROELITE GROWTH
    ("ProElite Omega Advantage", 4, 89),            # PROELITE OMEGA ADVANTAGE
    ("ProElite Performance", 10, 90),               # PROELITE PERFORMANCE
    ("ProElite Senior", 21, 51),                    # PROELITE SENIOR
    ("ProElite Topline Advantage", 6, 170),         # PROELITE TOPLINE ADVANTAGE
    ("Proforce Fuel", 7, 96),                       # PROFORCE FUEL
    ("Proforce Fuel XF", 2, None),                  # NEW - variant
    ("Proforce Senior", 11, 97),                    # PROFORCE SENIOR
    ("SafeChoice All Life Stages", 7, None),        # NEW
    ("SafeChoice Senior", 2, 112),                  # SAFECHOICE SENIOR
    ("SafeChoice Special Care", 8, 68),             # SAFECHOICE SPECIAL CARE / STARCH WI SE
    ("Southeast 12/8 Horse Pellet", 22, 135),       # SOUTHEAST 12/8 HORSE PELLET
    ("Stock and Stable 12% Sweet", 13, 113),        # STOCK AND STABLE SWEET
    ("Triumph Fiber Plus", 6, 130),                 # TRIUMPH FIBER PLUS
    ("Triumph Triple 10", 3, 146),                  # TRIUMPH TRIPLE 10

    # CAVALOR
    ("Endurix Cavalor", 5, 46),                     # Endurix Cavalor
    ("Fiberforce Cavalor", 18, 118),                # Fiberforce Cavalor
    ("Fiberforce Gastro Cavalor", 19, 99),          # FIBERFORCE GASTRO CAVALOR
    ("Mash & Mix Cavalor", 2, 67),                  # MASH & MIX 15KG CAVALOR
    ("Pianissimo Cavalor", 3, 100),                 # PIANISSIMO CAVALOR
    ("Strucomix Original Cavalor", 12, 174),        # STRUCOMIX ORIGINAL CAVALOR
    ("Strucomix Senior Cavalor", 3, 177),           # STRUCOMIX SENIOR CAVALOR
    ("Superforce Cavalor", 2, 161),                 # SUPERFORCE

    # FLORIDA HARDWARE
    ("Lucerne Hi-Fiber Gold", 8, 114),              # LUCERNE HI-FIBER FORAGE WITH MOLASSES (BROWN BAG) -> actually "Gold" = no molasses = 126
    # Actually Lucerne Hi-Fiber Gold = LUCERNE HI-FIBER GOLD NO MOLASSES (id=126)
    # Correcting:
    # ("Lucerne Hi-Fiber Gold", 8, 126),            # LUCERNE HI-FIBER GOLD NO MOLASSES
    ("PDZ Powder", 3, None),                        # NEW - PDZ POWDER
    
    # RED MILLS
    ("Comfort Mash 40LB Red Mills", 3, 131),        # COMFORT MASH 40LB RED MILLS
    ("Competition 10 Mix Red Mills", 25, 107),       # COMPETITION 10 MIX 44LB RED MILLS
    ("Competition 12 Mix Red Mills", 15, 103),       # COMPETITION 12 MIX 44LB RED MILLS
    ("Competition 14 Mix Red Mills", 3, 162),        # COMPETITION 14 MIX 44LB RED MILLS
    ("Cool N Condition Pellets Red Mills", 4, 60),   # COOL N CONDITION PELLETS 55LB RED MILLS
    ("Define & Shine Red Mills", 5, 74),             # DEFINE AND SHINE RED MILLS
    ("Horse Care 10 Mix Red Mills", 4, 133),         # HORSE CARE 10 MIX RED MILLS
    ("Horse Care 10 Pellets Red Mills", 13, 158),    # HORSE CARE 10 PELLETS 55LB RED MILLS
    ("Horse Care 14 Mix Red Mills", 6, 61),          # HORSE CARE 14 MIX RED MILLS
    ("Horse Care 14 Pellets Red Mills", 19, 75),     # HORSE CARE 14 PELLETS 55LB RED MILLS
    ("Horse Care Mash Red Mills", 3, 77),            # HORSE CARE MASH RED MILLS
    ("Horse Care Ultra Red Mills", 4, 76),           # HORSE CARE ULTRA RED MILLS
    ("Performa Care Balancer Red Mills", 7, 43),     # Performa Care Balancer 55lb Red Mills

    # FURST-McNESS / HALLWAY / KER
    ("KER Re-Leve Original", 2, 41),                # KER RE-LEVE ORIGINAL
    ("Mini Alfalfa Cubes", 2, 50),                  # MINI ALFALFA CUBES 50LB
    ("SoyBean Meal 50lbs", 3, 152),                 # SOYBEAN MEAL 50LBB

    # HAVENS
    ("Cool Mix 44lb Havens", 12, 86),               # COOL MIX 44LB (MUESLI-WITHOUT-OATS) HAVENS
    ("DraversBrok 55lb Havens", 6, 63),             # DRAVERSBROK 55LB HAVENS
    ("Endurance 14 Muesli Havens", 2, None),        # NEW - not in DB
    ("Gastro Plus 44lb Havens", 11, 44),            # Gastro Plus 44lb Havens
    ("Natural Balance w/o Molasses Havens", 2, 93),  # NATURAL BALANCE 44LB -MOLASSES FREE - HAVENS
    ("Performance 14 44lb Havens", 12, 33),          # PERFORMANCE 14 44 LB HAVENS
    ("Power Plus Mix 44lb Havens", 2, None),         # NEW
    ("Slobber Mash 44lb Havens", 9, 45),            # Slobber Mash 44lb (textured) Havens

    # STANDLEE - all blank, skip

    # SPEEDI BEET
    ("Fibrebeet 44lb", 5, 136),                     # FIBREBEET 44LB EMERALD VALLEY
    ("Speedi Beet 44lb", 7, 109),                   # SPEEDI BEET 44LB EMERALD VALLEY

    # TRACTOR SUPPLY / TRIPLE CROWN
    ("Triple Crown Balancer", 1, 165),               # TRIPLE CROWN BALANCER GOLD 50 LB
    ("Triple Crown Grass", 3, None),                 # NEW - TRIPLE CROWN GRASS
    ("Triple Crown Safe Starch", 4, 102),            # TRIPLE CROWN SAFE STARCH
    ("Triple Crown Senior", 43, 70),                 # TRIPLE CROWN SENIOR 50LB
    ("Triple Crown Stressfree", 4, 156),             # TRIPLE CROWN STRESSFREE FORAGE 40LB
    ("Triple Crown Low Starch", 3, 34),              # TRIPLE CROWN LOW STARCH
    ("Triple Crown Growth", 2, 157),                 # TRIPLE CROWN GROWTH

    # HAY EXCHANGE / BUCKEYE
    ("Cadence Ultra Buckeye", 8, 196),               # CADENCE ULTRA BUCKEYE
    ("EQ8 Gut Health Buckeye", 3, 120),              # EQ8 GUT HEALTH BUCKEYE
    ("EQ8 Performance Buckeye", 5, 194),             # EQ8 PERFORMANCE BUCKEYE
    ("EQ8 Senior Buckeye", 16, 123),                 # EQ8 SENIOR BUCKEYE
    ("Gro N Win Buckeye", 13, 190),                  # GRO N WIN BUCKEYE
    ("Safe N Easy Pelleted Buckeye", 3, 183),        # SAFE N EASY PELLET BUCKEYE
    ("Safe N Easy Performance Buckeye", 8, 197),     # SAFE N EASY PERFORMANCE BUCKEYE
    ("Ultimate Finish 25 Buckeye", 5, None),         # NEW

    # BLUE SEAL
    ("Sentinel Senior", 3, 137),                     # SENTINEL SENIOR  -> actually this might be SENTINEL PERFORMANCE LS=36
    # Actually checking: Sentinel Senior = id 137, Sentinel Performance LS = id 36

    # CRYPTO
    ("Wholefood Horse Feed Reg", 6, 171),            # WHOLEFOOD HORSE FEED CRYPTO AERO REGULAR
    ("Wild Forage Crypto", 9, 35),                   # WILD FORAGE CRYPTO AERO

    # ANDERSON
    ("Anderson Timothy Pellets", 4, 40),             # ANDERSON TIMOTHY PELLETS 40LB
    ("Anderson Alfalfa Timothy Pellets", 8, 147),    # ANDERSON ALFALFA TIMOTHY CUBES -> actually this is pellets
    ("Anderson Beet Pulp Shreds", 8, 49),            # ANDERSON BEET PULP SHREDS 25LB
    ("Anderson Alfalfa Cubes", 2, 91),               # ANDERSON ALFALFA CUBES 40LB

    # KEYFLOW
    ("Keyflow Nurture Pro Balancer 15kg", 2, 134),   # KEYFLOW NURTURE PRO BALANCER 15KG
    ("Keyflow Sensi-Care 15kg", 7, 55),              # KEYFLOW SENSI-CARE 15KG
    ("Keyflow Pink Mash 15kg", 5, 85),               # KEYFLOW PINK MASH CONDITION 15KG
    ("Keyflow Stay Cool 15kg", 3, 141),              # KEYFLOW STAY COOL 15KG

    # ADDITIONAL items at bottom of Sheet 2
    ("Total Equine", 6, 178),                        # TOTAL EQUINE
    ("Wheat Bran 50lb", 2, 88),                      # WHEAT BRAN 40LB
    ("Whole Flax", 1, 111),                          # WHOLE FLAX 50LB
    ("Whole Oats", 2, 200),                          # CF WHOLE OATS
    ("Coolstance", 4, 65),                           # COOLSTANCE COPRA STANCE EQUITEC
    ("Alfalfa Pellets (additional)", 6, 39),         # ANDERSON ALFALFA PELLETS 40LB
]

# Fix Lucerne Hi-Fiber Gold mapping
# Remove the wrong entry and keep correct one
vendor_feed = [(n,q,pid) if n != "Lucerne Hi-Fiber Gold" else ("Lucerne Hi-Fiber Gold No Molasses", 8, 126) for n,q,pid in vendor_feed]

# ============================================================
# SHEETS 4-25: Printed Retail Inventory + Handwritten Notebooks
# Only items WITH a count (skip BLANK items)
# ============================================================
retail_items = [
    # Printed sheets - items with counts
    ("1-10HP CONCENTRATE 55GAL", 3, 184),           # 1-10HP CONCENTRATE 55GAL PYRANHA
    ("ALCOHOL GALLON", 5, 207),                      # ALCOHOL GALLON
    ("ALU-MEND SPRAY BANDAGE", 7, None),             # NEW
    ("APPLE A DAY 15LB", 5, 163),                    # APPLE A DAY 15LB
    ("APPLE A DAY 30LB", 2, 121),                    # APPLE A DAY 30LB
    ("APPLE A DAY 5LB", 1, 195),                     # APPLE A DAY 5LB
    ("APPLE DEX 30 LBS", 6, None),                   # NEW
    ("APPLE ELITE ELECTROLYTE PASTE", 6, None),      # NEW
    ("B COMPLETE 1 LT FORAN", 3, None),              # NEW
    ("B COMPLETE 2.5LTS FORAN", 0, None),            # NEW - 0 count
    ("BELVOIR TACK COND BAR SOAP", 20, None),        # NEW
    ("BETADINE SOLUTION 16OZ", 2, None),             # NEW
    ("BETADINE SOLUTION GAL", 3, None),              # NEW
    ("BLADE ULTRA EDGE T-10", 13, None),             # NEW
    ("BRONCO EQUINE FLY SPRAY 32OZ", 9, None),      # NEW
    ("BRONCO EQUINE GAL", 3, None),                  # NEW
    ("BROOM BLACK", 11, None),                       # NEW
    ("CANTER MANE & TAIL COND 1L", 6, None),        # NEW
    ("CANTER MANE & TAIL COND 500ML", 4, None),     # NEW
    ("CLIPPER AGC2 SUPER EQ 2 SPEED", 1, None),     # NEW
    ("COCOSOYA GAL", 4, 160),                        # COCOSOYA GAL
    ("COOL CARE PLUS SPRAY ANDIS", 11, None),       # NEW
    ("COPPER SULFATE GEL 28OZ", 10, None),           # NEW
    ("COPPERVIT 1LT FORAN", 2, None),               # NEW
    ("COPPERVIT 2.5 LT FORAN", 0, None),            # NEW
    ("CORNUCRESCINE HOOF OINT 2", 1, None),          # NEW - Cornucrescine
    ("CORNUCRESCINE MOISTURISER", 4, None),          # NEW
    ("COWBOY MAGIC GREEN SPOT REMOVER 32OZ", 5, None), # NEW
    ("COWBOY MAGIC ROSEWATER COND 32OZ", 5, None),  # NEW
    ("COWBOY MAGIC ROSEWATER COND 16OZ", 8, None),  # NEW
    ("COWBOY MAGIC ROSEWATER COND GAL", 4, None),   # NEW
    ("COWBOY MAGIC ROSEWATER SHAMPOO 16OZ", 11, None), # NEW
    ("COWBOY MAGIC ROSEWATER SHAMPOO 32OZ", 6, None),  # NEW
    ("CRUNCHIES CAVALOR", 2, None),                  # NEW
    ("DECKER LARGE BODY SPONGE", 11, None),          # NEW
    ("DOUBLE END BRASS SNAPS", 0, None),             # NEW
    ("DURA FORK BLACK", 7, 117),                     # DURA FORK
    ("DURA FORK HEAD PINK", 3, None),                # NEW variant
    ("DURA FORK LIME GREEN", 3, None),               # NEW variant
    ("DURAMASK W/EARS HORSE PONY", 12, None),        # NEW
    ("E3 ANTIBACTERIAL ANTIFUNGAL GAL", 2, None),   # NEW
    ("E3 ANTIBACTERIAL SHAMPOO 32OZ", 2, None),     # NEW
    ("E3 ARGAN OIL SHAMPOO 32OZ", 6, None),         # NEW
    ("E3 ARGAN OIL SHAMPOO GAL", 3, 142),           # E3 ARGAN OIL SHAMPOO GAL
    ("E3 BRIGHTENING SHAMPOO 32OZ", 6, None),       # NEW
    ("E3 HOOF OIL WITH BRUSH 32OZ", 3, None),       # NEW
    ("E3 MEDICATED WOUND CARE CREAM", 2, 106),      # E3 MEDICATED WOUND CARE CREAM
    ("E3 TEA TREE SHAMPOO GAL", 5, 143),            # E3 TEA TREE SHAMPOO GAL
    ("EL QUIC SILVER SHAMPOO 16OZ", 9, None),       # NEW
    ("EL QUICK SILVER BRAID 16OZ", 5, None),        # NEW
    ("EL QUICK SILVER SHAMPOO 64OZ", 4, 206),       # E3 QUICK SILVER SHAMPOO - 64OZ
    ("ELEVATE MAINTENANCE POWDER SE 2LB", 1, 205),  # ELEVATE MAINTENANCE POWDER VITAMIN E 2LB
    ("ELEVATE MAINTENANCE POWDER 10LB", 7, None),   # NEW
    ("ENDURE EZ POUR SWEAT RESIST GAL", 5, None),   # NEW
    ("ENDURE SWEAT RESIST FLY SPRAY 32OZ", 3, None), # NEW
    ("EPSOM SALT POULTICE 10LB", 1, None),           # NEW
    ("EQUI SOFT 127OZ EQUI CARE", 2, None),         # NEW
    ("EX ULTRASHIELD ABSORBINE GAL", 3, 210),       # EX ULTRASHIELD ABSORBINE GAL
    ("EX ULTRASHIELD ABSORBINE 32OZ", 5, None),     # NEW
    ("FANCY WILD BIRD SEED", 0, None),               # NEW
    ("FARRIER'S FORMULA ORIGINAL BAG", 3, None),    # NEW (different from Double Strength)
    ("FC ANIMAL SHAMPOO GAL", 11, None),             # NEW
    ("FC ANTIFUNGAL SHAMPOO GAL", 2, None),          # NEW
    ("FEED PAN 3GAL", 16, None),                     # NEW
    ("FEED PAN 4 QUART", 13, None),                  # NEW
    ("FEED PAN 8QT", 10, None),                      # NEW
    ("FLAT BACK BUCKET 20QT BLACK", 3, None),        # NEW
    ("FLAT BACK BUCKET 20QT BLUE", 5, None),         # NEW
    ("FLAT BACK BUCKET 20QT GREEN", 7, None),        # NEW
    ("FLAXSEED OIL GAL", 5, None),                   # NEW
    ("FLEX WRAP 4 INCH SINGLE ASST", 426, None),    # NEW
    ("FLYSECT SUPER 7 32OZ", 22, None),              # NEW (different from GAL version)
    ("FLYSECT SUPER 7 REP SPRAY GAL", 1, 208),      # FLYSECT SUPER 7 REP SPRAY GALLON
    ("FUNGASOL SHAMPOO 20OZ", 4, None),              # NEW
    ("FUNGASOL SPRAY QT", 6, None),                  # NEW
    ("G-CHILL 30 SERVINGS", 3, None),                # NEW
    ("GASTROADE GAL", 6, None),                      # NEW
    ("GAUZE SPONGE 4X4X12 PLY", 6, None),           # NEW
    ("GERMAN HORSE MUFFINS 6LBS", 4, None),          # NEW
    ("GERMAN MINTY MUFFINS 6LBS", 6, None),          # NEW
    ("GIANT FLY RELIEF DISPOSABLE", 48, None),       # NEW
    ("HEALTHY COAT HORSE GAL", 7, 187),              # HEALTHY COAT HORSE GAL
    ("HIMALAYAN SALT - LARGE", 8, None),             # NEW
    ("HIMALAYAN SALT - MEDIUM", 17, 127),            # HIMALAYAN SALT - MEDIUM
    ("HIMALAYAN SALT - SMALL", 18, None),            # NEW
    ("HORSE & PONY FLY SPRAY 32OZ", 18, 175),       # HORSE & PONY FLY SPRAY 32OZ
    ("HORSE & PONY FLYSPRAY GAL", 4, None),          # NEW
    ("ICETIGHT POULTICE 7.5LB", 3, None),            # NEW
    ("KARRON OIL 5LTS FORAN", 3, 159),               # KARRON OIL
    ("KAUFFMANS ELECTROLYTE APPLE", 2, None),        # NEW
    ("KELCIE'S SPICE 5 LB", 3, None),               # NEW
    ("KER EO-3 OMEGA-3", 2, 203),                    # KER EO-3 OMEGA-3
    ("LEGACY FLY SPRAY 32OZ PYRANHA", 10, None),     # NEW
    ("LINIMENT 32OZ VETROLIN", 12, None),            # NEW
    ("LINIMENT GALLON VETROLIN", 7, None),            # NEW
    ("LIQUID GLYCERIN SADDLE SOAP FIEBINGS", 4, None), # NEW
    ("MANE & TAIL CONDITIONER 32OZ", 2, None),       # NEW
    ("MANE & TAIL SHAMPOO 32OZ", 13, None),          # NEW
    ("MANE & TAIL SHAMPOO GAL", 4, None),            # NEW
    ("MINERAL OIL GAL", 7, None),                     # NEW
    ("MOSQUITO HALT 32OZ FARNAM", 32, 122),          # MOSQUITO HALT 32OZ FARNAM
    ("MOSQUITO HALT GAL FARNAM", 3, None),            # NEW
    ("MRS PASTURES COOKIES 15LB BOX", 6, None),      # NEW
    ("MRS PASTURES COOKIES 15LB BUCKET", 6, None),   # NEW
    ("MRS PASTURES COOKIES 2LBS", 8, None),          # NEW
    ("MTG 32OZ", 5, None),                            # NEW
    ("MUCK TUB BLACK 40QT", 5, None),                # NEW
    ("MUCK TUB BLACK 70QT", 10, None),               # NEW
    ("MUCK TUB BLUE 70QT", 9, None),                 # NEW
    ("NUTRI-GARD POWDER FORAN", 3, 150),             # NUTRI-GARD PWDR 3 KG
    ("OINTMENT 10.6OZ EQUI CARE", 5, None),          # NEW
    ("ONE AC 200GM", 7, None),                        # NEW
    ("PANACUR DEWORMER EQUINE POWER PAC", 6, None),  # NEW (different from paste)
    ("POVIDONE IODINE 10% 32OZ", 6, None),           # NEW
    ("PRE-FUEL LIQ 2.5 LT FORAN", 5, None),         # NEW
    ("PRO-FORCE FLY SPRAY 32OZ", 2, None),           # NEW
    ("PROBIOS DISPERSIBLE POWDER", 4, None),          # NEW
    ("PROBIOS POWDER 5LB", 1, None),                  # NEW
    ("PROBIOS SOFT CHEWS 600GM", 8, None),            # NEW
    ("QUEST GEL", 40, None),                          # NEW
    ("QUEST GEL PLUS", 16, None),                     # NEW
    ("RED CELL EQUINE 32OZ", 4, None),                # NEW
    ("REDMOND DAILY GOLD STRESS", 6, None),           # NEW
    ("REDMOND ROCK CRUSHED 5LB", 7, None),            # NEW
    ("REDMOND ROCK ON A ROPE 3LB", 10, None),         # NEW
    ("REFUEL LIQ 1LT FORAN", 3, None),               # NEW
    ("REPEL XPE EMULSIFIABLE SPRAY 16OZ", 9, None),  # NEW
    ("RESIST + VITA C 5KG CAVALOR", 7, None),        # NEW
    ("RICE BRAN OIL PURE GAL", 5, 129),              # RICE BRAN OIL PURE GAL
    ("SANDCLEAR 10LB", 1, None),                      # NEW variant
    ("SANDCLEAR 20LB", 2, 105),                       # SANDCLEAR 20LB
    ("SANDCLEAR 3LBS", 4, None),                      # NEW variant
    ("SANDPURGE PSYLLIUM PELLET 5LB", 5, None),      # NEW
    ("SANTA FE COAT CONDITIONER ABSORBINE", 1, None), # NEW
    ("SHOWSHEEN DETANGLER W/ SPRAYER", 14, None),    # NEW
    ("SHOWSHEEN HAIR POLISH GAL", 5, 188),           # SHOWSHEEN HAIR POLISH GAL
    ("SHUR HOOF DRESSING 32OZ", 6, None),             # NEW
    ("SIMPLIFLY FLY CONTROL 20LB", 1, None),          # NEW (different from 10LB version=211)
    ("SMALL BUCKET 8QT BLACK ROUND", 13, None),      # NEW
    ("SMALL BUCKET 8QT GREEN ROUND", 3, None),       # NEW
    ("SMALL BUCKET 8QT NAVY ROUND", 3, None),        # NEW
    ("SOLITUDE IGR 20LB", 1, None),                   # NEW
    ("STAIN MASTER SPR 500ML", 7, None),              # NEW -> actually Carr Day Martin
    ("STOCK GUARD CONCENTRATE", 3, None),              # NEW
    ("STRESS-DEX ORANGE 20LB", 3, None),              # NEW
    ("STRESS-DEX ORANGE 4LB", 5, None),               # NEW
    ("STRONGID PASTE WORMER", 7, None),                # NEW
    ("THRUSH TREATMENT BUSTER", 17, None),             # NEW
    ("TOTAL CALM & FOCUS 1.12LB", 7, None),          # NEW (Ramard)
    ("TOTAL GUT HEALTH JAR 1.12", 2, None),           # NEW (Ramard)
    ("TOTAL GUT HEALTH SYRINGE", 14, None),            # NEW
    ("TOTAL PRE & PROBIOTIC 5LB", 2, 212),           # TOTAL PRE & PROBIOTIC 5LB RAMARD
    ("TRI-TEC 14 FLY REPELLANT GAL", 3, 169),        # TRI-TEC 14 FLY REPELLANT GAL
    ("TRI-TEC 14 FLY REPELLANT 32OZ", 3, None),      # NEW
    ("ULCERGARD PASTE", 42, None),                     # NEW
    ("ULTRA EDGE T-84 BLADE", 8, None),                # NEW
    ("V.S.L. LIQ 1LT FORAN", 0, None),                # NEW
    ("V.S.L. LIQ 2.5LTS FORAN", 1, None),             # NEW
    ("VETROLIN BATH 32OZ", 8, None),                   # NEW
    ("VETROLIN SHINE 360 20OZ", 4, None),              # NEW
    ("VETROLIN WHITE N BRITE SHAMPOO", 5, None),       # NEW
    ("VITA B1 CRUMBLES 3LB", 4, None),                # NEW
    ("VITA E + SELENIUM CRUMBLE", 0, None),            # NEW
    ("WHEAT GERM OIL GAL", 2, None),                   # NEW
    ("WIPE II FLY SPRAY W/CITRO", 15, None),          # NEW
    ("WIPE N SPRAY 32OZ PYRANHA", 1, 191),            # WIPE N SPRAY PYRETHRIN GAL? No, 32oz
    # Actually 191 = WIPE N SPRAY PYRETHRIN GAL PYRANHA. 32oz is different.
    ("WIPE N SPRAY PYRETHRIN GAL", 2, 191),           # WIPE N SPRAY PYRETHRIN GAL PYRANHA
    ("ZERO BITE 32OZ PYRANHA", 24, None),              # NEW
    ("ZIMECTERIN GOLD PASTE", 8, None),                # NEW
    ("ZIMECTERIN PASTE 1.87%", 22, None),              # NEW

    # From handwritten notebook pages - items with counts
    ("ULTRASHIELD SPORT QTS", 6, None),                # NEW
    ("ULTRASHIELD RED QTS", 2, None),                  # NEW
    ("FARNAM NATURE'S DEFENSE QTS", 7, None),          # NEW
    ("FIEBINGS MINK OIL LIQUID 8OZ", 5, None),       # NEW
    ("FIEBINGS MINK OIL PASTE 6OZ", 5, None),         # NEW
    ("BELVOIR TACK CLEANER", 8, None),                 # NEW
    ("BELVOIR TACK CONDITIONER", 4, None),             # NEW
    ("FARNHAM LEATHER NEW SPRAY GLYCERINE QTS", 3, None), # NEW
    ("BELVOIR TACK WIPES", 3, None),                   # NEW
    ("EQUI-CARE SADDLE SOAP 127OZ", 8, None),         # NEW
    ("EQUI-CARE SADDLE OINTMENT 10.6OZ", 6, None),    # NEW
    ("EQUI-CARE SADDLE OINTMENT 32OZ", 10, None),     # NEW
    ("TACK SPONGE 12 PACK", 4, None),                  # NEW
    ("HONEYCOMB TACK SPONGE", 4, None),                # NEW
    ("SYNNUTRA SYNCHILL DAILY 18OZ", 1, None),         # NEW
    ("SYNNUTRA SYNCHILL PASTE", 6, None),              # NEW
    ("SYNNUTRA SYNCHILL G-CHILL", 3, None),            # NEW
    ("MARE MAGIC 8OZ", 2, None),                       # NEW
    ("ABSORBINE VETERINARY LINIMENT GEL 12OZ", 6, None), # NEW
    ("KOMBAT KOO", 6, None),                           # NEW
    ("FINISH LINE SWEAT WELL 3.3LB", 4, None),        # NEW
    ("TOTAL GUT HEALTH 6.75LB", 0, None),              # NEW
    ("TOTAL PRE+PROBIOTICS 8OZ", 2, None),             # NEW
    ("KER NANO E", 7, None),                            # NEW
    ("VITA B-12 CRUMBLES 3LB", 1, None),               # NEW
    ("SAND PURGE 10LB", 5, None),                      # NEW
    ("STRESS DEX 12LB", 4, None),                      # NEW
    ("APPLE ELITE 5LB", 4, None),                      # NEW
    ("APPLE ELITE 7.5LB", 2, None),                    # NEW
    ("E3 TEA TREE OIL SHAMPOO QTS", 7, None),          # NEW
    ("E3 COOLING REJUVENATING SHAMPOO QTS", 3, None),  # NEW
    ("MANE N TAIL CONDITIONER GAL", 8, None),          # NEW
    ("FC ANTIFUNGAL SHAMPOO QT", 6, None),             # NEW
    ("FC CITRONELLA SHAMPOO GAL", 4, None),            # NEW
    ("FC CITRONELLA SHAMPOO QTS", 4, None),            # NEW
    ("LINSEED OIL GAL", 1, None),                      # NEW
    ("HEALTHY COAT 2.5 GAL", 2, 128),                 # HEALTHY COAT HORSE 2.5 GAL
    ("SHOWSHEEN DETANGLER GEL", 6, None),              # NEW
    ("QUIC BRAID 16OZ SPRAY", 5, None),                # NEW
    ("COWBOY MAGIC DETANGLER AND SHINE QT", 2, None),  # NEW
    ("COWBOY MAGIC DETANGLER AND SHINE 16OZ", 3, None),# NEW
    ("COWBOY MAGIC DETANGLER AND SHINE 4OZ", 1, None), # NEW
    ("CANTER DREAM COAT 1L", 0, None),                 # NEW
    ("CANTER COAT SHINE 500ML", 0, None),              # NEW
    ("TUNGASOL OINTMENT", 5, None),                    # NEW
    ("ANDIS AGC2 CLIPPER", 2, None),                   # NEW
    ("ANDIS CLIPPER BLADE CARE SPRAY", 2, None),       # NEW
    ("ANDIS CLIPPER BLADE CARE DIP", 3, None),         # NEW
    ("ENDURE GOLD QT SPRAY", 7, None),                 # NEW
    ("ENDURE GOLD GAL", 5, None),                      # NEW
    ("LUCKY BRAID SHAMPOO QT", 8, None),               # NEW
    ("FINISH LINE ORIGINAL PREMIUM POULTICE 5LB", 4, None), # NEW
    ("REDMOND ROCK ON A ROPE 3LB (notebook)", 12, None), # Duplicate from printed - use printed=10+notebook=12? Use 12 as notebook seems more thorough
    ("DAILY GOLD POWDER 5LB", 8, None),                # NEW
    ("REDMOND REIN WATER 5LB", 3, None),               # NEW
    ("KELSIES TREATS", 3, None),                       # NEW
    ("BEET TREATS", 5, None),                          # NEW
    ("SWEETIES CAVALOR", 8, None),                     # NEW
    ("CRUNCHIES CAVALOR (notebook)", 2, None),         # Already in printed list, skip duplicate
    ("FRUITIES CAVALOR", 8, None),                     # NEW
    ("FARRIER'S FORMULA DOUBLE STRENGTH 11LB", 0, 151), # FARRIER'S FORMULA DOUBLE STRENGTH 1LB -> actually different size
    ("FARRIER'S FORMULA DOUBLE STRENGTH (other)", 4, None), # NEW
    ("HEALTHY HAIR CARE MOISTURIZER 16OZ", 5, None),   # NEW
    ("NEATSFOOT OIL 32OZ FIEBINGS", 2, None),          # NEW
    # Shire's Products - combined into aggregate items
    ("ARMA NX MAX BELL BOOTS BLACK", 5, None),         # 3 XFULL + 2 FULL
    ("ARMA NX-AIR BRUSHING BOOTS BLACK", 4, None),    # 2 XFULL + 2 FULL
    ("COTTON LEADS BLACK", 3, None),                   # NEW
    ("COTTON LEADS NAVY", 3, None),                    # NEW
    ("EZ GROOM DANDY BRUSH #2371", 4, None),          # 2 Black + 2 Navy
    ("EZ GROOM BODY BRUSH #2357", 2, None),           # 2 Black
    ("LONG BRISTLE DANDY BRUSH #2470", 2, None),      # 2 Black
    ("BODY WASH BRUSH WITH SPONGE #1558", 2, None),   # 2 Navy
    ("CACTUS CLOTH", 2, None),                         # NEW
    ("CACTUS GLOVE", 2, None),                         # NEW
    ("PLASTIC SWEAT SCRAPERS #17DDS", 13, None),      # 3 blue + 4 neon green + 6 red
    ("HIPPO TONIC BLACK CURRY COMB", 6, None),         # NEW
    ("RUBBER MASSAGE GLOVE RJ MATTHEWS", 4, None),    # 4 purple
    ("RUBBER BRAID BANDS BAGS", 21, None),            # 12 grey + 5 black + 4 chestnut
    ("COTTON ROLL", 3, None),                          # NEW
    ("EZ ARNICA LIQUID", 5, None),                     # NEW
    ("EXCALIBUR", 3, None),                            # NEW
    ("KOPERTOX", 10, None),                            # NEW
    ("ELASTIKON 3 INCH BY 3M", 14, None),             # NEW
    ("MEDIUM LATEX GLOVES BOX", 1, None),              # NEW
    ("FARNAM PURISHIELD WOUND SKIN CARE 12OZ", 3, None), # NEW
    ("FARNAM PURISHIELD LIQUID BANDAGE 4OZ", 1, None), # NEW
    ("FARNAM PURISHIELD FAST ACTING SPRAY 12OZ", 3, None), # NEW
    ("COAT DEFENSE PASTE 24OZ", 1, None),              # NEW
    ("3X3 GAUZE SQUARES", 2, None),                    # NEW
    ("EPSOM SALT PASTE 20OZ", 4, None),                # NEW
    ("EPSOM SALT PASTE 10LB", 1, None),                # NEW
    ("EZI GROOM PULLING COMB W/HANDLE", 4, None),    # NEW
    ("WONDER DUST", 4, None),                          # NEW
    ("SCREW EYES", 55, None),                          # NEW hardware
    ("DOUBLE END SNAP ZINC", 113, None),              # NEW hardware
    ("JARS HONEY", 2, None),                           # NEW
    ("EQUI-CARE HOOF GREASE 33.8OZ", 4, None),       # NEW
    ("CARR DAY MARTIN STAIN MASTER 500ML", 15, None), # NEW -> duplicate of STAIN MASTER SPR 500ML
    ("EQUI-CARE HOOF GREASE 11OZ", 1, None),          # NEW
    ("TIGER'S TONGUE SPONGE", 11, None),               # NEW
    ("GRIP FIT BRUSH BY DECKER NAVY", 2, None),       # NEW
    ("LEGENDS SOFT BRUSH #2274", 3, None),             # NEW
    ("TANGLE WRANGLER COMB BRUSH", 4, None),           # NEW
    ("HIPPO TONIC TOYS ASSORTED", 5, None),           # 1 each of Zebra, Cow, Boomerang, Carrot, Horse
    
    # Back-of-page handwritten notes
    ("MT SHAMPOO (MANE N TAIL)", 6, None),             # NEW
    ("CM CONDITIONER", 25, None),                      # NEW - Cowboy Magic Conditioner? or Canter Mane?
    
    # Mosquito Halt from back page (already have 32 from printed sheet)
    # "Mosquito Halt 30" and "SUPER 17" - these may be Mosquito Halt GAL=30 and Super 7=17
    # Already covered above
]

# ============================================================
# Remove duplicates - keep the entry with a count, deduplicate by product_id
# ============================================================
# For items mapping to same product_id, keep the one with a count
seen_product_ids = {}
all_items = hay_straw + shavings_bedding + vendor_feed + retail_items

# First pass: collect items by product_id
for name, qty, pid in all_items:
    if pid is not None:
        if pid not in seen_product_ids:
            seen_product_ids[pid] = (name, qty)
        else:
            # Keep the one with higher count (more specific)
            existing_name, existing_qty = seen_product_ids[pid]
            if qty > existing_qty:
                seen_product_ids[pid] = (name, qty)

# Remove known duplicates from retail_items
# STAIN MASTER SPR 500ML and CARR DAY MARTIN STAIN MASTER 500ML are same
# CRUNCHIES CAVALOR appears twice
# REDMOND ROCK ON A ROPE appears in printed (10) and notebook (12)
# WIPE N SPRAY 32OZ - should NOT map to 191 (GAL version)

# Fix: WIPE N SPRAY 32OZ PYRANHA should be a new product, not mapped to 191
retail_items = [(n,q,p) if n != "WIPE N SPRAY 32OZ PYRANHA" else ("WIPE N SPRAY 32OZ PYRANHA", 1, None) for n,q,p in retail_items]

# ============================================================
# Generate SQL
# ============================================================

# Collect final inventory: {product_id: qty} for existing products
existing_inventory = {}
new_products = []
new_product_inventory = []  # (name, qty, category, unit_type, price)

for name, qty, pid in all_items:
    if pid is not None:
        if pid in existing_inventory:
            # Already have this product - skip duplicate
            continue
        existing_inventory[pid] = qty
    else:
        # Check if this is a known duplicate
        if "notebook" in name.lower() or "additional" in name.lower() or "other" in name.lower():
            continue
        new_products.append((name, qty))

# Deduplicate new products by name
seen_new = set()
unique_new = []
for name, qty in new_products:
    norm = name.upper().strip()
    if norm not in seen_new:
        seen_new.add(norm)
        unique_new.append((name, qty))

print(f"=== INVENTORY IMPORT SUMMARY ===")
print(f"Existing products with counts: {len(existing_inventory)}")
print(f"New products to create: {len(unique_new)}")
print(f"Total items: {len(existing_inventory) + len(unique_new)}")
print()

# Categorize new products
def categorize(name):
    n = name.upper()
    # Supplements/health
    if any(x in n for x in ['VITAMIN', 'SUPPLEMENT', 'PROBIOS', 'ULCERGARD', 'QUEST GEL', 
                             'PANACUR', 'DEWORMER', 'ZIMECTERIN', 'STRONGID', 'ELEVATE',
                             'TOTAL GUT', 'TOTAL CALM', 'TOTAL PRE', 'KER NANO', 'FORAN',
                             'V.S.L.', 'COPPERVIT', 'B COMPLETE', 'VITA B', 'VITA E',
                             'REDMOND', 'SAND PURGE', 'SAND CLEAR', 'SANDCLEAR', 'APPLE DEX',
                             'APPLE ELITE', 'STRESS DEX', 'RED CELL', 'POVIDONE', 'BETADINE',
                             'EPSOM SALT', 'COPPER SULFATE', 'CORNUCRESCINE', 'THRUSH',
                             'FARRIER', 'KOPERTOX', 'HOOF', 'WONDER DUST', 'ONE AC',
                             'FINISH LINE', 'KOMBAT', 'ABSORBINE', 'RESIST +', 'MARE MAGIC',
                             'G-CHILL', 'SYNNUTRA', 'GASTROADE', 'DAILY GOLD', 'REFUEL',
                             'PRE-FUEL', 'ICETIGHT', 'SOLITUDE', 'REPEL XPE']):
        return 'supplement', 'each'
    # Fly sprays/repellents
    if any(x in n for x in ['FLY SPRAY', 'MOSQUITO', 'ENDURE', 'TRI-TEC', 'BRONCO', 
                             'FLYSECT', 'ULTRASHIELD', 'PYRANHA', 'PRO-FORCE', 'LEGACY',
                             'WIPE II', 'WIPE N SPRAY', 'ZERO BITE', 'SIMPLIFLY',
                             'FARNAM NATURE', 'FLY RELIEF', 'GIANT FLY', 'FLY MASK',
                             'DURAMASK']):
        return 'other', 'each'
    # Grooming/shampoo
    if any(x in n for x in ['SHAMPOO', 'CONDITIONER', 'DETANGLER', 'SHOWSHEEN', 'COWBOY MAGIC',
                             'CANTER', 'VETROLIN', 'MANE N TAIL', 'MANE & TAIL', 'QUIC',
                             'E3 ', 'FC ANIMAL', 'FC ANTI', 'FC CITRONELLA', 'FUNGASOL',
                             'TUNGASOL', 'MTG', 'LUCKY BRAID', 'MT SHAMPOO', 'CM CONDITIONER',
                             'BRIGHTENING', 'COOLING REJUV', 'STAIN MASTER', 'DREAM COAT',
                             'COAT SHINE']):
        return 'other', 'each'
    # Oils
    if any(x in n for x in ['OIL GAL', 'FLAXSEED OIL', 'MINERAL OIL', 'WHEAT GERM',
                             'LINSEED OIL', 'COCOSOYA', 'HEALTHY COAT', 'RICE BRAN OIL',
                             'KARRON OIL']):
        return 'other', 'each'
    # Tack care
    if any(x in n for x in ['SADDLE', 'TACK', 'BELVOIR', 'FIEBINGS', 'GLYCERIN',
                             'NEATSFOOT', 'LEATHER', 'EQUI-CARE SADDLE']):
        return 'other', 'each'
    # Barn supplies
    if any(x in n for x in ['BUCKET', 'FORK', 'BROOM', 'FEED PAN', 'MUCK TUB',
                             'WHEELBARROW', 'SPRAY BOTTLE', 'SCREW EYE', 'SNAP ZINC',
                             'FEED SCOOP', 'SPONGE', 'GAUZE', 'GLOVE', 'COTTON',
                             'FLEX WRAP', 'ELASTIKON', 'BANDAGE', 'ALU-MEND', 'COAT DEFENSE']):
        return 'other', 'each'
    # Treats
    if any(x in n for x in ['TREAT', 'MUFFIN', 'SWEETIES', 'CRUNCHIES', 'FRUITIES',
                             'KELSIE', 'BEET TREAT', 'MRS PASTURES', 'HONEY']):
        return 'other', 'each'
    # Grooming tools / clippers
    if any(x in n for x in ['CLIPPER', 'ANDIS', 'BLADE', 'BRUSH', 'COMB', 'CURRY',
                             'BOOT', 'ARMA', 'LEAD', 'CACTUS', 'SWEAT SCRAPER',
                             'RUBBER BRAID', 'RUBBER MASSAGE', 'HIPPO TONIC', 'EZ GROOM',
                             'EZI GROOM', 'GRIP FIT', 'LEGENDS', 'TANGLE', 'PULLING',
                             'TIGER', 'TOYS']):
        return 'other', 'each'
    # Feed
    if any(x in n for x in ['FEED', 'PELLET', 'MUESLI', 'CUBES', 'ENDURANCE',
                             'POWER PLUS', 'GRASS', 'TRIPLE CROWN', 'PROFORCE',
                             'SAFECHOICE', 'ALFALFA', 'PDZ', 'STOCK GUARD',
                             'ULTIMATE FINISH', 'BUCKEYE']):
        return 'other', 'bag'
    # Hay
    if any(x in n for x in ['HAY', 'TIMOTHY', 'BALE']):
        return 'other', 'bale'
    return 'other', 'each'

# Generate SQL file
sql_lines = []
sql_lines.append("-- ============================================================")
sql_lines.append("-- LOXAHATCHEE RETAIL STORE INVENTORY IMPORT")
sql_lines.append("-- Generated from physical count sheet photos (25+ pages)")
sql_lines.append("-- Location: LOX (id=1, 14589 Southern Blvd, Loxahatchee, FL 33470)")
sql_lines.append("-- ============================================================")
sql_lines.append("")

# Part 1: Create new products
sql_lines.append("-- ============================================================")
sql_lines.append(f"-- PART 1: CREATE {len(unique_new)} NEW PRODUCTS")
sql_lines.append("-- ============================================================")
sql_lines.append("")

for name, qty in unique_new:
    cat, unit = categorize(name)
    safe_name = name.replace("'", "''")
    sql_lines.append(f"INSERT OR IGNORE INTO products (name, category, unit_type, price, active) VALUES ('{safe_name}', '{cat}', '{unit}', 0, 1);")

sql_lines.append("")
sql_lines.append("-- ============================================================")
sql_lines.append(f"-- PART 2: INITIALIZE INVENTORY STOCK FOR EXISTING PRODUCTS ({len(existing_inventory)} items)")
sql_lines.append("-- ============================================================")
sql_lines.append("")

for pid, qty in sorted(existing_inventory.items()):
    p = products_by_id.get(pid, {})
    pname = p.get('name', f'Product #{pid}')
    sql_lines.append(f"-- {pname}")
    sql_lines.append(f"INSERT OR REPLACE INTO inventory_stock (product_id, location_id, qty_on_hand, qty_on_hold, qty_reserved, reorder_point, reorder_qty, last_counted_at, last_counted_by)")
    sql_lines.append(f"  VALUES ({pid}, 1, {qty}, 0, 0, 0, 0, datetime('now'), 'inventory_import');")
    sql_lines.append(f"INSERT INTO inventory_audit (product_id, location_id, action, qty_change, qty_before, qty_after, reason, notes, user_name, created_at)")
    sql_lines.append(f"  VALUES ({pid}, 1, 'physical_count', {qty}, 0, {qty}, 'Initial physical count from LOX retail store inventory sheets', 'Imported from physical count sheets - May 2026', 'inventory_import', datetime('now'));")
    sql_lines.append("")

sql_lines.append("-- ============================================================")
sql_lines.append(f"-- PART 3: INITIALIZE INVENTORY STOCK FOR NEW PRODUCTS ({len(unique_new)} items)")
sql_lines.append("-- These use subqueries to find the product_id by name")
sql_lines.append("-- ============================================================")
sql_lines.append("")

for name, qty in unique_new:
    safe_name = name.replace("'", "''")
    sql_lines.append(f"-- {name}: {qty}")
    sql_lines.append(f"INSERT OR REPLACE INTO inventory_stock (product_id, location_id, qty_on_hand, qty_on_hold, qty_reserved, reorder_point, reorder_qty, last_counted_at, last_counted_by)")
    sql_lines.append(f"  SELECT id, 1, {qty}, 0, 0, 0, 0, datetime('now'), 'inventory_import' FROM products WHERE name = '{safe_name}' LIMIT 1;")
    sql_lines.append(f"INSERT INTO inventory_audit (product_id, location_id, action, qty_change, qty_before, qty_after, reason, notes, user_name, created_at)")
    sql_lines.append(f"  SELECT id, 1, 'physical_count', {qty}, 0, {qty}, 'Initial physical count from LOX retail store inventory sheets', 'Imported from physical count sheets - May 2026', 'inventory_import', datetime('now') FROM products WHERE name = '{safe_name}' LIMIT 1;")
    sql_lines.append("")

# Write SQL file
with open('/home/user/bf-ops/inventory_lox_import.sql', 'w') as f:
    f.write('\n'.join(sql_lines))

print(f"SQL file written to: /home/user/bf-ops/inventory_lox_import.sql")
print(f"Total SQL lines: {len(sql_lines)}")
print()

# Print summary of matched products
print(f"\n=== MATCHED EXISTING PRODUCTS ({len(existing_inventory)}) ===")
for pid, qty in sorted(existing_inventory.items()):
    p = products_by_id.get(pid, {})
    print(f"  ID {pid:>3}: {p.get('name', '?'):<60} qty={qty}")

print(f"\n=== NEW PRODUCTS ({len(unique_new)}) ===")
for name, qty in unique_new:
    cat, unit = categorize(name)
    print(f"  NEW: {name:<60} qty={qty}  cat={cat} unit={unit}")
