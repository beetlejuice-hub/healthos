/**
 * The stack-check knowledge base: what you might take, and what's known about each pair.
 *
 * Curated by hand, never generated. Every rule carries its evidence grade, its sources and the
 * date it was reviewed, and `verified: false` until someone has checked it against the full source
 * (the first pass, 30 Sept 2026, could only see search summaries — the sandbox blocks PubMed,
 * JAMA and MSKCC). Wording: "may", "goes with", "ask your doctor"; never a dose, never "stop".
 * Plan: the "HealthOS — Stack check" doc.
 */

export type ItemKind = "supplement" | "drink" | "medication" | "condition";
export type Item = { key: string; name: string; kind: ItemKind; /** Names people type, any language; matched accent- and case-insensitively as whole words. */ aka: string[] };

export type Verdict = "avoid" | "caution" | "timing" | "mixed" | "may-help" | "none";
export type Grade = "strong" | "moderate" | "limited" | "theoretical";
export type Source = { title: string; url: string };
export type Rule = { a: string; b: string; verdict: Verdict; grade: Grade; say: string; sources: Source[]; reviewed: string; verified: boolean };
/** Something worth asking a doctor about, shown when you have the condition and don't take it. */
export type AskAbout = { condition: string; item: string; /** Show even if you already take it. */ always?: boolean; say: string; grade: Grade; sources: Source[]; reviewed: string; verified: boolean };

export const ITEMS: Item[] = [
  // conditions
  { key: "psoriasis", name: "Psoriasis", kind: "condition", aka: ["psoriasis", "psoriatic", "pikkelysömör", "pikkelysomor"] },
  // drinks (checked from what you log, not from the stack)
  { key: "alcohol", name: "Alcohol", kind: "drink", aka: ["alcohol", "alkohol", "beer", "wine", "sör", "bor", "pálinka"] },
  { key: "caffeine", name: "Coffee / caffeine", kind: "drink", aka: ["caffeine", "coffee", "koffein", "kávé", "espresso"] },
  // supplements
  { key: "vitamin-d", name: "Vitamin D", kind: "supplement", aka: ["vitamin d", "vitamin d3", "vitamin d2", "d3", "d-vitamin", "d vitamin", "cholecalciferol", "kolekalciferol"] },
  { key: "black-cumin", name: "Black cumin seed oil", kind: "supplement", aka: ["black cumin", "black seed", "black seed oil", "nigella", "nigella sativa", "fekete kömény", "feketekömény", "kalonji"] },
  { key: "saffron", name: "Saffron", kind: "supplement", aka: ["saffron", "sáfrány", "affron", "crocus sativus"] },
  { key: "magnesium", name: "Magnesium", kind: "supplement", aka: ["magnesium", "magnézium", "mg bisglycinate", "mg citrate"] },
  { key: "creatine", name: "Creatine", kind: "supplement", aka: ["creatine", "kreatin", "creatine monohydrate"] },
  { key: "fish-oil", name: "Fish oil (omega-3)", kind: "supplement", aka: ["fish oil", "omega 3", "omega-3", "halolaj", "epa", "dha"] },
  { key: "vitamin-a", name: "Vitamin A", kind: "supplement", aka: ["vitamin a", "a-vitamin", "a vitamin", "retinol", "retinyl"] },
  { key: "st-johns-wort", name: "St John's wort", kind: "supplement", aka: ["st john's wort", "st johns wort", "st. john's wort", "st john", "hypericum", "orbáncfű"] },
  // medications (psoriasis treatments + the classes the rules need)
  { key: "methotrexate", name: "Methotrexate", kind: "medication", aka: ["methotrexate", "metotrexát", "metotrexat", "trexan", "metoject"] },
  { key: "acitretin", name: "Acitretin", kind: "medication", aka: ["acitretin", "soriatane", "neotigason"] },
  { key: "cyclosporine", name: "Cyclosporine", kind: "medication", aka: ["cyclosporine", "ciclosporin", "ciklosporin", "neoral", "sandimmun"] },
  { key: "apremilast", name: "Apremilast", kind: "medication", aka: ["apremilast", "otezla"] },
  { key: "calcipotriol", name: "Calcipotriol cream", kind: "medication", aka: ["calcipotriol", "calcipotriene", "daivonex", "daivobet", "enstilar", "xamiol", "wynzora", "dovonex"] },
  { key: "ssri", name: "Antidepressant (SSRI/SNRI)", kind: "medication", aka: ["ssri", "snri", "antidepressant", "sertraline", "sertralin", "escitalopram", "citalopram", "fluoxetine", "fluoxetin", "paroxetine", "paroxetin", "venlafaxine", "venlafaxin", "duloxetine", "duloxetin"] },
  { key: "blood-thinner", name: "Blood thinner", kind: "medication", aka: ["blood thinner", "anticoagulant", "warfarin", "apixaban", "rivaroxaban", "dabigatran", "clopidogrel", "eliquis", "xarelto", "aspirin"] },
  { key: "bp-meds", name: "Blood-pressure medication", kind: "medication", aka: ["blood pressure", "amlodipine", "amlodipin", "ramipril", "lisinopril", "perindopril", "losartan", "valsartan", "telmisartan", "bisoprolol", "metoprolol", "nebivolol", "indapamide", "hydrochlorothiazide"] },
  { key: "chelating-antibiotic", name: "Tetracycline / quinolone antibiotic", kind: "medication", aka: ["doxycycline", "doxycyclin", "tetracycline", "minocycline", "ciprofloxacin", "levofloxacin", "moxifloxacin", "cipro"] },
  { key: "bisphosphonate", name: "Bisphosphonate", kind: "medication", aka: ["alendronate", "alendronat", "risedronate", "ibandronate", "fosamax", "bisphosphonate"] },
];

const R = "2026-09-30";
const src = {
  alcoholMeta: { title: "Dose–response meta-analysis, alcohol and psoriasis (2024)", url: "https://pubmed.ncbi.nlm.nih.gov/38679782/" },
  alcoholReview: { title: "Alcohol and psoriasis review, Am J Clin Dermatol (2022)", url: "https://link.springer.com/10.1007/s40257-022-00713-z" },
  mtxGuideline: { title: "AAD–NPF guideline, systemic non-biologic therapies (2020)", url: "https://www.jaad.org/article/S0190-9622(20)30284-X/fulltext" },
  mtxAlcohol: { title: "Alcohol during low-dose weekly methotrexate, Pharmaceutical Journal", url: "https://pharmaceutical-journal.com/article/ld/alcohol-consumption-during-low-dose-weekly-methotrexate-therapy" },
  acitretinLabel: { title: "Acitretin label (DailyMed)", url: "https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=a6546625-acb8-460e-b34e-f795bfb3680a" },
  acitretinVitA: { title: "Acitretin + vitamin A interaction (Drugs.com)", url: "https://www.drugs.com/drug-interactions/acitretin-with-vitamin-a-98-0-2303-0.html" },
  vitdJama: { title: "Vitamin D in psoriasis with lower levels, RCT, JAMA Dermatology (2023)", url: "https://jamanetwork.com/journals/jamadermatology/fullarticle/2802780" },
  vitdRct2018: { title: "Oral vitamin D3 for plaque psoriasis, RCT (2018)", url: "https://pubmed.ncbi.nlm.nih.gov/29480035/" },
  vitdD2: { title: "Oral vitamin D2 in psoriasis, RCT (2019)", url: "https://www.ncbi.nlm.nih.gov/pmc/articles/PMC6500602/" },
  calcipotriene: { title: "Calcipotriene (Mayo Clinic)", url: "https://www.mayoclinic.org/drugs-supplements/calcipotriene-topical-route/description/drg-20067223" },
  calcitriolLabel: { title: "Calcitriol prescribing information (Drugs.com)", url: "https://www.drugs.com/pro/calcitriol.html" },
  nigellaMskcc: { title: "Nigella sativa (Memorial Sloan Kettering)", url: "https://www.mskcc.org/cancer-care/integrative-medicine/herbs/nigella-sativa" },
  nigellaTrial: { title: "Nigella sativa in psoriasis, clinical study (Basrah)", url: "https://www.jceionline.org/download/evaluation-of-efficacy-safety-and-antioxidant-effect-of-nigella-sativa-in-patients-with-psoriasis-a-3557.pdf" },
  saffronWebmd: { title: "Saffron monograph (WebMD)", url: "https://www.webmd.com/vitamins/ai/ingredientmono-844/saffron" },
  saffronBp: { title: "Saffron and blood pressure, meta-analysis (2021)", url: "https://www.ncbi.nlm.nih.gov/pmc/articles/PMC8398601/" },
  magnesiumOds: { title: "Magnesium fact sheet (NIH Office of Dietary Supplements)", url: "https://ods.od.nih.gov/factsheets/Magnesium-HealthProfessional/" },
  creatineIssn: { title: "ISSN position stand: creatine safety (2017)", url: "https://www.ncbi.nlm.nih.gov/pmc/articles/PMC5469049/" },
  creatineMyths: { title: "Creatine questions and misconceptions, JISSN (2021)", url: "https://link.springer.com/article/10.1186/s12970-021-00412-w" },
  coffeeNhs: { title: "Coffee, caffeine and psoriasis, Nurses' Health Study II (2012)", url: "https://jamanetwork.com/journals/jamadermatology/fullarticle/1105505" },
  sjwCyclo: { title: "Cyclosporine + St John's wort (Drugs.com)", url: "https://www.drugs.com/drug-interactions/cyclosporine-with-st-john-s-wort-763-0-2106-0.html" },
  sjwReview: { title: "St John's wort interactions, clinical update (PMC)", url: "https://pmc.ncbi.nlm.nih.gov/articles/PMC2782080/" },
  apremilastEma: { title: "Otezla (apremilast) product information (EMA)", url: "https://www.ema.europa.eu/en/documents/product-information/otezla-epar-product-information_en.pdf" },
  aadAlt: { title: "AAD–NPF guideline, topical and alternative therapies (2021)", url: "https://www.jaad.org/article/S0190-9622(20)32288-X/fulltext" },
};

const rule = (a: string, b: string, verdict: Verdict, grade: Grade, say: string, sources: Source[]): Rule => ({ a, b, verdict, grade, say, sources, reviewed: R, verified: false });

export const RULES: Rule[] = [
  rule("alcohol", "psoriasis", "caution", "moderate",
    "More drinking goes with more severe psoriasis, most clearly above about 45 g of alcohol a day (roughly 3 drinks). Heavier drinking is also linked to a weaker response to systemic treatments.",
    [src.alcoholMeta, src.alcoholReview]),
  rule("alcohol", "methotrexate", "avoid", "strong",
    "Methotrexate and alcohol both load the liver. Guidelines treat heavy drinking as a reason not to use methotrexate, and advise keeping any alcohol low — follow your doctor's limit.",
    [src.mtxGuideline, src.mtxAlcohol]),
  rule("alcohol", "acitretin", "avoid", "strong",
    "Alcohol turns acitretin into etretinate, which stays in the body for months. The label says women must not drink at all during treatment and for 2 months after.",
    [src.acitretinLabel]),
  rule("vitamin-d", "psoriasis", "mixed", "limited",
    "Low vitamin D levels go with worse psoriasis, but most placebo-controlled trials of supplements found no improvement in the skin (one small trial did). Worth knowing your blood level rather than expecting a skin effect.",
    [src.vitdJama, src.vitdRct2018, src.vitdD2]),
  rule("vitamin-d", "calcipotriol", "caution", "limited",
    "Calcipotriol is a vitamin D analogue. High-dose vitamin D on top of heavy cream use adds up on blood calcium; normal doses with normal cream use are rarely a problem. Mention the supplement to your doctor.",
    [src.calcipotriene, src.calcitriolLabel]),
  rule("vitamin-a", "acitretin", "avoid", "strong",
    "Acitretin is a vitamin A relative; adding vitamin A supplements raises the risk of vitamin A overload. The label says not to combine them unless your doctor says so.",
    [src.acitretinVitA]),
  rule("black-cumin", "psoriasis", "mixed", "limited",
    "A small study found a black seed oil ointment helped plaques; there's no solid evidence for taking the oil by mouth. Applied to skin, the oil itself can cause contact dermatitis.",
    [src.nigellaTrial, src.nigellaMskcc]),
  rule("black-cumin", "cyclosporine", "caution", "theoretical",
    "Black seed may change how the liver clears some drugs (CYP450 enzymes); how much that matters in people isn't known. Cyclosporine levels are sensitive to exactly this — tell your doctor you take it.",
    [src.nigellaMskcc]),
  rule("black-cumin", "apremilast", "caution", "theoretical",
    "Black seed may change how the liver clears some drugs (CYP450 enzymes), and apremilast is cleared that way. Clinical impact unknown — mention it to your doctor.",
    [src.nigellaMskcc]),
  rule("saffron", "ssri", "caution", "theoretical",
    "Saffron has antidepressant-like effects; on top of an SSRI/SNRI the effects may add up. Tell whoever prescribes it.",
    [src.saffronWebmd]),
  rule("saffron", "blood-thinner", "caution", "theoretical",
    "Saffron may slightly slow blood clotting, which could add to a blood thinner's effect.",
    [src.saffronWebmd]),
  rule("saffron", "bp-meds", "caution", "limited",
    "Saffron can lower blood pressure a little; with blood-pressure medication it might push it too low.",
    [src.saffronWebmd, src.saffronBp]),
  rule("magnesium", "chelating-antibiotic", "timing", "strong",
    "Magnesium binds these antibiotics in the gut. Take the antibiotic at least 2 hours before or 4–6 hours after magnesium.",
    [src.magnesiumOds]),
  rule("magnesium", "bisphosphonate", "timing", "strong",
    "Magnesium lowers absorption of oral bisphosphonates. Keep them at least 2 hours apart.",
    [src.magnesiumOds]),
  rule("creatine", "methotrexate", "caution", "moderate",
    "Creatine raises blood creatinine without harming the kidneys — but methotrexate needs kidney blood tests, and a raised creatinine can look like a problem. Tell your doctor you take creatine.",
    [src.creatineIssn, src.creatineMyths]),
  rule("creatine", "cyclosporine", "caution", "moderate",
    "Creatine raises blood creatinine without harming the kidneys — but cyclosporine needs close kidney monitoring, and a raised creatinine can look like damage. Tell your doctor you take creatine.",
    [src.creatineIssn, src.creatineMyths]),
  rule("caffeine", "psoriasis", "none", "moderate",
    "In 82,539 women followed for 14 years, coffee and caffeine weren't linked to psoriasis once smoking was accounted for.",
    [src.coffeeNhs]),
  rule("st-johns-wort", "cyclosporine", "avoid", "strong",
    "St John's wort speeds up cyclosporine's breakdown; in transplant patients levels dropped by about half. Don't combine without your doctor.",
    [src.sjwCyclo, src.sjwReview]),
  rule("st-johns-wort", "apremilast", "avoid", "strong",
    "St John's wort cuts apremilast levels sharply (a strong inducer cut exposure by 72%), so it may stop working. The label advises against combining them.",
    [src.apremilastEma]),
];

export const ASK_ABOUT: AskAbout[] = [
  { condition: "psoriasis", item: "fish-oil", grade: "limited", reviewed: R, verified: false, sources: [src.aadAlt],
    say: "Fish oil doesn't work on its own, but the AAD–NPF guideline says it may add to other psoriasis treatments." },
  { condition: "psoriasis", item: "vitamin-d", always: true, grade: "limited", reviewed: R, verified: false, sources: [src.vitdJama, src.vitdD2],
    say: "A vitamin D blood test: the few trials that found a benefit were in people with low levels." },
];
