// fichier de données géographiques étendu
// contient pays, provinces/états, villes, et monnaie locale.

// liste simplifiée des continents / pays utilisées dans l'interface
window.continents = {
    "Afrique": ["Côte d'Ivoire", "Burkina Faso", "Sénégal", "Mali", "Ghana", "Bénin", "Togo", "Niger", "Guinée", "Cameroun", "Gabon", "Congo (Kinshasa)", "République Centrafricaine", "Tchad", "Rwanda", "Burundi", "République Démocratique du Congo"],
    "Europe": ["France", "Allemagne", "Espagne"],
    "Amériques": ["USA", "Brésil", "Argentine"],
    "Asie": ["Inde", "Chine", "Japon"]
};

window.geoData = {
    // exemples détaillés
    "USA": {
        currency: 'USD', provinces: {
            "California": ["Los Angeles", "San Francisco", "San Diego"],
            "Texas": ["Houston", "Dallas", "Austin"],
            "New York": ["New York City", "Buffalo"]
        }
    },
    "France": {
        currency: 'EUR', provinces: {
            "Île-de-France": ["Paris", "Versailles", "Boulogne"],
            "Provence-Alpes-Côte d'Azur": ["Marseille", "Nice", "Toulon"],
            "Auvergne-Rhône-Alpes": ["Lyon", "Grenoble"]
        }
    },
    "Germany": {
        currency: 'EUR', provinces: {
            "Bavaria": ["Munich"],
            "Berlin": ["Berlin"]
        }
    },
    "Côte d'Ivoire": {
        currency: 'XOF',
        provinces: {
            "Abidjan": ["Abidjan", "Cocody", "Plateau", "Yopougon"],
            "Bouaké": ["Bouaké"],
            "Yamoussoukro": ["Yamoussoukro"],
            "San-Pédro": ["San-Pédro"]
        }
    },
    "Burkina Faso": {
        currency: 'XOF',
        provinces: {
            "Centre": ["Ouagadougou"],
            "Hauts-Bassins": ["Bobo-Dioulasso"],
            "Boucle du Mouhoun": ["Dédougou"]
        }
    },
    "Sénégal": {
        currency: 'XOF',
        provinces: {
            "Dakar": ["Dakar", "Pikine", "Guédiawaye"],
            "Thiès": ["Thiès"],
            "Saint-Louis": ["Saint-Louis"]
        }
    },
    "Mali": {
        currency: 'XOF',
        provinces: {
            "Bamako": ["Bamako"],
            "Sikasso": ["Sikasso"],
            "Mopti": ["Mopti"]
        }
    },
    "Ghana": {
        currency: 'GHS',
        provinces: {
            "Greater Accra": ["Accra"],
            "Ashanti": ["Kumasi"],
            "Western": ["Takoradi"]
        }
    },
    "Brésil": {
        currency: 'BRL',
        provinces: {
            "São Paulo": ["São Paulo", "Campinas"],
            "Rio de Janeiro": ["Rio de Janeiro"],
            "Minas Gerais": ["Belo Horizonte"]
        }
    },
    "Argentine": {
        currency: 'ARS',
        provinces: {
            "Buenos Aires": ["Buenos Aires", "La Plata"],
            "Córdoba": ["Córdoba"],
            "Santa Fe": ["Rosario"]
        }
    },
    "Inde": {
        currency: 'INR',
        provinces: {
            "Maharashtra": ["Mumbai", "Pune"],
            "Delhi": ["Delhi"],
            "Karnataka": ["Bangalore"]
        }
    },
    "Chine": {
        currency: 'CNY',
        provinces: {
            "Beijing": ["Beijing"],
            "Shanghai": ["Shanghai"],
            "Guangdong": ["Guangzhou", "Shenzhen"]
        }
    },
    "Japon": {
        currency: 'JPY',
        provinces: {
            "Tokyo": ["Tokyo"],
            "Osaka": ["Osaka"],
            "Kyoto": ["Kyoto"]
        }
    },
    "Espagne": {
        currency: 'EUR',
        provinces: {
            "Madrid": ["Madrid"],
            "Cataluña": ["Barcelona"],
            "Andalucía": ["Sevilla"]
        }
    },
    "Allemagne": {
        currency: 'EUR',
        provinces: {
            "Bavière": ["Munich"],
            "Berlin": ["Berlin"]
        }
    },
    // plafonnage: les autres pays sans détail de sous‑divisions
    "Afghanistan": { currency: 'AFN', provinces: {} },
    "Albania": { currency: 'ALL', provinces: {} },
    "Algeria": { currency: 'DZD', provinces: {} },
    "Andorra": { currency: 'EUR', provinces: {} },
    "Angola": { currency: 'AOA', provinces: {} },
    "Antigua and Barbuda": { currency: 'XCD', provinces: {} },
    "Argentina": { currency: 'ARS', provinces: {} },
    "Armenia": { currency: 'AMD', provinces: {} },
    "Austria": { currency: 'EUR', provinces: {} },
    "Azerbaijan": { currency: 'AZN', provinces: {} },
    "Bahamas": { currency: 'BSD', provinces: {} },
    "Bahrain": { currency: 'BHD', provinces: {} },
    "Bangladesh": { currency: 'BDT', provinces: {} },
    "Barbados": { currency: 'BBD', provinces: {} },
    "Belarus": { currency: 'BYN', provinces: {} },
    "Belgium": { currency: 'EUR', provinces: {} },
    "Belize": { currency: 'BZD', provinces: {} },
    "Benin": { currency: 'XOF', provinces: {} },
    "Bhutan": { currency: 'BTN', provinces: {} },
    "Bolivia": { currency: 'BOB', provinces: {} },
    "Bosnia and Herzegovina": { currency: 'BAM', provinces: {} },
    "Botswana": { currency: 'BWP', provinces: {} },
    "Brunei": { currency: 'BND', provinces: {} },
    "Bulgaria": { currency: 'BGN', provinces: {} },
    "Burkina Faso": { currency: 'XOF', provinces: {} },
    "Burundi": {
        currency: 'BIF',
        provinces: {
            "Bujumbura": ["Bujumbura", "Gitega"]
        }
    },
    "Bénin": {
        currency: 'XOF',
        provinces: {
            "Cotonou": ["Cotonou", "Porto-Novo"],
            "Parakou": ["Parakou"]
        }
    },
    "Togo": {
        currency: 'XOF',
        provinces: {
            "Lomé": ["Lomé"],
            "Kara": ["Kara"]
        }
    },
    "Niger": {
        currency: 'XOF',
        provinces: {
            "Niamey": ["Niamey"],
            "Zinder": ["Zinder"]
        }
    },
    "Guinée": {
        currency: 'GNF',
        provinces: {
            "Conakry": ["Conakry"],
            "Kankan": ["Kankan"]
        }
    },
    "Cameroun": {
        currency: 'XAF',
        provinces: {
            "Yaoundé": ["Yaoundé", "Douala"],
            "Garoua": ["Garoua"]
        }
    },
    "Gabon": {
        currency: 'XAF',
        provinces: {
            "Libreville": ["Libreville"],
            "Port-Gentil": ["Port-Gentil"]
        }
    },
    "Congo (Kinshasa)": {
        currency: 'CDF',
        provinces: {
            "Kinshasa": ["Kinshasa"],
            "Kongo Central": ["Matadi", "Boma"],
            "Kwango": ["Kenge"],
            "Kwilu": ["Bandundu", "Kikwit"],
            "Mai-Ndombe": ["Inongo"],
            "Kasaï": ["Tshikapa"],
            "Lulua": ["Kananga"],
            "Kasaï Oriental": ["Mbuji-Mayi", "Lubumbashi"],
            "Lomami": ["Kabinda"],
            "Sankuru": ["Lusambo"],
            "Maniema": ["Kindu"],
            "Nord-Kivu": ["Goma", "Butembo"],
            "Ituri": ["Bunia"],
            "Haut-Uélé": ["Isiro"],
            "Tshopo": ["Kisangani"],
            "Bas-Uélé": ["Buta"],
            "Nord-Ubangi": ["Gbadolite"],
            "Mongala": ["Lisala"],
            "Sud-Ubangi": ["Gemena"],
            "Équateur": ["Mbandaka"],
            "Tshuapa": ["Boende"],
            "Tanganyika": ["Kalemie"],
            "Haut-Lomami": ["Kamina"],
            "Lualaba": ["Kolwezi"],
            "Haut-Katanga": ["Lubumbashi"]
        }
    },
    "République Centrafricaine": {
        currency: 'XAF',
        provinces: {
            "Bangui": ["Bangui"],
            "Bimbo": ["Bimbo"]
        }
    },
    "Tchad": {
        currency: 'XAF',
        provinces: {
            "N'Djamena": ["N'Djamena"],
            "Moundou": ["Moundou"]
        }
    },
    "Rwanda": {
        currency: 'RWF',
        provinces: {
            "Kigali": ["Kigali", "Gasabo", "Kicukiro", "Nyarugenge"],
            "Eastern": ["Rwamagana", "Kayonza", "Kirehe", "Ngoma", "Bugesera"],
            "Northern": ["Musanze", "Burera", "Gicumbi", "Rulindo"],
            "Western": ["Rubavu", "Nyabihu", "Ngororero", "Rusizi", "Karongi"],
            "Southern": ["Nyanza", "Huye", "Gisagara", "Nyaruguru", "Muhanga", "Kamonyi"]
        }
    },
    "République Démocratique du Congo": {
        currency: 'CDF',
        provinces: {
            "Kinshasa": ["Kinshasa"],
            "Kongo Central": ["Matadi", "Boma"],
            "Kwango": ["Kenge"],
            "Kwilu": ["Bandundu", "Kikwit"],
            "Mai-Ndombe": ["Inongo"],
            "Kasaï": ["Tshikapa"],
            "Lulua": ["Kananga"],
            "Kasaï Oriental": ["Mbuji-Mayi"],
            "Lomami": ["Kabinda"],
            "Sankuru": ["Lusambo"],
            "Maniema": ["Kindu"],
            "Nord-Kivu": ["Goma", "Butembo"],
            "Ituri": ["Bunia"],
            "Haut-Uélé": ["Isiro"],
            "Tshopo": ["Kisangani"],
            "Bas-Uélé": ["Buta"],
            "Nord-Ubangi": ["Gbadolite"],
            "Mongala": ["Lisala"],
            "Sud-Ubangi": ["Gemena"],
            "Équateur": ["Mbandaka"],
            "Tshuapa": ["Boende"],
            "Tanganyika": ["Kalemie"],
            "Haut-Lomami": ["Kamina"],
            "Lualaba": ["Kolwezi"],
            "Haut-Katanga": ["Lubumbashi"]
        }
    },
    "Cambodia": { currency: 'KHR', provinces: {} },
    "Cameroon": { currency: 'XAF', provinces: {} },
    "Cape Verde": { currency: 'CVE', provinces: {} },
    "Central African Republic": { currency: 'XAF', provinces: {} },
    "Chad": { currency: 'XAF', provinces: {} },
    "Chile": { currency: 'CLP', provinces: {} },
    "China": { currency: 'CNY', provinces: {} },
    "Colombia": { currency: 'COP', provinces: {} },
    "Comoros": { currency: 'KMF', provinces: {} },
    "Congo (Congo-Brazzaville)": { currency: 'XAF', provinces: {} },
    "Congo (Kinshasa)": { currency: 'CDF', provinces: {} },
    "Costa Rica": { currency: 'CRC', provinces: {} },
    "Côte d'Ivoire": { currency: 'XOF', provinces: {} },
    "Croatia": { currency: 'HRK', provinces: {} },
    "Cuba": { currency: 'CUP', provinces: {} },
    "Cyprus": { currency: 'EUR', provinces: {} },
    "Czechia (Czech Republic)": { currency: 'CZK', provinces: {} },
    "Denmark": { currency: 'DKK', provinces: {} },
    "Djibouti": { currency: 'DJF', provinces: {} },
    "Dominica": { currency: 'XCD', provinces: {} },
    "Dominican Republic": { currency: 'DOP', provinces: {} },
    "Ecuador": { currency: 'USD', provinces: {} },
    "Egypt": { currency: 'EGP', provinces: {} },
    "El Salvador": { currency: 'USD', provinces: {} },
    "Equatorial Guinea": { currency: 'XAF', provinces: {} },
    "Eritrea": { currency: 'ERN', provinces: {} },
    "Estonia": { currency: 'EUR', provinces: {} },
    "Eswatini (fmr. Swaziland)": { currency: 'SZL', provinces: {} },
    "Ethiopia": { currency: 'ETB', provinces: {} },
    "Fiji": { currency: 'FJD', provinces: {} },
    "Finland": { currency: 'EUR', provinces: {} },
    "France": {
        currency: 'EUR', provinces: {
            "Île-de-France": ["Paris", "Versailles", "Boulogne"],
            "Provence-Alpes-Côte d'Azur": ["Marseille", "Nice", "Toulon"],
            "Auvergne-Rhône-Alpes": ["Lyon", "Grenoble"]
        }
    },
    "Gabon": { currency: 'XAF', provinces: {} },
    "Gambia": { currency: 'GMD', provinces: {} },
    "Georgia": { currency: 'GEL', provinces: {} },
    "Germany": {
        currency: 'EUR', provinces: {
            "Bavaria": ["Munich"],
            "Berlin": ["Berlin"]
        }
    },
    "Ghana": {
        currency: 'GHS', provinces: {
            "Greater Accra": ["Accra", "Tema"],
            "Ashanti": ["Kumasi", "Obuasi"]
        }
    },
    "Greece": { currency: 'EUR', provinces: {} },
    "Grenada": { currency: 'XCD', provinces: {} },
    "Guatemala": { currency: 'GTQ', provinces: {} },
    "Guinea": { currency: 'GNF', provinces: {} },
    "Guinea-Bissau": { currency: 'XOF', provinces: {} },
    "Guyana": { currency: 'GYD', provinces: {} },
    "Haiti": { currency: 'HTG', provinces: {} },
    "Honduras": { currency: 'HNL', provinces: {} },
    "Hungary": { currency: 'HUF', provinces: {} },
    "Iceland": { currency: 'ISK', provinces: {} },
    "India": {
        currency: 'INR', provinces: {
            "Maharashtra": ["Mumbai", "Pune"],
            "Delhi": ["New Delhi"]
        }
    },
    "Indonesia": { currency: 'IDR', provinces: {} },
    "Iran": { currency: 'IRR', provinces: {} },
    "Iraq": { currency: 'IQD', provinces: {} },
    "Ireland": { currency: 'EUR', provinces: {} },
    "Israel": { currency: 'ILS', provinces: {} },
    "Italy": { currency: 'EUR', provinces: {} },
    "Jamaica": { currency: 'JMD', provinces: {} },
    "Japan": { currency: 'JPY', provinces: {} },
    "Jordan": { currency: 'JOD', provinces: {} },
    "Kazakhstan": { currency: 'KZT', provinces: {} },
    "Kenya": {
        currency: 'KES', provinces: {
            "Nairobi County": ["Nairobi"],
            "Mombasa County": ["Mombasa"]
        }
    },
    "Kiribati": { currency: 'AUD', provinces: {} },
    "Kosovo": { currency: 'EUR', provinces: {} },
    "Kuwait": { currency: 'KWD', provinces: {} },
    "Kyrgyzstan": { currency: 'KGS', provinces: {} },
    "Laos": { currency: 'LAK', provinces: {} },
    "Latvia": { currency: 'EUR', provinces: {} },
    "Lebanon": { currency: 'LBP', provinces: {} },
    "Lesotho": { currency: 'LSL', provinces: {} },
    "Liberia": { currency: 'LRD', provinces: {} },
    "Libya": { currency: 'LYD', provinces: {} },
    "Liechtenstein": { currency: 'CHF', provinces: {} },
    "Lithuania": { currency: 'EUR', provinces: {} },
    "Luxembourg": { currency: 'EUR', provinces: {} },
    "Madagascar": { currency: 'MGA', provinces: {} },
    "Malawi": { currency: 'MWK', provinces: {} },
    "Malaysia": { currency: 'MYR', provinces: {} },
    "Maldives": { currency: 'MVR', provinces: {} },
    "Mali": { currency: 'XOF', provinces: {} },
    "Malta": { currency: 'EUR', provinces: {} },
    "Marshall Islands": { currency: 'USD', provinces: {} },
    "Mauritania": { currency: 'MRU', provinces: {} },
    "Mauritius": { currency: 'MUR', provinces: {} },
    "Mexico": { currency: 'MXN', provinces: {} },
    "Micronesia": { currency: 'USD', provinces: {} },
    "Moldova": { currency: 'MDL', provinces: {} },
    "Monaco": { currency: 'EUR', provinces: {} },
    "Mongolia": { currency: 'MNT', provinces: {} },
    "Montenegro": { currency: 'EUR', provinces: {} },
    "Morocco": { currency: 'MAD', provinces: {} },
    "Mozambique": { currency: 'MZN', provinces: {} },
    "Myanmar (formerly Burma)": { currency: 'MMK', provinces: {} },
    "Namibia": { currency: 'NAD', provinces: {} },
    "Nauru": { currency: 'AUD', provinces: {} },
    "Nepal": { currency: 'NPR', provinces: {} },
    "Netherlands": { currency: 'EUR', provinces: {} },
    "New Zealand": { currency: 'NZD', provinces: {} },
    "Nicaragua": { currency: 'NIO', provinces: {} },
    "Niger": { currency: 'XOF', provinces: {} },
    "North Korea": { currency: 'KPW', provinces: {} },
    "North Macedonia": { currency: 'MKD', provinces: {} },
    "Norway": { currency: 'NOK', provinces: {} },
    "Oman": { currency: 'OMR', provinces: {} },
    "Pakistan": { currency: 'PKR', provinces: {} },
    "Palau": { currency: 'USD', provinces: {} },
    "Panama": { currency: 'PAB', provinces: {} },
    "Papua New Guinea": { currency: 'PGK', provinces: {} },
    "Paraguay": { currency: 'PYG', provinces: {} },
    "Peru": { currency: 'PEN', provinces: {} },
    "Philippines": { currency: 'PHP', provinces: {} },
    "Poland": { currency: 'PLN', provinces: {} },
    "Portugal": { currency: 'EUR', provinces: {} },
    "Qatar": { currency: 'QAR', provinces: {} },
    "Romania": { currency: 'RON', provinces: {} },
    "Russia": { currency: 'RUB', provinces: {} },
    "Rwanda": { currency: 'RWF', provinces: {} },
    "Saint Kitts and Nevis": { currency: 'XCD', provinces: {} },
    "Saint Lucia": { currency: 'XCD', provinces: {} },
    "Saint Vincent and the Grenadines": { currency: 'XCD', provinces: {} },
    "Samoa": { currency: 'WST', provinces: {} },
    "San Marino": { currency: 'EUR', provinces: {} },
    "Sao Tome and Principe": { currency: 'STN', provinces: {} },
    "Saudi Arabia": { currency: 'SAR', provinces: {} },
    "Senegal": { currency: 'XOF', provinces: {} },
    "Serbia": { currency: 'RSD', provinces: {} },
    "Seychelles": { currency: 'SCR', provinces: {} },
    "Sierra Leone": { currency: 'SLL', provinces: {} },
    "Singapore": { currency: 'SGD', provinces: {} },
    "Slovakia": { currency: 'EUR', provinces: {} },
    "Slovenia": { currency: 'EUR', provinces: {} },
    "Solomon Islands": { currency: 'SBD', provinces: {} },
    "Somalia": { currency: 'SOS', provinces: {} },
    "South Africa": { currency: 'ZAR', provinces: {} },
    "South Korea": { currency: 'KRW', provinces: {} },
    "South Sudan": { currency: 'SSP', provinces: {} },
    "Spain": { currency: 'EUR', provinces: {} },
    "Sri Lanka": { currency: 'LKR', provinces: {} },
    "Sudan": { currency: 'SDG', provinces: {} },
    "Suriname": { currency: 'SRD', provinces: {} },
    "Sweden": { currency: 'SEK', provinces: {} },
    "Switzerland": { currency: 'CHF', provinces: {} },
    "Syria": { currency: 'SYP', provinces: {} },
    "Taiwan": { currency: 'TWD', provinces: {} },
    "Tajikistan": { currency: 'TJS', provinces: {} },
    "Tanzania": { currency: 'TZS', provinces: {} },
    "Thailand": { currency: 'THB', provinces: {} },
    "Togo": { currency: 'XOF', provinces: {} },
    "Tonga": { currency: 'TOP', provinces: {} },
    "Trinidad and Tobago": { currency: 'TTD', provinces: {} },
    "Tunisia": { currency: 'TND', provinces: {} },
    "Turkey": { currency: 'TRY', provinces: {} },
    "Turkmenistan": { currency: 'TMT', provinces: {} },
    "Tuvalu": { currency: 'AUD', provinces: {} },
    "Uganda": { currency: 'UGX', provinces: {} },
    "Ukraine": { currency: 'UAH', provinces: {} },
    "United Arab Emirates": { currency: 'AED', provinces: {} },
    "United Kingdom": { currency: 'GBP', provinces: {} },
    "United States of America": { currency: 'USD', provinces: {} },
    "Uruguay": { currency: 'UYU', provinces: {} },
    "Uzbekistan": { currency: 'UZS', provinces: {} },
    "Vanuatu": { currency: 'VUV', provinces: {} },
    "Vatican City": { currency: 'EUR', provinces: {} },
    "Venezuela": { currency: 'VES', provinces: {} },
    "Vietnam": { currency: 'VND', provinces: {} },
    "Yemen": { currency: 'YER', provinces: {} },
    "Zambia": { currency: 'ZMW', provinces: {} },
    "Zimbabwe": { currency: 'ZWL', provinces: {} }
};

// liste des pays par continent pour filtrage
window.continents = {
    "Africa": [
        "Algeria", "Angola", "Benin", "Botswana", "Burkina Faso", "Burundi", "Cabo Verde",
        "Cameroon", "Central African Republic", "Chad", "Comoros", "Congo (Congo-Brazzaville)",
        "Congo (Kinshasa)", "Côte d'Ivoire", "Djibouti", "Egypt", "Equatorial Guinea", "Eritrea",
        "Eswatini (fmr. Swaziland)", "Ethiopia", "Gabon", "Gambia", "Ghana", "Guinea",
        "Guinea-Bissau", "Kenya", "Lesotho", "Liberia", "Libya", "Madagascar", "Malawi",
        "Mali", "Mauritania", "Mauritius", "Morocco", "Mozambique", "Namibia", "Niger", "Nigeria",
        "Rwanda", "Sao Tome and Principe", "Senegal", "Seychelles", "Sierra Leone", "Somalia",
        "South Africa", "South Sudan", "Sudan", "Tanzania", "Togo", "Tunisia", "Uganda", "Zambia", "Zimbabwe"
    ],
    "Asia": [
        "Afghanistan", "Armenia", "Azerbaijan", "Bahrain", "Bangladesh", "Bhutan", "Brunei", "Cambodia",
        "China", "Cyprus", "Georgia", "India", "Indonesia", "Iran", "Iraq", "Israel", "Japan", "Jordan",
        "Kazakhstan", "Kuwait", "Kyrgyzstan", "Laos", "Lebanon", "Malaysia", "Maldives", "Mongolia",
        "Myanmar (formerly Burma)", "Nepal", "North Korea", "Oman", "Pakistan", "Palestine", "Philippines",
        "Qatar", "Saudi Arabia", "Singapore", "South Korea", "Sri Lanka", "Syria", "Taiwan", "Tajikistan",
        "Thailand", "Timor-Leste", "Turkmenistan", "United Arab Emirates", "Uzbekistan", "Vietnam", "Yemen"
    ],
    "Europe": [
        "Albania", "Andorra", "Austria", "Belarus", "Belgium", "Bosnia and Herzegovina", "Bulgaria",
        "Croatia", "Czechia (Czech Republic)", "Denmark", "Estonia", "Finland", "France", "Germany", "Greece",
        "Hungary", "Iceland", "Ireland", "Italy", "Kosovo", "Latvia", "Liechtenstein", "Lithuania",
        "Luxembourg", "Malta", "Moldova", "Monaco", "Montenegro", "Netherlands", "North Macedonia", "Norway",
        "Poland", "Portugal", "Romania", "Russia", "San Marino", "Serbia", "Slovakia", "Slovenia", "Spain",
        "Sweden", "Switzerland", "Ukraine", "United Kingdom", "Vatican City"
    ],
    "North America": [
        "Antigua and Barbuda", "Bahamas", "Barbados", "Belize", "Canada", "Costa Rica", "Cuba", "Dominica",
        "Dominican Republic", "El Salvador", "Grenada", "Guatemala", "Haiti", "Honduras", "Jamaica", "Mexico",
        "Nicaragua", "Panama", "Saint Kitts and Nevis", "Saint Lucia", "Saint Vincent and the Grenadines", "Trinidad and Tobago",
        "United States of America"
    ],
    "South America": [
        "Argentina", "Bolivia", "Brazil", "Chile", "Colombia", "Ecuador", "Guyana", "Paraguay", "Peru", "Suriname", "Uruguay", "Venezuela"
    ],
    "Oceania": [
        "Australia", "Fiji", "Kiribati", "Marshall Islands", "Micronesia", "Nauru", "New Zealand", "Palau", "Papua New Guinea",
        "Samoa", "Solomon Islands", "Tonga", "Tuvalu", "Vanuatu"
    ]
};