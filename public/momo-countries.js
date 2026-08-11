(function exposeMomoCountries(root, factory) {
    const countries = factory();
    if (typeof module !== 'undefined' && module.exports) module.exports = countries;
    if (root) root.MOMO_COUNTRIES = countries;
}(typeof window !== 'undefined' ? window : globalThis, function buildMomoCountries() {
    // Opérateurs présents commercialement dans chaque pays, vérifiés pour les marques retenues.
    return [
        { name: 'Afrique du Sud', dialCode: '+27', currency: 'ZAR', providers: ['MTN', 'Vodacom'] },
        { name: 'Bénin', dialCode: '+229', currency: 'XOF', providers: ['MTN'] },
        { name: 'Botswana', dialCode: '+267', currency: 'BWP', providers: ['Orange'] },
        { name: 'Burkina Faso', dialCode: '+226', currency: 'XOF', providers: ['Orange'] },
        { name: 'Cameroun', dialCode: '+237', currency: 'XAF', providers: ['MTN', 'Orange'] },
        { name: 'Égypte', dialCode: '+20', currency: 'EGP', providers: ['Orange'] },
        { name: 'Eswatini', dialCode: '+268', currency: 'SZL', providers: ['MTN'] },
        { name: 'Gabon', dialCode: '+241', currency: 'XAF', providers: ['Airtel'] },
        { name: 'Ghana', dialCode: '+233', currency: 'GHS', providers: ['MTN'] },
        { name: 'Guinée', dialCode: '+224', currency: 'GNF', providers: ['MTN', 'Orange'] },
        { name: 'Guinée-Bissau', dialCode: '+245', currency: 'XOF', providers: ['MTN', 'Orange'] },
        { name: 'Kenya', dialCode: '+254', currency: 'KES', providers: ['Airtel'] },
        { name: 'Lesotho', dialCode: '+266', currency: 'LSL', providers: ['Vodacom'] },
        { name: 'Liberia', dialCode: '+231', currency: 'LRD', providers: ['MTN', 'Orange'] },
        { name: 'Madagascar', dialCode: '+261', currency: 'MGA', providers: ['Airtel', 'Orange'] },
        { name: 'Malawi', dialCode: '+265', currency: 'MWK', providers: ['Airtel'] },
        { name: 'Mali', dialCode: '+223', currency: 'XOF', providers: ['Orange'] },
        { name: 'Maroc', dialCode: '+212', currency: 'MAD', providers: ['Orange'] },
        { name: 'Mozambique', dialCode: '+258', currency: 'MZN', providers: ['Vodacom'] },
        { name: 'Niger', dialCode: '+227', currency: 'XOF', providers: ['Airtel', 'Orange'] },
        { name: 'Nigeria', dialCode: '+234', currency: 'NGN', providers: ['Airtel', 'MTN'] },
        { name: 'Ouganda', dialCode: '+256', currency: 'UGX', providers: ['Airtel', 'MTN'] },
        { name: 'République centrafricaine', dialCode: '+236', currency: 'XAF', providers: ['Orange'] },
        { name: 'République démocratique du Congo', dialCode: '+243', currency: 'CDF', providers: ['Airtel', 'Orange', 'Vodacom'] },
        { name: 'République du Congo', dialCode: '+242', currency: 'XAF', providers: ['Airtel', 'MTN'] },
        { name: 'Rwanda', dialCode: '+250', currency: 'RWF', providers: ['Airtel', 'MTN'] },
        { name: 'Sénégal', dialCode: '+221', currency: 'XOF', providers: ['Orange'] },
        { name: 'Seychelles', dialCode: '+248', currency: 'SCR', providers: ['Airtel'] },
        { name: 'Sierra Leone', dialCode: '+232', currency: 'SLL', providers: ['Orange'] },
        { name: 'Soudan', dialCode: '+249', currency: 'SDG', providers: ['MTN'] },
        { name: 'Soudan du Sud', dialCode: '+211', currency: 'SSP', providers: ['MTN'] },
        { name: 'Tanzanie', dialCode: '+255', currency: 'TZS', providers: ['Airtel', 'Vodacom'] },
        { name: 'Tchad', dialCode: '+235', currency: 'XAF', providers: ['Airtel'] },
        { name: 'Tunisie', dialCode: '+216', currency: 'TND', providers: ['Orange'] },
        { name: 'Zambie', dialCode: '+260', currency: 'ZMW', providers: ['Airtel', 'MTN'] },
        { name: 'Guinée équatoriale', dialCode: '+240', currency: 'XAF', providers: ['Orange'] },
        { name: 'Côte d’Ivoire', dialCode: '+225', currency: 'XOF', providers: ['MTN', 'Orange'] }
    ].sort((first, second) => first.name.localeCompare(second.name, 'fr'));
}));
