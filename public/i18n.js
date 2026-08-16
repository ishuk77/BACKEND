/* Client-side interface copy only. Content received from the API is never scanned or translated. */
(() => {
    const STORAGE_KEY = 'avecLocale';
    const LOCALES = Object.freeze(['fr', 'en', 'rw', 'rn', 'sw', 'ln']);
    const names = Object.freeze({
        fr: 'Français', en: 'English', rw: 'Kinyarwanda', rn: 'Kirundi', sw: 'Kiswahili', ln: 'Lingala'
    });
    const messages = Object.freeze({
        fr: {
            loading: 'Chargement…', send: 'Envoyer', save: 'Enregistrer', cancel: 'Annuler', back: 'Retour',
            close: 'Fermer', apply: 'Appliquer', language: 'Langue de l’interface', news: 'Actualités',
            select_country: 'Sélectionner un pays', select_provider: 'Sélectionner un opérateur', choose_country_first: 'Choisissez d’abord un pays',
            comment: 'Commenter', comments: 'Commentaires publics', add_comment: 'Ajouter un commentaire',
            no_comments: 'Aucun commentaire approuvé pour le moment.', comments_members: 'Les commentaires sont réservés aux publications membres.',
            news_loading: 'Chargement des actualités…', news_empty: 'Aucune actualité ou publicité publique ne correspond à ces critères pour le moment.',
            feed_current: 'Fil à jour.', more: 'Afficher plus', advertisement: 'Publicité', publication: 'Publication membre', announcement: 'Actualité',
            price: 'Prix', total: 'Total', availability: 'Disponibilité', address: 'Adresse', phone: 'Téléphone', email: 'E-mail',
            image_shared: 'Média partagé avec la publication', assistant_default: 'Je peux aider sur l’inscription, la sécurité, les groupes AVEC, l’épargne, les portefeuilles, la communauté et les actualités. Pour un problème de compte, utilisez les réglages sécurisés après connexion.',
            assistant_security: 'Ne partagez jamais votre PIN, mot de passe, code OTP ou données Mobile Money. Utilisez uniquement les contrôles sécurisés après connexion.',
            assistant_group: 'Créez votre compte puis découvrez ou rejoignez un groupe. La création d’un groupe respecte ses règles AVEC : 20 à 50 membres déclarés et un capital initial minimum.',
            assistant_account: 'L’inscription demande un e-mail, un téléphone, votre identité et un PIN à 4 chiffres. Vérifiez l’e-mail pour activer le compte.',
            assistant_wallet: 'Le portefeuille personnel, le portefeuille AVEC de chaque membre et les fonds du groupe sont séparés. Les paiements restent en mode SANDBOX.',
            assistant_community: 'Les échanges publics se font dans AVEC Communauté. Les annonces sont visibles ici et sur la page Actualités; Facebook dirige vers la communauté AVEC.'
        },
        en: {
            loading: 'Loading…', send: 'Send', save: 'Save', cancel: 'Cancel', back: 'Back', close: 'Close', apply: 'Apply',
            language: 'Interface language', news: 'News', comment: 'Comment', comments: 'Public comments', add_comment: 'Add a comment',
            select_country: 'Select a country', select_provider: 'Select an operator', choose_country_first: 'Choose a country first',
            no_comments: 'No approved comments yet.', comments_members: 'Comments are available only for member posts.',
            news_loading: 'Loading news…', news_empty: 'No public news or advertisement matches these criteria at the moment.',
            feed_current: 'Feed is up to date.', more: 'Show more', advertisement: 'Advertisement', publication: 'Member post', announcement: 'News',
            price: 'Price', total: 'Total', availability: 'Availability', address: 'Address', phone: 'Phone', email: 'Email',
            image_shared: 'Media shared with the post', assistant_default: 'I can help with registration, security, AVEC groups, savings, wallets, the community and news. For an account problem, use the secure settings after signing in.',
            assistant_security: 'Never share your PIN, password, OTP code or Mobile Money data. Use only the secure controls after signing in.',
            assistant_group: 'Create your account, then discover or join a group. Creating a group follows AVEC rules: 20 to 50 declared members and a minimum initial capital.',
            assistant_account: 'Registration requires an email address, phone number, identity and a four-digit PIN. Verify your email to activate the account.',
            assistant_wallet: 'Your personal wallet, each member’s AVEC wallet and group funds are separate. Payments remain in SANDBOX mode.',
            assistant_community: 'Public exchanges take place in AVEC Community. Announcements are visible here and on the News page; Facebook directs people to the AVEC community.'
        },
        rw: {
            loading: 'Kwamamaza…', send: 'Ohereza', save: 'Bika', cancel: 'Kureka', back: 'Subira', close: 'Funga', apply: 'Koresha',
            language: 'Ururimi rw’imigaragarire', news: 'Kwamamaza', comment: 'Tanga igitekerezo', comments: 'Ibitekerezo rusange', add_comment: 'Ongeraho igitekerezo',
            select_country: 'Hitamo igihugu', select_provider: 'Hitamo umukozi', choose_country_first: 'Banza uhitemo igihugu',
            no_comments: 'Nta bitekerezo byemejwe biraboneka.', comments_members: 'Ibitekerezo biremewe gusa ku nyandiko z’abanyamuryango.',
            news_loading: 'Kwamamaza amakuru…', news_empty: 'Nta makuru cyangwa itangazo rusange rihuye n’ibi bisabwa ubu.',
            feed_current: 'Urutonde rugezweho.', more: 'Erekana ibindi', advertisement: 'Kwamamaza', publication: 'Kwamamaza kw’umunyamuryango', announcement: 'Kwamamaza',
            price: 'Igiciro', total: 'Igiteranyo', availability: 'Kuboneka', address: 'Aderesi', phone: 'Telefone', email: 'Imeyili',
            image_shared: 'Itangazamakuru risangiwe n’inyandiko', assistant_default: 'Nshobora gufasha ku kwiyandikisha, umutekano, amatsinda AVEC, ubwizigame, amasakoshi, umuryango n’amakuru.',
            assistant_security: 'Ntugatange PIN, ijambo banga, kode OTP cyangwa amakuru ya Mobile Money. Koresha igenzura ririnzwe gusa umaze kwinjira.',
            assistant_group: 'Fungura konti yawe, ushake cyangwa winjire mu itsinda. Gukora itsinda bikurikiza amategeko ya AVEC.',
            assistant_account: 'Kwiyandikisha bisaba imeyili, telefone, umwirondoro na PIN y’imibare ine. Emeza imeyili kugira ngo konti ikore.',
            assistant_wallet: 'Agasakoshi kawe, ak’ikorwa rya AVEC n’amafaranga y’itsinda biratandukanye. Kwishyura kuguma muri SANDBOX.',
            assistant_community: 'Ibiganiro rusange bibera muri AVEC Umuryango. Amatangazo aboneka hano no ku rupapuro rw’amakuru.'
        },
        rn: {
            loading: 'Kwamamaza…', send: 'Rungika', save: 'Bika', cancel: 'Reka', back: 'Subira', close: 'Funga', apply: 'Shira mu ngiro',
            language: 'Ururimi rw’urubuga', news: 'Amakuru', comment: 'Tanga iciyumviro', comments: 'Ivyiyumviro vya bose', add_comment: 'Shiramwo iciyumviro',
            select_country: 'Hitamwo igihugu', select_provider: 'Hitamwo umukoresha', choose_country_first: 'Banza uhitemwo igihugu',
            no_comments: 'Nta vyiyumviro vyemejwe birahari.', comments_members: 'Ivyiyumviro biremewe gusa ku vyanditswe n’abanywanyi.',
            news_loading: 'Kwamamaza amakuru…', news_empty: 'Nta makuru canke amatangazo rusangi aboneka ubu.',
            feed_current: 'Urutonde ruri ku gihe.', more: 'Raba vyinshi', advertisement: 'Kwamamaza', publication: 'Kwamamaza kw’umunywanyi', announcement: 'Inkuru',
            price: 'Igiciro', total: 'Igiteranyo', availability: 'Kuboneka', address: 'Aderesi', phone: 'Telefone', email: 'Imeyili',
            image_shared: 'Ishusho yasangiwe n’ivyanditswe', assistant_default: 'Nshobora gufasha mu kwiyandikisha, umutekano, imigwi AVEC, kuziganya, amafaranga n’amakuru.',
            assistant_security: 'Ntugatange PIN, ijambo banga, kode OTP canke amakuru ya Mobile Money. Koresha gusa ibigenzura bikingiwe.',
            assistant_group: 'Fungura konti yawe hanyuma urondere canke winjire mu mugwi. Gukora umugwi bikurikiza amategeko AVEC.',
            assistant_account: 'Kwiyandikisha bisaba imeyili, telefone, umwirondoro na PIN y’imibare ine. Emeza imeyili kugira konti ikore.',
            assistant_wallet: 'Ikofi yawe, iy’umunywanyi wa AVEC n’amafaranga y’umugwi biratandukanye. Kwishura kuguma muri SANDBOX.',
            assistant_community: 'Ibiganiro vya bose bibera muri AVEC Umuryango. Amatangazo aboneka hano no ku rupapuro rw’amakuru.'
        },
        sw: {
            loading: 'Inapakia…', send: 'Tuma', save: 'Hifadhi', cancel: 'Ghairi', back: 'Rudi', close: 'Funga', apply: 'Tumia',
            language: 'Lugha ya kiolesura', news: 'Habari', comment: 'Toa maoni', comments: 'Maoni ya umma', add_comment: 'Ongeza maoni',
            select_country: 'Chagua nchi', select_provider: 'Chagua mtoa huduma', choose_country_first: 'Chagua nchi kwanza',
            no_comments: 'Bado hakuna maoni yaliyoidhinishwa.', comments_members: 'Maoni yanapatikana kwa machapisho ya wanachama pekee.',
            news_loading: 'Inapakia habari…', news_empty: 'Hakuna habari au tangazo la umma linalolingana na vigezo hivi kwa sasa.',
            feed_current: 'Mlisho umesasishwa.', more: 'Onyesha zaidi', advertisement: 'Tangazo', publication: 'Chapisho la mwanachama', announcement: 'Habari',
            price: 'Bei', total: 'Jumla', availability: 'Upatikanaji', address: 'Anwani', phone: 'Simu', email: 'Barua pepe',
            image_shared: 'Picha iliyoshirikiwa na chapisho', assistant_default: 'Ninaweza kusaidia usajili, usalama, vikundi vya AVEC, akiba, pochi, jumuiya na habari.',
            assistant_security: 'Usiwahi kushiriki PIN, nenosiri, msimbo wa OTP au data ya Mobile Money. Tumia vidhibiti salama tu baada ya kuingia.',
            assistant_group: 'Fungua akaunti yako, kisha tafuta au jiunge na kikundi. Kuunda kikundi hufuata kanuni za AVEC.',
            assistant_account: 'Usajili unahitaji barua pepe, simu, utambulisho na PIN ya tarakimu nne. Thibitisha barua pepe ili kuanzisha akaunti.',
            assistant_wallet: 'Pochi yako, pochi ya AVEC ya kila mwanachama na fedha za kikundi zimetenganishwa. Malipo yanabaki katika SANDBOX.',
            assistant_community: 'Mazungumzo ya umma yanafanyika katika Jumuiya ya AVEC. Matangazo yanaonekana hapa na kwenye ukurasa wa Habari.'
        },
        ln: {
            loading: 'Ezali kofungwama…', send: 'Tinda', save: 'Bomba', cancel: 'Tika', back: 'Zonga', close: 'Kanga', apply: 'Salela',
            language: 'Lokóta ya etando', news: 'Bansango', comment: 'Tia likanisi', comments: 'Makanisi ya bato nyonso', add_comment: 'Bakisa likanisi',
            select_country: 'Pona mboka', select_provider: 'Pona mopesi', choose_country_first: 'Pona mboka liboso',
            no_comments: 'Naino likanisi oyo endimami ezali te.', comments_members: 'Makanisi epesami kaka mpo na mikanda ya bandimi.',
            news_loading: 'Ezali kofungwama bansango…', news_empty: 'Bansango to liyebisi ya bato nyonso ekokani na makambo oyo ezali te sikawa.',
            feed_current: 'Nsango ezali ya sika.', more: 'Lakisa mingi', advertisement: 'Liyebisi', publication: 'Mikanda ya mondimi', announcement: 'Nsango',
            price: 'Ntalo', total: 'Nyonso', availability: 'Kozala', address: 'Adresse', phone: 'Telefone', email: 'Imeyili',
            image_shared: 'Elili ekabolami na mokanda', assistant_default: 'Nakoki kosalisa na bokomisi, bokengi, masanga AVEC, bobombi, ba portefeuille, lisanga mpe bansango.',
            assistant_security: 'Kabolaka PIN, mot de passe, kode OTP to makambo ya Mobile Money te. Salela kaka bokengi sima ya kokota.',
            assistant_group: 'Fungola konti na yo, na sima luka to kota na lisanga. Kosala lisanga elandaka mibeko ya AVEC.',
            assistant_account: 'Bokomisi esengaka imeyili, telefone, bomoto mpe PIN ya mitango minei. Ndima imeyili mpo konti esala.',
            assistant_wallet: 'Portefeuille na yo, ya mondimi nyonso ya AVEC mpe mbongo ya lisanga ekabwani. Kofuta etikala na SANDBOX.',
            assistant_community: 'Masolo ya bato nyonso esalemaka na Lisanga AVEC. Mayebisi emonanaka awa mpe na lokasa ya Bansango.'
        }
    });
    const landing = Object.freeze({
        fr: {
            tagline: 'Épargne, crédit et entraide organisés pour votre groupe.', language: 'Langue', account: 'Créer ou ouvrir mon compte',
            hero_title: 'Faire grandir l’épargne du groupe, ensemble.', hero_text: 'AVEC Microcredit réunit votre compte membre, votre groupe d’épargne et votre communauté dans des espaces distincts et simples à utiliser.',
            create: 'Créer mon compte membre', community: 'Découvrir AVEC Communauté', sandbox: 'Les paiements et la vérification Mobile Money sont actuellement en mode SANDBOX.',
            journey: 'Votre parcours', step_one: 'Créer et vérifier votre identité', step_two: 'Découvrir ou rejoindre un groupe', step_three: 'Organiser l’épargne avec votre communauté',
            spaces_title: 'Un compte, des espaces bien séparés.', spaces_text: 'Votre portefeuille personnel, votre groupe AVEC et les échanges de communauté ne mélangent jamais leurs règles ni leurs fonds.',
            spaces_wallet_title: 'Portefeuille personnel', spaces_wallet_text: 'Rechargez avant de contribuer, publier ou créer une AVEC.',
            spaces_group_title: 'Compte AVEC', spaces_group_text: 'Contributions, crédit, remboursements et registre restent dans votre groupe.',
            spaces_contacts_title: 'Contacts et échanges', spaces_contacts_text: 'Ajoutez un membre AVEC et discutez après acceptation de la connexion.',
            orient_title: 'Choisissez votre prochain pas.', orient_text: 'Chaque parcours commence publiquement et devient sécurisé après votre connexion.',
            orient_member: 'Je suis membre', orient_member_text: 'Créer mon compte, compléter mon profil et accéder à mon portefeuille personnel.',
            orient_group: 'Je représente un groupe', orient_group_text: 'Préparer une AVEC ou un groupe d’épargne avec ses règles et ses membres.',
            orient_community: 'Je veux échanger', orient_community_text: 'Découvrir les initiatives, publications et conversations de la communauté AVEC.',
            platform_title: 'Une plateforme numérique pour l’épargne communautaire.', platform_text: 'AVEC Microcredit aide les groupes d’épargne, les associations villageoises et les communautés à organiser leurs contributions, leurs règles de gestion, leurs registres et leurs échanges. Les groupes peuvent fonctionner comme AVEC ou comme groupes d’épargne sans intérêt, selon leurs propres règles.',
            platform_savings_title: 'Épargne solidaire', platform_savings_text: 'Structurez les cotisations et le suivi des mouvements collectifs dans un cadre défini par le groupe.',
            platform_credit_title: 'Microcrédit communautaire', platform_credit_text: 'Les demandes, remboursements et décisions de crédit restent suivis au sein de l’AVEC.',
            platform_community_title: 'Communauté numérique', platform_community_text: 'Découvrez les actualités et les initiatives publiques, puis échangez depuis AVEC Communauté.',
            facebook_title: 'Retrouvez les nouvelles AVEC sur Facebook.', facebook_text: 'Suivez la page officielle pour les annonces publiques, puis rejoignez AVEC Communauté pour échanger dans la plateforme.',
            facebook_action: 'Ouvrir notre page Facebook', assistant_title: 'Assistant AVEC', assistant_text: 'Une aide rapide pour comprendre la plateforme. Il ne demande jamais votre PIN, code OTP, mot de passe ou informations Mobile Money.',
            assistant_safety: 'Pour une opération financière, suivez toujours les contrôles sécurisés de votre espace membre.', assistant_welcome: 'Bonjour ! Posez une question sur l’inscription, les groupes AVEC, l’épargne, la communauté ou la sécurité.',
            assistant_label: 'Votre question', assistant_placeholder: 'Ex. Comment rejoindre un groupe ?', assistant_send: 'Demander',
            home_news_title: 'Annonces et publicités des membres', home_news_text: 'Les contenus sont publiés par les membres après débit automatique de leur portefeuille SANDBOX.', home_news_action: 'Voir les annonces',
            news_page_header: 'Actualités & publicités', news_page_subheader: 'Les annonces, publicités et produits proposés par les membres AVEC.', news_public_home: 'Accueil public', news_member_account: 'Accéder à mon compte membre',
            news_intro_title: 'Suivre la vie publique d’AVEC', news_intro_text: 'Les annonces et publicités sont publiées par les membres depuis leur espace personnel, lorsque leur portefeuille SANDBOX couvre le montant demandé.', news_privacy_text: 'Les publications réservées aux contacts, privées ou retirées restent hors de cette page. Le nom d’un membre n’est affiché que lorsque son profil est public.'
        },
        en: {
            tagline: 'Savings, credit and mutual support organised for your group.', language: 'Language', account: 'Create or open my account',
            hero_title: 'Grow your group savings, together.', hero_text: 'AVEC Microcredit brings your member account, savings group and community together in separate, easy-to-use spaces.',
            create: 'Create my member account', community: 'Discover AVEC Community', sandbox: 'Payments and Mobile Money verification currently run in SANDBOX mode.',
            journey: 'Your journey', step_one: 'Create and verify your identity', step_two: 'Discover or join a group', step_three: 'Organise savings with your community',
            spaces_title: 'One account, clearly separated spaces.', spaces_text: 'Your personal wallet, AVEC group and community conversations never mix their rules or funds.',
            spaces_wallet_title: 'Personal wallet', spaces_wallet_text: 'Top up before contributing, publishing or creating an AVEC group.',
            spaces_group_title: 'AVEC account', spaces_group_text: 'Contributions, credit, repayments and the ledger stay in your group.',
            spaces_contacts_title: 'Contacts and conversations', spaces_contacts_text: 'Add an AVEC member and talk after the connection is accepted.',
            orient_title: 'Choose your next step.', orient_text: 'Every journey starts publicly and becomes secure after you sign in.',
            orient_member: 'I am a member', orient_member_text: 'Create my account, complete my profile and access my personal wallet.',
            orient_group: 'I represent a group', orient_group_text: 'Prepare an AVEC or savings group with its rules and members.',
            orient_community: 'I want to connect', orient_community_text: 'Discover initiatives, posts and conversations in the AVEC community.',
            platform_title: 'A digital platform for community savings.', platform_text: 'AVEC Microcredit helps savings groups, village associations and communities organise their contributions, management rules, ledgers and conversations. Groups can operate as AVEC groups or interest-free savings groups under their own rules.',
            platform_savings_title: 'Mutual savings', platform_savings_text: 'Organise contributions and track collective transactions within a framework set by the group.',
            platform_credit_title: 'Community microcredit', platform_credit_text: 'Credit requests, repayments and credit decisions remain tracked within the AVEC group.',
            platform_community_title: 'Digital community', platform_community_text: 'Discover public news and initiatives, then talk in AVEC Community.',
            facebook_title: 'Find AVEC news on Facebook.', facebook_text: 'Follow the official page for public announcements, then join AVEC Community to talk on the platform.',
            facebook_action: 'Open our Facebook page', assistant_title: 'AVEC Assistant', assistant_text: 'Quick help to understand the platform. It never asks for your PIN, OTP code, password or Mobile Money details.',
            assistant_safety: 'For a financial action, always follow the secure controls in your member area.', assistant_welcome: 'Hello! Ask about registration, AVEC groups, savings, the community or security.',
            assistant_label: 'Your question', assistant_placeholder: 'For example: How do I join a group?', assistant_send: 'Ask',
            home_news_title: 'Member announcements and advertisements', home_news_text: 'Content is published by members after an automatic debit from their SANDBOX wallet.', home_news_action: 'View announcements',
            news_page_header: 'News & advertisements', news_page_subheader: 'Announcements, advertisements and products offered by AVEC members.', news_public_home: 'Public home', news_member_account: 'Access my member account',
            news_intro_title: 'Follow AVEC’s public life', news_intro_text: 'Members publish announcements and advertisements from their personal area when their SANDBOX wallet covers the requested amount.', news_privacy_text: 'Posts limited to contacts, private posts and removed posts are not shown on this page. A member’s name is displayed only when their profile is public.'
        },
        rw: {
            tagline: 'Kwamamaza, inguzanyo n’ubufatanye byateguriwe itsinda ryanyu.', language: 'Ururimi', account: 'Fungura cyangwa winjire muri konti',
            hero_title: 'Tuzamure ubwizigame bw’itsinda, twese hamwe.', hero_text: 'AVEC Microcredit ihuza konti yawe, itsinda ry’ubwizigame n’umuryango wawe ahantu hatandukanye kandi horoshye gukoresha.',
            create: 'Fungura konti yanjye', community: 'Sura Umuryango AVEC', journey: 'Urugendo rwawe', step_one: 'Kora kandi wemeze umwirondoro wawe',
            step_two: 'Shaka cyangwa winjire mu itsinda', step_three: 'Tegura ubwizigame n’umuryango wawe', orient_title: 'Hitamo intambwe ikurikira.',
            orient_member: 'Ndi umunyamuryango', orient_group: 'Nserukira itsinda', orient_community: 'Ndashaka kuganira',
            spaces_title: 'Konti imwe, ahantu hatandukanye neza.', spaces_text: 'Agasakoshi kawe, itsinda AVEC n’ibiganiro by’umuryango ntibivanga amategeko cyangwa amafaranga yabyo.',
            spaces_wallet_title: 'Agasakoshi kawe', spaces_wallet_text: 'Shyiramo amafaranga mbere yo gutanga umusanzu, gutangaza cyangwa gukora AVEC.',
            spaces_group_title: 'Konti AVEC', spaces_group_text: 'Imisanzu, inguzanyo, kwishyura n’igitabo biguma mu itsinda ryawe.',
            spaces_contacts_title: 'Abo muziranye n’ibiganiro', spaces_contacts_text: 'Ongeraho umunyamuryango wa AVEC muganire nyuma yo kwemera guhuza.',
            orient_text: 'Buri rugendo rutangirira ku mugaragaro rukagira umutekano umaze kwinjira.', orient_member_text: 'Fungura konti, uzuze umwirondoro kandi ugere ku gasakoshi kawe.', orient_group_text: 'Tegura AVEC cyangwa itsinda ry’ubwizigame rifite amategeko n’abanyamuryango.', orient_community_text: 'Menya ibikorwa, inyandiko n’ibiganiro by’umuryango AVEC.',
            platform_title: 'Urubuga rw’ikoranabuhanga rw’ubwizigame bw’umuryango.', platform_text: 'AVEC Microcredit ifasha amatsinda yo kwizigama, amashyirahamwe y’imidugudu n’imiryango gutunganya imisanzu, amategeko y’imicungire, ibitabo n’ibiganiro. Amatsinda ashobora gukora nka AVEC cyangwa nk’amatsinda yo kwizigama adafite inyungu akurikije amategeko yayo.',
            platform_savings_title: 'Kwamamaza ubwizigame', platform_savings_text: 'Tunganya imisanzu kandi ukurikirane ibikorwa rusange mu murongo washyizweho n’itsinda.',
            platform_credit_title: 'Inguzanyo y’umuryango', platform_credit_text: 'Ubusabe, kwishyura n’ibyemezo by’inguzanyo bikurikiranwa muri AVEC.',
            platform_community_title: 'Umuryango w’ikoranabuhanga', platform_community_text: 'Menya amakuru n’ibikorwa rusange, ubundi muganire muri Umuryango AVEC.',
            facebook_title: 'Sanga amakuru ya AVEC kuri Facebook.', facebook_text: 'Kurikira urupapuro rwemewe rw’amatangazo rusange, hanyuma winjire mu Muryango AVEC muganire ku rubuga.', facebook_action: 'Fungura urupapuro rwacu rwa Facebook',
            assistant_title: 'Umufasha AVEC', assistant_text: 'Ubufasha bwihuse bwo gusobanukirwa urubuga. Ntiyigera agusaba PIN, kode OTP, ijambo banga cyangwa amakuru ya Mobile Money.', assistant_safety: 'Mu gikorwa cy’amafaranga, buri gihe kurikiza igenzura ririnzwe ryo mu mwanya wawe w’umunyamuryango.', assistant_welcome: 'Muraho! Baza ku kwiyandikisha, amatsinda AVEC, ubwizigame, umuryango cyangwa umutekano.', assistant_label: 'Ikibazo cyawe', assistant_placeholder: 'Urugero: Ninjira nte mu itsinda?', assistant_send: 'Baza',
            home_news_title: 'Amatangazo n’iyamamaza by’abanyamuryango', home_news_text: 'Ibirimo bitangazwa n’abanyamuryango nyuma yo gukura amafaranga muri agasakoshi kabo ka SANDBOX.', home_news_action: 'Reba amatangazo',
            news_page_header: 'Amakuru n’iyamamaza', news_page_subheader: 'Amatangazo, iyamamaza n’ibicuruzwa bitangwa n’abanyamuryango ba AVEC.', news_public_home: 'Ahabanza rusange', news_member_account: 'Injira muri konti yanjye',
            news_intro_title: 'Kurikira ubuzima rusange bwa AVEC', news_intro_text: 'Abanyamuryango batangaza amatangazo n’iyamamaza mu mwanya wabo igihe agasakoshi ka SANDBOX gafite amafaranga asabwa.', news_privacy_text: 'Inyandiko z’abaziranye gusa, izigenga cyangwa zavanyweho ntizigaragara kuri uru rupapuro. Izina ry’umunyamuryango rigaragara gusa iyo umwirondoro we ari rusange.'
        },
        rn: {
            tagline: 'Kwamamaza, inguzanyo n’ugufashanya vyatunganijwe ku mugwi wanyu.', language: 'Ururimi', account: 'Fungura canke winjire muri konti',
            hero_title: 'Tuzamure ubwizigame bw’umugwi, twese hamwe.', hero_text: 'AVEC Microcredit ihuza konti yawe, umugwi wo kuziganya n’umuryango wawe mu bibanza vyoroshe gukoresha.',
            create: 'Fungura konti yanje', community: 'Raba Umuryango AVEC', journey: 'Urugendo rwawe', step_one: 'Rema kandi wemeze umwirondoro wawe',
            step_two: 'Rondera canke winjire mu mugwi', step_three: 'Tunganya kuziganya n’umuryango wawe', orient_title: 'Hitamwo intambwe ikurikira.',
            orient_member: 'Ndi umunywanyi', orient_group: 'Nserukira umugwi', orient_community: 'Ndashaka kuganira',
            spaces_title: 'Konti imwe, ibibanza bitandukanye neza.', spaces_text: 'Ikofi yawe, umugwi AVEC n’ibiganiro vy’umuryango ntibivanga amategeko canke amafaranga yabyo.',
            spaces_wallet_title: 'Ikofi yawe', spaces_wallet_text: 'Shiramwo amafaranga imbere yo gutanga intererano, gutangaza canke gukora AVEC.',
            spaces_group_title: 'Konti AVEC', spaces_group_text: 'Intererano, amadeni, kwishura n’igitabu biguma mu mugwi wawe.',
            spaces_contacts_title: 'Abo muziranye n’ibiganiro', spaces_contacts_text: 'Shiramwo umunywanyi wa AVEC muganire inyuma yo kwemera kubonana.',
            orient_text: 'Urugendo rwose rutangura ku mugaragaro rukagira umutekano umaze kwinjira.', orient_member_text: 'Fungura konti, wuzuze umwirondoro kandi ushike ku ikofi yawe.', orient_group_text: 'Tegura AVEC canke umugwi wo kuziganya ufise amategeko n’abanywanyi.', orient_community_text: 'Raba ibikorwa, ivyanditswe n’ibiganiro vy’Umuryango AVEC.',
            platform_title: 'Urubuga rw’ikoranabuhanga rwo kuziganya kw’umuryango.', platform_text: 'AVEC Microcredit ifasha imigwi yo kuziganya, amashirahamwe y’ingo n’imiryango gutunganya intererano, amategeko y’ubuyobozi, ibitabu n’ibiganiro. Imigwi ishobora gukora nka AVEC canke nk’imigwi yo kuziganya itagira inyungu ikurikije amategeko yayo.',
            platform_savings_title: 'Kwamamaza kuziganya', platform_savings_text: 'Tunganya intererano kandi ukurikirane ibikorwa rusangi mu murongo washinzwe n’umugwi.',
            platform_credit_title: 'Ideni ry’umuryango', platform_credit_text: 'Ubusabe, kwishura n’ingingo z’amadeni bikurikiranwa muri AVEC.',
            platform_community_title: 'Umuryango w’ikoranabuhanga', platform_community_text: 'Raba amakuru n’ibikorwa vya bose, hanyuma muganire muri Umuryango AVEC.',
            facebook_title: 'Raba amakuru ya AVEC kuri Facebook.', facebook_text: 'Kurikira urupapuro rwemewe rw’amatangazo ya bose, hanyuma winjire mu Muryango AVEC muganire ku rubuga.', facebook_action: 'Fungura urupapuro rwacu rwa Facebook',
            assistant_title: 'Umufasha AVEC', assistant_text: 'Ubufasha bwihuta bwo gutahura urubuga. Ntiyigera agusaba PIN, kode OTP, ijambo banga canke amakuru ya Mobile Money.', assistant_safety: 'Mu gikorwa c’amafaranga, wame ukurikiza ibigenzura bikingiwe mu kibuga cawe c’umunywanyi.', assistant_welcome: 'Muraho! Baza ku kwiyandikisha, imigwi AVEC, kuziganya, umuryango canke umutekano.', assistant_label: 'Ikibazo cawe', assistant_placeholder: 'Akarorero: Ninjira gute mu mugwi?', assistant_send: 'Baza',
            home_news_title: 'Amatangazo n’ukwamamaza vy’abanywanyi', home_news_text: 'Ibirimwo bitangazwa n’abanywanyi inyuma yo gukura amafaranga mu ikofi yabo ya SANDBOX.', home_news_action: 'Raba amatangazo',
            news_page_header: 'Amakuru n’ukwamamaza', news_page_subheader: 'Amatangazo, ukwamamaza n’ibicuruzwa bitangwa n’abanywanyi ba AVEC.', news_public_home: 'Intango ya bose', news_member_account: 'Injira muri konti yanje',
            news_intro_title: 'Kurikira ubuzima bwa bose bwa AVEC', news_intro_text: 'Abanywanyi batangaza amatangazo n’ukwamamaza mu kibuga cabo igihe ikofi ya SANDBOX ifise amafaranga asabwa.', news_privacy_text: 'Kwamamaza kugenewe abo muziranye, ukwihariye canke kwakuweho ntikugaragara kuri uru rupapuro. Izina ry’umunywanyi riboneka gusa iyo umwirondoro wiwe ari rusangi.'
        },
        sw: {
            tagline: 'Akiba, mikopo na usaidizi vimepangwa kwa kikundi chako.', language: 'Lugha', account: 'Fungua au ingia kwenye akaunti yangu',
            hero_title: 'Kukuza akiba ya kikundi, pamoja.', hero_text: 'AVEC Microcredit huleta akaunti yako, kikundi cha akiba na jumuiya yako katika nafasi tofauti zilizo rahisi kutumia.',
            create: 'Fungua akaunti yangu', community: 'Gundua Jumuiya ya AVEC', journey: 'Safari yako', step_one: 'Unda na uthibitishe utambulisho wako',
            step_two: 'Gundua au jiunge na kikundi', step_three: 'Panga akiba na jumuiya yako', orient_title: 'Chagua hatua yako inayofuata.',
            orient_member: 'Mimi ni mwanachama', orient_group: 'Ninawakilisha kikundi', orient_community: 'Nataka kuwasiliana',
            spaces_title: 'Akaunti moja, nafasi zilizotenganishwa wazi.', spaces_text: 'Pochi yako, kikundi cha AVEC na mazungumzo ya jumuiya havichanganyi kanuni au fedha zao.',
            spaces_wallet_title: 'Pochi binafsi', spaces_wallet_text: 'Weka fedha kabla ya kuchangia, kuchapisha au kuunda AVEC.',
            spaces_group_title: 'Akaunti ya AVEC', spaces_group_text: 'Michango, mikopo, marejesho na daftari hubaki katika kikundi chako.',
            spaces_contacts_title: 'Mawasiliano na mazungumzo', spaces_contacts_text: 'Ongeza mwanachama wa AVEC na zungumza baada ya muunganisho kukubaliwa.',
            orient_text: 'Kila safari huanza hadharani na kuwa salama baada ya kuingia.', orient_member_text: 'Fungua akaunti, kamilisha wasifu wako na ufikie pochi yako.', orient_group_text: 'Andaa AVEC au kikundi cha akiba chenye kanuni na wanachama wake.', orient_community_text: 'Gundua mipango, machapisho na mazungumzo katika Jumuiya ya AVEC.',
            platform_title: 'Jukwaa la kidijitali la akiba ya jumuiya.', platform_text: 'AVEC Microcredit husaidia vikundi vya akiba, vyama vya vijijini na jumuiya kupanga michango, kanuni za usimamizi, madaftari na mazungumzo. Vikundi vinaweza kufanya kazi kama AVEC au kama vikundi vya akiba visivyo na riba kwa kanuni zao.',
            platform_savings_title: 'Akiba ya ushirikiano', platform_savings_text: 'Panga michango na ufuatilie miamala ya pamoja katika mfumo uliowekwa na kikundi.',
            platform_credit_title: 'Mikopo midogo ya jumuiya', platform_credit_text: 'Maombi, marejesho na maamuzi ya mikopo hufuatiliwa ndani ya AVEC.',
            platform_community_title: 'Jumuiya ya kidijitali', platform_community_text: 'Gundua habari na mipango ya umma, kisha zungumza katika Jumuiya ya AVEC.',
            facebook_title: 'Pata habari za AVEC kwenye Facebook.', facebook_text: 'Fuata ukurasa rasmi kwa matangazo ya umma, kisha jiunge na Jumuiya ya AVEC kuzungumza kwenye jukwaa.', facebook_action: 'Fungua ukurasa wetu wa Facebook',
            assistant_title: 'Msaidizi wa AVEC', assistant_text: 'Msaada wa haraka wa kuelewa jukwaa. Hakuombi kamwe PIN, msimbo wa OTP, nenosiri au maelezo ya Mobile Money.', assistant_safety: 'Kwa shughuli ya kifedha, daima fuata vidhibiti salama katika eneo lako la mwanachama.', assistant_welcome: 'Hujambo! Uliza kuhusu usajili, vikundi vya AVEC, akiba, jumuiya au usalama.', assistant_label: 'Swali lako', assistant_placeholder: 'Mfano: Ninawezaje kujiunga na kikundi?', assistant_send: 'Uliza',
            home_news_title: 'Matangazo na matangazo ya biashara ya wanachama', home_news_text: 'Maudhui huchapishwa na wanachama baada ya kukatwa kiotomatiki kutoka pochi yao ya SANDBOX.', home_news_action: 'Tazama matangazo',
            news_page_header: 'Habari na matangazo', news_page_subheader: 'Matangazo, matangazo ya biashara na bidhaa zinazotolewa na wanachama wa AVEC.', news_public_home: 'Mwanzo wa umma', news_member_account: 'Fikia akaunti yangu ya mwanachama',
            news_intro_title: 'Fuata maisha ya umma ya AVEC', news_intro_text: 'Wanachama huchapisha matangazo na matangazo ya biashara kutoka eneo lao binafsi wakati pochi yao ya SANDBOX inatosha kiasi kinachohitajika.', news_privacy_text: 'Machapisho ya mawasiliano pekee, ya faragha au yaliyoondolewa hayaonekani kwenye ukurasa huu. Jina la mwanachama huonyeshwa tu wakati wasifu wake ni wa umma.'
        },
        ln: {
            tagline: 'Bobombi, kredi mpe lisungi esalemi mpo na lisanga na bino.', language: 'Lokóta', account: 'Fungola to kota na konti na ngai',
            hero_title: 'Tobakisa bobombi ya lisanga, elongo.', hero_text: 'AVEC Microcredit esangisi konti ya moto, lisanga ya bobombi mpe lisanga ya bato na bisika ekeseni mpe pete kosalela.',
            create: 'Fungola konti na ngai', community: 'Tala Lisanga AVEC', journey: 'Nzela na yo', step_one: 'Salá mpe ndima bomoto na yo',
            step_two: 'Luka to kota na lisanga', step_three: 'Bongisa bobombi na lisanga na yo', orient_title: 'Pona litambe na yo elandi.',
            orient_member: 'Nazali mondimi', orient_group: 'Nazali koloba na nkombo ya lisanga', orient_community: 'Nalingi kosolola',
            spaces_title: 'Konti moko, bisika ekabwani polele.', spaces_text: 'Portefeuille na yo, lisanga AVEC mpe masolo ya bato ekosangisa mibeko to mbongo na yango te.',
            spaces_wallet_title: 'Portefeuille ya moto', spaces_wallet_text: 'Tia mbongo liboso ya kopesa lisungi, kobimisa mokanda to kosala AVEC.',
            spaces_group_title: 'Konti AVEC', spaces_group_text: 'Lisungi, kredi, kofuta mpe buku etikala na lisanga na yo.',
            spaces_contacts_title: 'Bato bayebani mpe masolo', spaces_contacts_text: 'Bakisa mondimi ya AVEC mpe solola sima ya kondima boyokani.',
            orient_text: 'Nzela nyonso ebandaka na polele mpe ekomaka na bokengi sima ya kokota.', orient_member_text: 'Fungola konti, silisa profil na yo mpe kota na portefeuille na yo.', orient_group_text: 'Bongisa AVEC to lisanga ya bobombi na mibeko mpe bandimi na yango.', orient_community_text: 'Tala misala, mikanda mpe masolo na Lisanga AVEC.',
            platform_title: 'Etando ya nimero mpo na bobombi ya lisanga.', platform_text: 'AVEC Microcredit esalisaka masanga ya bobombi, masanga ya bamboka mpe bato kobongisa lisungi, mibeko ya boyangeli, babuku mpe masolo. Masanga ekoki kosala lokola AVEC to masanga ya bobombi ezangi intérêt kolanda mibeko na yango.',
            platform_savings_title: 'Bobombi ya lisungi', platform_savings_text: 'Bongisa lisungi mpe landela botamboli ya bato nyonso na nzela oyo lisanga etie.',
            platform_credit_title: 'Kredi ya lisanga', platform_credit_text: 'Masengi, bofuti mpe bikateli ya kredi elandelamaka na kati ya AVEC.',
            platform_community_title: 'Lisanga ya nimero', platform_community_text: 'Tala bansango mpe misala ya bato nyonso, bongo solola na Lisanga AVEC.',
            facebook_title: 'Luka bansango ya AVEC na Facebook.', facebook_text: 'Landa lokasa ya solo mpo na mayebisi ya bato nyonso, bongo kota na Lisanga AVEC mpo na kosolola na etando.', facebook_action: 'Fungola lokasa na biso ya Facebook',
            assistant_title: 'Mosungi AVEC', assistant_text: 'Lisungi ya mbangu mpo na kososola etando. Asengaka yo PIN, kode OTP, mot de passe to makambo ya Mobile Money te.', assistant_safety: 'Na mosala ya mbongo, landa ntango nyonso bokengi ya esika na yo ya mondimi.', assistant_welcome: 'Mbote! Tuna na ntina ya bokomisi, masanga AVEC, bobombi, lisanga to bokengi.', assistant_label: 'Motuna na yo', assistant_placeholder: 'Ndakisa: Nakota ndenge nini na lisanga?', assistant_send: 'Tuna',
            home_news_title: 'Mayebisi mpe bapiblisite ya bandimi', home_news_text: 'Mikanda ebimisamaka na bandimi sima ya kolongola mbongo na portefeuille na bango ya SANDBOX.', home_news_action: 'Tala mayebisi',
            news_page_header: 'Bansango mpe bapiblisite', news_page_subheader: 'Mayebisi, bapiblisite mpe biloko bandimi AVEC bazali kopesa.', news_public_home: 'Ebandeli ya bato nyonso', news_member_account: 'Kota na konti na ngai ya mondimi',
            news_intro_title: 'Landa bomoi ya polele ya AVEC', news_intro_text: 'Bandimi babimisaka mayebisi mpe bapiblisite na esika na bango ntango portefeuille ya SANDBOX ezali na motango oyo esengami.', news_privacy_text: 'Mikanda ya bato bayebani kaka, ya sekele to oyo elongolami emonanaka na lokasa oyo te. Nkombo ya mondimi emonanaka kaka soki profil na ye ezali ya bato nyonso.'
        }
    });
    const copy = {
        'AVEC — accueil membre': ['AVEC — member home', 'AVEC — urugo rw’umunyamuryango', 'AVEC — ikibuga c’umunywanyi', 'AVEC — nafasi ya mwanachama', 'AVEC — ndako ya mondimi'],
        'AVEC Communauté': ['AVEC Community', 'Umuryango AVEC', 'Umuryango AVEC', 'Jumuiya ya AVEC', 'Lisanga AVEC'],
        'Accueil public': ['Public home', 'Ahabanza rusange', 'Intango ya bose', 'Mwanzo wa umma', 'Ebandeli ya bato nyonso'],
        'Déconnexion': ['Sign out', 'Sohoka', 'Sohoka', 'Ondoka', 'Bima'],
        'Se connecter': ['Sign in', 'Injira', 'Injira', 'Ingia', 'Kota'],
        'Créer un compte': ['Create an account', 'Fungura konti', 'Fungura konti', 'Fungua akaunti', 'Fungola konti'],
        'Créer mon compte': ['Create my account', 'Fungura konti yanjye', 'Fungura konti yanje', 'Fungua akaunti yangu', 'Fungola konti na ngai'],
        'Créer un groupe': ['Create a group', 'Kora itsinda', 'Kora umugwi', 'Unda kikundi', 'Sala lisanga'],
        'Rejoindre un groupe': ['Join a group', 'Injira mu itsinda', 'Injira mu mugwi', 'Jiunge na kikundi', 'Kota na lisanga'],
        'Mon portefeuille': ['My wallet', 'Agasakoshi kanjye', 'Ikofi yanje', 'Pochi yangu', 'Portefeuille na ngai'],
        'Mon profil': ['My profile', 'Umwirondoro wanjye', 'Umwirondoro wanje', 'Wasifu wangu', 'Profil na ngai'],
        'Mes groupes': ['My groups', 'Amatsinda yanjye', 'Imigwi yanje', 'Vikundi vyangu', 'Masanga na ngai'],
        'Messages': ['Messages', 'Ubutumwa', 'Ubutumwa', 'Ujumbe', 'Bansango'],
        'Envoyer': ['Send', 'Ohereza', 'Rungika', 'Tuma', 'Tinda'],
        'Enregistrer': ['Save', 'Bika', 'Bika', 'Hifadhi', 'Bomba'],
        'Retour': ['Back', 'Subira', 'Subira', 'Rudi', 'Zonga'],
        'Annuler': ['Cancel', 'Kureka', 'Reka', 'Ghairi', 'Tika'],
        'Téléphone': ['Phone', 'Telefone', 'Telefone', 'Simu', 'Telefone'],
        'E-mail': ['Email', 'Imeyili', 'Imeyili', 'Barua pepe', 'Imeyili'],
        'Prénom': ['First name', 'Izina', 'Izina', 'Jina la kwanza', 'Nkombo'],
        'Nom': ['Last name', 'Izina', 'Izina', 'Jina la mwisho', 'Kombo'],
        'Pays': ['Country', 'Igihugu', 'Igihugu', 'Nchi', 'Mboka'],
        'Ville': ['City', 'Umujyi', 'Igisagara', 'Jiji', 'Engumba'],
        'Type': ['Type', 'Ubwoko', 'Ubwoko', 'Aina', 'Lolenge'],
        'Montant': ['Amount', 'Amafaranga', 'Amafaranga', 'Kiasi', 'Motango'],
        'Message': ['Message', 'Ubutumwa', 'Ubutumwa', 'Ujumbe', 'Nsango'],
        'Actualités': ['News', 'Kwamamaza', 'Amakuru', 'Habari', 'Bansango'],
        'Fil social': ['Social feed', 'Kwamamaza', 'Kwamamaza', 'Mlisho wa jamii', 'Nsango ya lisanga'],
        'Publier': ['Publish', 'Kwamamaza', 'Kwamamaza', 'Chapisha', 'Kobimisa'],
        'Commentaires publics': ['Public comments', 'Ibitekerezo rusange', 'Ivyiyumviro vya bose', 'Maoni ya umma', 'Makanisi ya bato nyonso'],
        'Ajouter un commentaire': ['Add a comment', 'Ongeraho igitekerezo', 'Shiramwo iciyumviro', 'Ongeza maoni', 'Bakisa likanisi'],
        'Commenter': ['Comment', 'Tanga igitekerezo', 'Tanga iciyumviro', 'Toa maoni', 'Tia likanisi'],
        'Afficher plus': ['Show more', 'Erekana ibindi', 'Raba vyinshi', 'Onyesha zaidi', 'Lakisa mingi'],
        'Appliquer les filtres': ['Apply filters', 'Koresha ayungurura', 'Shira mu ngiro ayunguruzi', 'Tumia vichujio', 'Salela baponi'],
        'Tout afficher': ['Show all', 'Erekana byose', 'Raba vyose', 'Onyesha yote', 'Lakisa nyonso'],
        'Chargement des actualités…': ['Loading news…', 'Kwamamaza amakuru…', 'Kwamamaza amakuru…', 'Inapakia habari…', 'Ezali kofungwama bansango…'],
        'Aucun mouvement.': ['No transactions.', 'Nta migendekere ihari.', 'Nta migendekere ihari.', 'Hakuna miamala.', 'Botamboli ezali te.'],
        'Aucun message.': ['No messages.', 'Nta butumwa.', 'Nta butumwa.', 'Hakuna ujumbe.', 'Nsango ezali te.'],
        'Accepter': ['Accept', 'Emera', 'Emera', 'Kubali', 'Ndima'],
        'Refuser': ['Decline', 'Kwanga', 'Kwanka', 'Kataa', 'Boya'],
        'Valider': ['Confirm', 'Emeza', 'Emeza', 'Thibitisha', 'Ndima'],
        'Langue de l’interface': ['Interface language', 'Ururimi rw’imigaragarire', 'Ururimi rw’urubuga', 'Lugha ya kiolesura', 'Lokóta ya etando']
    };
    Object.assign(copy, {
        'Votre compte plateforme': ['Your platform account', 'Konti yawe ya porogaramu', 'Konti yawe y’urubuga', 'Akaunti yako ya jukwaa', 'Konti na yo ya etando'],
        'Paiements réels indisponibles.': ['Real payments are unavailable.', 'Kwishyura nyakuri ntibihari.', 'Kwishura nyakuri ntikubaho.', 'Malipo halisi hayapatikani.', 'Kofuta ya solo ezali te.'],
        'La création est gratuite.': ['Creating an account is free.', 'Gufungura konti ni ubuntu.', 'Gufungura konti ni ku buntu.', 'Kufungua akaunti ni bure.', 'Kofungola konti ezali ofele.'],
        'PIN oublié ?': ['Forgot PIN?', 'Wibagiwe PIN?', 'Wibagiye PIN?', 'Umesahau PIN?', 'Obosani PIN?'],
        'Activer mon compte': ['Activate my account', 'Koresha konti yanjye', 'Koresha konti yanje', 'Washa akaunti yangu', 'Salisa konti na ngai'],
        'Demander le code': ['Request code', 'Saba kode', 'Saba kode', 'Omba msimbo', 'Senga kode'],
        'Vérifier le téléphone': ['Verify phone', 'Emeza telefone', 'Emeza telefone', 'Thibitisha simu', 'Ndima telefone'],
        'Vérifier l’e-mail': ['Verify email', 'Emeza imeyili', 'Emeza imeyili', 'Thibitisha barua pepe', 'Ndima imeyili'],
        'Réinitialiser le PIN': ['Reset PIN', 'Hindura PIN', 'Hindura PIN', 'Weka upya PIN', 'Bongisa lisusu PIN'],
        'Confirmer le nouveau PIN': ['Confirm new PIN', 'Emeza PIN nshya', 'Emeza PIN nshasha', 'Thibitisha PIN mpya', 'Ndima PIN ya sika'],
        'Nouveau PIN (4 chiffres)': ['New PIN (4 digits)', 'PIN nshya (imibare 4)', 'PIN nshasha (imibare 4)', 'PIN mpya (tarakimu 4)', 'PIN ya sika (mitango 4)'],
        'Code à 6 chiffres': ['6-digit code', 'Kode y’imibare 6', 'Kode y’imibare 6', 'Msimbo wa tarakimu 6', 'Kode ya mitango 6'],
        'Sélectionner un pays': ['Select a country', 'Hitamo igihugu', 'Hitamwo igihugu', 'Chagua nchi', 'Pona mboka'],
        'Numéro sans l’indicatif': ['Number without country code', 'Nomero idafite kode y’igihugu', 'Inomero idafise kode y’igihugu', 'Nambari bila msimbo wa nchi', 'Motango kozanga kode ya mboka'],
        'Les fonctionnalités de paiement sont en cours de configuration.': ['Payment features are being configured.', 'Serivisi zo kwishyura ziri gutegurwa.', 'Uburyo bwo kwishura buriko buratunganywa.', 'Vipengele vya malipo vinaandaliwa.', 'Misala ya kofuta ezali kobongisama.'],
        'Photo réelle du visage': ['Real face photo', 'Ifoto nyayo y’isura', 'Ifoto nyayo y’isura', 'Picha halisi ya uso', 'Elili ya solo ya elongi'],
        'Optionnelle à la création; image légère de 3 Mo maximum.': ['Optional when creating your account; lightweight image, 3 MB maximum.', 'Si ngombwa igihe ufungura konti; ifoto yoroheje ya 3 Mo ntarengwa.', 'Si ngombwa igihe ufungura konti; ifoto yoroshe ya 3 Mo ntarengwa.', 'Si lazima wakati wa kufungua akaunti; picha nyepesi ya upeo wa MB 3.', 'Ekoki kozala te ntango ya kofungola konti; elili ya pete, 3 Mo mingi te.'],
        'Numéro d’identité ou de passeport': ['Identity or passport number', 'Nomero y’irangamuntu cyangwa pasiporo', 'Inomero y’indangamuntu canke pasiporo', 'Nambari ya kitambulisho au pasipoti', 'Motango ya carte d’identité to passeport'],
        'Pays du téléphone': ['Phone country', 'Igihugu cya telefone', 'Igihugu ca telefone', 'Nchi ya simu', 'Mboka ya telefone'],
        'PIN (exactement 4 chiffres)': ['PIN (exactly 4 digits)', 'PIN (imibare 4 gusa)', 'PIN (imibare 4 gusa)', 'PIN (tarakimu 4 hasa)', 'PIN (mitango 4 kaka)'],
        'Aucun fichier choisi': ['No file chosen', 'Nta dosiye yatoranyijwe', 'Nta dosiye yatowe', 'Hakuna faili iliyochaguliwa', 'Fisyé moko eponami te'],
        'Espace AVEC': ['AVEC area', 'Umwanya AVEC', 'Ikibuga AVEC', 'Eneo la AVEC', 'Esika AVEC'],
        'Communauté sociale': ['Social community', 'Umuryango rusange', 'Umuryango rusangi', 'Jumuiya ya kijamii', 'Lisanga ya bato'],
        'Créez votre compte membre avant de rejoindre ou créer un groupe.': ['Create your member account before joining or creating a group.', 'Fungura konti y’umunyamuryango mbere yo kwinjira cyangwa gukora itsinda.', 'Fungura konti y’umunywanyi imbere yo kwinjira canke gukora umugwi.', 'Fungua akaunti yako ya mwanachama kabla ya kujiunga au kuunda kikundi.', 'Fungola konti na yo ya mondimi liboso ya kokota to kosala lisanga.'],
        'La création est gratuite. L’e-mail active le compte; le téléphone est vérifié ensuite pour les opérations sensibles.': ['Creating an account is free. Email activates the account; the phone is verified later for sensitive operations.', 'Gufungura konti ni ubuntu. Ime yemeza konti; telefone igenzurwa nyuma ku bikorwa by’ingenzi.', 'Gufungura konti ni ku buntu. Imeyili yemeza konti; telefone igenzurwa inyuma ku bikorwa bikomeye.', 'Kufungua akaunti ni bure. Barua pepe huamilisha akaunti; simu huthibitishwa baadaye kwa shughuli nyeti.', 'Kofungola konti ezali ofele. Imeyili ebandisaka konti; telefone endimamaka na sima mpo na misala ya bokengi.'],
        'Contacts, fil, annonces et publicités avec votre compte AVEC.': ['Contacts, feed, announcements and advertisements with your AVEC account.', 'Abo muziranye, urutonde, amatangazo n’iyamamaza ukoresheje konti ya AVEC.', 'Abo muziranye, urutonde, amatangazo n’ukwamamaza ukoresheje konti ya AVEC.', 'Mawasiliano, mlisho, matangazo na matangazo ya biashara kwa akaunti yako ya AVEC.', 'Bato bayebani, nsango, mayebisi mpe bapiblisite na konti na yo ya AVEC.'],
        'Présence et visibilité': ['Presence and visibility', 'Kuboneka n’ukugaragara', 'Kuboneka n’ukubonwa', 'Hali na mwonekano', 'Kozala mpe komonana'],
        'Enregistrer les réglages': ['Save settings', 'Bika igenamiterere', 'Bika ugutunganya', 'Hifadhi mipangilio', 'Bomba bobongisi'],
        'Alimenter mon portefeuille': ['Add funds to my wallet', 'Shyira amafaranga mu gasakoshi', 'Shira amafaranga mu ikofi', 'Weka fedha kwenye pochi', 'Tia mbongo na portefeuille'],
        'Créer le rechargement': ['Create top-up', 'Tegura kongera amafaranga', 'Tegura kwongera amafaranga', 'Unda ujazo', 'Sala kobakisa mbongo'],
        'Confirmer le rechargement SANDBOX': ['Confirm SANDBOX top-up', 'Emeza kongera amafaranga SANDBOX', 'Emeza kwongera amafaranga SANDBOX', 'Thibitisha ujazo wa SANDBOX', 'Ndima kobakisa mbongo SANDBOX'],
        'Groupes AVEC et Epargne': ['AVEC groups and savings', 'Amatsinda AVEC n’ubwizigame', 'Imigwi AVEC no kuziganya', 'Vikundi vya AVEC na akiba', 'Masanga AVEC mpe bobombi'],
        'Invitations reçues': ['Received invitations', 'Ubutumire bwakiriwe', 'Ubutumire bwakiriwe', 'Mialiko iliyopokelewa', 'Mabenga ezwami'],
        'Découvrir des membres': ['Discover members', 'Shakisha abanyamuryango', 'Rondera abanywanyi', 'Gundua wanachama', 'Luka bandimi'],
        'Contacts et messages': ['Contacts and messages', 'Abo muziranye n’ubutumwa', 'Abo muziranye n’ubutumwa', 'Anwani na ujumbe', 'Bato bayebani mpe bansango'],
        'Annonces et publicités': ['Announcements and advertisements', 'Amatangazo n’iyamamaza', 'Amatangazo n’ukwamamaza', 'Matangazo na matangazo ya biashara', 'Mayebisi mpe bapiblisite'],
        'Agenda social': ['Social calendar', 'Kalendari y’umuryango', 'Kalendari y’umuryango', 'Kalenda ya jamii', 'Kalendali ya lisanga'],
        'Mon espace membre AVEC': ['My AVEC member area', 'Umwanya wanjye wa AVEC', 'Ikibuga canje ca AVEC', 'Eneo langu la mwanachama AVEC', 'Esika na ngai ya mondimi AVEC'],
        'Gérer le compte AVEC': ['Manage AVEC account', 'Gucunga konti AVEC', 'Gucunga konti AVEC', 'Dhibiti akaunti ya AVEC', 'Yangela konti AVEC'],
        'Contribuer': ['Contribute', 'Tanga umusanzu', 'Tanga intererano', 'Changia', 'Pesa lisungi'],
        'Demander un crédit': ['Request credit', 'Saba inguzanyo', 'Saba ideni', 'Omba mkopo', 'Senga kredi'],
        'Rembourser': ['Repay', 'Ishyura inguzanyo', 'Rihira ideni', 'Lipa deni', 'Futa kredi'],
        'Retirer vers Momo': ['Withdraw to Momo', 'Kuramo ujya kuri Momo', 'Kurungika kuri Momo', 'Toa kwenda Momo', 'Bimisa na Momo'],
        'Mon registre': ['My ledger', 'Igitabo cyanjye', 'Igitabu canje', 'Daftari langu', 'Buku na ngai'],
        'Discussion du groupe': ['Group discussion', 'Ikiganiro cy’itsinda', 'Ikiganiro c’umugwi', 'Majadiliano ya kikundi', 'Masolo ya lisanga'],
        'Demandes d’adhésion': ['Membership requests', 'Ibisabwa byo kwinjira', 'Ubusabe bwo kwinjira', 'Maombi ya uanachama', 'Masengi ya bokoti'],
        'Clôturer le cycle': ['Close cycle', 'Funga icyiciro', 'Funga uruzitiro', 'Funga mzunguko', 'Kanga zongazonga'],
        'Nouveau cycle': ['New cycle', 'Icyiciro gishya', 'Uruzitiro rushasha', 'Mzunguko mpya', 'Zongazonga ya sika'],
        'Paramètres et règles': ['Settings and rules', 'Igenamiterere n’amategeko', 'Ugutunganya n’amategeko', 'Mipangilio na kanuni', 'Bobongisi mpe mibeko'],
        'Administration de la Plateforme AVEC': ['AVEC Platform administration', 'Ubuyobozi bwa porogaramu AVEC', 'Ubuyobozi bw’urubuga AVEC', 'Usimamizi wa Jukwaa la AVEC', 'Bokonzi ya Etando AVEC'],
        'Connexion Administration Plateforme': ['Platform administrator sign-in', 'Kwinjira kw’umuyobozi wa porogaramu', 'Kwinjira kw’umuyobozi w’urubuga', 'Kuingia kwa msimamizi wa jukwaa', 'Kokota ya mokonzi wa etando'],
        'Tableau de bord': ['Dashboard', 'Imbonerahamwe', 'Imbonerahamwe', 'Dashibodi', 'Etanda ya bokonzi'],
        'Statistiques de la plateforme': ['Platform statistics', 'Imibare ya porogaramu', 'Ibitigiri vy’urubuga', 'Takwimu za jukwaa', 'Mitango ya etando'],
        'Voir tous les groupes': ['View all groups', 'Reba amatsinda yose', 'Raba imigwi yose', 'Tazama vikundi vyote', 'Tala masanga nyonso'],
        'Voir tous les membres': ['View all members', 'Reba abanyamuryango bose', 'Raba abanywanyi bose', 'Tazama wanachama wote', 'Tala bandimi nyonso'],
        'Voir les alertes': ['View alerts', 'Reba impuruza', 'Raba imburi', 'Tazama arifa', 'Tala makebisi'],
        'Gérer les comptes Momo': ['Manage Momo accounts', 'Cunga konti Momo', 'Cunga konti Momo', 'Dhibiti akaunti za Momo', 'Yangela bakonti Momo'],
        'Actualités & publicités': ['News & advertisements', 'Amakuru n’iyamamaza', 'Amakuru n’ukwamamaza', 'Habari na matangazo', 'Bansango mpe bapiblisite'],
        'Filtrer les actualités': ['Filter news', 'Shungura amakuru', 'Yungurura amakuru', 'Chuja habari', 'Pona bansango'],
        'Fil public': ['Public feed', 'Urutonde rusange', 'Urutonde rwa bose', 'Mlisho wa umma', 'Nsango ya bato nyonso'],
        'Depuis le': ['From', 'Kuva ku', 'Kuva ku', 'Kuanzia', 'Kobanda na'],
        'Jusqu’au': ['To', 'Kugeza', 'Gushika', 'Hadi', 'Tii na'],
        'Voir et commenter dans le fil public': ['View and comment in the public feed', 'Reba kandi utange igitekerezo ku rutonde rusange', 'Raba kandi utange iciyumviro ku rutonde rwa bose', 'Tazama na utoe maoni kwenye mlisho wa umma', 'Tala mpe tia likanisi na nsango ya bato nyonso'],
        'élément(s) affiché(s).': ['item(s) displayed.', 'ikintu/ibintu byerekanwe.', 'ikintu/ibintu vyerekanwe.', 'kipengee/vipengee vimeonyeshwa.', 'eloko/biloko emonisami.'],
        'Aucune demande de crédit en attente.': ['No credit requests are pending.', 'Nta busabe bw’inguzanyo butegereje.', 'Nta busabe bw’ideni burindiriye.', 'Hakuna maombi ya mkopo yanayosubiri.', 'Lisengi ya kredi ezali kozela te.'],
        'Aucune demande d’adhésion en attente.': ['No membership requests are pending.', 'Nta busabe bwo kwinjira butegereje.', 'Nta busabe bwo kwinjira burindiriye.', 'Hakuna maombi ya uanachama yanayosubiri.', 'Lisengi ya bokoti ezali kozela te.'],
        'Registre du groupe AVEC': ['AVEC group ledger', 'Igitabo cy’itsinda AVEC', 'Igitabu c’umugwi AVEC', 'Daftari la kikundi cha AVEC', 'Buku ya lisanga AVEC'],
        'Mon registre de mouvements': ['My transaction ledger', 'Igitabo cy’imigendekere yanjye', 'Igitabu c’ibikorwa vyanje', 'Daftari langu la miamala', 'Buku na ngai ya botamboli']
    });
    let locale = LOCALES.includes(localStorage.getItem(STORAGE_KEY)) ? localStorage.getItem(STORAGE_KEY) : 'fr';
    const captured = [];

    function textFor(source, language) {
        if (language === 'fr') return source;
        const leading = source.match(/^\s*/)[0];
        const trailing = source.match(/\s*$/)[0];
        const value = copy[source.trim()];
        return value ? `${leading}${value[LOCALES.indexOf(language) - 1]}${trailing}` : source;
    }
    function t(key, fallback = key) {
        return (messages[locale] && messages[locale][key])
            || (landing[locale] && landing[locale][key])
            || textFor(fallback, locale);
    }
    function captureStatic() {
        const ignored = 'script, style, template, [data-i18n-ignore]';
        const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, {
            acceptNode(node) {
                if (!node.nodeValue.trim() || node.parentElement.closest(ignored)) return NodeFilter.FILTER_REJECT;
                return NodeFilter.FILTER_ACCEPT;
            }
        });
        let node;
        while ((node = walker.nextNode())) captured.push({ node, source: node.nodeValue });
        document.querySelectorAll('[placeholder], [title], [aria-label], [alt]').forEach(element => {
            if (element.closest(ignored)) return;
            ['placeholder', 'title', 'aria-label', 'alt'].forEach(attribute => {
                if (element.hasAttribute(attribute)) captured.push({ element, attribute, source: element.getAttribute(attribute) });
            });
        });
    }
    function apply(language, persist = true) {
        locale = LOCALES.includes(language) ? language : 'fr';
        document.documentElement.lang = locale;
        captured.forEach(item => {
            const value = textFor(item.source, locale);
            if (item.node) item.node.nodeValue = value;
            else item.element.setAttribute(item.attribute, value);
        });
        document.querySelectorAll('[data-i18n]').forEach(element => {
            const value = t(element.dataset.i18n, element.textContent);
            element.textContent = value;
        });
        document.querySelectorAll('[data-i18n-placeholder]').forEach(element => {
            element.placeholder = t(element.dataset.i18nPlaceholder, element.placeholder);
        });
        document.querySelectorAll('[data-file-label-for]').forEach(label => {
            const input = document.getElementById(label.dataset.fileLabelFor);
            label.textContent = input && input.files && input.files[0]
                ? input.files[0].name
                : t('no_file_chosen', 'Aucun fichier choisi');
        });
        document.querySelectorAll('[data-language-selector]').forEach(selector => { selector.value = locale; });
        if (persist) localStorage.setItem(STORAGE_KEY, locale);
        if (typeof window.CustomEvent === 'function') window.dispatchEvent(new CustomEvent('avec:localechange', { detail: { locale } }));
    }
    function initialize() {
        captureStatic();
        document.querySelectorAll('[data-language-selector]').forEach(selector => {
            selector.value = locale;
            selector.addEventListener('change', () => apply(selector.value));
        });
        document.querySelectorAll('input[type="file"]').forEach(input => {
            input.addEventListener('change', () => {
                document.querySelectorAll(`[data-file-label-for="${input.id}"]`).forEach(label => {
                    label.textContent = input.files && input.files[0]
                        ? input.files[0].name
                        : t('no_file_chosen', 'Aucun fichier choisi');
                });
            });
        });
        apply(locale, false);
    }
    window.AVEC_I18N = Object.freeze({ locales: LOCALES, names, t, apply, get locale() { return locale; } });
    // This script is placed after each page's markup and before code that requests API content.
    // Capturing now ensures only authored UI nodes, never later user content, are localized.
    initialize();
})();
