// ╔═══════════════════════════════════════════════════════════════════════╗
// ║  ERZEUGT — nicht von Hand aendern.                                    ║
// ║  Quelle: cable-planner scripts/katalog-uebernahme.mjs                 ║
// ╚═══════════════════════════════════════════════════════════════════════╝
//
// Die stabile Geraetetyp-Id (GDTF/DIN-SPEC-15800-analog: FixtureTypeID) je
// Katalog-Eintrag. Sie ist UUIDv5 ueber einen festen Namensraum und die
// Quell-Id dieses Repos — `avplan:camera:sony-fx6` und so weiter.
//
// WOZU SIE DA IST: damit ein Geraet, das zwischen den Planern wandert, sein
// Datenblatt AUTORITATIV wiederfindet statt ueber den Modellnamen geraten zu
// werden. Ein Name veraltet beim Umbenennen und existiert in zwei
// Schreibweisen; diese Id nicht.
//
// DIE NEUN VON HAND GESETZTEN GUIDS STEHEN WEITER IN `cameras.ts` und
// gewinnen: sie sind aelter als diese Ableitung, und eine gespeicherte
// Verknuepfung in einem Projektfile zeigt auf sie.
//
// Nachziehen: im cable-planner `npm run katalog:uebernahme`.

export const GERAETETYP_IDS: Record<string, Record<string, string>> = {
  fixture: {
    'etc-s4-19': '117a0db0-bf94-5669-a8db-f98eec23542b',
    'etc-s4-26': 'cadbf972-fc25-5f3b-bbec-37d6f045df45',
    'etc-s4-36': '7c31f263-34a4-53e6-a2fc-b9021179636b',
    'etc-s4-50': '93c2bdf8-9df5-5589-a8d3-69b1b2a08e9a',
    'etc-s4-zoom-15-30': '8361ab74-939f-5071-b03f-9bffa34eeb14',
    'etc-s4-zoom-25-50': 'ed76dda0-30af-5de5-8d1b-ede79b54781d',
    'etc-s4led-s3': '3827c007-b78d-5586-83e3-7fd27ac6fd59',
    'robert-juliat-714': '36cf4ce9-9cf3-55c3-9035-01e9662d1a00',
    'fresnel-1kw': '53c7d6dc-e989-52ad-aca1-ee4ced02752c',
    'fresnel-2kw': '579f8203-79d9-57a6-b43e-e1a37b586f12',
    'etc-cs-fresnel': '9823f454-4794-53f2-886f-76359a8a8c41',
    'par64-cp62-nsp': '23a92221-e667-5ae8-b89b-acc78b22703e',
    'par64-cp61-mfl': 'af2dea42-9c11-58a6-ac10-d07f5de91b12',
    'par64-cp60-wfl': 'bd59620e-48b1-5188-af1d-732e7cbf6c8b',
    'par56-mfl': '3418a9a5-3676-5c63-86f0-52efacfc3d3d',
    'adj-mega-hex-par': 'd9d01f71-235a-5ca4-88f6-6dbf71dd9e2b',
    'chauvet-colordash-h18ip': '498f378e-66e0-561b-a7da-cd452b787a43',
    'elation-sixpar-300': '4fce52ce-2ae3-5d18-9519-61f35969da2b',
    'generic-led-par-54x3': '865b9eb1-8650-5879-a480-6b5a1a9557a9',
    'etc-cs-par': '14841d82-3944-5554-bcaa-d78e53c21e27',
    'martin-mac-aura-xb': 'b9c15eff-71e6-59ef-8dcc-13889e69dca6',
    'robe-robin-600-ledwash': 'e17deb7a-ba83-5452-b75f-d83329009e19',
    'robe-robin-ledbeam-150': 'cb9b8289-30d9-5e1f-8163-d77fa8a3393e',
    'chauvet-rogue-r2-wash': '7eb958a6-fc82-5c22-8e83-c353cb5a13c6',
    'martin-mac-aura-pxl': '62fbb53f-3959-5cec-ae1b-4c0571afd8db',
    'glp-impression-x4': 'b667bdda-06fa-5056-90b0-ef6e4e2247ed',
    'robe-robin-spiider': 'b0f59594-2c1b-5dd5-ad65-4d194c992ff8',
    'martin-mac-viper-profile': '5b75c0ef-1bb2-5899-8f3e-d4b9dfa8fdb1',
    'robe-robin-t1-profile': 'c11d9434-c6cb-5c14-8fe4-332ea5919548',
    'chauvet-maverick-mk3-profile': '58adbee0-480e-5f7a-877d-c299560561fb',
    'ayrton-ghibli': 'a5b53e3e-687b-5ec5-b8f9-7c96145e300c',
    'ayrton-diablo': 'f436bb46-92cb-57ce-aaf1-7e8a43dd94eb',
    'ayrton-khamsin': '1286a06d-2bfe-5135-871d-f03c55130a47',
    'ayrton-domino-lt': '07e17c59-7c9b-58d6-a95e-7c0737f846b6',
    'ayrton-mistral': '498acb9f-b21c-584c-9e39-5b7b66baa529',
    'ayrton-perseo-profile': 'd4848bc8-de5d-5dfc-876a-051b6e2494fa',
    'ayrton-karif-lt': '59fb96b2-7908-53e2-85f6-7c52e9a58238',
    'ayrton-bora': '451fe6f2-a4a6-5d59-8c10-225d28fd9fdc',
    'etc-s4-led-s3-lustr': 'f46ff924-31b9-530c-95a7-13d7d75aec9c',
    'etc-colorsource-spot': '412d5d24-9480-578a-ac80-84416e683ede',
    'chauvet-maverick-storm-1-wash': '7e8d8404-888f-572b-9123-0ff5823d8248',
    'elation-proteus-maximus': '05f103da-1fe7-55b3-900b-9c1cae1bf020',
    'robe-iforte-ltx': 'eb40e6c0-2d0e-52ca-9d3c-cd242c9d8e8d',
    'martin-mac-encore-perf-cld': '3a895c44-3452-5682-ae78-690461071774',
    'martin-mac-aura-xip': 'e81f83e0-cc1c-52f4-a695-3ca096a2f860',
    'elation-fuze-max-profile': 'd33df562-e105-5c2a-823c-fb4dbc46aaab',
    'sgm-p6': '31d2f286-288a-5c98-9c97-45d3a8d96c96',
    'adj-vizi-beam-12rx': '4378a04e-cdaf-5a5b-9e50-a9817c7324a8',
    'astera-ax1-pixeltube': '8f891f4e-4d42-5695-aa6f-ccfff3676426',
    'chauvet-rogue-r2-spot': 'd737359b-76ef-5778-b939-de0be15e435c',
    'chauvet-colordash-par-h12x': 'ba49326f-4dec-59c3-9efb-bb761ea74ed1',
    'robe-ledbeam-350': '775edb32-e844-5ef5-a53b-6c36ebfc640f',
    'elation-kl-panel-xl': 'c602414a-c103-5d08-aceb-b220104a1fb4',
    'adj-focus-spot-6z': 'f0b70451-b5fa-523a-a6a7-b3003808d003',
    'chauvet-rogue-r1-beamwash': '7c222cb4-33ee-5a97-94a1-fa78f2a3f29b',
    'cameo-opus-s5': '206ee8d8-6385-5e93-8225-aab31681c806',
    'cameo-opus-h5': '659988f9-e127-5919-a768-a76d31ea6572',
    'cameo-otos-h5': 'c4e53a9f-0d16-5bc4-9a92-cefe301e90a5',
    'cameo-otos-sp6': 'ef967c1f-6fb1-52e2-be2b-76db0e9450cf',
    'cameo-evos-s3': '53dbe488-28cc-50d9-bb22-293d7105b705',
    'cameo-evos-w7': '64cd7e39-c26c-5546-8a90-71a5655328b7',
    'cameo-otos-b5': '069a3592-38bd-5e5a-98b7-c92b1c2f6b4f',
    'cameo-movo-beam-z100': 'db86199c-9846-5e5e-bcec-0e091c00f5ed',
    'robe-robin-megapointe': 'c745018b-fc13-5728-9d96-d859e935961f',
    'robe-robin-pointe': '85ef7824-019c-5025-a06e-13812288c7db',
    'claypaky-mythos2': '679a8cda-3b99-5110-9856-0f5de2bf1329',
    'claypaky-sharpy': '5e60456d-aa2b-5369-9e18-b1daec7db55c',
    'molefay-4lite': '10ca3253-1c46-5247-9caf-3ec6837d8a44',
    'martin-atomic-3000': 'bf3fc067-dc05-5340-8e3c-500abaf50757',
    'etc-cs-cyc': '77004e9d-fb4e-593a-aa6a-5de69f04217b',
    'arri-cyc-1250': '6b471748-ebfd-5fb1-8763-224490b6552e',
    'etc-desire-d22': '0b29f3b9-fa3e-58ee-af28-22f9b9257ea2',
    'etc-desire-d40': '2e17484d-da93-50be-92c5-99c918b7d9db',
    'philips-colorblast-12': '1aed3908-60da-5a51-a50a-51678aaa57b9',
    'robert-juliat-cyrano': 'fe0a02b4-2b8e-5091-9168-74210a327026',
    'aputure-ls-600x-pro': 'bd60702e-1376-5293-9f71-6bb6091a08cd',
    'aputure-ls-300x-ii': '4fbfbbe1-3400-5d06-bb72-8a481e7851da',
    'elation-kl-fresnel-8-fc': 'c2314f8d-c3e2-506f-a8de-c1167c89d725',
    'elation-kl-fresnel-6-fc': 'd2062df8-0698-5123-a476-ecf9ad5d1809',
    'elation-kl-panel-fc': '4a58b27f-dcc4-505d-b156-bf5f06141d38',
    'elation-kl-profile-fc': '048c31ba-130e-557a-be80-b73a9d4b6e75',
    'elation-kl-par-fc': '97d7c9cd-c369-546c-9de6-d86fd87c61dd',
    'elation-fuze-wash-z350': '676ac255-ca48-57d7-8704-0095093c92db',
    'elation-fuze-par-z120': 'd251500e-6016-5baa-bdd2-1f8418705de3',
  },
};

/** Die Geraetetyp-Id zu einer Quell-Id, oder `undefined` wenn keine erzeugt
 *  wurde. `undefined` heisst „zu diesem Geraet gibt es keinen Katalog-Eintrag"
 *  und ist eine Auskunft — nicht ein Grund, eine Id zu erfinden. */
export const geraetetypIdVon = (
  bereich: string,
  quellId: string | undefined,
): string | undefined => (quellId ? GERAETETYP_IDS[bereich]?.[quellId] : undefined);
