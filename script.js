/* ==========================================================================
   Maatora | Cold-Chain Monitoring
   Single state object, role-based views, incident simulation, alert history,
   English and Arabic interfaces, and the printable compliance certificate
   with a scannable verification code. No dependencies.
   ========================================================================== */
'use strict';

/* --------------------------------------------------------------------------
   Constants
   -------------------------------------------------------------------------- */
const EXCURSION_DELTA_C = 9;
const LIVE_TICK_MS = 4000;
const ETA_TICK_MS = 60000;
const HISTORY_POINTS = 32;
const AUDIT_LOG_VISIBLE = 12;
const TOAST_MS = 3200;
const MAX_SIGN_IN_ATTEMPTS = 5;
const LOCKOUT_MS = 30000;
const IDLE_LIMIT_MS = { client: 30 * 60000, admin: 10 * 60000 };
const SESSION_KEY = 'maatora.session';
const LANG_KEY = 'maatora.lang';
const VERIFY_PREFIX = '#verify=';
const VERIFY_DIGEST_LENGTH = 32;

const ROUTE_STEPS = [
  'Origin Departure',
  'Highway In-Transit',
  'Regional Inspection Hub',
  'Final Receiving Depot'
];

const PERSONNEL = {
  qaOfficer: 'Lead Quality Assurance Auditor',
  inspector: 'Cold-Chain Regulatory Officer'
};

const DOCK_ITEMS = {
  client: [
    { id: 'overview', label: 'Overview', icon: 'i-shield-check' },
    { id: 'journey', label: 'Journey', icon: 'i-route' },
    { id: 'documents', label: 'Documents', icon: 'i-document' }
  ],
  admin: [
    { id: 'fleet', label: 'Fleet', icon: 'i-fleet' },
    { id: 'diagnostics', label: 'Diagnostics', icon: 'i-activity' },
    { id: 'alerts', label: 'Alerts', icon: 'i-bell' },
    { id: 'controls', label: 'Controls', icon: 'i-sliders' }
  ]
};

/* Demonstration accounts. Sign-in is simulated in the browser: these values
   ship with the page and are not a security boundary. A production build must
   authenticate against a server and never deliver credentials to the client. */
const DEMO_ACCOUNTS = [
  {
    id: 'client-biopharma',
    role: 'client',
    identifier: 'consignor@maatora.test',
    password: 'ColdChain-Demo-2026',
    name: 'National Logistics & Biopharma Consignor S.A.E.',
    trucks: ['TRK-104', 'TRK-208']
  },
  {
    id: 'client-provisions',
    role: 'client',
    identifier: 'provisions@maatora.test',
    password: 'FrozenDock-Demo-2026',
    name: 'National Cold-Chain Provisions Consignor S.A.E.',
    trucks: ['TRK-315']
  },
  {
    id: 'admin-qa',
    role: 'admin',
    identifier: 'QA-0104',
    password: 'Dispatch-Demo-2026',
    name: 'Lead Quality Assurance Auditor',
    trucks: []
  }
];

const AUTH_COPY = {
  client: {
    title: 'Client Portal Sign-In',
    sub: 'Follow your consignment temperature, route progress and compliance certificate.',
    identifierLabel: 'Account Email',
    missing: 'Enter your account email and password.',
    inputMode: 'email',
    scope: 'client portal',
    demoNote: 'Sign-in is simulated in this browser. Load the demo consignor account to explore the client portal.'
  },
  admin: {
    title: 'Control Room Sign-In',
    sub: 'Dispatch and compliance controllers only: fleet telemetry, hardware health and certificate signing.',
    identifierLabel: 'Operator ID',
    missing: 'Enter your operator ID and password.',
    inputMode: 'text',
    scope: 'control room console',
    demoNote: 'Sign-in is simulated in this browser. Load the demo controller account to open the control room.'
  }
};

const HEALTH_LEVELS = {
  ok: { label: 'Nominal', tone: 'safe' },
  warn: { label: 'Attention', tone: 'ice' },
  fault: { label: 'Fault', tone: 'alert' }
};

const UNIT_STATUS = {
  'en-route': { label: 'En Route', chip: 'chip--safe' },
  standby: { label: 'Standby / Pre-Cooling', chip: 'chip--ice' },
  excursion: { label: 'Excursion', chip: 'chip--alert chip--flash' }
};

const CERT_STATUS = {
  valid: {
    label: 'Valid',
    chip: 'chip--safe',
    tone: 'safe',
    stamp: 'VERIFIED & VALIDATED • ZERO EXCURSIONS',
    note: 'Continuous temperature log validated. Compliance seal is in force.'
  },
  hold: {
    label: 'Compliance Hold',
    chip: 'chip--alert chip--flash',
    tone: 'alert',
    stamp: 'COMPLIANCE HOLD • EXCURSION UNDER REVIEW',
    note: 'Compliance violation flagged. Seal suspended while the excursion is active.'
  },
  revalidate: {
    label: 'Re-Validation Pending',
    chip: 'chip--ice',
    tone: 'pending',
    stamp: 'RE-VALIDATION PENDING • AWAITING QA SIGN-OFF',
    note: 'Telemetry is back at baseline. Sign the certificate to restore the seal.'
  },
  'not-issued': {
    label: 'Not Yet Issued',
    chip: 'chip--neutral',
    tone: 'pending',
    stamp: 'NOT YET ISSUED • TRANSIT NOT COMMENCED',
    note: 'Unit is on standby. A certificate is issued once the transit log opens.'
  }
};

const ALERT_KINDS = {
  excursion: { title: 'Temperature Excursion', detailLabel: 'Peak Reading' },
  uplink: { title: 'Telemetry Uplink Dropout', detailLabel: 'Detail' }
};

const VERIFY_STATUS = {
  checking: {
    banner: 'banner--pending',
    chip: 'chip--ice',
    label: 'Checking',
    title: 'CHECKING CERTIFICATE',
    note: 'Recomputing the digest from the scanned fields.'
  },
  verified: {
    banner: 'banner--safe',
    chip: 'chip--safe',
    label: 'Verified',
    title: 'CERTIFICATE VERIFIED • DIGEST MATCHES',
    note: 'The scanned fields match the digest issued when the certificate was signed.'
  },
  failed: {
    banner: 'banner--alert',
    chip: 'chip--alert',
    label: 'Failed',
    title: 'VERIFICATION FAILED • DIGEST MISMATCH',
    note: 'The scanned fields do not match the digest. Treat this certificate as altered.'
  },
  invalid: {
    banner: 'banner--alert',
    chip: 'chip--alert',
    label: 'Failed',
    title: 'VERIFICATION FAILED • UNREADABLE CODE',
    note: 'This link does not contain a recognisable certificate record.'
  }
};

/* --------------------------------------------------------------------------
   Arabic translations (keyed by the English source string)
   -------------------------------------------------------------------------- */
const AR = {
  /* Shell and navigation */
  'Cold-Chain Monitoring': 'مراقبة سلسلة التبريد',
  'Client View': 'بوابة العميل',
  'Admin & Telematics': 'الإدارة والقياس عن بُعد',
  'Sign Out': 'تسجيل الخروج',
  'Live': 'مباشر',
  'Alert': 'تنبيه',
  'Overview': 'نظرة عامة',
  'Journey': 'الرحلة',
  'Documents': 'المستندات',
  'Fleet': 'الأسطول',
  'Diagnostics': 'التشخيص',
  'Alerts': 'التنبيهات',
  'Controls': 'التحكم',
  'Operational role': 'الدور التشغيلي',
  'Section navigation': 'التنقل بين الأقسام',
  'Select unit': 'اختيار الوحدة',
  'Select consignment': 'اختيار الشحنة',
  'Shipment overview': 'نظرة عامة على الشحنة',
  'Journey detail': 'تفاصيل الرحلة',
  'Compliance documents': 'مستندات المطابقة',
  'Fleet telemetry': 'قياسات الأسطول',
  'Sensor and chiller diagnostics': 'تشخيص الحساسات والمبرّد',
  'Simulation and compliance controls': 'عناصر المحاكاة والمطابقة',
  'Switch language to English': 'التبديل إلى اللغة الإنجليزية',

  /* Sign-in */
  'Secure Access': 'دخول آمن',
  'Client Portal Sign-In': 'تسجيل الدخول إلى بوابة العميل',
  'Control Room Sign-In': 'تسجيل الدخول إلى غرفة التحكم',
  'Follow your consignment temperature, route progress and compliance certificate.': 'تابع درجة حرارة شحنتك وتقدّم مسارها وشهادة المطابقة.',
  'Dispatch and compliance controllers only: fleet telemetry, hardware health and certificate signing.': 'لمراقبي الإرسال والمطابقة فقط: قياسات الأسطول وحالة الأجهزة وتوقيع الشهادات.',
  'Account Email': 'البريد الإلكتروني للحساب',
  'Operator ID': 'رقم المشغّل',
  'Password': 'كلمة المرور',
  'Show': 'إظهار',
  'Hide': 'إخفاء',
  'Sign In': 'تسجيل الدخول',
  'Demonstration Environment': 'بيئة تجريبية',
  'Use Demo Credentials': 'استخدام بيانات الدخول التجريبية',
  'Sign-in is simulated in this browser. Load the demo consignor account to explore the client portal.': 'تسجيل الدخول محاكى داخل هذا المتصفح. حمّل حساب المرسِل التجريبي لاستكشاف بوابة العميل.',
  'Sign-in is simulated in this browser. Load the demo controller account to open the control room.': 'تسجيل الدخول محاكى داخل هذا المتصفح. حمّل حساب المراقب التجريبي لفتح غرفة التحكم.',
  'Enter your account email and password.': 'أدخل البريد الإلكتروني للحساب وكلمة المرور.',
  'Enter your operator ID and password.': 'أدخل رقم المشغّل وكلمة المرور.',
  'Those details do not match an account. {left} attempts left before a temporary lock.': 'البيانات لا تطابق أي حساب. تبقّت {left} محاولات قبل القفل المؤقت.',
  'Those details do not match an account. 1 attempt left before a temporary lock.': 'البيانات لا تطابق أي حساب. تبقّت محاولة واحدة قبل القفل المؤقت.',
  'Too many failed attempts. Try again in {seconds} seconds.': 'محاولات فاشلة كثيرة. حاول مجددًا بعد {seconds} ثانية.',
  'You were signed out after a period of inactivity.': 'تم تسجيل خروجك بعد فترة من عدم النشاط.',
  'Signed in as {name}': 'تم تسجيل الدخول باسم {name}',
  'client portal': 'بوابة العميل',
  'control room console': 'غرفة التحكم',

  /* Organisations, people, places and cargo */
  'National Logistics & Biopharma Consignor S.A.E.': 'الشركة الوطنية للوجستيات والأدوية الحيوية (ش.م.م)',
  'National Cold-Chain Provisions Consignor S.A.E.': 'الشركة الوطنية لتوريدات سلسلة التبريد (ش.م.م)',
  'Lead Quality Assurance Auditor': 'كبير مدققي ضمان الجودة',
  'Cold-Chain Regulatory Officer': 'مسؤول الرقابة على سلسلة التبريد',
  'Certified Pharmaceutical Logistics Dept.': 'إدارة اللوجستيات الدوائية المعتمدة',
  'Certified Food-Grade Logistics Dept.': 'إدارة لوجستيات الأغذية المعتمدة',
  'Northern Regional Medical Depot #04': 'المستودع الطبي الإقليمي الشمالي رقم 04',
  'Delta Regional Clinical Depot #02': 'المستودع السريري الإقليمي بالدلتا رقم 02',
  'Coastal Cold Storage Terminal #07': 'محطة التخزين المبرّد الساحلية رقم 07',
  'Regional Receiving Terminal #04': 'محطة الاستلام الإقليمية رقم 04',
  'Regional Receiving Terminal #02': 'محطة الاستلام الإقليمية رقم 02',
  'Regional Receiving Terminal #07': 'محطة الاستلام الإقليمية رقم 07',
  'Central Biopharma Distribution Hub': 'المركز الرئيسي لتوزيع الأدوية الحيوية',
  'Origin Cold Dock B': 'رصيف التبريد «ب» بنقطة المنشأ',
  'Transit Corridor 4': 'ممر العبور 4',
  'Transit Corridor 7': 'ممر العبور 7',
  'Pharmaceutical Vaccines (Ultra-Cold)': 'لقاحات دوائية (تبريد فائق)',
  'Perishable Biologics (Chilled 2–8°C)': 'مستحضرات حيوية سريعة التلف (مبرّدة من 2 إلى 8 درجات مئوية)',
  'Frozen Seafood (Deep-Frozen)': 'مأكولات بحرية مجمّدة (تجميد عميق)',
  'Vaccines': 'لقاحات',
  'Perishable Biologics': 'مستحضرات حيوية',
  'Frozen Seafood': 'مأكولات بحرية مجمّدة',
  'Heavy Refrigerated Rigid 26T': 'شاحنة مبرّدة ثقيلة 26 طنًا',
  'Medium Refrigerated Rigid 18T': 'شاحنة مبرّدة متوسطة 18 طنًا',
  'Heavy Refrigerated Articulated 40T': 'شاحنة مبرّدة مفصلية ثقيلة 40 طنًا',
  'Certified Transport Operator #104': 'مشغّل النقل المعتمد رقم 104',
  'Certified Transport Operator #208': 'مشغّل النقل المعتمد رقم 208',
  'Certified Transport Operator #315': 'مشغّل النقل المعتمد رقم 315',

  /* Client portal */
  'REFRIGERATION GUARANTEED • SAFE SPEC': 'التبريد مضمون • ضمن المواصفات الآمنة',
  'Your cargo is held inside its certified temperature range and monitored continuously.': 'شحنتك محفوظة ضمن نطاق الحرارة المعتمد وتخضع لمراقبة مستمرة.',
  'TEMPERATURE EXCURSION • QA NOTIFIED': 'انحراف حراري • تم إخطار ضمان الجودة',
  'The reading is outside the permitted range. Quality assurance has been alerted and corrective action is under way.': 'القراءة خارج النطاق المسموح. تم تنبيه ضمان الجودة وجارٍ اتخاذ الإجراء التصحيحي.',
  'PRE-COOLING IN PROGRESS • DEPARTURE PENDING': 'التبريد المسبق جارٍ • بانتظار المغادرة',
  'Your cargo bay is being conditioned to its certified temperature before departure.': 'تجري تهيئة حجرة الشحن إلى درجة الحرارة المعتمدة قبل المغادرة.',
  'Consignment ID': 'رقم الشحنة',
  'Within Spec': 'ضمن المواصفات',
  'Out of Spec': 'خارج المواصفات',
  'Current Temperature': 'درجة الحرارة الحالية',
  'Target {target} • Permitted {min} to {max}': 'المستهدف {target} • المسموح من {min} إلى {max}',
  'Current {temp}, permitted range {min} to {max}': 'الحالية {temp}، النطاق المسموح من {min} إلى {max}',
  '{corridor} • ETA: {eta} Mins': '{corridor} • الوصول المتوقع خلال {eta} دقيقة',
  '{corridor} • Departure Pending': '{corridor} • بانتظار المغادرة',
  'Route & Corridor Status': 'حالة المسار والممر',
  'In Transit': 'في الطريق',
  'Pre-Departure': 'قبل المغادرة',
  'At Inspection Hub': 'في مركز الفحص',
  'Origin Departure': 'المغادرة من المنشأ',
  'Highway In-Transit': 'العبور على الطريق السريع',
  'Regional Inspection Hub': 'مركز الفحص الإقليمي',
  'Final Receiving Depot': 'مستودع الاستلام النهائي',
  'View Official Compliance Certificate': 'عرض شهادة المطابقة الرسمية',
  '{origin} to {destination}': 'من {origin} إلى {destination}',
  'Corridor Milestones': 'محطات المسار',
  'Regional Inspection Hub Checkpoint': 'نقطة تفتيش مركز الفحص الإقليمي',
  'Awaiting departure': 'بانتظار المغادرة',
  'Completed {time}': 'اكتملت الساعة {time}',
  'Pre-cooling at origin dock': 'تبريد مسبق في رصيف المنشأ',
  'In progress': 'جارية الآن',
  'Expected {time}': 'متوقعة الساعة {time}',
  'Chain of Custody': 'سلسلة العهدة',
  'Consignor': 'المرسِل',
  'Consignee': 'المرسَل إليه',
  'Transport Operator': 'مشغّل النقل',
  'Quality Oversight': 'الإشراف على الجودة',
  'Compliance Record': 'سجل المطابقة',
  'Audit evidence for your consignment, issued from the continuous temperature log.': 'أدلة التدقيق الخاصة بشحنتك، صادرة من سجل الحرارة المستمر.',
  'Certificate Serial': 'الرقم التسلسلي للشهادة',
  'Last Validation': 'آخر تحقق',
  'Temperature Excursions': 'الانحرافات الحرارية',
  'Door Seal Check': 'فحص ختم الباب',
  'Sampling': 'معدل القياس',
  'Every 60 Seconds': 'كل 60 ثانية',
  'Compliance is evidenced by calibrated temperature records and a tamper-evident audit log reviewed by the Cold-Chain Regulatory Officer.': 'تُثبَت المطابقة بسجلات حرارة معايَرة وسجل تدقيق مقاوم للعبث يراجعه مسؤول الرقابة على سلسلة التبريد.',
  '0 (Zero Breaches Recorded)': '0 (لم تُسجَّل أي تجاوزات)',
  '{count} (Breach Recorded, Under Review)': '{count} (تجاوز مسجَّل قيد المراجعة)',
  '{count} Unauthorized Openings': '{count} فتحات غير مصرّح بها',

  /* Certificate status */
  'Valid': 'سارية',
  'Compliance Hold': 'تعليق المطابقة',
  'Re-Validation Pending': 'بانتظار إعادة التحقق',
  'Not Yet Issued': 'لم تصدر بعد',
  'VERIFIED & VALIDATED • ZERO EXCURSIONS': 'تم التحقق والاعتماد • بلا انحرافات',
  'COMPLIANCE HOLD • EXCURSION UNDER REVIEW': 'تعليق المطابقة • انحراف قيد المراجعة',
  'RE-VALIDATION PENDING • AWAITING QA SIGN-OFF': 'بانتظار إعادة التحقق • في انتظار توقيع ضمان الجودة',
  'NOT YET ISSUED • TRANSIT NOT COMMENCED': 'لم تصدر بعد • لم يبدأ النقل',
  'Continuous temperature log validated. Compliance seal is in force.': 'تم التحقق من سجل الحرارة المستمر. ختم المطابقة سارٍ.',
  'Compliance violation flagged. Seal suspended while the excursion is active.': 'تم رصد مخالفة للمطابقة. الختم معلّق ما دام الانحراف قائمًا.',
  'Telemetry is back at baseline. Sign the certificate to restore the seal.': 'عادت القياسات إلى مستواها الأساسي. وقّع الشهادة لاستعادة الختم.',
  'Unit is on standby. A certificate is issued once the transit log opens.': 'الوحدة في وضع الاستعداد. تصدر الشهادة عند فتح سجل النقل.',

  /* Control room: fleet and diagnostics */
  'Dispatch & Compliance Control': 'التحكم في الإرسال والمطابقة',
  'Fleet Telemetry Grid': 'شبكة قياسات الأسطول',
  '{total} units monitored • {enRoute} en route • {standby} on standby': '{total} وحدات تحت المراقبة • {enRoute} في الطريق • {standby} في الاستعداد',
  'Unit {id}': 'الوحدة {id}',
  'En Route': 'في الطريق',
  'Standby / Pre-Cooling': 'استعداد / تبريد مسبق',
  'Excursion': 'انحراف',
  'Internal Temp': 'الحرارة الداخلية',
  'Chiller Power': 'تشغيل المبرّد',
  'Uplink': 'الاتصال',
  'Hardware Health': 'حالة الأجهزة',
  'FAULT': 'عطل',
  'Pre-Cooling': 'تبريد مسبق',
  'ON': 'يعمل',
  'Online • {ping}': 'متصل • {ping}',
  'Nominal': 'سليم',
  'Attention': 'يحتاج انتباهًا',
  'Fault': 'عطل',
  '1 Fault': 'عطل واحد',
  '{count} Faults': '{count} أعطال',
  '{count} Attention': '{count} تحتاج انتباهًا',
  '{ok} / {total} Nominal': '{ok} / {total} سليمة',
  'Open Diagnostics': 'فتح التشخيص',
  'Open Diagnostics for Unit {id}': 'فتح تشخيص الوحدة {id}',
  'IoT Sensor & Chiller Diagnostics': 'تشخيص حساسات إنترنت الأشياء والمبرّد',
  'Internal Temperature': 'درجة الحرارة الداخلية',
  'Recent internal temperature trace against the permitted range': 'مسار درجة الحرارة الداخلية الأخير مقابل النطاق المسموح',
  'Setpoint {target} • Permitted {min} to {max} • 60 s sampling': 'نقطة الضبط {target} • المسموح من {min} إلى {max} • قياس كل 60 ثانية',
  'Sensor Probe Battery Health': 'حالة بطارية مجس الحساس',
  '{percent} (Li-SOCl2 Cell, 3.6V)': '{percent} (خلية Li-SOCl2 بجهد 3.6 فولت)',
  'Telemetry Uplink': 'اتصال القياس عن بُعد',
  '4G LTE / Satellite Failover (Ping: {ping} • {signal})': 'شبكة 4G LTE مع تحويل احتياطي للقمر الصناعي (زمن الاستجابة {ping} • الإشارة {signal})',
  'Compressor Speed': 'سرعة الضاغط',
  '{rpm} RPM (Inverter Variable Frequency)': '{rpm} دورة في الدقيقة (عاكس متغيّر التردد)',
  '0 RPM (Compressor Fault, Inverter Trip)': '0 دورة في الدقيقة (عطل في الضاغط وفصل العاكس)',
  'Chiller Reserve Tank': 'خزان المبرّد الاحتياطي',
  '{percent} Diesel Dedicated Auxiliary': '{percent} ديزل مساعد مخصّص',
  'Cargo Bay Tamper Seal': 'ختم حماية حجرة الشحن',
  'Electronic Seal {seal} [ENGAGED / ZERO BREACHES]': 'الختم الإلكتروني {seal} [مُفعَّل / بلا اختراقات]',
  'Electronic Seal {seal} [ENGAGED / {count} BREACHES]': 'الختم الإلكتروني {seal} [مُفعَّل / {count} اختراقات]',
  'Probe Calibration': 'معايرة المجس',
  '±0.1°C Reference Probe, Verified {days} Days Ago': 'مجس مرجعي بدقة ±0.1 درجة مئوية، تم التحقق قبل {days} يومًا',
  'Telematics Firmware': 'البرنامج الثابت لوحدة القياس',
  '{version} (Signed Build)': '{version} (إصدار موقّع)',

  /* Control room: controls and audit log */
  'Simulation & Testing Tools': 'أدوات المحاكاة والاختبار',
  'Drill the excursion response, restore telemetry and sign the compliance seal.': 'تدرّب على الاستجابة للانحراف، ثم أعد القياسات ووقّع ختم المطابقة.',
  'Compliance Seal': 'ختم المطابقة',
  'Signed': 'تاريخ التوقيع',
  'Log Digest': 'بصمة السجل',
  'Excursions Logged': 'الانحرافات المسجّلة',
  'Interactive Controls': 'عناصر التحكم التفاعلية',
  'Trigger Incident': 'محاكاة حادثة',
  'Normalize Sensor': 'إعادة الحساس إلى وضعه الطبيعي',
  'Issue / Sign Certificate': 'إصدار / توقيع الشهادة',
  'Tamper-Evident Audit Log': 'سجل تدقيق مقاوم للعبث',
  'Not signed': 'غير موقّعة',
  'Withheld (Compliance Hold)': 'محجوبة (تعليق المطابقة)',
  'Not issued': 'لم تصدر',
  'Computing digest': 'جارٍ حساب البصمة',
  'Trigger Incident simulates a compressor failure and a {delta} spike on Unit {id}.': 'زر «محاكاة حادثة» يحاكي عطلًا في الضاغط وارتفاعًا قدره {delta} في الوحدة {id}.',
  'A drill is active on Unit {id}. Normalize Sensor will close it.': 'يوجد تدريب نشط على الوحدة {id}. زر إعادة الحساس سيُنهيه.',
  'Drill active on this unit.': 'يوجد تدريب نشط على هذه الوحدة.',
  'Telemetry is nominal. Issue / Sign Certificate to validate the log and restore the seal.': 'القياسات طبيعية. استخدم «إصدار / توقيع الشهادة» للتحقق من السجل واستعادة الختم.',
  'Signing is blocked while an excursion is active. Normalize the sensor first.': 'التوقيع محظور ما دام الانحراف قائمًا. أعد الحساس إلى وضعه الطبيعي أولًا.',
  'Unit is on standby. There is no in-transit log to validate yet.': 'الوحدة في وضع الاستعداد. لا يوجد سجل نقل للتحقق منه بعد.',
  'Signing is blocked while the reading is outside the permitted range.': 'التوقيع محظور ما دامت القراءة خارج النطاق المسموح.',
  'Acknowledge the open alert for this unit before signing.': 'أقرّ بالتنبيه المفتوح لهذه الوحدة قبل التوقيع.',
  'Excursion triggered on Unit {id}': 'تم تفعيل انحراف على الوحدة {id}',
  'Unit {id} returned to nominal range': 'عادت الوحدة {id} إلى النطاق الطبيعي',
  'Certificate signed for Unit {id}': 'تم توقيع شهادة الوحدة {id}',
  'Active Excursion • Unit {id}': 'انحراف نشط • الوحدة {id}',
  'Internal temperature {temp}, above the {limit} limit. Compliance violation flagged.': 'درجة الحرارة الداخلية {temp}، أعلى من الحد {limit}. تم رصد مخالفة للمطابقة.',
  '{count} Entries': '{count} مدخلات',
  '{seq} • {time} • chain {digest}': '{seq} • {time} • السلسلة {digest}',
  '{seq} • {time} • chain pending': '{seq} • {time} • السلسلة قيد الحساب',
  'Telemetry session opened. {count} units reporting on 60 second sampling.': 'تم فتح جلسة القياس. {count} وحدات ترسل قراءاتها كل 60 ثانية.',
  'Electronic seal {seal} engaged on Unit {id}.': 'تم تفعيل الختم الإلكتروني {seal} على الوحدة {id}.',
  'Certificate {serial} validated by {name}.': 'تم التحقق من الشهادة {serial} بواسطة {name}.',
  'Incident drill: compressor failure on Unit {id}. Internal temperature {temp} ({delta} excursion). Compliance violation flagged.': 'تدريب على حادثة: عطل في الضاغط بالوحدة {id}. درجة الحرارة الداخلية {temp} (انحراف {delta}). تم رصد مخالفة للمطابقة.',
  'Sensor normalized on Unit {id}. Telemetry back at baseline {temp}. Drill closed and excluded from the compliance record.': 'أُعيد الحساس إلى وضعه الطبيعي في الوحدة {id}. عادت القياسات إلى المستوى الأساسي {temp}. أُغلق التدريب واستُبعد من سجل المطابقة.',
  'Certificate {serial} signed by {name}. Continuous log validated: {excursions} excursions, {openings} unauthorized openings.': 'وُقّعت الشهادة {serial} بواسطة {name}. تم التحقق من السجل المستمر: {excursions} انحرافات و{openings} فتحات غير مصرّح بها.',
  'Sign-in locked on the {scope} for {seconds} seconds after {attempts} failed attempts.': 'تم قفل تسجيل الدخول إلى {scope} لمدة {seconds} ثانية بعد {attempts} محاولات فاشلة.',
  'Failed sign-in attempt on the {scope} ({attempt} of {max}).': 'محاولة دخول فاشلة إلى {scope} ({attempt} من {max}).',
  'Sign-in on the {scope}: {name}.': 'تسجيل دخول إلى {scope}: {name}.',
  'Sign-out on the {scope}: {name}.': 'تسجيل خروج من {scope}: {name}.',
  'Sign-out on the {scope}: {name} (idle timeout).': 'تسجيل خروج من {scope}: {name} (انتهاء مهلة عدم النشاط).',
  'Alert {alert} on Unit {id} acknowledged by {name}.': 'تم الإقرار بالتنبيه {alert} في الوحدة {id} بواسطة {name}.',

  /* Alert history */
  'Alert history': 'سجل التنبيهات',
  'Alert History': 'سجل التنبيهات',
  'Excursions & Events': 'الانحرافات والأحداث',
  '{open} unacknowledged • {total} recorded': '{open} بانتظار الإقرار • {total} مسجّلة',
  'No alerts have been recorded in this session.': 'لم تُسجَّل أي تنبيهات في هذه الجلسة.',
  'Temperature Excursion': 'انحراف حراري',
  'Telemetry Uplink Dropout': 'انقطاع اتصال القياس',
  '{alert} • Unit {id}': '{alert} • الوحدة {id}',
  'Active': 'نشط',
  'Ended, Unacknowledged': 'انتهى وبانتظار الإقرار',
  'Acknowledged': 'تم الإقرار',
  'Started': 'البداية',
  'Duration': 'المدة',
  'Peak Reading': 'أعلى قراءة',
  'Detail': 'التفاصيل',
  'Acknowledgement': 'الإقرار',
  'Ongoing ({span})': 'مستمر ({span})',
  '{m}m {s}s': '{m} د {s} ث',
  '{peak} against a {limit} limit': '{peak} مقابل حد {limit}',
  'Satellite failover engaged, no samples lost': 'تم التحويل إلى القمر الصناعي دون فقدان أي قراءات',
  'Pending': 'بانتظار الإقرار',
  '{name}, {time}': '{name}، {time}',
  'Acknowledge': 'إقرار',
  'Alert {id} acknowledged': 'تم الإقرار بالتنبيه {id}',

  /* Certificate */
  'Official Compliance Certificate': 'شهادة المطابقة الرسمية',
  'Close certificate': 'إغلاق الشهادة',
  'Department of Cold-Chain Regulatory Affairs': 'إدارة الشؤون التنظيمية لسلسلة التبريد',
  'CERTIFICATE OF COLD-CHAIN INTEGRITY & COMPLIANCE': 'شهادة سلامة سلسلة التبريد والمطابقة',
  'Official Cold-Chain Telematics Certificate of Compliance': 'شهادة مطابقة رسمية صادرة عن نظام قياس سلسلة التبريد',
  'Serial Reference:': 'الرقم المرجعي:',
  'Consignment Particulars': 'بيانات الشحنة',
  'Carrier': 'الناقل',
  'Authorized Refrigerated Transit Operator': 'مشغّل نقل مبرّد معتمد',
  'Shipper / Consignor': 'الشاحن / المرسِل',
  'Consignee Depot': 'مستودع المرسَل إليه',
  'Vehicle Identifier': 'معرّف المركبة',
  'Consignment / Cargo': 'الشحنة / البضاعة',
  'Calibrated Temperature Setpoint': 'نقطة ضبط الحرارة المعايَرة',
  'Continuous Audit Summary': 'ملخص التدقيق المستمر',
  'Sampling Frequency': 'معدل القياس',
  'Total In-Transit Duration': 'إجمالي مدة النقل',
  'Recorded Minimum / Maximum': 'أدنى / أعلى قراءة مسجّلة',
  'Temperature Excursion Count': 'عدد الانحرافات الحرارية',
  'Electronic Door Seal Check': 'فحص ختم الباب الإلكتروني',
  'Electronic Seal Reference': 'مرجع الختم الإلكتروني',
  'Validation & Sign-off': 'التحقق والاعتماد',
  'Cryptographic verification hash': 'بصمة التحقق المشفّرة',
  'Scan to Verify': 'امسح الرمز للتحقق',
  'QR code issued on signing': 'يصدر رمز QR عند التوقيع',
  'Verification QR code': 'رمز QR للتحقق',
  'Open the verification page for this certificate': 'فتح صفحة التحقق لهذه الشهادة',
  'Chief Quality Assurance Inspector • Department of Cold-Chain Regulatory Affairs': 'كبير مفتشي ضمان الجودة • إدارة الشؤون التنظيمية لسلسلة التبريد',
  'Countersigning Inspector • Regulatory Audit Desk': 'المفتش المصادق • مكتب التدقيق التنظيمي',
  'Issued from continuous calibrated telemetry and a tamper-evident audit log. System-generated record, valid without a wet signature.': 'صادرة من قياسات معايَرة مستمرة وسجل تدقيق مقاوم للعبث. سجل مُنشأ آليًا وصالح دون توقيع يدوي.',
  'Print Certificate / Save PDF': 'طباعة الشهادة / حفظ PDF',
  'Close Modal': 'إغلاق',
  'Unit {id} ({vehicle})': 'الوحدة {id} ({vehicle})',
  '{target} (Permissible Range: {min} to {max})': '{target} (النطاق المسموح: من {min} إلى {max})',
  'Not Commenced (Pre-Departure Conditioning)': 'لم يبدأ (تهيئة ما قبل المغادرة)',
  '{h} Hours {m} Minutes': '{h} ساعة و{m} دقيقة',
  '{seal} (Engaged)': '{seal} (مُفعَّل)',
  'Certificate not in force': 'الشهادة غير سارية',
  'Signed {time} by {name}': 'وُقّعت في {time} بواسطة {name}',
  'Seal suspended pending corrective action and QA review': 'الختم معلّق لحين اتخاذ الإجراء التصحيحي ومراجعة ضمان الجودة',
  'Telemetry nominal, awaiting signature': 'القياسات طبيعية وبانتظار التوقيع',
  'Signature pending': 'بانتظار التوقيع',

  /* Verification page */
  'Certificate Verification': 'التحقق من الشهادة',
  'Verification Result': 'نتيجة التحقق',
  'Opened from the QR code printed on a compliance certificate.': 'فُتحت هذه الصفحة من رمز QR المطبوع على شهادة المطابقة.',
  'CHECKING CERTIFICATE': 'جارٍ فحص الشهادة',
  'Recomputing the digest from the scanned fields.': 'تُعاد الآن حساب البصمة من الحقول الممسوحة.',
  'CERTIFICATE VERIFIED • DIGEST MATCHES': 'تم التحقق من الشهادة • البصمة مطابقة',
  'The scanned fields match the digest issued when the certificate was signed.': 'الحقول الممسوحة تطابق البصمة الصادرة عند توقيع الشهادة.',
  'VERIFICATION FAILED • DIGEST MISMATCH': 'فشل التحقق • البصمة غير مطابقة',
  'The scanned fields do not match the digest. Treat this certificate as altered.': 'الحقول الممسوحة لا تطابق البصمة. اعتبر هذه الشهادة معدَّلة.',
  'VERIFICATION FAILED • UNREADABLE CODE': 'فشل التحقق • رمز غير مقروء',
  'This link does not contain a recognisable certificate record.': 'هذا الرابط لا يحتوي على سجل شهادة يمكن التعرّف عليه.',
  'Verified': 'موثّقة',
  'Failed': 'فشل التحقق',
  'Checking': 'جارٍ الفحص',
  'Vehicle': 'المركبة',
  'Consignment': 'الشحنة',
  'Cargo': 'البضاعة',
  'Permitted Range': 'النطاق المسموح',
  'In-Transit Duration': 'مدة النقل',
  'Recorded Min / Max': 'أدنى / أعلى قراءة',
  'Digest': 'البصمة',
  '{min} to {max}': 'من {min} إلى {max}',
  'This check recomputes the SHA-256 digest from the certificate fields carried in the QR code. It runs in your browser and does not consult a central registry.': 'يعيد هذا الفحص حساب بصمة SHA-256 من حقول الشهادة المضمّنة في رمز QR. يعمل داخل متصفحك ولا يرجع إلى سجل مركزي.',
  'Back to Portal': 'العودة إلى البوابة'
};

/* --------------------------------------------------------------------------
   State
   -------------------------------------------------------------------------- */
const state = {
  currentRole: 'client',
  activeTruckId: 'TRK-104',
  isExcursionActive: false,
  certificateModalOpen: false,

  activePanel: { client: 'overview', admin: 'fleet' },
  excursionTruckId: null,
  auditLog: [],

  session: { client: null, admin: null },
  clientTruckId: 'TRK-104',
  auth: {
    attempts: { client: 0, admin: 0 },
    lockedUntil: { client: 0, admin: 0 },
    error: null
  },
  lastActivityAt: Date.now(),

  lang: 'en',
  alerts: [],
  verification: null,

  trucks: [
    {
      id: 'TRK-104',
      vehicleClass: 'Heavy Refrigerated Rigid 26T',
      operator: 'Certified Transport Operator #104',
      consignmentId: 'BATCH-REF-8841-X',
      cargo: 'Pharmaceutical Vaccines (Ultra-Cold)',
      cargoShort: 'Vaccines',
      consignor: 'National Logistics & Biopharma Consignor S.A.E.',
      consignorDept: 'Certified Pharmaceutical Logistics Dept.',
      consignee: 'Northern Regional Medical Depot #04',
      consigneeTerminal: 'Regional Receiving Terminal #04',
      origin: 'Central Biopharma Distribution Hub',
      destination: 'Northern Regional Medical Depot #04',
      corridor: 'Transit Corridor 4',
      routeStep: 1,
      milestonesAgo: [258],
      tempTarget: -20.0,
      tempMin: -24.0,
      tempMax: -18.0,
      tempBaseline: -21.5,
      tempCurrent: -21.5,
      eta: 42,
      sealId: 'EGY-9921-X',
      sensorBattery: 96,
      uplinkPing: 42,
      uplinkSignal: -74,
      compressorRpm: 1850,
      compressorNominalRpm: 1850,
      fuelPercent: 88,
      firmware: 'TLM-FW 4.2.1',
      calibrationDays: 14,
      status: 'en-route',
      baseStatus: 'en-route',
      history: [],
      log: { transitMinutes: 258, min: -22.1, max: -20.8, excursions: 0, doorOpenings: 0 },
      certificate: { serial: 'REF-CERT-2026-8812-CC', status: 'valid', signedAt: null, hash: '' }
    },
    {
      id: 'TRK-208',
      vehicleClass: 'Medium Refrigerated Rigid 18T',
      operator: 'Certified Transport Operator #208',
      consignmentId: 'BATCH-REF-8856-K',
      cargo: 'Perishable Biologics (Chilled 2–8°C)',
      cargoShort: 'Perishable Biologics',
      consignor: 'National Logistics & Biopharma Consignor S.A.E.',
      consignorDept: 'Certified Pharmaceutical Logistics Dept.',
      consignee: 'Delta Regional Clinical Depot #02',
      consigneeTerminal: 'Regional Receiving Terminal #02',
      origin: 'Central Biopharma Distribution Hub',
      destination: 'Delta Regional Clinical Depot #02',
      corridor: 'Transit Corridor 7',
      routeStep: 2,
      milestonesAgo: [203, 21],
      tempTarget: 4.0,
      tempMin: 2.0,
      tempMax: 8.0,
      tempBaseline: 3.2,
      tempCurrent: 3.2,
      eta: 27,
      sealId: 'EGY-9934-K',
      sensorBattery: 91,
      uplinkPing: 58,
      uplinkSignal: -81,
      compressorRpm: 1420,
      compressorNominalRpm: 1420,
      fuelPercent: 74,
      firmware: 'TLM-FW 4.2.1',
      calibrationDays: 9,
      status: 'en-route',
      baseStatus: 'en-route',
      history: [],
      log: { transitMinutes: 203, min: 2.8, max: 3.9, excursions: 0, doorOpenings: 0 },
      certificate: { serial: 'REF-CERT-2026-8813-CC', status: 'valid', signedAt: null, hash: '' }
    },
    {
      id: 'TRK-315',
      vehicleClass: 'Heavy Refrigerated Articulated 40T',
      operator: 'Certified Transport Operator #315',
      consignmentId: 'BATCH-REF-8872-M',
      cargo: 'Frozen Seafood (Deep-Frozen)',
      cargoShort: 'Frozen Seafood',
      consignor: 'National Cold-Chain Provisions Consignor S.A.E.',
      consignorDept: 'Certified Food-Grade Logistics Dept.',
      consignee: 'Coastal Cold Storage Terminal #07',
      consigneeTerminal: 'Regional Receiving Terminal #07',
      origin: 'Origin Cold Dock B',
      destination: 'Coastal Cold Storage Terminal #07',
      corridor: 'Origin Cold Dock B',
      routeStep: 0,
      milestonesAgo: [],
      tempTarget: -18.0,
      tempMin: -22.0,
      tempMax: -15.0,
      tempBaseline: -18.0,
      tempCurrent: -18.0,
      eta: null,
      sealId: 'EGY-9951-M',
      sensorBattery: 99,
      uplinkPing: 36,
      uplinkSignal: -69,
      compressorRpm: 2100,
      compressorNominalRpm: 2100,
      fuelPercent: 97,
      firmware: 'TLM-FW 4.2.1',
      calibrationDays: 3,
      status: 'standby',
      baseStatus: 'standby',
      history: [],
      log: { transitMinutes: 0, min: -18.4, max: -17.6, excursions: 0, doorOpenings: 0 },
      certificate: { serial: 'REF-CERT-2026-8814-CC', status: 'not-issued', signedAt: null, hash: '' }
    }
  ]
};

/* --------------------------------------------------------------------------
   Helpers
   -------------------------------------------------------------------------- */
const el = {};
const loadedAt = Date.now();
const staticText = [];
const dateTimeFormats = {};
let toastTimer = null;
let lastFocused = null;
let verificationToken = 0;
let logChain = Promise.resolve('MAATORA-AUDIT-GENESIS');

const byId = (id) => document.getElementById(id);
const all = (selector, root = document) => Array.from(root.querySelectorAll(selector));
const round1 = (value) => Math.round(value * 10) / 10;
const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const pad2 = (value) => String(value).padStart(2, '0');

const getTruck = (id) => state.trucks.find((truck) => truck.id === id);
const activeTruck = () => getTruck(state.activeTruckId);
const isInSpec = (truck) => truck.tempCurrent >= truck.tempMin && truck.tempCurrent <= truck.tempMax;

const isAuthed = (role = state.currentRole) => Boolean(state.session[role]);
const clientTruck = () => getTruck(state.clientTruckId);
/* The client sees only their own consignment; the admin sees the selected unit. */
const viewTruck = () => (state.currentRole === 'client' ? clientTruck() : activeTruck());

/* Fills {placeholders} in an English source string. */
function fmt(source, params) {
  if (!params) {
    return source;
  }
  return source.replace(/\{(\w+)\}/g, (match, key) => (key in params ? String(params[key]) : match));
}

/* Translates a source string. In Arabic every inserted value is wrapped in a
   first-strong isolate so identifiers and readings keep their own direction. */
function t(source, params) {
  if (state.lang !== 'ar') {
    return fmt(source, params);
  }
  const template = AR[source] || source;
  if (!params) {
    return template;
  }
  return template.replace(/\{(\w+)\}/g, (match, key) => {
    if (!(key in params)) {
      return match;
    }
    const raw = String(params[key]);
    return `⁨${AR[raw] || raw}⁩`;
  });
}

/* Keeps a standalone identifier or reading left-to-right inside Arabic text. */
const ltr = (text) => (state.lang === 'ar' ? `⁦${text}⁩` : String(text));

function plainTemp(value) {
  const rounded = round1(value);
  const sign = rounded > 0 ? '+' : '';
  return `${sign}${rounded.toFixed(1)}°C`;
}

const formatTemp = (value) => ltr(plainTemp(value));

function formatClock(date, withSeconds = false) {
  const base = `${pad2(date.getHours())}:${pad2(date.getMinutes())}`;
  return withSeconds ? `${base}:${pad2(date.getSeconds())}` : base;
}

function formatDateTime(date) {
  const lang = state.lang;
  if (!dateTimeFormats[lang]) {
    dateTimeFormats[lang] = new Intl.DateTimeFormat(lang === 'ar' ? 'ar-EG-u-nu-latn' : 'en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
    });
  }
  return dateTimeFormats[lang].format(date);
}

function formatDuration(totalMinutes) {
  return t('{h} Hours {m} Minutes', { h: pad2(Math.floor(totalMinutes / 60)), m: pad2(totalMinutes % 60) });
}

function formatSpan(milliseconds) {
  const seconds = Math.max(0, Math.round(milliseconds / 1000));
  return t('{m}m {s}s', { m: Math.floor(seconds / 60), s: pad2(seconds % 60) });
}

function shortHash(hash) {
  return hash ? `${hash.slice(0, 6)}...${hash.slice(-5)}` : '';
}

function setText(node, text) {
  if (node && node.textContent !== text) {
    node.textContent = text;
  }
}

function setChip(node, label, modifiers) {
  if (!node) {
    return;
  }
  setText(node, label);
  const className = `chip ${modifiers}`.trim();
  if (node.className !== className) {
    node.className = className;
  }
}

function iconMarkup(name) {
  return `<svg class="icon" aria-hidden="true" focusable="false"><use href="#${name}"></use></svg>`;
}

/* --------------------------------------------------------------------------
   Language
   -------------------------------------------------------------------------- */
/* Registers every static text node and aria-label that has a translation, so
   the markup stays plain English and needs no per-element keys. */
function collectStaticText() {
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  let node = walker.nextNode();
  while (node) {
    const source = node.nodeValue.replace(/\s+/g, ' ').trim();
    if (source && AR[source]) {
      staticText.push({ node, source, original: node.nodeValue });
    }
    node = walker.nextNode();
  }
  all('[aria-label]').forEach((element) => {
    const source = element.getAttribute('aria-label');
    if (AR[source]) {
      staticText.push({ element, source });
    }
  });
}

function applyStaticText() {
  staticText.forEach((entry) => {
    if (entry.node) {
      const next = state.lang === 'ar' ? AR[entry.source] : entry.original;
      if (entry.node.nodeValue !== next) {
        entry.node.nodeValue = next;
      }
    } else {
      entry.element.setAttribute('aria-label', t(entry.source));
    }
  });
}

function applyLanguage() {
  const arabic = state.lang === 'ar';
  document.documentElement.lang = state.lang;
  document.documentElement.dir = arabic ? 'rtl' : 'ltr';
  applyStaticText();

  const toggle = el['lang-toggle'];
  toggle.textContent = arabic ? 'EN' : 'عربي';
  toggle.lang = arabic ? 'en' : 'ar';
  toggle.setAttribute('aria-label', arabic ? AR['Switch language to English'] : 'Switch language to Arabic');

  buildDock();
  render();
  renderAuditLog();
}

function toggleLanguage() {
  state.lang = state.lang === 'ar' ? 'en' : 'ar';
  try {
    window.localStorage.setItem(LANG_KEY, state.lang);
  } catch (error) {
    /* Storage unavailable: the choice lasts until the page is closed. */
  }
  applyLanguage();
}

function restoreLanguage() {
  try {
    if (window.localStorage.getItem(LANG_KEY) === 'ar') {
      state.lang = 'ar';
    }
  } catch (error) {
    state.lang = 'en';
  }
}

/* --------------------------------------------------------------------------
   SHA-256
   -------------------------------------------------------------------------- */
/* Used where the Web Crypto API is unavailable, for example when the page is
   served over plain HTTP to a phone on the local network. */
function sha256Fallback(bytes) {
  const rotr = (value, shift) => (value >>> shift) | (value << (32 - shift));
  const fraction = (value) => Math.floor((value - Math.floor(value)) * 4294967296) >>> 0;
  const primes = [];
  for (let candidate = 2; primes.length < 64; candidate += 1) {
    if (primes.every((prime) => candidate % prime !== 0)) {
      primes.push(candidate);
    }
  }
  const k = primes.map((prime) => fraction(Math.cbrt(prime)));
  const hash = primes.slice(0, 8).map((prime) => fraction(Math.sqrt(prime)));

  const padded = new Uint8Array(((bytes.length + 9 + 63) >> 6) << 6);
  padded.set(bytes);
  padded[bytes.length] = 0x80;
  const view = new DataView(padded.buffer);
  view.setUint32(padded.length - 8, Math.floor(bytes.length / 536870912));
  view.setUint32(padded.length - 4, (bytes.length << 3) >>> 0);

  const w = new Uint32Array(64);
  for (let offset = 0; offset < padded.length; offset += 64) {
    for (let i = 0; i < 16; i += 1) {
      w[i] = view.getUint32(offset + i * 4);
    }
    for (let i = 16; i < 64; i += 1) {
      const s0 = rotr(w[i - 15], 7) ^ rotr(w[i - 15], 18) ^ (w[i - 15] >>> 3);
      const s1 = rotr(w[i - 2], 17) ^ rotr(w[i - 2], 19) ^ (w[i - 2] >>> 10);
      w[i] = w[i - 16] + s0 + w[i - 7] + s1;
    }
    let [a, b, c, d, e, f, g, h] = hash;
    for (let i = 0; i < 64; i += 1) {
      const s1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
      const choice = (e & f) ^ (~e & g);
      const temp1 = (h + s1 + choice + k[i] + w[i]) >>> 0;
      const s0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
      const majority = (a & b) ^ (a & c) ^ (b & c);
      const temp2 = (s0 + majority) >>> 0;
      h = g;
      g = f;
      f = e;
      e = (d + temp1) >>> 0;
      d = c;
      c = b;
      b = a;
      a = (temp1 + temp2) >>> 0;
    }
    [a, b, c, d, e, f, g, h].forEach((value, index) => {
      hash[index] = (hash[index] + value) >>> 0;
    });
  }
  return hash.map((value) => value.toString(16).padStart(8, '0')).join('');
}

async function sha256Hex(text) {
  const bytes = new TextEncoder().encode(text);
  if (window.crypto && window.crypto.subtle) {
    try {
      const buffer = await window.crypto.subtle.digest('SHA-256', bytes);
      return Array.from(new Uint8Array(buffer), (byte) => byte.toString(16).padStart(2, '0')).join('');
    } catch (error) {
      /* Fall through to the script implementation. */
    }
  }
  return sha256Fallback(bytes);
}

/* --------------------------------------------------------------------------
   Audit log (hash-chained entries)
   -------------------------------------------------------------------------- */
/* Entries keep their English source and values, so the log can be shown in
   either language while the chain is always hashed over the English text. */
function appendLog(kind, source, params) {
  const entry = {
    seq: state.auditLog.length + 1,
    time: new Date(),
    kind,
    source,
    params,
    digest: ''
  };
  state.auditLog.push(entry);
  renderAuditLog();

  logChain = logChain.then(async (previous) => {
    entry.digest = await sha256Hex(`${previous}|${entry.seq}|${entry.time.toISOString()}|${fmt(source, params)}`);
    renderAuditLog();
    return entry.digest;
  });
}

/* --------------------------------------------------------------------------
   Certificate digest
   -------------------------------------------------------------------------- */
/* The canonical record that is hashed when a certificate is signed and hashed
   again by the verification page. */
function certificatePayload(truck, record) {
  return [
    truck.certificate.serial,
    truck.id,
    truck.consignmentId,
    truck.tempTarget,
    truck.tempMin,
    truck.tempMax,
    record.transitMinutes,
    record.min,
    record.max,
    record.excursions,
    record.doorOpenings,
    truck.sealId,
    new Date(record.signedAt).toISOString()
  ].join('|');
}

async function refreshCertificateHash(truck) {
  const cert = truck.certificate;
  if (cert.status !== 'valid' || !cert.signedAt) {
    cert.hash = '';
    return;
  }
  const signedAt = cert.signedAt;
  const hash = await sha256Hex(certificatePayload(truck, { ...truck.log, signedAt: signedAt.getTime() }));
  if (cert.status === 'valid' && cert.signedAt === signedAt) {
    cert.hash = hash;
    renderCertificate();
    renderControls();
  }
}

/* --------------------------------------------------------------------------
   QR code (byte mode, error correction level M, versions 1 to 15)
   -------------------------------------------------------------------------- */
const QR_ECC_PER_BLOCK = [0, 10, 16, 26, 18, 24, 16, 18, 22, 22, 26, 30, 22, 22, 24, 24];
const QR_BLOCK_COUNT = [0, 1, 1, 1, 2, 2, 4, 4, 4, 5, 5, 5, 8, 9, 9, 10];
const QR_MAX_VERSION = QR_BLOCK_COUNT.length - 1;

const QR_MASKS = [
  (x, y) => (x + y) % 2 === 0,
  (x, y) => y % 2 === 0,
  (x) => x % 3 === 0,
  (x, y) => (x + y) % 3 === 0,
  (x, y) => (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0,
  (x, y) => ((x * y) % 2) + ((x * y) % 3) === 0,
  (x, y) => (((x * y) % 2) + ((x * y) % 3)) % 2 === 0,
  (x, y) => (((x + y) % 2) + ((x * y) % 3)) % 2 === 0
];

/* Modules left for data and error correction once function patterns are placed. */
function qrRawModules(version) {
  let result = (16 * version + 128) * version + 64;
  if (version >= 2) {
    const alignCount = Math.floor(version / 7) + 2;
    result -= (25 * alignCount - 10) * alignCount - 55;
    if (version >= 7) {
      result -= 36;
    }
  }
  return result;
}

function qrDataCodewords(version) {
  return Math.floor(qrRawModules(version) / 8) - QR_ECC_PER_BLOCK[version] * QR_BLOCK_COUNT[version];
}

/* Multiplication in GF(2^8) modulo x^8 + x^4 + x^3 + x^2 + 1. */
function gfMultiply(x, y) {
  let z = 0;
  for (let i = 7; i >= 0; i -= 1) {
    z = (z << 1) ^ ((z >>> 7) * 0x11D);
    z ^= ((y >>> i) & 1) * x;
  }
  return z;
}

function reedSolomonDivisor(degree) {
  const result = new Array(degree).fill(0);
  result[degree - 1] = 1;
  let root = 1;
  for (let i = 0; i < degree; i += 1) {
    for (let j = 0; j < degree; j += 1) {
      result[j] = gfMultiply(result[j], root);
      if (j + 1 < degree) {
        result[j] ^= result[j + 1];
      }
    }
    root = gfMultiply(root, 2);
  }
  return result;
}

function reedSolomonRemainder(data, divisor) {
  const result = divisor.map(() => 0);
  data.forEach((byte) => {
    const factor = byte ^ result.shift();
    result.push(0);
    divisor.forEach((coefficient, index) => {
      result[index] ^= gfMultiply(coefficient, factor);
    });
  });
  return result;
}

/* Packs the text into data codewords, then adds and interleaves error correction. */
function qrCodewords(bytes, version) {
  const capacityBits = qrDataCodewords(version) * 8;
  const bits = [];
  const push = (value, length) => {
    for (let i = length - 1; i >= 0; i -= 1) {
      bits.push((value >>> i) & 1);
    }
  };
  push(4, 4);
  push(bytes.length, version < 10 ? 8 : 16);
  bytes.forEach((byte) => push(byte, 8));
  push(0, Math.min(4, capacityBits - bits.length));
  push(0, (8 - (bits.length % 8)) % 8);
  for (let padByte = 0xEC; bits.length < capacityBits; padByte ^= 0xEC ^ 0x11) {
    push(padByte, 8);
  }

  const data = [];
  for (let i = 0; i < bits.length; i += 8) {
    data.push(bits.slice(i, i + 8).reduce((value, bit) => (value << 1) | bit, 0));
  }

  const blockCount = QR_BLOCK_COUNT[version];
  const eccLength = QR_ECC_PER_BLOCK[version];
  const rawCodewords = Math.floor(qrRawModules(version) / 8);
  const shortBlocks = blockCount - (rawCodewords % blockCount);
  const shortLength = Math.floor(rawCodewords / blockCount);
  const divisor = reedSolomonDivisor(eccLength);

  const blocks = [];
  let offset = 0;
  for (let i = 0; i < blockCount; i += 1) {
    const dataLength = shortLength - eccLength + (i < shortBlocks ? 0 : 1);
    const chunk = data.slice(offset, offset + dataLength);
    offset += dataLength;
    const ecc = reedSolomonRemainder(chunk, divisor);
    if (i < shortBlocks) {
      chunk.push(0);
    }
    blocks.push(chunk.concat(ecc));
  }

  const codewords = [];
  for (let i = 0; i < blocks[0].length; i += 1) {
    blocks.forEach((block, index) => {
      if (i !== shortLength - eccLength || index >= shortBlocks) {
        codewords.push(block[i]);
      }
    });
  }
  return codewords;
}

function qrPenalty(modules) {
  const size = modules.length;
  let score = 0;
  const lines = [];
  for (let i = 0; i < size; i += 1) {
    lines.push(modules[i]);
    lines.push(modules.map((row) => row[i]));
  }
  lines.forEach((line) => {
    let run = 1;
    for (let i = 1; i <= size; i += 1) {
      if (i < size && line[i] === line[i - 1]) {
        run += 1;
      } else {
        if (run >= 5) {
          score += run - 2;
        }
        run = 1;
      }
    }
    const text = line.map((dark) => (dark ? '1' : '0')).join('');
    ['10111010000', '00001011101'].forEach((pattern) => {
      for (let at = text.indexOf(pattern); at !== -1; at = text.indexOf(pattern, at + 1)) {
        score += 40;
      }
    });
  });
  let dark = 0;
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const colour = modules[y][x];
      if (colour) {
        dark += 1;
      }
      if (x + 1 < size && y + 1 < size
        && colour === modules[y][x + 1] && colour === modules[y + 1][x] && colour === modules[y + 1][x + 1]) {
        score += 3;
      }
    }
  }
  return score + Math.floor(Math.abs(dark * 20 - size * size * 10) / (size * size)) * 10;
}

/* Returns the module matrix for the text, or null when it is too long. A mask
   can be forced so the output can be compared against a reference encoder. */
function qrEncode(text, forcedMask = -1) {
  const bytes = Array.from(new TextEncoder().encode(text));
  let version = 1;
  while (4 + (version < 10 ? 8 : 16) + bytes.length * 8 > qrDataCodewords(version) * 8) {
    version += 1;
    if (version > QR_MAX_VERSION) {
      return null;
    }
  }

  const size = version * 4 + 17;
  const modules = Array.from({ length: size }, () => new Array(size).fill(false));
  const reserved = Array.from({ length: size }, () => new Array(size).fill(false));
  const setFunction = (x, y, dark) => {
    modules[y][x] = dark;
    reserved[y][x] = true;
  };

  /* Timing patterns. */
  for (let i = 0; i < size; i += 1) {
    setFunction(6, i, i % 2 === 0);
    setFunction(i, 6, i % 2 === 0);
  }

  /* Finder patterns with their separators. */
  [[3, 3], [size - 4, 3], [3, size - 4]].forEach(([centreX, centreY]) => {
    for (let dy = -4; dy <= 4; dy += 1) {
      for (let dx = -4; dx <= 4; dx += 1) {
        const x = centreX + dx;
        const y = centreY + dy;
        const distance = Math.max(Math.abs(dx), Math.abs(dy));
        if (x >= 0 && x < size && y >= 0 && y < size) {
          setFunction(x, y, distance !== 2 && distance !== 4);
        }
      }
    }
  });

  /* Alignment patterns. */
  const alignPositions = [];
  if (version > 1) {
    const alignCount = Math.floor(version / 7) + 2;
    const step = Math.ceil((version * 4 + 4) / (alignCount * 2 - 2)) * 2;
    for (let position = size - 7; alignPositions.length < alignCount - 1; position -= step) {
      alignPositions.unshift(position);
    }
    alignPositions.unshift(6);
  }
  const lastAlign = alignPositions.length - 1;
  alignPositions.forEach((centreY, i) => {
    alignPositions.forEach((centreX, j) => {
      const onFinder = (i === 0 && j === 0) || (i === 0 && j === lastAlign) || (i === lastAlign && j === 0);
      if (!onFinder) {
        for (let dy = -2; dy <= 2; dy += 1) {
          for (let dx = -2; dx <= 2; dx += 1) {
            setFunction(centreX + dx, centreY + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
          }
        }
      }
    });
  });

  /* Format information: level M with the chosen mask, protected by BCH(15,5). */
  const drawFormat = (mask) => {
    let remainder = mask;
    for (let i = 0; i < 10; i += 1) {
      remainder = (remainder << 1) ^ ((remainder >>> 9) * 0x537);
    }
    const bits = ((mask << 10) | remainder) ^ 0x5412;
    const bit = (index) => ((bits >>> index) & 1) !== 0;
    for (let i = 0; i <= 5; i += 1) {
      setFunction(8, i, bit(i));
    }
    setFunction(8, 7, bit(6));
    setFunction(8, 8, bit(7));
    setFunction(7, 8, bit(8));
    for (let i = 9; i < 15; i += 1) {
      setFunction(14 - i, 8, bit(i));
    }
    for (let i = 0; i < 8; i += 1) {
      setFunction(size - 1 - i, 8, bit(i));
    }
    for (let i = 8; i < 15; i += 1) {
      setFunction(8, size - 15 + i, bit(i));
    }
    setFunction(8, size - 8, true);
  };
  drawFormat(0);

  /* Version information for version 7 and above, protected by BCH(18,6). */
  if (version >= 7) {
    let remainder = version;
    for (let i = 0; i < 12; i += 1) {
      remainder = (remainder << 1) ^ ((remainder >>> 11) * 0x1F25);
    }
    const bits = (version << 12) | remainder;
    for (let i = 0; i < 18; i += 1) {
      const dark = ((bits >>> i) & 1) !== 0;
      const a = size - 11 + (i % 3);
      const b = Math.floor(i / 3);
      setFunction(a, b, dark);
      setFunction(b, a, dark);
    }
  }

  /* Data placement: two-column zigzag from the bottom-right corner. */
  const codewords = qrCodewords(bytes, version);
  let bitIndex = 0;
  for (let right = size - 1; right >= 1; right -= 2) {
    if (right === 6) {
      right = 5;
    }
    for (let vertical = 0; vertical < size; vertical += 1) {
      for (let j = 0; j < 2; j += 1) {
        const x = right - j;
        const upward = ((right + 1) & 2) === 0;
        const y = upward ? size - 1 - vertical : vertical;
        if (!reserved[y][x] && bitIndex < codewords.length * 8) {
          modules[y][x] = ((codewords[bitIndex >>> 3] >>> (7 - (bitIndex & 7))) & 1) !== 0;
          bitIndex += 1;
        }
      }
    }
  }

  /* Try every mask and keep the one with the lowest penalty. */
  const applyMask = (mask) => {
    for (let y = 0; y < size; y += 1) {
      for (let x = 0; x < size; x += 1) {
        if (!reserved[y][x] && QR_MASKS[mask](x, y)) {
          modules[y][x] = !modules[y][x];
        }
      }
    }
  };
  let bestMask = Math.max(0, forcedMask);
  let bestPenalty = Infinity;
  for (let mask = 0; forcedMask < 0 && mask < QR_MASKS.length; mask += 1) {
    applyMask(mask);
    drawFormat(mask);
    const penalty = qrPenalty(modules);
    if (penalty < bestPenalty) {
      bestPenalty = penalty;
      bestMask = mask;
    }
    applyMask(mask);
  }
  applyMask(bestMask);
  drawFormat(bestMask);

  return { version, size, modules };
}

/* One SVG path, with each horizontal run of dark modules drawn as a rectangle. */
function qrPath(matrix) {
  let path = '';
  matrix.modules.forEach((row, y) => {
    let x = 0;
    while (x < matrix.size) {
      if (row[x]) {
        let length = 1;
        while (x + length < matrix.size && row[x + length]) {
          length += 1;
        }
        path += `M${x} ${y}h${length}v1h-${length}z`;
        x += length;
      } else {
        x += 1;
      }
    }
  });
  return path;
}

/* --------------------------------------------------------------------------
   Certificate verification page
   -------------------------------------------------------------------------- */
/* The link carries the signed record itself, so any browser can recompute the
   digest. It proves the fields were not altered; it is not proof of origin. */
function verificationUrl(truck) {
  const cert = truck.certificate;
  if (cert.status !== 'valid' || !cert.hash || !cert.signedAt) {
    return '';
  }
  const record = [
    truck.id,
    cert.signedAt.getTime(),
    truck.log.transitMinutes,
    truck.log.min,
    truck.log.max,
    truck.log.excursions,
    truck.log.doorOpenings,
    cert.hash.slice(0, VERIFY_DIGEST_LENGTH)
  ].join('~');
  return `${window.location.href.split('#')[0]}${VERIFY_PREFIX}${record}`;
}

function parseVerificationRecord(hash) {
  let parts = [];
  try {
    parts = decodeURIComponent(hash.slice(VERIFY_PREFIX.length)).split('~');
  } catch (error) {
    return null;
  }
  if (parts.length !== 8) {
    return null;
  }
  const truck = getTruck(parts[0]);
  const numbers = parts.slice(1, 7).map(Number);
  const digest = parts[7].toLowerCase();
  if (!truck || numbers.some((value) => !Number.isFinite(value)) || !/^[0-9a-f]+$/.test(digest)
    || digest.length !== VERIFY_DIGEST_LENGTH || numbers[0] <= 0 || numbers[0] > 8640000000000000) {
    return null;
  }
  return {
    truck,
    digest,
    signedAt: numbers[0],
    transitMinutes: numbers[1],
    min: numbers[2],
    max: numbers[3],
    excursions: numbers[4],
    doorOpenings: numbers[5]
  };
}

async function loadVerification() {
  verificationToken += 1;
  const token = verificationToken;
  const hash = window.location.hash;

  if (!hash.startsWith(VERIFY_PREFIX)) {
    if (state.verification) {
      state.verification = null;
      render();
    }
    return;
  }

  const record = parseVerificationRecord(hash);
  state.certificateModalOpen = false;
  state.verification = record ? { ...record, status: 'checking' } : { status: 'invalid' };
  render();
  el.viewport.scrollTop = 0;
  if (!record) {
    return;
  }

  const computed = await sha256Hex(certificatePayload(record.truck, record));
  if (token === verificationToken && state.verification) {
    state.verification.status = computed.slice(0, VERIFY_DIGEST_LENGTH) === record.digest ? 'verified' : 'failed';
    render();
  }
}

function exitVerification() {
  window.history.replaceState(null, '', window.location.href.split('#')[0]);
  verificationToken += 1;
  state.verification = null;
  render();
  el.viewport.scrollTop = 0;
}

/* --------------------------------------------------------------------------
   Actions
   -------------------------------------------------------------------------- */
/* --- Authentication (simulated, browser only) --- */
function persistSession() {
  try {
    window.sessionStorage.setItem(SESSION_KEY, JSON.stringify({
      role: state.currentRole,
      client: state.session.client ? state.session.client.id : null,
      admin: state.session.admin ? state.session.admin.id : null,
      clientTruckId: state.clientTruckId
    }));
  } catch (error) {
    /* Storage unavailable: the session lasts until the page is closed. */
  }
}

function restoreSession() {
  let saved = null;
  try {
    saved = JSON.parse(window.sessionStorage.getItem(SESSION_KEY) || 'null');
  } catch (error) {
    saved = null;
  }
  if (!saved || typeof saved !== 'object') {
    return;
  }
  ['client', 'admin'].forEach((role) => {
    state.session[role] = DEMO_ACCOUNTS.find((item) => item.id === saved[role] && item.role === role) || null;
  });
  if (saved.role === 'client' || saved.role === 'admin') {
    state.currentRole = saved.role;
  }
  const account = state.session.client;
  if (account) {
    state.clientTruckId = account.trucks.includes(saved.clientTruckId) ? saved.clientTruckId : account.trucks[0];
  }
}

function lockSecondsLeft(role = state.currentRole) {
  return Math.max(0, Math.ceil((state.auth.lockedUntil[role] - Date.now()) / 1000));
}

function resetAuthForm() {
  el['auth-form'].reset();
  el['auth-password'].type = 'password';
  el['auth-toggle'].setAttribute('aria-pressed', 'false');
}

function submitSignIn() {
  const role = state.currentRole;
  const copy = AUTH_COPY[role];
  if (lockSecondsLeft(role) > 0) {
    renderAuth();
    return;
  }

  const identifier = el['auth-identifier'].value.trim().toLowerCase();
  const password = el['auth-password'].value;
  if (!identifier || !password) {
    state.auth.error = { source: copy.missing };
    renderAuth();
    return;
  }

  const account = DEMO_ACCOUNTS.find(
    (item) => item.role === role && item.identifier.toLowerCase() === identifier && item.password === password
  );

  if (!account) {
    state.auth.attempts[role] += 1;
    const attempt = state.auth.attempts[role];
    if (attempt >= MAX_SIGN_IN_ATTEMPTS) {
      state.auth.attempts[role] = 0;
      state.auth.lockedUntil[role] = Date.now() + LOCKOUT_MS;
      state.auth.error = null;
      appendLog('alert', 'Sign-in locked on the {scope} for {seconds} seconds after {attempts} failed attempts.', {
        scope: copy.scope,
        seconds: LOCKOUT_MS / 1000,
        attempts: MAX_SIGN_IN_ATTEMPTS
      });
    } else {
      const left = MAX_SIGN_IN_ATTEMPTS - attempt;
      state.auth.error = left === 1
        ? { source: 'Those details do not match an account. 1 attempt left before a temporary lock.' }
        : { source: 'Those details do not match an account. {left} attempts left before a temporary lock.', params: { left } };
      appendLog('alert', 'Failed sign-in attempt on the {scope} ({attempt} of {max}).', {
        scope: copy.scope,
        attempt,
        max: MAX_SIGN_IN_ATTEMPTS
      });
    }
    el['auth-password'].value = '';
    renderAuth();
    el['auth-password'].focus();
    return;
  }

  state.auth.attempts[role] = 0;
  state.auth.error = null;
  state.session[role] = account;
  if (role === 'client' && !account.trucks.includes(state.clientTruckId)) {
    state.clientTruckId = account.trucks[0];
  }
  state.lastActivityAt = Date.now();
  resetAuthForm();
  persistSession();
  appendLog('ok', 'Sign-in on the {scope}: {name}.', { scope: copy.scope, name: account.name });
  showToast(t('Signed in as {name}', { name: account.name }), 'safe');
  render();
  el.viewport.scrollTop = 0;
  el.viewport.focus();
}

function signOut(role = state.currentRole, idle = false) {
  const account = state.session[role];
  if (!account) {
    return;
  }
  state.session[role] = null;
  persistSession();
  appendLog(
    'info',
    idle ? 'Sign-out on the {scope}: {name} (idle timeout).' : 'Sign-out on the {scope}: {name}.',
    { scope: AUTH_COPY[role].scope, name: account.name }
  );

  if (role === state.currentRole) {
    state.certificateModalOpen = false;
    lastFocused = null;
    state.auth.error = idle ? { source: 'You were signed out after a period of inactivity.' } : null;
    hideToast();
    resetAuthForm();
    render();
    el.viewport.scrollTop = 0;
  }
}

function fillDemoCredentials() {
  const account = DEMO_ACCOUNTS.find((item) => item.role === state.currentRole);
  el['auth-identifier'].value = account.identifier;
  el['auth-password'].value = account.password;
  state.auth.error = null;
  renderAuth();
  el['auth-submit'].focus();
}

function togglePasswordVisibility() {
  const input = el['auth-password'];
  const reveal = input.type === 'password';
  input.type = reveal ? 'text' : 'password';
  el['auth-toggle'].setAttribute('aria-pressed', String(reveal));
  renderAuth();
}

function selectConsignment(truckId) {
  const account = state.session.client;
  if (!account || !account.trucks.includes(truckId) || state.clientTruckId === truckId) {
    return;
  }
  state.clientTruckId = truckId;
  persistSession();
  render();
}

/* --- Hardware health --- */
function hardwareChecks(truck) {
  const level = (fault, warn) => {
    if (fault) {
      return 'fault';
    }
    return warn ? 'warn' : 'ok';
  };
  return {
    battery: level(truck.sensorBattery < 15, truck.sensorBattery < 35),
    uplink: level(truck.uplinkSignal < -105, truck.uplinkSignal < -95 || truck.uplinkPing > 150),
    compressor: level(truck.status === 'excursion' || truck.compressorRpm === 0, false),
    fuel: level(truck.fuelPercent < 15, truck.fuelPercent < 30),
    seal: level(truck.log.doorOpenings > 0, false),
    calibration: 'ok',
    firmware: 'ok'
  };
}

function healthSummary(truck) {
  const levels = Object.values(hardwareChecks(truck));
  const faults = levels.filter((item) => item === 'fault').length;
  const warnings = levels.filter((item) => item === 'warn').length;
  if (faults > 0) {
    const label = faults === 1 ? t('1 Fault') : t('{count} Faults', { count: faults });
    return { label, tone: 'alert', chip: 'chip--alert chip--flash' };
  }
  if (warnings > 0) {
    return { label: t('{count} Attention', { count: warnings }), tone: 'ice', chip: 'chip--ice' };
  }
  return {
    label: t('{ok} / {total} Nominal', { ok: levels.length, total: levels.length }),
    tone: 'safe',
    chip: 'chip--safe'
  };
}

/* --- Alert history --- */
const unacknowledgedAlerts = (truckId) => state.alerts.filter(
  (alert) => !alert.acknowledgedAt && (!truckId || alert.truckId === truckId)
);

function openAlert(truck) {
  state.alerts.push({
    id: `ALT-${String(state.alerts.length + 1).padStart(4, '0')}`,
    truckId: truck.id,
    kind: 'excursion',
    startedAt: new Date(),
    endedAt: null,
    peak: truck.tempCurrent,
    limit: truck.tempMax,
    acknowledgedAt: null,
    acknowledgedBy: null
  });
}

function activeAlert(truckId) {
  return state.alerts.find((alert) => alert.truckId === truckId && alert.kind === 'excursion' && !alert.endedAt);
}

function acknowledgeAlert(button) {
  const alert = state.alerts.find((item) => item.id === button.dataset.alertId);
  const account = state.session.admin;
  if (!alert || alert.acknowledgedAt || !account) {
    return;
  }
  alert.acknowledgedAt = new Date();
  alert.acknowledgedBy = account.name;
  appendLog('ok', 'Alert {alert} on Unit {id} acknowledged by {name}.', {
    alert: alert.id,
    id: `#${alert.truckId}`,
    name: account.name
  });
  showToast(t('Alert {id} acknowledged', { id: alert.id }), 'safe');
  render();
  el.viewport.focus();
}

function setRole(role) {
  if (role !== 'client' && role !== 'admin') {
    return;
  }
  if (state.currentRole === role) {
    return;
  }
  state.currentRole = role;
  state.auth.error = null;
  resetAuthForm();
  persistSession();
  hideToast();
  buildDock();
  render();
  el.viewport.scrollTop = 0;
}

function setPanel(panelId) {
  const valid = DOCK_ITEMS[state.currentRole].some((item) => item.id === panelId);
  if (!valid) {
    return;
  }
  state.activePanel[state.currentRole] = panelId;
  render();
  el.viewport.scrollTop = 0;
}

function selectTruck(id) {
  if (!getTruck(id) || state.activeTruckId === id) {
    return;
  }
  state.activeTruckId = id;
  render();
}

function triggerIncident() {
  if (state.isExcursionActive) {
    return;
  }
  const truck = activeTruck();
  const cert = truck.certificate;

  state.isExcursionActive = true;
  state.excursionTruckId = truck.id;

  truck.status = 'excursion';
  truck.tempCurrent = round1(truck.tempBaseline + EXCURSION_DELTA_C);
  truck.compressorRpm = 0;
  truck.history.push(truck.tempCurrent);
  truck.history = truck.history.slice(-HISTORY_POINTS);

  truck.log.maxBeforeDrill = truck.log.max;
  truck.log.max = Math.max(truck.log.max, truck.tempCurrent);
  truck.log.excursions += 1;

  cert.statusBeforeDrill = cert.status;
  cert.status = 'hold';
  cert.hash = '';

  openAlert(truck);
  appendLog(
    'alert',
    'Incident drill: compressor failure on Unit {id}. Internal temperature {temp} ({delta} excursion). Compliance violation flagged.',
    { id: `#${truck.id}`, temp: plainTemp(truck.tempCurrent), delta: `+${EXCURSION_DELTA_C.toFixed(1)}°C` }
  );
  showToast(t('Excursion triggered on Unit {id}', { id: `#${truck.id}` }), 'alert');
  render();
}

function normalizeSensor() {
  if (!state.isExcursionActive) {
    return;
  }
  const truck = getTruck(state.excursionTruckId);
  const cert = truck.certificate;
  const alert = activeAlert(truck.id);

  truck.status = truck.baseStatus;
  truck.tempCurrent = truck.tempBaseline;
  truck.compressorRpm = truck.compressorNominalRpm;
  truck.history.push(truck.tempCurrent);
  truck.history = truck.history.slice(-HISTORY_POINTS);

  truck.log.max = truck.log.maxBeforeDrill;
  truck.log.excursions = Math.max(0, truck.log.excursions - 1);
  delete truck.log.maxBeforeDrill;

  cert.status = cert.statusBeforeDrill === 'not-issued' ? 'not-issued' : 'revalidate';
  delete cert.statusBeforeDrill;

  if (alert) {
    alert.endedAt = new Date();
  }
  state.isExcursionActive = false;
  state.excursionTruckId = null;

  appendLog(
    'ok',
    'Sensor normalized on Unit {id}. Telemetry back at baseline {temp}. Drill closed and excluded from the compliance record.',
    { id: `#${truck.id}`, temp: plainTemp(truck.tempCurrent) }
  );
  showToast(t('Unit {id} returned to nominal range', { id: `#${truck.id}` }), 'safe');
  render();
}

/* Returns the English source of the reason signing is blocked, or ''. */
function signBlockReason(truck) {
  if (truck.status === 'excursion') {
    return 'Signing is blocked while an excursion is active. Normalize the sensor first.';
  }
  if (truck.baseStatus === 'standby') {
    return 'Unit is on standby. There is no in-transit log to validate yet.';
  }
  if (!isInSpec(truck)) {
    return 'Signing is blocked while the reading is outside the permitted range.';
  }
  if (unacknowledgedAlerts(truck.id).length > 0) {
    return 'Acknowledge the open alert for this unit before signing.';
  }
  return '';
}

function signCertificate() {
  const truck = activeTruck();
  const reason = signBlockReason(truck);
  if (reason) {
    showToast(t(reason), 'alert');
    return;
  }
  const cert = truck.certificate;
  cert.status = 'valid';
  cert.signedAt = new Date();
  cert.hash = '';

  appendLog(
    'sign',
    'Certificate {serial} signed by {name}. Continuous log validated: {excursions} excursions, {openings} unauthorized openings.',
    {
      serial: cert.serial,
      name: PERSONNEL.qaOfficer,
      excursions: truck.log.excursions,
      openings: truck.log.doorOpenings
    }
  );
  showToast(t('Certificate signed for Unit {id}', { id: `#${truck.id}` }), 'safe');
  render();
  refreshCertificateHash(truck);
}

function openCertificate() {
  if (state.certificateModalOpen || !isAuthed() || state.verification) {
    return;
  }
  lastFocused = document.activeElement;
  state.certificateModalOpen = true;
  renderCertificate();
  renderModal();
  const closeButton = el.modal.querySelector('.modal__toolbar [data-action="close-certificate"]');
  if (closeButton) {
    closeButton.focus();
  }
}

function closeCertificate() {
  if (!state.certificateModalOpen) {
    return;
  }
  state.certificateModalOpen = false;
  renderModal();
  if (lastFocused && typeof lastFocused.focus === 'function') {
    lastFocused.focus();
  }
  lastFocused = null;
}

function printCertificate() {
  renderCertificate();
  window.print();
}

const ACTIONS = {
  'open-certificate': openCertificate,
  'close-certificate': closeCertificate,
  'print-certificate': printCertificate,
  'trigger-incident': triggerIncident,
  'normalize-sensor': normalizeSensor,
  'sign-certificate': signCertificate,
  'goto-diagnostics': () => setPanel('diagnostics'),
  'sign-out': () => signOut(),
  'fill-demo': fillDemoCredentials,
  'toggle-password': togglePasswordVisibility,
  'toggle-language': toggleLanguage,
  'acknowledge-alert': acknowledgeAlert,
  'exit-verification': exitVerification
};

/* --------------------------------------------------------------------------
   One-time DOM construction
   -------------------------------------------------------------------------- */
function cacheElements() {
  [
    'app', 'viewport', 'role-switch', 'live-chip', 'live-chip-text', 'lang-toggle', 'dock', 'dock-items', 'toast',
    'account-bar', 'account-name', 'auth-panel', 'auth-title', 'auth-sub', 'auth-form',
    'auth-identifier', 'auth-identifier-label', 'auth-password', 'auth-toggle', 'auth-error',
    'auth-submit', 'auth-demo-note', 'health-chip',
    'verify-panel', 'verify-banner', 'verify-banner-title', 'verify-banner-note', 'verify-card',
    'verify-serial', 'verify-chip', 'verify-vehicle', 'verify-consignment', 'verify-cargo', 'verify-range',
    'verify-signed', 'verify-duration', 'verify-minmax', 'verify-excursions', 'verify-door', 'verify-digest',
    'admin-alert', 'admin-alert-title', 'admin-alert-note',
    'client-banner', 'client-banner-title', 'client-banner-note',
    'cargo-card', 'cargo-consignment', 'cargo-state', 'cargo-type', 'cargo-temp', 'cargo-target',
    'cargo-meter', 'meter-min', 'meter-max', 'cargo-corridor', 'route-chip', 'route-stepper',
    'journey-title', 'journey-sub', 'journey-timeline',
    'custody-consignor', 'custody-consignee', 'custody-operator',
    'doc-heading', 'doc-status', 'doc-validated', 'doc-excursions', 'doc-door',
    'fleet-summary', 'fleet-grid', 'fleet-goto-label',
    'diag-title', 'diag-sub', 'trace-card', 'diag-temp', 'diag-status', 'diag-range',
    'spark-band', 'spark-setpoint', 'spark-line', 'spark-dot',
    'diag-battery', 'bar-battery', 'diag-uplink', 'row-uplink', 'diag-compressor', 'row-compressor',
    'diag-fuel', 'bar-fuel', 'diag-seal', 'diag-calibration', 'diag-firmware',
    'alerts-summary', 'alert-list', 'alerts-empty',
    'controls-title', 'seal-card', 'seal-serial', 'seal-status', 'seal-note', 'seal-signed',
    'seal-hash', 'seal-excursions', 'btn-incident', 'btn-normalize', 'btn-sign', 'tools-hint',
    'audit-log', 'log-count',
    'certificate', 'cert-serial', 'cert-consignor', 'cert-consignee', 'cert-vehicle', 'cert-operator',
    'cert-cargo', 'cert-setpoint', 'cert-duration', 'cert-minmax', 'cert-excursions', 'cert-door',
    'cert-seal', 'cert-stamp-title', 'cert-stamp-meta', 'cert-stamp-tick', 'cert-hash', 'cert-qr',
    'cert-qr-svg', 'cert-qr-pending', 'cert-verify-link', 'cert-signer'
  ].forEach((id) => {
    el[id] = byId(id);
  });
  el.modal = byId('certificate-modal');
  el.viewport = byId('viewport');
}

function buildStepper() {
  el['route-stepper'].innerHTML = ROUTE_STEPS.map((label, index) => `
    <li class="stepper__step" data-state="upcoming">
      <span class="stepper__node"><span class="stepper__num">${index + 1}</span>${iconMarkup('i-check')}</span>
      <span class="stepper__label"></span>
    </li>`).join('');
}

function buildTimeline() {
  el['journey-timeline'].innerHTML = ROUTE_STEPS.map(() => `
    <li class="timeline__step" data-state="upcoming">
      <p class="timeline__label"></p>
      <p class="timeline__place"></p>
      <p class="timeline__time"></p>
    </li>`).join('');
}

function buildFleet() {
  el['fleet-grid'].innerHTML = state.trucks.map((truck) => `
    <button type="button" class="unit-card" data-truck="${truck.id}" aria-pressed="false">
      <span class="unit-card__head">
        <span class="unit-card__id" data-field="unit"></span>
        <span class="chip" data-field="status"></span>
      </span>
      <span class="unit-card__cargo" data-field="cargo"></span>
      <span class="unit-card__metrics">
        <span class="metric">
          <span class="metric__label">Internal Temp</span>
          <span class="metric__value metric__value--temp" data-field="temp"></span>
        </span>
        <span class="metric">
          <span class="metric__label">Chiller Power</span>
          <span class="metric__value" data-field="chiller"></span>
        </span>
        <span class="metric">
          <span class="metric__label">Uplink</span>
          <span class="metric__value" data-field="uplink"></span>
        </span>
        <span class="metric">
          <span class="metric__label">Hardware Health</span>
          <span class="metric__value" data-field="health"></span>
        </span>
      </span>
    </button>`).join('');
}

function buildUnitPickers() {
  const markup = state.trucks.map((truck) => `
    <button type="button" class="unit-picker__option" data-truck="${truck.id}" aria-pressed="false" dir="ltr">#${truck.id}</button>`).join('');
  all('[data-unit-picker]').forEach((picker) => {
    picker.innerHTML = markup;
  });
}

function buildDock() {
  const items = DOCK_ITEMS[state.currentRole];
  el.dock.style.setProperty('--dock-count', String(items.length));
  el['dock-items'].innerHTML = items.map((item) => `
    <button type="button" class="dock-item" data-panel-target="${item.id}">
      ${iconMarkup(item.icon)}
      <span>${t(item.label)}</span>
      ${item.id === 'alerts' ? '<span class="dock-item__badge" data-dock-badge aria-hidden="true" hidden></span>' : ''}
    </button>`).join('');
}

function createAlertCard(alert) {
  const card = document.createElement('article');
  card.className = 'card alert-card';
  card.dataset.alert = alert.id;
  card.innerHTML = `
    <header class="card__head">
      <div>
        <p class="eyebrow" data-field="ref"></p>
        <h2 class="card__title" data-field="title"></h2>
      </div>
      <span class="chip" data-field="status"></span>
    </header>
    <dl class="facts">
      <div class="facts__row"><dt data-field="started-label"></dt><dd data-field="started"></dd></div>
      <div class="facts__row"><dt data-field="duration-label"></dt><dd data-field="duration"></dd></div>
      <div class="facts__row"><dt data-field="detail-label"></dt><dd data-field="detail"></dd></div>
      <div class="facts__row"><dt data-field="ack-label"></dt><dd data-field="ack"></dd></div>
    </dl>
    <button type="button" class="btn btn--outline btn--block btn--small" data-action="acknowledge-alert" data-alert-id="${alert.id}"></button>`;
  return card;
}

/* --------------------------------------------------------------------------
   Rendering
   -------------------------------------------------------------------------- */
function render() {
  renderShell();
  renderClient();
  renderFleet();
  renderDiagnostics();
  renderAlerts();
  renderControls();
  renderCertificate();
  renderModal();
}

function renderShell() {
  const role = state.currentRole;
  const verifying = Boolean(state.verification);
  const authed = isAuthed(role);
  const portal = authed && !verifying;
  const truck = viewTruck();
  const panelId = state.activePanel[role];
  const alertInView = portal && (role === 'admin' ? state.isExcursionActive : truck.status === 'excursion');

  el.app.dataset.role = role;
  el.app.dataset.alert = String(alertInView);
  el.app.dataset.authed = String(authed);
  /* Print rules read this flag: the certificate prints only inside a portal. */
  document.body.dataset.authed = String(portal);
  el['role-switch'].dataset.role = role;
  el['role-switch'].hidden = verifying;

  el['verify-panel'].hidden = !verifying;
  el['auth-panel'].hidden = authed || verifying;
  el.dock.hidden = !portal;
  el['live-chip'].hidden = !portal;
  el['account-bar'].hidden = !portal;
  if (portal) {
    setText(el['account-name'], t(state.session[role].name));
  }
  renderAuth();
  renderVerification();

  all('[data-role-target]').forEach((button) => {
    button.setAttribute('aria-pressed', String(button.dataset.roleTarget === role));
  });

  all('.panel[data-panel]').forEach((panel) => {
    const visible = portal && panel.dataset.role === role && panel.dataset.panel === panelId;
    if (panel.hidden === visible) {
      panel.hidden = !visible;
    }
  });

  const items = DOCK_ITEMS[role];
  const index = Math.max(0, items.findIndex((item) => item.id === panelId));
  el.dock.style.setProperty('--dock-index', String(index));
  all('.dock-item', el.dock).forEach((button) => {
    if (button.dataset.panelTarget === panelId) {
      button.setAttribute('aria-current', 'page');
    } else {
      button.removeAttribute('aria-current');
    }
  });
  const badge = el.dock.querySelector('[data-dock-badge]');
  if (badge) {
    const open = unacknowledgedAlerts().length;
    badge.hidden = open === 0;
    setText(badge, String(open));
  }

  const showAdminAlert = portal && role === 'admin' && state.isExcursionActive;
  el['admin-alert'].hidden = !showAdminAlert;
  if (showAdminAlert) {
    const affected = getTruck(state.excursionTruckId);
    setText(el['admin-alert-title'], t('Active Excursion • Unit {id}', { id: `#${affected.id}` }));
    setText(
      el['admin-alert-note'],
      t('Internal temperature {temp}, above the {limit} limit. Compliance violation flagged.', {
        temp: plainTemp(affected.tempCurrent),
        limit: plainTemp(affected.tempMax)
      })
    );
  }

  renderLiveChip();
}

function renderAuth() {
  const role = state.currentRole;
  const copy = AUTH_COPY[role];
  const locked = lockSecondsLeft(role);
  const error = state.auth.error;

  setText(el['auth-title'], t(copy.title));
  setText(el['auth-sub'], t(copy.sub));
  setText(el['auth-identifier-label'], t(copy.identifierLabel));
  el['auth-identifier'].setAttribute('inputmode', copy.inputMode);
  setText(el['auth-demo-note'], t(copy.demoNote));
  setText(el['auth-toggle'], t(el['auth-password'].type === 'password' ? 'Show' : 'Hide'));

  let message = '';
  if (locked > 0) {
    message = t('Too many failed attempts. Try again in {seconds} seconds.', { seconds: locked });
  } else if (error) {
    message = t(error.source, error.params);
  }
  el['auth-error'].hidden = !message;
  setText(el['auth-error'], message);
  el['auth-submit'].disabled = locked > 0;
}

function renderVerification() {
  const record = state.verification;
  if (!record) {
    return;
  }
  const view = VERIFY_STATUS[record.status];
  const bannerClass = `banner ${view.banner}`;
  if (el['verify-banner'].className !== bannerClass) {
    el['verify-banner'].className = bannerClass;
  }
  setText(el['verify-banner-title'], t(view.title));
  setText(el['verify-banner-note'], t(view.note));

  el['verify-card'].hidden = !record.truck;
  if (!record.truck) {
    return;
  }
  const truck = record.truck;
  setText(el['verify-serial'], truck.certificate.serial);
  setChip(el['verify-chip'], t(view.label), view.chip);
  setText(el['verify-vehicle'], t('Unit {id} ({vehicle})', { id: `#${truck.id}`, vehicle: truck.vehicleClass }));
  setText(el['verify-consignment'], ltr(truck.consignmentId));
  setText(el['verify-cargo'], t(truck.cargo));
  setText(el['verify-range'], t('{min} to {max}', { min: plainTemp(truck.tempMin), max: plainTemp(truck.tempMax) }));
  setText(el['verify-signed'], formatDateTime(new Date(record.signedAt)));
  setText(el['verify-duration'], formatDuration(record.transitMinutes));
  setText(el['verify-minmax'], `${formatTemp(record.min)} / ${formatTemp(record.max)}`);
  setText(el['verify-excursions'], excursionText(record.excursions));
  setText(el['verify-door'], t('{count} Unauthorized Openings', { count: record.doorOpenings }));
  setText(el['verify-digest'], ltr(`SHA256: ${record.digest}`));
}

function renderConsignmentPickers() {
  const account = state.session.client;
  const trucks = account ? account.trucks : [];
  const signature = trucks.join(',');
  all('[data-consignment-picker]').forEach((picker) => {
    picker.hidden = trucks.length < 2;
    if (picker.dataset.signature !== signature) {
      picker.dataset.signature = signature;
      picker.innerHTML = trucks.map((id) => `
        <button type="button" class="unit-picker__option" data-consignment="${id}" aria-pressed="false">${getTruck(id).consignmentId}</button>`).join('');
    }
    all('[data-consignment]', picker).forEach((button) => {
      const truck = getTruck(button.dataset.consignment);
      button.setAttribute('aria-pressed', String(truck.id === state.clientTruckId));
      button.dataset.status = truck.status;
    });
  });
}

function renderLiveChip() {
  const alertInView = el.app.dataset.alert === 'true';
  setText(el['live-chip-text'], `${alertInView ? 'Alert' : 'Live'} • ${formatClock(new Date(), true)}`);
}

function renderClient() {
  const truck = clientTruck();
  renderConsignmentPickers();
  const cert = truck.certificate;
  const certMeta = CERT_STATUS[cert.status];
  const inExcursion = truck.status === 'excursion';
  const onStandby = truck.baseStatus === 'standby';
  const inSpec = isInSpec(truck);

  /* Reassurance banner */
  let bannerClass = 'banner banner--safe';
  let bannerTitle = 'REFRIGERATION GUARANTEED • SAFE SPEC';
  let bannerNote = 'Your cargo is held inside its certified temperature range and monitored continuously.';
  if (inExcursion) {
    bannerClass = 'banner banner--alert';
    bannerTitle = 'TEMPERATURE EXCURSION • QA NOTIFIED';
    bannerNote = 'The reading is outside the permitted range. Quality assurance has been alerted and corrective action is under way.';
  } else if (onStandby) {
    bannerClass = 'banner banner--pending';
    bannerTitle = 'PRE-COOLING IN PROGRESS • DEPARTURE PENDING';
    bannerNote = 'Your cargo bay is being conditioned to its certified temperature before departure.';
  }
  if (el['client-banner'].className !== bannerClass) {
    el['client-banner'].className = bannerClass;
  }
  setText(el['client-banner-title'], bannerTitle);
  setText(el['client-banner-note'], bannerNote);

  /* Cargo snapshot */
  el['cargo-card'].dataset.tone = inSpec ? 'safe' : 'alert';
  setText(el['cargo-consignment'], truck.consignmentId);
  setText(el['cargo-type'], truck.cargo);
  setText(el['cargo-temp'], formatTemp(truck.tempCurrent));
  setText(
    el['cargo-target'],
    `Target ${formatTemp(truck.tempTarget)} • Permitted ${formatTemp(truck.tempMin)} to ${formatTemp(truck.tempMax)}`
  );
  setChip(el['cargo-state'], inSpec ? 'Within Spec' : 'Out of Spec', inSpec ? 'chip--safe' : 'chip--alert chip--flash');

  const domainMin = truck.tempMin - 2;
  const domainMax = truck.tempMax + EXCURSION_DELTA_C;
  const toPercent = (value) => clamp(((value - domainMin) / (domainMax - domainMin)) * 100, 3, 97);
  const meter = el['cargo-meter'];
  meter.style.setProperty('--band-start', `${toPercent(truck.tempMin)}%`);
  meter.style.setProperty('--band-end', `${toPercent(truck.tempMax)}%`);
  meter.style.setProperty('--setpoint', `${toPercent(truck.tempTarget)}%`);
  meter.style.setProperty('--marker', `${toPercent(truck.tempCurrent)}%`);
  meter.setAttribute(
    'aria-label',
    `Current ${formatTemp(truck.tempCurrent)}, permitted range ${formatTemp(truck.tempMin)} to ${formatTemp(truck.tempMax)}`
  );
  setText(el['meter-min'], formatTemp(truck.tempMin));
  setText(el['meter-max'], formatTemp(truck.tempMax));

  const etaText = truck.eta === null ? 'Departure Pending' : `ETA: ${truck.eta} Mins`;
  setText(el['cargo-corridor'], `${truck.corridor} • ${etaText}`);

  /* Route status */
  const routeLabel = onStandby ? 'Pre-Departure' : truck.routeStep === 2 ? 'At Inspection Hub' : 'In Transit';
  setChip(el['route-chip'], routeLabel, 'chip--ice');
  const stepState = (index) => {
    if (index < truck.routeStep) {
      return 'done';
    }
    return index === truck.routeStep ? 'current' : 'upcoming';
  };
  all('.stepper__step', el['route-stepper']).forEach((step, index) => {
    step.dataset.state = stepState(index);
    if (index === truck.routeStep) {
      step.setAttribute('aria-current', 'step');
    } else {
      step.removeAttribute('aria-current');
    }
  });

  /* Journey */
  setText(el['journey-title'], truck.consignmentId);
  setText(el['journey-sub'], `${truck.origin} to ${truck.destination}`);
  const now = Date.now();
  all('.timeline__step', el['journey-timeline']).forEach((step, index) => {
    const stateName = stepState(index);
    step.dataset.state = stateName;
    let place = truck.corridor;
    if (index === 0) {
      place = truck.origin;
    } else if (index === 2) {
      place = 'Regional Inspection Hub Checkpoint';
    } else if (index === 3) {
      place = truck.destination;
    }
    let timeText = 'Awaiting departure';
    if (stateName === 'done') {
      const minutesAgo = truck.milestonesAgo[index] || 0;
      timeText = `Completed ${formatClock(new Date(loadedAt - minutesAgo * 60000))}`;
    } else if (stateName === 'current') {
      timeText = onStandby ? 'Pre-cooling at origin dock' : 'In progress';
    } else if (truck.eta !== null) {
      const share = index === 3 ? 1 : 0.5;
      timeText = `Expected ${formatClock(new Date(now + truck.eta * share * 60000))}`;
    }
    setText(step.querySelector('.timeline__place'), place);
    setText(step.querySelector('.timeline__time'), timeText);
  });
  setText(el['custody-consignor'], truck.consignor);
  setText(el['custody-consignee'], truck.consignee);
  setText(el['custody-operator'], truck.operator);

  /* Documents */
  setText(el['doc-heading'], cert.serial);
  setChip(el['doc-status'], certMeta.label, certMeta.chip);
  setText(el['doc-validated'], cert.signedAt && cert.status === 'valid' ? formatDateTime(cert.signedAt) : certMeta.label);
  setText(el['doc-excursions'], excursionText(truck));
  setText(el['doc-door'], `${truck.log.doorOpenings} Unauthorized Openings`);
}

function excursionText(truck) {
  const count = truck.log.excursions;
  return count === 0 ? '0 (Zero Breaches Recorded)' : `${count} (Breach Recorded, Under Review)`;
}

function chillerState(truck) {
  if (truck.status === 'excursion') {
    return { label: 'FAULT', tone: 'alert' };
  }
  if (truck.baseStatus === 'standby') {
    return { label: 'Pre-Cooling', tone: 'ice' };
  }
  return { label: 'ON', tone: 'safe' };
}

function renderFleet() {
  const enRoute = state.trucks.filter((truck) => truck.baseStatus === 'en-route').length;
  const standby = state.trucks.length - enRoute;
  setText(el['fleet-summary'], `${state.trucks.length} units monitored • ${enRoute} en route • ${standby} on standby`);

  state.trucks.forEach((truck) => {
    const card = el['fleet-grid'].querySelector(`[data-truck="${truck.id}"]`);
    const meta = UNIT_STATUS[truck.status];
    const chiller = chillerState(truck);
    const tempNode = card.querySelector('[data-field="temp"]');
    const chillerNode = card.querySelector('[data-field="chiller"]');

    card.setAttribute('aria-pressed', String(truck.id === state.activeTruckId));
    card.dataset.status = truck.status;
    setChip(card.querySelector('[data-field="status"]'), meta.label, meta.chip);
    setText(card.querySelector('[data-field="cargo"]'), `${truck.cargoShort} • ${truck.consignmentId}`);
    setText(tempNode, formatTemp(truck.tempCurrent));
    tempNode.dataset.tone = isInSpec(truck) ? 'default' : 'alert';
    setText(chillerNode, chiller.label);
    chillerNode.dataset.tone = chiller.tone;
    setText(card.querySelector('[data-field="uplink"]'), `Online • ${truck.uplinkPing}ms`);

    const health = healthSummary(truck);
    const healthNode = card.querySelector('[data-field="health"]');
    setText(healthNode, health.label);
    healthNode.dataset.tone = health.tone;
  });

  all('.unit-picker__option[data-truck]').forEach((button) => {
    const truck = getTruck(button.dataset.truck);
    button.setAttribute('aria-pressed', String(truck.id === state.activeTruckId));
    button.dataset.status = truck.status;
  });

  setText(el['fleet-goto-label'], `Open Diagnostics for Unit #${state.activeTruckId}`);
}

function renderSparkline(truck) {
  const width = 320;
  const height = 84;
  const padY = 8;
  const values = truck.history;
  const low = Math.min(truck.tempMin - 1.5, ...values);
  const high = Math.max(truck.tempMax + 1.5, ...values) + 0.5;
  const toY = (value) => padY + ((high - value) / (high - low)) * (height - padY * 2);
  const stepX = (width - 8) / Math.max(1, HISTORY_POINTS - 1);
  const offset = HISTORY_POINTS - values.length;

  const points = values.map((value, index) => `${round1((offset + index) * stepX + 2)},${round1(toY(value))}`);
  el['spark-line'].setAttribute('points', points.join(' '));

  const bandTop = toY(truck.tempMax);
  const bandBottom = toY(truck.tempMin);
  el['spark-band'].setAttribute('y', String(round1(bandTop)));
  el['spark-band'].setAttribute('height', String(round1(bandBottom - bandTop)));

  const setpointY = String(round1(toY(truck.tempTarget)));
  el['spark-setpoint'].setAttribute('y1', setpointY);
  el['spark-setpoint'].setAttribute('y2', setpointY);

  const last = points[points.length - 1].split(',');
  el['spark-dot'].setAttribute('cx', last[0]);
  el['spark-dot'].setAttribute('cy', last[1]);
}

function renderDiagnostics() {
  const truck = activeTruck();
  const meta = UNIT_STATUS[truck.status];
  const inExcursion = truck.status === 'excursion';

  setText(el['diag-title'], `Unit #${truck.id}`);
  setText(el['diag-sub'], `${truck.vehicleClass} • ${truck.cargoShort}`);
  el['trace-card'].dataset.tone = isInSpec(truck) ? 'safe' : 'alert';
  setText(el['diag-temp'], formatTemp(truck.tempCurrent));
  setChip(el['diag-status'], meta.label, meta.chip);
  setText(
    el['diag-range'],
    `Setpoint ${formatTemp(truck.tempTarget)} • Permitted ${formatTemp(truck.tempMin)} to ${formatTemp(truck.tempMax)} • 60 s sampling`
  );
  renderSparkline(truck);

  setText(el['diag-battery'], `${truck.sensorBattery}% (Li-SOCl2 Cell, 3.6V)`);
  el['bar-battery'].parentElement.style.setProperty('--fill', `${truck.sensorBattery}%`);

  setText(
    el['diag-uplink'],
    `4G LTE / Satellite Failover (Ping: ${truck.uplinkPing}ms • ${truck.uplinkSignal} dBm)`
  );

  const health = healthSummary(truck);
  setChip(el['health-chip'], health.label, health.chip);
  Object.entries(hardwareChecks(truck)).forEach(([key, level]) => {
    const meta = HEALTH_LEVELS[level];
    const stateNode = byId(`state-${key}`);
    setText(stateNode, meta.label);
    stateNode.dataset.tone = meta.tone;
    byId(`row-${key}`).dataset.tone = level === 'fault' ? 'alert' : 'default';
  });

  setText(
    el['diag-compressor'],
    inExcursion
      ? '0 RPM (Compressor Fault, Inverter Trip)'
      : `${truck.compressorRpm.toLocaleString('en-US')} RPM (Inverter Variable Frequency)`
  );

  setText(el['diag-fuel'], `${truck.fuelPercent}% Diesel Dedicated Auxiliary`);
  el['bar-fuel'].parentElement.style.setProperty('--fill', `${truck.fuelPercent}%`);

  const sealState = truck.log.doorOpenings === 0 ? 'ENGAGED / ZERO BREACHES' : `ENGAGED / ${truck.log.doorOpenings} BREACHES`;
  setText(el['diag-seal'], `Electronic Seal #${truck.sealId} [${sealState}]`);
  setText(el['diag-calibration'], truck.calibration);
  setText(el['diag-firmware'], truck.firmware);
}

function renderControls() {
  const truck = activeTruck();
  const cert = truck.certificate;
  const certMeta = CERT_STATUS[cert.status];
  const drillTruck = state.isExcursionActive ? getTruck(state.excursionTruckId) : null;
  const blockReason = signBlockReason(truck);

  setText(el['controls-title'], `Unit #${truck.id}`);
  el['seal-card'].dataset.tone = certMeta.tone;
  setText(el['seal-serial'], cert.serial);
  setChip(el['seal-status'], certMeta.label, certMeta.chip);
  setText(el['seal-note'], certMeta.note);
  setText(el['seal-signed'], cert.status === 'valid' && cert.signedAt ? formatDateTime(cert.signedAt) : 'Not signed');
  setText(el['seal-hash'], hashLabel(cert));
  setText(el['seal-excursions'], excursionText(truck));

  el['btn-incident'].disabled = state.isExcursionActive;
  el['btn-normalize'].disabled = !state.isExcursionActive;
  el['btn-sign'].disabled = Boolean(blockReason);

  let hint = `Trigger Incident simulates a compressor failure and a +${EXCURSION_DELTA_C.toFixed(1)}°C spike on Unit #${truck.id}.`;
  if (drillTruck && drillTruck.id !== truck.id) {
    hint = `A drill is active on Unit #${drillTruck.id}. Normalize Sensor will close it. ${blockReason}`.trim();
  } else if (drillTruck) {
    hint = `Drill active on this unit. ${blockReason}`;
  } else if (blockReason) {
    hint = `${hint} ${blockReason}`;
  } else if (cert.status === 'revalidate') {
    hint = 'Telemetry is nominal. Issue / Sign Certificate to validate the log and restore the seal.';
  }
  setText(el['tools-hint'], hint);
}

function hashLabel(cert) {
  if (cert.status !== 'valid') {
    return cert.status === 'hold' ? 'Withheld (Compliance Hold)' : 'Not issued';
  }
  return cert.hash ? `SHA256: ${shortHash(cert.hash)}` : 'Digest unavailable in this browser';
}

function renderAuditLog() {
  const list = el['audit-log'];
  if (!list) {
    return;
  }
  const entries = state.auditLog.slice(-AUDIT_LOG_VISIBLE).reverse();
  list.innerHTML = '';
  entries.forEach((entry) => {
    const item = document.createElement('li');
    item.className = 'audit__entry';
    item.dataset.kind = entry.kind;
    item.value = entry.seq;

    const marker = document.createElement('span');
    marker.className = 'audit__marker';
    marker.setAttribute('aria-hidden', 'true');

    const message = document.createElement('p');
    message.className = 'audit__message';
    message.textContent = entry.message;

    const meta = document.createElement('p');
    meta.className = 'audit__meta';
    const digest = entry.digest ? `chain ${entry.digest.slice(0, 12)}` : 'chain pending';
    meta.textContent = `#${pad2(entry.seq)} • ${formatClock(entry.time, true)} • ${digest}`;

    item.append(marker, message, meta);
    list.append(item);
  });
  setText(el['log-count'], `${state.auditLog.length} Entries`);
}

/* Deterministic verification block: QR-styled placeholder seeded from the
   certificate serial and digest. It is not a decodable QR symbol. */
function renderVerificationBlock(seed) {
  const size = 25;
  let hashState = 2166136261;
  for (let index = 0; index < seed.length; index += 1) {
    hashState ^= seed.charCodeAt(index);
    hashState = Math.imul(hashState, 16777619);
  }
  const next = () => {
    hashState |= 0;
    hashState = (hashState + 0x6D2B79F5) | 0;
    let mixed = Math.imul(hashState ^ (hashState >>> 15), 1 | hashState);
    mixed = (mixed + Math.imul(mixed ^ (mixed >>> 7), 61 | mixed)) ^ mixed;
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296;
  };

  const finders = [[0, 0], [size - 7, 0], [0, size - 7]];
  const finderCell = (x, y) => {
    for (const [fx, fy] of finders) {
      const dx = x - fx;
      const dy = y - fy;
      if (dx >= -1 && dx <= 7 && dy >= -1 && dy <= 7) {
        if (dx < 0 || dx > 6 || dy < 0 || dy > 6) {
          return 0;
        }
        const ring = dx === 0 || dx === 6 || dy === 0 || dy === 6;
        const core = dx >= 2 && dx <= 4 && dy >= 2 && dy <= 4;
        return ring || core ? 1 : 0;
      }
    }
    return -1;
  };

  let path = '';
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const fixed = finderCell(x, y);
      const filled = fixed === -1 ? next() > 0.52 : fixed === 1;
      if (filled) {
        path += `M${x} ${y}h1v1h-1z`;
      }
    }
  }
  el['cert-qr'].setAttribute('d', path);
}

function renderCertificate() {
  const truck = viewTruck();
  const cert = truck.certificate;
  const certMeta = CERT_STATUS[cert.status];
  const log = truck.log;

  el.certificate.dataset.tone = certMeta.tone;
  setText(el['cert-serial'], cert.serial);
  setText(el['cert-consignor'], `${truck.consignor} (${truck.consignorDept})`);
  setText(el['cert-consignee'], `${truck.consignee} (${truck.consigneeTerminal})`);
  setText(el['cert-vehicle'], `Unit #${truck.id} (${truck.vehicleClass})`);
  setText(el['cert-operator'], truck.operator);
  setText(el['cert-cargo'], `${truck.consignmentId} • ${truck.cargo}`);
  setText(
    el['cert-setpoint'],
    `${formatTemp(truck.tempTarget)} (Permissible Range: ${formatTemp(truck.tempMin)} to ${formatTemp(truck.tempMax)})`
  );

  setText(
    el['cert-duration'],
    truck.baseStatus === 'standby' ? 'Not Commenced (Pre-Departure Conditioning)' : formatDuration(log.transitMinutes)
  );
  setText(el['cert-minmax'], `${formatTemp(log.min)} / ${formatTemp(log.max)}`);
  setText(el['cert-excursions'], excursionText(truck));
  el['cert-excursions'].dataset.tone = log.excursions === 0 ? 'default' : 'alert';
  setText(el['cert-door'], `${log.doorOpenings} Unauthorized Openings`);
  setText(el['cert-seal'], `#${truck.sealId} (Engaged)`);

  setText(el['cert-stamp-title'], certMeta.stamp);
  let stampMeta = 'Certificate not in force';
  if (cert.status === 'valid' && cert.signedAt) {
    stampMeta = `Signed ${formatDateTime(cert.signedAt)} by ${PERSONNEL.qaOfficer}`;
  } else if (cert.status === 'hold') {
    stampMeta = 'Seal suspended pending corrective action and QA review';
  } else if (cert.status === 'revalidate') {
    stampMeta = 'Telemetry nominal, awaiting signature';
  }
  setText(el['cert-stamp-meta'], stampMeta);
  el['cert-stamp-tick'].setAttribute(
    'd',
    cert.status === 'valid' ? 'M16.5 24.5l5 5 10-10.5' : cert.status === 'hold' ? 'M24 15v11M24 31.500v.500' : 'M17 24h14'
  );

  setText(el['cert-hash'], hashLabel(cert));
  setText(el['cert-signer'], cert.status === 'valid' ? PERSONNEL.qaOfficer : 'Signature pending');
  renderVerificationBlock(`${cert.serial}|${cert.status}|${cert.hash}`);
}

function renderModal() {
  const open = state.certificateModalOpen;
  if (el.modal.hidden === open) {
    el.modal.hidden = !open;
  }
  document.body.classList.toggle('is-modal-open', open);
}

function showToast(message, tone = 'info') {
  const toast = el.toast;
  toast.textContent = message;
  toast.dataset.tone = tone;
  toast.classList.add('is-visible');
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(hideToast, TOAST_MS);
}

function hideToast() {
  window.clearTimeout(toastTimer);
  el.toast.classList.remove('is-visible');
}

/* --------------------------------------------------------------------------
   Live telemetry
   -------------------------------------------------------------------------- */
function jitter(span) {
  return (Math.random() - 0.5) * span;
}

function sampleTemperature(truck) {
  const base = truck.tempBaseline + (truck.status === 'excursion' ? EXCURSION_DELTA_C : 0);
  return round1(base + jitter(0.5));
}

function liveTick() {
  state.trucks.forEach((truck) => {
    truck.tempCurrent = sampleTemperature(truck);
    truck.history.push(truck.tempCurrent);
    truck.history = truck.history.slice(-HISTORY_POINTS);
    truck.uplinkPing = clamp(Math.round(truck.uplinkPing + jitter(6)), 28, 72);
    if (truck.status === 'excursion') {
      truck.log.max = Math.max(truck.log.max, truck.tempCurrent);
    } else {
      truck.compressorRpm = truck.compressorNominalRpm + Math.round(jitter(40));
    }
  });
  renderShell();
  renderClient();
  renderFleet();
  renderDiagnostics();
  if (state.isExcursionActive) {
    renderCertificate();
  }
}

function etaTick() {
  state.trucks.forEach((truck) => {
    if (truck.eta !== null && truck.eta > 1) {
      truck.eta -= 1;
    }
  });
  renderClient();
}

/* --------------------------------------------------------------------------
   Events
   -------------------------------------------------------------------------- */
function handleClick(event) {
  const target = event.target instanceof Element ? event.target : null;
  if (!target) {
    return;
  }

  const roleButton = target.closest('[data-role-target]');
  if (roleButton) {
    setRole(roleButton.dataset.roleTarget);
    return;
  }

  const panelButton = target.closest('[data-panel-target]');
  if (panelButton) {
    setPanel(panelButton.dataset.panelTarget);
    return;
  }

  const consignmentButton = target.closest('[data-consignment]');
  if (consignmentButton) {
    selectConsignment(consignmentButton.dataset.consignment);
    return;
  }

  const truckButton = target.closest('[data-truck]');
  if (truckButton) {
    selectTruck(truckButton.dataset.truck);
    return;
  }

  const actionButton = target.closest('[data-action]');
  if (actionButton && !actionButton.disabled) {
    const action = ACTIONS[actionButton.dataset.action];
    if (action) {
      action();
    }
  }
}

function handleKeydown(event) {
  if (!state.certificateModalOpen) {
    return;
  }
  if (event.key === 'Escape') {
    event.preventDefault();
    closeCertificate();
    return;
  }
  if (event.key !== 'Tab') {
    return;
  }
  const focusable = all('button:not([disabled])', el.modal);
  if (focusable.length === 0) {
    return;
  }
  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  } else if (!el.modal.contains(document.activeElement)) {
    event.preventDefault();
    first.focus();
  }
}

/* --------------------------------------------------------------------------
   Boot
   -------------------------------------------------------------------------- */
function seedData() {
  state.trucks.forEach((truck, index) => {
    truck.history = Array.from({ length: HISTORY_POINTS }, () => sampleTemperature(truck));
    truck.tempCurrent = truck.tempBaseline;
    truck.history[truck.history.length - 1] = truck.tempCurrent;
    if (truck.certificate.status === 'valid') {
      truck.certificate.signedAt = new Date(loadedAt - (6 + index * 5) * 60000);
    }
  });
}

function seedAuditLog() {
  appendLog('info', 'Telemetry session opened. 3 units reporting on 60 second sampling.');
  state.trucks.forEach((truck) => {
    appendLog('info', `Electronic seal #${truck.sealId} engaged on Unit #${truck.id}.`);
  });
  state.trucks
    .filter((truck) => truck.certificate.status === 'valid')
    .forEach((truck) => {
      appendLog('sign', `Certificate ${truck.certificate.serial} validated by ${PERSONNEL.qaOfficer}.`);
    });
}

function secondTick() {
  renderLiveChip();
  const now = Date.now();
  ['client', 'admin'].forEach((role) => {
    if (state.session[role] && now - state.lastActivityAt > IDLE_LIMIT_MS[role]) {
      signOut(role, 'idle timeout');
    }
  });
  if (!isAuthed()) {
    renderAuth();
  }
}

function markActivity() {
  state.lastActivityAt = Date.now();
}

function init() {
  cacheElements();
  seedData();
  restoreSession();

  buildStepper();
  buildTimeline();
  buildFleet();
  buildUnitPickers();
  buildDock();

  document.addEventListener('click', handleClick);
  document.addEventListener('keydown', handleKeydown);
  document.addEventListener('pointerdown', markActivity, { passive: true });
  document.addEventListener('keydown', markActivity);
  el['auth-form'].addEventListener('submit', (event) => {
    event.preventDefault();
    submitSignIn();
  });
  window.addEventListener('beforeprint', renderCertificate);

  render();
  seedAuditLog();
  state.trucks.forEach((truck) => {
    refreshCertificateHash(truck);
  });

  window.setInterval(liveTick, LIVE_TICK_MS);
  window.setInterval(etaTick, ETA_TICK_MS);
  window.setInterval(secondTick, 1000);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
