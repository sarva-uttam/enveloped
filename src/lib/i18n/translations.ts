export const LOCALES = [
  { code: "en", label: "English" },
  { code: "fr", label: "Français" },
  { code: "hi", label: "हिन्दी" },
  { code: "ta", label: "தமிழ்" },
  { code: "te", label: "తెలుగు" },
  { code: "mr", label: "मराठी" },
  { code: "mfe", label: "Kreol Morisien" },
] as const;

export type LocaleCode = (typeof LOCALES)[number]["code"];

export const DEFAULT_LOCALE: LocaleCode = "en";

// First-pass coverage: navbar + hero only. Everything else on the site
// currently renders in English regardless of the selected locale — this is
// an intentional, incremental rollout (see AGENTS.md / project notes), not
// a bug. Expand section by section by adding keys here and swapping the
// matching JSX to t("...").
export const TRANSLATIONS: Record<LocaleCode, Record<string, string>> = {
  en: {
    "nav.templates": "Templates",
    "nav.pricing": "Pricing",
    "nav.howItWorks": "How it works",
    "nav.myInvites": "My invites",
    "nav.startMyInvite": "Start my invite",
    "hero.badge": "Thoughtfully crafted digital invites",
    "hero.headline1": "Skip the printer.",
    "hero.headline2Pre": "Send a ",
    "hero.headline2Italic": "moment",
    "hero.headline2Post": " instead.",
    "hero.paragraph":
      "A digital invite platform built for weddings — and everything else worth celebrating. Answer a few questions, we'll write and design it, then deliver it as an irresistible “click me” — not a link full of gibberish.",
    "hero.ctaPrimary": "Start my invite",
    "hero.ctaSecondary": "See templates",
  },
  fr: {
    "nav.templates": "Modèles",
    "nav.pricing": "Tarifs",
    "nav.howItWorks": "Comment ça marche",
    "nav.myInvites": "Mes invitations",
    "nav.startMyInvite": "Créer mon invitation",
    "hero.badge": "Des invitations numériques soignées",
    "hero.headline1": "Oubliez l'imprimante.",
    "hero.headline2Pre": "Envoyez un ",
    "hero.headline2Italic": "moment",
    "hero.headline2Post": " à la place.",
    "hero.paragraph":
      "Une plateforme d'invitations numériques pensée pour les mariages — et tout ce qui mérite d'être célébré. Répondez à quelques questions, nous rédigeons et concevons votre invitation, puis la livrons comme un irrésistible « clique ici » — pas un lien illisible.",
    "hero.ctaPrimary": "Créer mon invitation",
    "hero.ctaSecondary": "Voir les modèles",
  },
  hi: {
    "nav.templates": "टेम्पलेट्स",
    "nav.pricing": "मूल्य",
    "nav.howItWorks": "यह कैसे काम करता है",
    "nav.myInvites": "मेरे निमंत्रण",
    "nav.startMyInvite": "अपना निमंत्रण बनाएं",
    "hero.badge": "खूबसूरती से तैयार डिजिटल निमंत्रण",
    "hero.headline1": "प्रिंटर को छोड़ दें।",
    "hero.headline2Pre": "इसके बजाय एक ",
    "hero.headline2Italic": "पल",
    "hero.headline2Post": " भेजें।",
    "hero.paragraph":
      "शादियों के लिए बना एक डिजिटल निमंत्रण मंच — और हर वो मौका जो मनाने लायक है। कुछ सवालों के जवाब दें, हम इसे लिखेंगे और डिज़ाइन करेंगे, फिर इसे एक आकर्षक “क्लिक करें” के रूप में भेजेंगे — बेतरतीब लिंक नहीं।",
    "hero.ctaPrimary": "अपना निमंत्रण बनाएं",
    "hero.ctaSecondary": "टेम्पलेट्स देखें",
  },
  ta: {
    "nav.templates": "வார்ப்புருக்கள்",
    "nav.pricing": "விலை",
    "nav.howItWorks": "இது எப்படி செயல்படுகிறது",
    "nav.myInvites": "எனது அழைப்பிதழ்கள்",
    "nav.startMyInvite": "எனது அழைப்பிதழை உருவாக்கு",
    "hero.badge": "அழகாக வடிவமைக்கப்பட்ட டிஜிட்டல் அழைப்பிதழ்கள்",
    "hero.headline1": "பிரிண்டரை தவிர்க்கவும்.",
    "hero.headline2Pre": "அதற்கு பதிலாக ஒரு ",
    "hero.headline2Italic": "தருணத்தை",
    "hero.headline2Post": " அனுப்புங்கள்.",
    "hero.paragraph":
      "திருமணங்களுக்காக உருவாக்கப்பட்ட டிஜிட்டல் அழைப்பிதழ் தளம் — கொண்டாட தகுதியான அனைத்திற்கும். சில கேள்விகளுக்கு பதிலளியுங்கள், நாங்கள் அதை எழுதி வடிவமைப்போம், பின்னர் ஒரு கவர்ச்சிகரமான “இங்கே கிளிக் செய்யவும்” ஆக வழங்குவோம் — குழப்பமான இணைப்பு அல்ல.",
    "hero.ctaPrimary": "எனது அழைப்பிதழை உருவாக்கு",
    "hero.ctaSecondary": "வார்ப்புருக்களைப் பார்",
  },
  te: {
    "nav.templates": "టెంప్లేట్‌లు",
    "nav.pricing": "ధర",
    "nav.howItWorks": "ఇది ఎలా పనిచేస్తుంది",
    "nav.myInvites": "నా ఆహ్వానాలు",
    "nav.startMyInvite": "నా ఆహ్వానాన్ని ప్రారంభించండి",
    "hero.badge": "శ్రద్ధగా రూపొందించిన డిజిటల్ ఆహ్వానాలు",
    "hero.headline1": "ప్రింటర్‌ను వదిలేయండి.",
    "hero.headline2Pre": "బదులుగా ఒక ",
    "hero.headline2Italic": "క్షణాన్ని",
    "hero.headline2Post": " పంపండి.",
    "hero.paragraph":
      "పెళ్లిళ్ల కోసం రూపొందించిన డిజిటల్ ఆహ్వాన వేదిక — మరియు జరుపుకోదగిన ప్రతిదానికీ. కొన్ని ప్రశ్నలకు సమాధానం ఇవ్వండి, మేము దాన్ని రాసి డిజైన్ చేస్తాము, ఆపై దాన్ని ఆకర్షణీయమైన “క్లిక్ చేయండి”గా అందిస్తాము — గందరగోళమైన లింక్ కాదు.",
    "hero.ctaPrimary": "నా ఆహ్వానాన్ని ప్రారంభించండి",
    "hero.ctaSecondary": "టెంప్లేట్‌లను చూడండి",
  },
  mr: {
    "nav.templates": "टेम्पलेट्स",
    "nav.pricing": "किंमत",
    "nav.howItWorks": "हे कसे कार्य करते",
    "nav.myInvites": "माझी आमंत्रणे",
    "nav.startMyInvite": "माझे आमंत्रण तयार करा",
    "hero.badge": "काळजीपूर्वक तयार केलेली डिजिटल आमंत्रणे",
    "hero.headline1": "प्रिंटर विसरा.",
    "hero.headline2Pre": "त्याऐवजी एक ",
    "hero.headline2Italic": "क्षण",
    "hero.headline2Post": " पाठवा.",
    "hero.paragraph":
      "लग्नांसाठी — आणि साजरे करण्यासारख्या प्रत्येक गोष्टीसाठी तयार केलेला डिजिटल आमंत्रण प्लॅटफॉर्म. काही प्रश्नांची उत्तरे द्या, आम्ही ते लिहू आणि डिझाइन करू, आणि नंतर ते एका आकर्षक “इथे क्लिक करा” म्हणून पाठवू — गोंधळात टाकणारी लिंक नाही.",
    "hero.ctaPrimary": "माझे आमंत्रण तयार करा",
    "hero.ctaSecondary": "टेम्पलेट्स पहा",
  },
  mfe: {
    "nav.templates": "Modèl",
    "nav.pricing": "Pri",
    "nav.howItWorks": "Kouma li marse",
    "nav.myInvites": "Mo bann invitasion",
    "nav.startMyInvite": "Kree mo invitasion",
    "hero.badge": "Bann invitasion dizital kree avek swin",
    "hero.headline1": "Bliye printing.",
    "hero.headline2Pre": "Avoy enn ",
    "hero.headline2Italic": "moment",
    "hero.headline2Post": " dan so plas.",
    "hero.paragraph":
      "Enn platform invitasion dizital kree pou maryaz — ek tou lezot moman ki merit selebre. Reponn zis detrwa kestion, nou pou ekrir ek kree design-la pou ou, apre nou pou livre li kouma enn “klik lor mwa” ki donn envi — pa enn lien ranpli ar bann zafer ki pa konpran.",
    "hero.ctaPrimary": "Kree mo invitasion",
    "hero.ctaSecondary": "Get bann modèl",
  },
};
