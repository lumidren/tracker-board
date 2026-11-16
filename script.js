/* ==========================================================================
   Maatora | Cold-Chain Monitoring
   The interface only. It draws whatever view of the system its backend hands
   it and sends commands back. Two backends exist: the Maatora server (accounts,
   database, live updates) and an in-page demo that runs the same engine with
   test data when no server is present.
   ========================================================================== */
'use strict';

/* --------------------------------------------------------------------------
   Constants
   -------------------------------------------------------------------------- */
const Engine = window.MaatoraEngine;
/* Set by the server's own data.js. Absent when the page is opened as plain files. */
const REMOTE = window.MAATORA_REMOTE || null;
const SEED = window.MAATORA_SEED || { places: {}, geography: null };

const EXCURSION_DELTA_C = Engine.EXCURSION_DELTA_C;
const LIVE_TICK_MS = 4000;
const AUDIT_LOG_VISIBLE = 12;
const TOAST_MS = 3200;
const MAX_SIGN_IN_ATTEMPTS = 5;
const LOCKOUT_MS = 30000;
const IDLE_LIMIT_MS = { client: 30 * 60000, admin: 10 * 60000 };
const TOUCH_EVERY_MS = 60000;
const SESSION_KEY = 'maatora.session';
const LANG_KEY = 'maatora.lang';
const VERIFY_PREFIX = '#verify=';
/* Address of the hosted site, for example 'https://example.org/maatora/'. When set, every
   QR code points there, so anyone can verify a certificate from any phone. */
const PUBLIC_VERIFY_URL = '';
/* Used inside the phone app, whose own page address means nothing to another device. */
const APP_VERIFY_LINK = 'maatora://verify/';
const PORTALS = ['client', 'admin'];

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
    { id: 'shipments', label: 'Shipments', icon: 'i-list' },
    { id: 'status', label: 'Status', icon: 'i-shield-check' },
    { id: 'map', label: 'Map', icon: 'i-pin' },
    { id: 'documents', label: 'Documents', icon: 'i-document' }
  ],
  admin: [
    { id: 'fleet', label: 'Fleet', icon: 'i-fleet' },
    { id: 'map', label: 'Map', icon: 'i-pin' },
    { id: 'unit', label: 'Unit', icon: 'i-activity' },
    { id: 'alerts', label: 'Alerts', icon: 'i-bell' },
    { id: 'controls', label: 'Controls', icon: 'i-sliders' }
  ]
};

const AUTH_COPY = {
  client: {
    title: 'Client Portal Sign-In',
    sub: 'Follow your consignment temperature, route progress and compliance certificate.',
    identifierLabel: 'Account Email',
    missing: 'Enter your account email and password.',
    inputMode: 'email',
    scope: 'client portal'
  },
  admin: {
    title: 'Control Room Sign-In',
    sub: 'Dispatch and compliance controllers only: fleet telemetry, hardware health and certificate signing.',
    identifierLabel: 'Operator ID',
    missing: 'Enter your operator ID and password.',
    inputMode: 'text',
    scope: 'control room console'
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
  delivered: { label: 'Delivered', chip: 'chip--neutral' },
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
  revoked: {
    banner: 'banner--alert',
    chip: 'chip--alert',
    label: 'Not Current',
    title: 'CERTIFICATE NO LONGER CURRENT',
    note: 'This certificate was genuine when issued, but it has since been suspended or replaced by a newer one.'
  },
  unknown: {
    banner: 'banner--alert',
    chip: 'chip--alert',
    label: 'Failed',
    title: 'VERIFICATION FAILED • NOT ON RECORD',
    note: 'The issuing registry has no certificate with these details.'
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

/* How a shipment is described to a client, in everyday words. */
const SHIPMENT_STATES = {
  safe: {
    tone: 'safe',
    icon: 'i-check',
    headline: 'Your shipment is safe',
    text: 'The temperature is right and it is on its way.'
  },
  alert: {
    tone: 'alert',
    icon: 'i-alert',
    headline: 'There is a temperature problem',
    text: 'The temperature went outside the safe range. Our quality team has been alerted and is fixing it now.'
  },
  pending: {
    tone: 'pending',
    icon: 'i-clock',
    headline: 'Getting ready to leave',
    text: 'Your shipment is being cooled to the right temperature before it leaves.'
  },
  done: {
    tone: 'done',
    icon: 'i-flag',
    headline: 'Delivered safely',
    text: 'Your shipment arrived and stayed at the right temperature for the whole trip.'
  }
};

const PERMISSION_LABELS = {
  drill: 'Run drills',
  acknowledge: 'Acknowledge alerts',
  sign: 'Sign certificates',
  accounts: 'View accounts'
};

/* Map projection: a flat projection is accurate enough across one country. */
const MAP = { lon0: 24.4, lat0: 32.7, kx: 0.885, scale: 30, width: 345, height: 330 };

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
  'Back to Portal': 'العودة إلى البوابة',

  /* Navigation and sign-in additions */
  'Shipments': 'شحناتي',
  'Status': 'الحالة',
  'Map': 'الخريطة',
  'Unit': 'الوحدة',
  'My shipments': 'شحناتي',
  'Shipment status': 'حالة الشحنة',
  'Shipment map': 'خريطة الشحنة',
  'Fleet map': 'خريطة الأسطول',
  'Filter units': 'تصفية الوحدات',
  'Route progress': 'تقدّم المسار',
  'Map of the shipment route': 'خريطة مسار الشحنة',
  'Map of all units': 'خريطة جميع الوحدات',
  'Test Accounts': 'حسابات تجريبية',
  'Demo': 'تجريبي',
  'These accounts exist only in this browser. Choose one to fill in the form.': 'هذه الحسابات موجودة داخل هذا المتصفح فقط. اختر حسابًا لتعبئة النموذج.',
  'This server is running in demo mode. Choose a test account to fill in the form.': 'هذا الخادم يعمل في الوضع التجريبي. اختر حسابًا تجريبيًا لتعبئة النموذج.',
  'Signing in': 'جارٍ تسجيل الدخول',
  'The server could not be reached. Check the connection and try again.': 'تعذّر الوصول إلى الخادم. تحقّق من الاتصال وحاول مجددًا.',
  'Your session ended. Please sign in again.': 'انتهت جلستك. يُرجى تسجيل الدخول مجددًا.',
  'Loading your data': 'جارٍ تحميل بياناتك',

  /* Accounts, roles and organisations */
  'Fleet Dispatch Controller': 'مراقب إرسال الأسطول',
  'Platform Administrator': 'مدير المنصة',
  'Quality Assurance': 'ضمان الجودة',
  'Dispatch': 'الإرسال',
  'Regulatory Affairs (Read Only)': 'الشؤون التنظيمية (اطّلاع فقط)',
  'Administration': 'الإدارة',
  'Receiving Depot': 'مستودع استلام',
  'Delta Dairy Cooperative S.A.E.': 'تعاونية ألبان الدلتا (ش.م.م)',
  'Certified Dairy Logistics Dept.': 'إدارة لوجستيات الألبان المعتمدة',
  'Upper Egypt Pharmacy Network Depot #11': 'مستودع شبكة صيدليات الصعيد رقم 11',
  'Canal Zone Blood Bank #03': 'بنك الدم بمنطقة القناة رقم 03',
  'Western Coast Cold Store #05': 'مخزن التبريد بالساحل الغربي رقم 05',
  'Red Sea Hospitality Depot #08': 'مستودع الضيافة بالبحر الأحمر رقم 08',
  'Capital Retail Distribution Hub #01': 'مركز توزيع التجزئة بالعاصمة رقم 01',
  'Damietta Wholesale Market Depot #06': 'مستودع سوق الجملة بدمياط رقم 06',
  'Luxor Fresh Produce Terminal #09': 'محطة المنتجات الطازجة بالأقصر رقم 09',
  'Regional Receiving Terminal #11': 'محطة الاستلام الإقليمية رقم 11',
  'Regional Receiving Terminal #03': 'محطة الاستلام الإقليمية رقم 03',
  'Regional Receiving Terminal #05': 'محطة الاستلام الإقليمية رقم 05',
  'Regional Receiving Terminal #08': 'محطة الاستلام الإقليمية رقم 08',
  'Regional Receiving Terminal #01': 'محطة الاستلام الإقليمية رقم 01',
  'Regional Receiving Terminal #06': 'محطة الاستلام الإقليمية رقم 06',
  'Regional Receiving Terminal #09': 'محطة الاستلام الإقليمية رقم 09',
  'Alexandria Frozen Goods Dock': 'رصيف البضائع المجمّدة بالإسكندرية',
  'Suez Cold Port Terminal': 'محطة ميناء التبريد بالسويس',
  'Tanta Dairy Collection Plant': 'محطة تجميع الألبان بطنطا',
  'Mansoura Dairy Plant': 'مصنع الألبان بالمنصورة',
  'Asyut Produce Packing House': 'محطة تعبئة المنتجات بأسيوط',
  'Certified Transport Operator #412': 'مشغّل النقل المعتمد رقم 412',
  'Certified Transport Operator #509': 'مشغّل النقل المعتمد رقم 509',
  'Certified Transport Operator #620': 'مشغّل النقل المعتمد رقم 620',
  'Certified Transport Operator #733': 'مشغّل النقل المعتمد رقم 733',
  'Certified Transport Operator #840': 'مشغّل النقل المعتمد رقم 840',
  'Certified Transport Operator #951': 'مشغّل النقل المعتمد رقم 951',
  'Certified Transport Operator #067': 'مشغّل النقل المعتمد رقم 067',
  'Light Refrigerated Van 7.5T': 'شاحنة مبرّدة خفيفة 7.5 طن',

  /* Cargo */
  'Insulin Supplies (Chilled 2–8°C)': 'مستلزمات الإنسولين (مبرّدة من 2 إلى 8 درجات مئوية)',
  'Insulin': 'إنسولين',
  'Blood Plasma (Deep-Frozen)': 'بلازما دم (تجميد عميق)',
  'Blood Plasma': 'بلازما دم',
  'Frozen Poultry (Deep-Frozen)': 'دواجن مجمّدة (تجميد عميق)',
  'Frozen Poultry': 'دواجن مجمّدة',
  'Ice Cream (Deep-Frozen)': 'مثلجات (تجميد عميق)',
  'Ice Cream': 'مثلجات',
  'Fresh Dairy (Chilled 1–5°C)': 'ألبان طازجة (مبرّدة من 1 إلى 5 درجات مئوية)',
  'Fresh Dairy': 'ألبان طازجة',
  'Yoghurt & Cheese (Chilled 2–6°C)': 'زبادي وأجبان (مبرّدة من 2 إلى 6 درجات مئوية)',
  'Yoghurt & Cheese': 'زبادي وأجبان',
  'Fresh Grade-A Perishables': 'منتجات طازجة سريعة التلف من الدرجة الأولى',
  'Fresh Produce': 'منتجات طازجة',

  /* Places and corridors */
  'Cairo': 'القاهرة',
  'Alexandria': 'الإسكندرية',
  'Mansoura': 'المنصورة',
  'Port Said': 'بورسعيد',
  'Suez': 'السويس',
  'Ismailia': 'الإسماعيلية',
  'Tanta': 'طنطا',
  'Damietta': 'دمياط',
  'Marsa Matruh': 'مرسى مطروح',
  'Beni Suef': 'بني سويف',
  'Minya': 'المنيا',
  'Asyut': 'أسيوط',
  'Sohag': 'سوهاج',
  'Qena': 'قنا',
  'Luxor': 'الأقصر',
  'Aswan': 'أسوان',
  'Hurghada': 'الغردقة',
  'Mediterranean Sea': 'البحر المتوسط',
  'Red Sea': 'البحر الأحمر',
  'Transit Corridor 2': 'ممر العبور 2',
  'Transit Corridor 3': 'ممر العبور 3',
  'Transit Corridor 5': 'ممر العبور 5',
  'Transit Corridor 8': 'ممر العبور 8',
  'Transit Corridor 9': 'ممر العبور 9',
  'Transit Corridor 11': 'ممر العبور 11',
  'Transit Corridor 12': 'ممر العبور 12',
  'Transit Corridor 14': 'ممر العبور 14',

  /* Plain-language client dashboard */
  'My Shipments': 'شحناتي',
  'No shipments yet': 'لا توجد شحنات بعد',
  'Shipments addressed to your organisation will appear here.': 'ستظهر هنا الشحنات الخاصة بمؤسستك.',
  'Your shipment is safe': 'شحنتك بأمان',
  'All {count} shipments are safe': 'جميع الشحنات ({count}) بأمان',
  'One shipment needs attention': 'توجد شحنة واحدة تحتاج إلى متابعة',
  '{count} shipments need attention': '{count} شحنات تحتاج إلى متابعة',
  'Tap a shipment to see its details.': 'اضغط على أي شحنة لعرض تفاصيلها.',
  'What the Colours Mean': 'معاني الألوان',
  'Green: the shipment is safe.': 'الأخضر: الشحنة بأمان.',
  'Red: there is a problem and our team is fixing it.': 'الأحمر: توجد مشكلة وفريقنا يعالجها.',
  'Blue: getting ready to leave.': 'الأزرق: الشحنة تستعد للمغادرة.',
  'Grey: already delivered.': 'الرمادي: تم التسليم.',
  '{cargo} to {city}': '{cargo} إلى {city}',
  'The temperature is right and it is on its way.': 'درجة الحرارة سليمة والشحنة في طريقها إليك.',
  'There is a temperature problem': 'توجد مشكلة في درجة الحرارة',
  'The temperature went outside the safe range. Our quality team has been alerted and is fixing it now.': 'خرجت درجة الحرارة عن النطاق الآمن. تم تنبيه فريق الجودة وهو يعالج المشكلة الآن.',
  'Getting ready to leave': 'تستعد للمغادرة',
  'Your shipment is being cooled to the right temperature before it leaves.': 'يجري تبريد شحنتك إلى الدرجة المناسبة قبل مغادرتها.',
  'Delivered safely': 'تم التسليم بأمان',
  'Your shipment arrived and stayed at the right temperature for the whole trip.': 'وصلت شحنتك وبقيت في درجة الحرارة المناسبة طوال الرحلة.',
  'On the road • arrives in {eta}': 'في الطريق • تصل خلال {eta}',
  'Temperature problem • our team is on it': 'مشكلة في الحرارة • فريقنا يعالجها',
  'Delivered at {time}': 'تم التسليم الساعة {time}',
  'about {n} minutes': 'نحو {n} دقيقة',
  'about {h} h {m} min': 'نحو {h} س و{m} د',
  'Temperature Now': 'درجة الحرارة الآن',
  'It should stay between {min} and {max}.': 'يجب أن تبقى بين {min} و{max}.',
  'Temperature OK': 'الحرارة سليمة',
  'Too Warm': 'أدفأ من اللازم',
  'Too Cold': 'أبرد من اللازم',
  'Arrival': 'الوصول',
  'Arrives in {eta}': 'تصل خلال {eta}',
  'Waiting to leave': 'بانتظار المغادرة',
  'Arrived at {time}': 'وصلت الساعة {time}',
  'at {place}, {city}': 'إلى {place}، {city}',
  '{done} of {total} km done • {left} km to go': 'قُطع {done} من {total} كم • تبقّى {left} كم',
  'The trip of {total} km has not started yet.': 'لم تبدأ بعد الرحلة البالغة {total} كم.',
  'The whole trip of {total} km is complete.': 'اكتملت الرحلة البالغة {total} كم.',
  'Delivered': 'تم التسليم',
  'Shipment Details': 'تفاصيل الشحنة',
  'Shipment Number': 'رقم الشحنة',
  'What Is Inside': 'المحتويات',
  'Quantity': 'الكمية',
  '{count} pallets': '{count} منصات تحميل',
  'From': 'من',
  'To': 'إلى',
  '{place}, {city}': '{place}، {city}',
  'Driver': 'السائق',
  'Left At': 'وقت المغادرة',
  'Not yet': 'لم تغادر بعد',
  'Where It Is': 'موقع الشحنة',
  'This certificate proves your shipment stayed cold for the whole trip.': 'تُثبت هذه الشهادة أن شحنتك بقيت مبرّدة طوال الرحلة.',
  'The certificate will be issued once your shipment is on its way.': 'ستصدر الشهادة فور انطلاق شحنتك.',
  'The certificate is on hold while the temperature problem is being fixed.': 'الشهادة معلّقة لحين معالجة مشكلة الحرارة.',
  'The certificate is being checked again and will be signed shortly.': 'تجري مراجعة الشهادة وستُوقَّع قريبًا.',
  'Your shipment is here, on the way to {city}.': 'شحنتك هنا، في طريقها إلى {city}.',
  'Your shipment is waiting in {city}.': 'شحنتك بانتظار المغادرة في {city}.',
  'Your shipment has arrived in {city}.': 'وصلت شحنتك إلى {city}.',
  'Completed': 'اكتملت',

  /* Control room additions */
  'Units': 'الوحدات',
  'On the Road': 'في الطريق',
  'Need Attention': 'تحتاج متابعة',
  'Open Alerts': 'تنبيهات مفتوحة',
  'All': 'الكل',
  'Parked': 'متوقفة',
  'No units match this filter.': 'لا توجد وحدات مطابقة لهذه التصفية.',
  '{total} units monitored • {moving} on the road • {standby} on standby • {delivered} delivered': '{total} وحدات تحت المراقبة • {moving} في الطريق • {standby} في الاستعداد • {delivered} تم تسليمها',
  'Open Unit {id}': 'فتح الوحدة {id}',
  'Open Unit': 'فتح الوحدة',
  'Fleet Map': 'خريطة الأسطول',
  'Live Positions': 'المواقع المباشرة',
  '{moving} units on the road right now': '{moving} وحدات في الطريق الآن',
  'Tap a unit on the map to see its details.': 'اضغط على أي وحدة في الخريطة لعرض تفاصيلها.',
  'Route': 'المسار',
  'Trip': 'الرحلة',
  'Corridor': 'الممر',
  'Distance': 'المسافة',
  'Speed': 'السرعة',
  'Departed': 'وقت المغادرة',
  '{percent} complete': 'اكتمل {percent}',
  '{done} of {total} km • {left} km to go': '{done} من {total} كم • تبقّى {left} كم',
  '{speed} km/h': '{speed} كم/س',
  'Stationary': 'متوقفة',
  'Expected {time} • {eta}': 'متوقعة الساعة {time} • {eta}',
  'Cargo & Environment': 'البضاعة والبيئة',
  'Cargo Bay Humidity': 'رطوبة حجرة الشحن',
  'Outside Temperature': 'الحرارة الخارجية',
  'Signed By': 'الموقِّع',
  'Not Current': 'غير سارية',
  'CERTIFICATE NO LONGER CURRENT': 'الشهادة لم تعد سارية',
  'This certificate was genuine when issued, but it has since been suspended or replaced by a newer one.': 'كانت هذه الشهادة صحيحة عند إصدارها، لكنها عُلّقت أو استُبدلت بشهادة أحدث.',
  'VERIFICATION FAILED • NOT ON RECORD': 'فشل التحقق • غير مسجّلة',
  'The issuing registry has no certificate with these details.': 'لا يوجد في سجل الإصدار شهادة بهذه البيانات.',
  'Checked against the issuing registry on the Maatora server, which also confirms the certificate is still the current one.': 'تم الفحص مقابل سجل الإصدار على خادم ماتورا، الذي يؤكد أيضًا أن الشهادة ما زالت هي السارية.',
  'Accounts': 'الحسابات',
  '{count} accounts': '{count} حسابات',
  'Signed in now': 'متصل الآن',
  'Last sign-in {time}': 'آخر دخول {time}',
  'Never signed in': 'لم يسجّل الدخول من قبل',
  'Client portal': 'بوابة العميل',
  'Control room': 'غرفة التحكم',
  'Read only': 'اطّلاع فقط',
  'Run drills': 'تشغيل التدريبات',
  'Acknowledge alerts': 'الإقرار بالتنبيهات',
  'Sign certificates': 'توقيع الشهادات',
  'View accounts': 'عرض الحسابات',
  'Your role: {title}. You can: {can}.': 'دورك: {title}. صلاحياتك: {can}.',
  'Your role: {title}. You can view everything but cannot change anything.': 'دورك: {title}. يمكنك الاطّلاع على كل شيء دون إجراء أي تغيير.',
  'Your role cannot run drills.': 'دورك لا يسمح بتشغيل التدريبات.',
  'Your role cannot sign certificates.': 'دورك لا يسمح بتوقيع الشهادات.',
  'Your role does not allow this action.': 'دورك لا يسمح بهذا الإجراء.',
  'A drill is already active. Normalize the sensor first.': 'يوجد تدريب نشط بالفعل. أعد الحساس إلى وضعه الطبيعي أولًا.',
  'This unit has already delivered its cargo.': 'هذه الوحدة سلّمت بضاعتها بالفعل.',
  'Drills are not available once a unit has delivered.': 'التدريبات غير متاحة بعد تسليم الوحدة لبضاعتها.',
  'The server refused this action.': 'رفض الخادم هذا الإجراء.',
  'Incident drill started by {name}: compressor failure on Unit {id}. Internal temperature {temp} ({delta} excursion). Compliance violation flagged.': 'بدأ {name} تدريبًا على حادثة: عطل في الضاغط بالوحدة {id}. درجة الحرارة الداخلية {temp} (انحراف {delta}). تم رصد مخالفة للمطابقة.',
  'Sensor normalized on Unit {id} by {name}. Telemetry back at baseline {temp}. Drill closed and excluded from the compliance record.': 'أعاد {name} الحساس إلى وضعه الطبيعي في الوحدة {id}. عادت القياسات إلى المستوى الأساسي {temp}. أُغلق التدريب واستُبعد من سجل المطابقة.',
  'Unit {id} cleared the regional inspection hub.': 'اجتازت الوحدة {id} مركز الفحص الإقليمي.',
  'Unit {id} arrived at {place}.': 'وصلت الوحدة {id} إلى {place}.',
  '±0.1°C Reference Probe, Verified {days} Days Ago (Due)': 'مجس مرجعي بدقة ±0.1 درجة مئوية، تم التحقق قبل {days} يومًا (حان موعد المعايرة)'
};

/* --------------------------------------------------------------------------
   State
   -------------------------------------------------------------------------- */
const state = {
  currentRole: 'client',
  activeTruckId: 'TRK-104',
  isExcursionActive: false,
  certificateModalOpen: false,
  /* The units the signed-in account is allowed to see, as last sent by the backend. */
  trucks: [],

  activePanel: { client: 'shipments', admin: 'fleet' },
  session: { client: null, admin: null },
  views: { client: null, admin: null },
  landing: { client: false, admin: false },
  clientTruckId: null,
  fleetFilter: 'all',
  auth: {
    busy: false,
    lockedUntil: { client: 0, admin: 0 },
    error: null,
    demoAccounts: { client: null, admin: null }
  },
  lastActivityAt: Date.now(),
  lastTouchAt: 0,

  lang: 'en',
  verification: null
};

/* --------------------------------------------------------------------------
   Helpers
   -------------------------------------------------------------------------- */
const el = {};
const staticText = [];
const dateTimeFormats = {};
let backend = null;
let toastTimer = null;
let lastFocused = null;
let verificationToken = 0;

const byId = (id) => document.getElementById(id);
const all = (selector, root = document) => Array.from(root.querySelectorAll(selector));
const round1 = (value) => Math.round(value * 10) / 10;
const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const pad2 = (value) => String(value).padStart(2, '0');

const view = (role = state.currentRole) => state.views[role];
const trucksOf = (role) => (state.views[role] ? state.views[role].trucks : []);
const getTruck = (id, role = state.currentRole) => trucksOf(role).find((truck) => truck.id === id) || null;
const activeTruck = () => getTruck(state.activeTruckId, 'admin') || trucksOf('admin')[0] || null;
const clientTruck = () => getTruck(state.clientTruckId, 'client') || trucksOf('client')[0] || null;
/* The client sees only their own consignment; the admin sees the selected unit. */
const viewTruck = () => (state.currentRole === 'client' ? clientTruck() : activeTruck());
const isAuthed = (role = state.currentRole) => Boolean(state.session[role]);
const isInSpec = (truck) => truck.tempCurrent >= truck.tempMin && truck.tempCurrent <= truck.tempMax;
const can = (permission) => Boolean(state.session.admin && state.session.admin.permissions.includes(permission));
const openAlertCount = () => (state.views.admin ? state.views.admin.alerts.filter((alert) => !alert.acknowledgedAt).length : 0);

/* Fills {placeholders} in an English source string. */
const fmt = Engine.fill;

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

const plainTemp = Engine.plainTemp;
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

/* "about 42 minutes" or "about 2 h 15 min": how a wait is said to a client. */
function formatEta(minutes) {
  if (minutes < 60) {
    return t('about {n} minutes', { n: minutes });
  }
  return t('about {h} h {m} min', { h: Math.floor(minutes / 60), m: pad2(minutes % 60) });
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

function setAttribute(node, name, value) {
  if (node.getAttribute(name) !== value) {
    node.setAttribute(name, value);
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
  const root = document.documentElement;
  root.classList.add('is-switching-language');
  root.lang = state.lang;
  root.dir = arabic ? 'rtl' : 'ltr';
  applyStaticText();

  const toggle = el['lang-toggle'];
  toggle.textContent = arabic ? 'EN' : 'عربي';
  toggle.lang = arabic ? 'en' : 'ar';
  toggle.setAttribute('aria-label', arabic ? AR['Switch language to English'] : 'Switch language to Arabic');

  buildDock();
  render();

  /* Reading layout applies the mirrored styles while transitions are still
     off; only then are transitions allowed again. */
  void root.offsetWidth;
  root.classList.remove('is-switching-language');
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
   Backends
   -------------------------------------------------------------------------- */
/* Both backends answer the same questions, so the rest of the interface does
   not know which one it is talking to. */

/* The offline demo: the engine runs in this page with the test dataset. */
function createLocalBackend() {
  const engine = Engine.createEngine(SEED);
  const sessions = { client: null, admin: null };
  const listeners = { client: null, admin: null };
  const guesses = {};
  const lastSignIn = {};

  const accounts = () => engine.accounts().map((account) => ({
    ...account,
    lastSignIn: lastSignIn[account.id] || null,
    sessions: sessions[account.portal] && sessions[account.portal].id === account.id ? 1 : 0
  }));

  function push() {
    PORTALS.forEach((portal) => {
      if (sessions[portal] && listeners[portal]) {
        listeners[portal](engine.snapshot(sessions[portal], { accounts: accounts() }));
      }
    });
  }

  function remember() {
    try {
      window.sessionStorage.setItem(SESSION_KEY, JSON.stringify({
        client: sessions.client ? sessions.client.id : null,
        admin: sessions.admin ? sessions.admin.id : null
      }));
    } catch (error) {
      /* Storage unavailable: the session lasts until the page is closed. */
    }
  }

  window.setInterval(() => {
    engine.tick();
    push();
  }, LIVE_TICK_MS);

  return {
    mode: 'local',

    async restore() {
      let saved = {};
      try {
        saved = JSON.parse(window.sessionStorage.getItem(SESSION_KEY) || '{}') || {};
      } catch (error) {
        saved = {};
      }
      const restored = {};
      PORTALS.forEach((portal) => {
        sessions[portal] = SEED.users.find((user) => user.id === saved[portal] && user.portal === portal) || null;
        restored[portal] = sessions[portal] ? engine.snapshot(sessions[portal]).user : null;
      });
      return restored;
    },

    async login(portal, identifier, password) {
      const key = `${portal}:${identifier.toLowerCase()}`;
      const record = guesses[key] || { count: 0, lockedUntil: 0 };
      guesses[key] = record;
      if (record.lockedUntil > Date.now()) {
        return { ok: false, reason: 'locked', retryAfter: Math.ceil((record.lockedUntil - Date.now()) / 1000) };
      }
      const scope = AUTH_COPY[portal].scope;
      const user = SEED.users.find(
        (item) => item.portal === portal && item.identifier.toLowerCase() === identifier.toLowerCase()
          && item.password === password
      );
      if (!user) {
        record.count += 1;
        if (record.count >= MAX_SIGN_IN_ATTEMPTS) {
          record.count = 0;
          record.lockedUntil = Date.now() + LOCKOUT_MS;
          engine.log('alert', 'Sign-in locked on the {scope} for {seconds} seconds after {attempts} failed attempts.', {
            scope,
            seconds: LOCKOUT_MS / 1000,
            attempts: MAX_SIGN_IN_ATTEMPTS
          });
          push();
          return { ok: false, reason: 'locked', retryAfter: LOCKOUT_MS / 1000 };
        }
        engine.log('alert', 'Failed sign-in attempt on the {scope} ({attempt} of {max}).', {
          scope,
          attempt: record.count,
          max: MAX_SIGN_IN_ATTEMPTS
        });
        push();
        return { ok: false, reason: 'invalid', attemptsLeft: MAX_SIGN_IN_ATTEMPTS - record.count };
      }
      record.count = 0;
      sessions[portal] = user;
      lastSignIn[user.id] = Date.now();
      remember();
      engine.log('ok', 'Sign-in on the {scope}: {name}.', { scope, name: user.name });
      return { ok: true, user: engine.snapshot(user).user };
    },

    async logout(portal, idle) {
      const user = sessions[portal];
      sessions[portal] = null;
      listeners[portal] = null;
      remember();
      if (user) {
        engine.log(
          'info',
          idle ? 'Sign-out on the {scope}: {name} (idle timeout).' : 'Sign-out on the {scope}: {name}.',
          { scope: AUTH_COPY[portal].scope, name: user.name }
        );
        push();
      }
    },

    subscribe(portal, onSnapshot) {
      listeners[portal] = onSnapshot;
      push();
    },

    unsubscribe(portal) {
      listeners[portal] = null;
    },

    async command(name, payload) {
      const result = engine.command(sessions.admin, name, payload);
      push();
      return result;
    },

    async verify(record) {
      return engine.verify(record);
    },

    async demoAccounts(portal) {
      return SEED.users.filter((user) => user.portal === portal).map((user) => ({
        identifier: user.identifier,
        password: user.password,
        name: user.name,
        title: user.title || ''
      }));
    },

    touch() {}
  };
}

/* The Maatora server: accounts, sessions and data live there. */
function createRemoteBackend() {
  const streams = {};

  async function request(method, path, body) {
    const options = { method, credentials: 'same-origin', headers: {} };
    if (body !== undefined) {
      options.headers['Content-Type'] = 'application/json';
      options.headers['X-Requested-With'] = 'maatora';
      options.body = JSON.stringify(body);
    }
    try {
      const response = await window.fetch(path, options);
      let data = {};
      try {
        data = await response.json();
      } catch (error) {
        data = {};
      }
      return { status: response.status, data };
    } catch (error) {
      return { status: 0, data: {} };
    }
  }

  function unsubscribe(portal) {
    if (streams[portal]) {
      streams[portal].close();
      delete streams[portal];
    }
  }

  return {
    mode: 'remote',

    async restore() {
      const reply = await request('GET', '/api/session');
      return reply.status === 200 ? reply.data : { client: null, admin: null };
    },

    async login(portal, identifier, password) {
      const reply = await request('POST', '/api/login', { portal, identifier, password });
      if (reply.status === 200) {
        return { ok: true, user: reply.data.user };
      }
      if (reply.status === 429) {
        return { ok: false, reason: 'locked', retryAfter: reply.data.retryAfter || 30 };
      }
      if (reply.status === 401) {
        return { ok: false, reason: 'invalid', attemptsLeft: reply.data.attemptsLeft };
      }
      return { ok: false, reason: 'unreachable' };
    },

    async logout(portal) {
      unsubscribe(portal);
      await request('POST', '/api/logout', { portal });
    },

    subscribe(portal, onSnapshot, onExpired) {
      unsubscribe(portal);
      const source = new window.EventSource(`/api/stream?portal=${portal}`);
      streams[portal] = source;
      source.addEventListener('snapshot', (event) => onSnapshot(JSON.parse(event.data)));
      source.addEventListener('expired', () => {
        unsubscribe(portal);
        onExpired();
      });
      /* The browser reconnects by itself. If the session is gone, stop and say so. */
      source.onerror = async () => {
        const reply = await request('GET', '/api/session');
        if (reply.status === 200 && !reply.data[portal] && streams[portal] === source) {
          unsubscribe(portal);
          onExpired();
        }
      };
    },

    unsubscribe,

    async command(name, payload) {
      const reply = await request('POST', `/api/commands/${name}`, payload || {});
      if (reply.status === 200) {
        return { ok: true };
      }
      if (reply.status === 401) {
        return { ok: false, expired: true };
      }
      if (reply.status === 0) {
        return { ok: false, error: 'The server could not be reached. Check the connection and try again.' };
      }
      return { ok: false, error: reply.data.message || 'The server refused this action.' };
    },

    async verify(record) {
      const reply = await request('GET', `/api/public/verify?record=${encodeURIComponent(record)}`);
      return reply.status === 200 ? reply.data : { status: 'invalid' };
    },

    async demoAccounts(portal) {
      if (!REMOTE.demo) {
        return [];
      }
      const reply = await request('GET', `/api/demo-accounts?portal=${portal}`);
      return reply.status === 200 ? reply.data : [];
    },

    touch(portal) {
      request('POST', '/api/touch', { portal });
    }
  };
}

/* --------------------------------------------------------------------------
   Certificate verification page
   -------------------------------------------------------------------------- */
function verificationUrl(truck) {
  const record = truck.certificate.verification;
  if (!record) {
    return '';
  }
  if (PUBLIC_VERIFY_URL) {
    return `${PUBLIC_VERIFY_URL}${VERIFY_PREFIX}${record}`;
  }
  if (/^https?:$/.test(window.location.protocol)) {
    return `${window.location.href.split('#')[0]}${VERIFY_PREFIX}${record}`;
  }
  return `${APP_VERIFY_LINK}${record}`;
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

  let record = '';
  try {
    record = decodeURIComponent(hash.slice(VERIFY_PREFIX.length));
  } catch (error) {
    record = '';
  }
  state.certificateModalOpen = false;
  state.verification = { status: 'checking' };
  render();
  el.viewport.scrollTop = 0;

  let result = { status: 'invalid' };
  try {
    result = await backend.verify(record);
  } catch (error) {
    result = { status: 'invalid' };
  }
  if (token === verificationToken && state.verification) {
    state.verification = result;
    render();
  }
}

function exitVerification() {
  try {
    window.history.replaceState(null, '', window.location.href.split('#')[0]);
  } catch (error) {
    /* Some hosts refuse to rewrite the address; the record is dropped below regardless. */
  }
  verificationToken += 1;
  state.verification = null;
  render();
  el.viewport.scrollTop = 0;
}

/* --------------------------------------------------------------------------
   Actions
   -------------------------------------------------------------------------- */
function rememberRole() {
  try {
    window.sessionStorage.setItem(`${SESSION_KEY}.role`, state.currentRole);
  } catch (error) {
    /* Storage unavailable: the page simply opens on the client portal next time. */
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

/* The backend delivered a fresh view for one portal. */
function applySnapshot(role, snapshot) {
  state.views[role] = snapshot;
  if (role === 'admin') {
    state.isExcursionActive = Boolean(snapshot.drillTruckId);
    if (!snapshot.trucks.some((truck) => truck.id === state.activeTruckId)) {
      state.activeTruckId = snapshot.trucks[0] ? snapshot.trucks[0].id : null;
    }
  } else if (!snapshot.trucks.some((truck) => truck.id === state.clientTruckId)) {
    state.clientTruckId = snapshot.trucks[0] ? snapshot.trucks[0].id : null;
  }
  if (state.landing[role]) {
    state.landing[role] = false;
    if (role === 'client') {
      state.activePanel.client = snapshot.trucks.length > 1 ? 'shipments' : 'status';
    }
  }
  state.trucks = trucksOf(state.currentRole);
  render();
}

function startSession(role, user, landing) {
  state.session[role] = user;
  state.views[role] = null;
  state.landing[role] = landing;
  state.lastActivityAt = Date.now();
  backend.subscribe(role, (snapshot) => applySnapshot(role, snapshot), () => endSession(role, true));
  render();
}

function endSession(role, expired) {
  if (!state.session[role]) {
    return;
  }
  backend.unsubscribe(role);
  state.session[role] = null;
  state.views[role] = null;
  if (role === 'admin') {
    state.isExcursionActive = false;
  }
  if (role === state.currentRole) {
    state.certificateModalOpen = false;
    lastFocused = null;
    state.auth.error = expired ? { source: 'You were signed out after a period of inactivity.' } : null;
    state.trucks = [];
    hideToast();
    resetAuthForm();
    el.viewport.scrollTop = 0;
  }
  render();
}

async function submitSignIn() {
  const role = state.currentRole;
  const copy = AUTH_COPY[role];
  if (state.auth.busy || lockSecondsLeft(role) > 0) {
    renderAuth();
    return;
  }
  const identifier = el['auth-identifier'].value.trim();
  const password = el['auth-password'].value;
  if (!identifier || !password) {
    state.auth.error = { source: copy.missing };
    renderAuth();
    return;
  }

  state.auth.busy = true;
  state.auth.error = null;
  renderAuth();
  let result = { ok: false, reason: 'unreachable' };
  try {
    result = await backend.login(role, identifier, password);
  } catch (error) {
    result = { ok: false, reason: 'unreachable' };
  }
  state.auth.busy = false;

  if (!result.ok) {
    if (result.reason === 'locked') {
      state.auth.lockedUntil[role] = Date.now() + result.retryAfter * 1000;
      state.auth.error = null;
    } else if (result.reason === 'invalid') {
      state.auth.error = result.attemptsLeft === 1
        ? { source: 'Those details do not match an account. 1 attempt left before a temporary lock.' }
        : { source: 'Those details do not match an account. {left} attempts left before a temporary lock.', params: { left: result.attemptsLeft } };
    } else {
      state.auth.error = { source: 'The server could not be reached. Check the connection and try again.' };
    }
    el['auth-password'].value = '';
    renderAuth();
    el['auth-password'].focus();
    return;
  }

  resetAuthForm();
  startSession(role, result.user, true);
  showToast(t('Signed in as {name}', { name: result.user.name }), 'safe');
  el.viewport.scrollTop = 0;
  el.viewport.focus();
}

async function signOut(role = state.currentRole, idle = false) {
  if (!state.session[role]) {
    return;
  }
  try {
    await backend.logout(role, idle);
  } catch (error) {
    /* The local session ends either way. */
  }
  endSession(role, idle);
}

async function loadDemoAccounts(role) {
  if (state.auth.demoAccounts[role]) {
    return;
  }
  state.auth.demoAccounts[role] = [];
  try {
    state.auth.demoAccounts[role] = await backend.demoAccounts(role);
  } catch (error) {
    state.auth.demoAccounts[role] = [];
  }
  renderAuth();
}

function fillDemoAccount(button) {
  const account = (state.auth.demoAccounts[state.currentRole] || [])[Number(button.dataset.demoAccount)];
  if (!account) {
    return;
  }
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

function setRole(role) {
  if (!PORTALS.includes(role) || state.currentRole === role) {
    return;
  }
  state.currentRole = role;
  state.auth.error = null;
  state.trucks = trucksOf(role);
  resetAuthForm();
  rememberRole();
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
  if (!getTruck(id, 'admin') || state.activeTruckId === id) {
    return;
  }
  state.activeTruckId = id;
  render();
}

function selectShipment(id) {
  if (!getTruck(id, 'client')) {
    return;
  }
  state.clientTruckId = id;
  state.activePanel.client = 'status';
  render();
  el.viewport.scrollTop = 0;
}

function setFleetFilter(filter) {
  state.fleetFilter = filter;
  renderFleet();
}

/* Sends a control room command and reports the outcome. */
async function runCommand(name, payload, success) {
  let result = { ok: false, error: 'The server could not be reached. Check the connection and try again.' };
  try {
    result = await backend.command(name, payload);
  } catch (error) {
    /* Keep the unreachable message. */
  }
  if (result.expired) {
    endSession('admin', true);
    return;
  }
  if (!result.ok) {
    showToast(t(result.error), 'alert');
    return;
  }
  showToast(success.text, success.tone);
}

function triggerIncident() {
  const truck = activeTruck();
  if (truck) {
    runCommand('trigger-incident', { truckId: truck.id }, {
      text: t('Excursion triggered on Unit {id}', { id: `#${truck.id}` }),
      tone: 'alert'
    });
  }
}

function normalizeSensor() {
  const drillId = state.views.admin ? state.views.admin.drillTruckId : null;
  if (drillId) {
    runCommand('normalize-sensor', {}, {
      text: t('Unit {id} returned to nominal range', { id: `#${drillId}` }),
      tone: 'safe'
    });
  }
}

function signCertificate() {
  const truck = activeTruck();
  if (truck) {
    runCommand('sign-certificate', { truckId: truck.id }, {
      text: t('Certificate signed for Unit {id}', { id: `#${truck.id}` }),
      tone: 'safe'
    });
  }
}

function acknowledgeAlert(button) {
  const alertId = button.dataset.alertId;
  runCommand('acknowledge-alert', { alertId }, { text: t('Alert {id} acknowledged', { id: alertId }), tone: 'safe' });
  el.viewport.focus();
}

function openCertificate() {
  if (state.certificateModalOpen || !isAuthed() || state.verification || !viewTruck()) {
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
  /* The Android app has no browser print dialog, so it prints through its own bridge. */
  if (window.MaatoraNative && typeof window.MaatoraNative.print === 'function') {
    window.MaatoraNative.print();
  } else {
    window.print();
  }
}

const ACTIONS = {
  'open-certificate': openCertificate,
  'close-certificate': closeCertificate,
  'print-certificate': printCertificate,
  'trigger-incident': triggerIncident,
  'normalize-sensor': normalizeSensor,
  'sign-certificate': signCertificate,
  'goto-unit': () => setPanel('unit'),
  'sign-out': () => signOut(),
  'toggle-password': togglePasswordVisibility,
  'toggle-language': toggleLanguage,
  'acknowledge-alert': acknowledgeAlert,
  'exit-verification': exitVerification
};

/* --------------------------------------------------------------------------
   Maps
   -------------------------------------------------------------------------- */
const project = (point) => [
  round1((point[0] - MAP.lon0) * MAP.kx * MAP.scale),
  round1((MAP.lat0 - point[1]) * MAP.scale)
];

const linePath = (points) => points.map((point, index) => `${index === 0 ? 'M' : 'L'}${project(point).join(' ')}`).join('');

/* Draws the coastline, seas and river once; routes and units are layered on top. */
function buildMap(svg) {
  const geo = SEED.geography;
  if (!geo || svg.dataset.built) {
    return;
  }
  const northCoast = geo.land.slice(3, 13);
  const eastCoast = geo.land.slice(13);
  const mediterranean = [[22, 34], [22, northCoast[0][1]], ...northCoast, [northCoast[northCoast.length - 1][0], 34]];
  const redSea = [...eastCoast, [39, eastCoast[eastCoast.length - 1][1]], [39, eastCoast[0][1]]];
  svg.dataset.built = 'true';
  svg.innerHTML = `
    <path class="map__sea" d="${linePath(mediterranean)}Z"/>
    <path class="map__sea" d="${linePath(redSea)}Z"/>
    <path class="map__land" d="${linePath(geo.land)}Z"/>
    <path class="map__river" d="${linePath(geo.nile)}"/>
    <path class="map__river" d="${linePath(geo.rosetta)}"/>
    <path class="map__river" d="${linePath(geo.damiettaBranch)}"/>
    <g data-layer="labels"></g>
    <g data-layer="routes"></g>
    <g data-layer="trucks"></g>`;
}

/* Frames the map on a box in map units; k is how far it is zoomed in. */
function frameMap(svg, x, y, width, height) {
  const k = width / MAP.width;
  setAttribute(svg, 'viewBox', `${round1(x)} ${round1(y)} ${round1(width)} ${round1(height)}`);
  svg.style.setProperty('--k', String(Math.round(k * 1000) / 1000));
  return k;
}

function mapLabels(svg, k, placeIds) {
  const layer = svg.querySelector('[data-layer="labels"]');
  const signature = `${state.lang}|${k}|${placeIds.join(',')}`;
  if (layer.dataset.signature === signature) {
    return;
  }
  layer.dataset.signature = signature;
  const seas = [['Mediterranean Sea', [28.2, 32.25]], ['Red Sea', [35.55, 26.3]]];
  layer.innerHTML = seas.map(([name, at]) => {
    const [x, y] = project(at);
    return `<text class="map__label map__label--sea" x="${x}" y="${y}" text-anchor="middle">${t(name)}</text>`;
  }).join('') + placeIds.map((id) => {
    const place = SEED.places[id];
    const [x, y] = project(place.at);
    return `<circle class="map__city" cx="${x}" cy="${y}" r="${round1(1.9 * k)}"/>`
      + `<text class="map__label" x="${round1(x + 4 * k)}" y="${round1(y + 3 * k)}">${t(place.name)}</text>`;
  }).join('');
}

/* The route split at the unit's position: the part driven and the part left. */
function splitRoute(truck) {
  const points = truck.routePoints;
  let target = Engine.routeLength(points) * truck.progress;
  const done = [points[0]];
  let index = 1;
  for (; index < points.length; index += 1) {
    const leg = Engine.distanceKm(points[index - 1], points[index]);
    if (target <= leg) {
      break;
    }
    target -= leg;
    done.push(points[index]);
  }
  done.push(truck.position);
  return { done, rest: [truck.position, ...points.slice(index)] };
}

function routeMarkup(truck) {
  const parts = splitRoute(truck);
  return `<path class="map__route" d="${linePath(parts.rest)}"/><path class="map__route map__route--done" d="${linePath(parts.done)}"/>`;
}

function truckMarker(truck, k, selected) {
  const [x, y] = project(truck.position);
  return `<g class="map__truck" data-truck="${truck.id}" data-status="${truck.status}" data-selected="${selected}" tabindex="0" role="button" aria-label="${t('Unit {id}', { id: `#${truck.id}` })}">
      <circle class="map__pulse" cx="${x}" cy="${y}" r="${round1(5 * k)}"/>
      <circle class="map__truck-ring" cx="${x}" cy="${y}" r="${round1(8.5 * k)}"/>
      <circle class="map__truck-dot" cx="${x}" cy="${y}" r="${round1(5 * k)}"/>
    </g>`;
}

function renderFleetMap() {
  const svg = el['fleet-map'];
  const snapshot = state.views.admin;
  if (!snapshot || !SEED.geography) {
    return;
  }
  buildMap(svg);
  const k = frameMap(svg, 0, 0, MAP.width, MAP.height);
  mapLabels(svg, k, SEED.geography.labels);

  const selected = activeTruck();
  svg.querySelector('[data-layer="routes"]').innerHTML = selected ? routeMarkup(selected) : '';
  /* The selected unit is drawn last so it sits on top of its neighbours. */
  const ordered = snapshot.trucks.filter((truck) => truck !== selected).concat(selected ? [selected] : []);
  svg.querySelector('[data-layer="trucks"]').innerHTML = ordered.map((truck) => truckMarker(truck, k, truck === selected)).join('');

  const moving = snapshot.trucks.filter((truck) => truck.baseStatus === 'en-route').length;
  setText(el['map-summary'], t('{moving} units on the road right now', { moving }));
  if (!selected) {
    return;
  }
  const meta = UNIT_STATUS[selected.status];
  setText(el['map-unit-id'], t('Unit {id}', { id: `#${selected.id}` }));
  setChip(el['map-unit-status'], t(meta.label), meta.chip);
  setText(el['map-unit-cargo'], t(selected.cargoShort));
  setText(el['map-unit-route'], t('{origin} to {destination}', { origin: selected.originCity, destination: selected.destinationCity }));
  setText(el['map-unit-temp'], formatTemp(selected.tempCurrent));
  setText(el['map-unit-eta'], arrivalText(selected));
}

function renderClientMap(truck) {
  const svg = el['client-map'];
  if (!SEED.geography) {
    return;
  }
  buildMap(svg);
  const projected = truck.routePoints.map(project);
  const xs = projected.map((point) => point[0]);
  const ys = projected.map((point) => point[1]);
  const pad = 26;
  let width = Math.max(...xs) - Math.min(...xs) + pad * 2;
  let height = Math.max(...ys) - Math.min(...ys) + pad * 2;
  /* Keep a steady 4:3 picture whatever shape the route has. */
  if (width * 0.75 > height) {
    height = width * 0.75;
  } else {
    width = height / 0.75;
  }
  const centreX = (Math.max(...xs) + Math.min(...xs)) / 2;
  const centreY = (Math.max(...ys) + Math.min(...ys)) / 2;
  const k = frameMap(svg, centreX - width / 2, centreY - height / 2, width, height);
  mapLabels(svg, k, []);

  const first = projected[0];
  const last = projected[projected.length - 1];
  const endLabel = (point, name, above) => `<circle class="map__end" cx="${point[0]}" cy="${point[1]}" r="${round1(4 * k)}"/>`
    + `<text class="map__label map__label--end" x="${point[0]}" y="${round1(point[1] + (above ? -8 : 15) * k)}" text-anchor="middle">${t(name)}</text>`;
  const originAbove = first[1] < last[1];
  svg.querySelector('[data-layer="routes"]').innerHTML = routeMarkup(truck)
    + endLabel(first, truck.originCity, originAbove)
    + endLabel(last, truck.destinationCity, !originAbove);
  svg.querySelector('[data-layer="trucks"]').innerHTML = truckMarker(truck, k, false);

  let caption = t('Your shipment is here, on the way to {city}.', { city: truck.destinationCity });
  if (truck.baseStatus === 'standby') {
    caption = t('Your shipment is waiting in {city}.', { city: truck.originCity });
  } else if (truck.baseStatus === 'delivered') {
    caption = t('Your shipment has arrived in {city}.', { city: truck.destinationCity });
  }
  setText(el['client-map-caption'], caption);
}

/* --------------------------------------------------------------------------
   One-time DOM construction
   -------------------------------------------------------------------------- */
function cacheElements() {
  all('[id]').forEach((node) => {
    el[node.id] = node;
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

function createUnitCard(truck) {
  const card = document.createElement('button');
  card.type = 'button';
  card.className = 'unit-card';
  card.dataset.truck = truck.id;
  card.innerHTML = `
    <span class="unit-card__head">
      <span class="unit-card__id" data-field="unit"></span>
      <span class="chip" data-field="status"></span>
    </span>
    <span class="unit-card__cargo" data-field="cargo"></span>
    <span class="unit-card__metrics">
      <span class="metric">
        <span class="metric__label" data-label="Internal Temp"></span>
        <span class="metric__value metric__value--temp" data-field="temp"></span>
      </span>
      <span class="metric">
        <span class="metric__label" data-label="Chiller Power"></span>
        <span class="metric__value" data-field="chiller"></span>
      </span>
      <span class="metric">
        <span class="metric__label" data-label="Uplink"></span>
        <span class="metric__value" data-field="uplink"></span>
      </span>
      <span class="metric">
        <span class="metric__label" data-label="Hardware Health"></span>
        <span class="metric__value" data-field="health"></span>
      </span>
    </span>`;
  return card;
}

function createShipmentCard(truck) {
  const card = document.createElement('button');
  card.type = 'button';
  card.className = 'shipment';
  card.dataset.shipment = truck.id;
  card.innerHTML = `
    <span class="shipment__icon" aria-hidden="true"><svg class="icon" focusable="false"><use></use></svg></span>
    <span class="shipment__body">
      <span class="shipment__title" data-field="title"></span>
      <span class="shipment__line" data-field="line"></span>
    </span>
    <span class="shipment__temp" data-field="temp"></span>`;
  return card;
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

/* Keeps a list of keyed cards in step with the data without rebuilding it,
   so focus and scroll position survive every live update. */
function syncCards(container, items, attribute, create) {
  const wanted = new Set(items.map((item) => item.id));
  all(`[data-${attribute}]`, container).forEach((node) => {
    if (!wanted.has(node.dataset[attribute])) {
      node.remove();
    }
  });
  return items.map((item) => {
    let node = container.querySelector(`[data-${attribute}="${item.id}"]`);
    if (!node) {
      node = create(item);
    }
    return node;
  });
}

/* --------------------------------------------------------------------------
   Rendering
   -------------------------------------------------------------------------- */
function render() {
  renderShell();
  if (state.views.client) {
    renderShipments();
    renderClient();
  }
  if (state.views.admin) {
    renderFleet();
    renderFleetMap();
    renderUnit();
    renderAlerts();
    renderControls();
    renderAuditLog();
  }
  renderCertificate();
  renderModal();
}

function renderShell() {
  const role = state.currentRole;
  const verifying = Boolean(state.verification);
  const authed = isAuthed(role);
  const ready = authed && Boolean(state.views[role]);
  const portal = ready && !verifying;
  const truck = viewTruck();
  const panelId = state.activePanel[role];
  const alertInView = portal && (role === 'admin' ? state.isExcursionActive : Boolean(truck) && truck.status === 'excursion');

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
  el['account-bar'].hidden = !authed || verifying;
  if (authed) {
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
    const open = openAlertCount();
    badge.hidden = open === 0;
    setText(badge, String(open));
  }

  const showAdminAlert = portal && role === 'admin' && state.isExcursionActive;
  el['admin-alert'].hidden = !showAdminAlert;
  if (showAdminAlert) {
    const affected = getTruck(state.views.admin.drillTruckId, 'admin');
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
  setText(el['auth-toggle'], t(el['auth-password'].type === 'password' ? 'Show' : 'Hide'));

  let message = '';
  if (locked > 0) {
    message = t('Too many failed attempts. Try again in {seconds} seconds.', { seconds: locked });
  } else if (state.auth.busy) {
    message = '';
  } else if (isAuthed(role) && !state.views[role]) {
    message = t('Loading your data');
  } else if (error) {
    message = t(error.source, error.params);
  }
  el['auth-error'].hidden = !message;
  setText(el['auth-error'], message);
  el['auth-submit'].disabled = locked > 0 || state.auth.busy;
  setText(el['auth-submit'].querySelector('span'), t(state.auth.busy ? 'Signing in' : 'Sign In'));

  /* Test accounts, when the backend offers them. */
  const accounts = state.auth.demoAccounts[role];
  if (!accounts) {
    loadDemoAccounts(role);
  }
  const list = el['auth-demo-list'];
  const signature = `${role}|${state.lang}|${accounts ? accounts.length : 0}`;
  el['auth-demo'].hidden = !accounts || accounts.length === 0;
  setText(
    el['auth-demo-note'],
    t(backend.mode === 'remote'
      ? 'This server is running in demo mode. Choose a test account to fill in the form.'
      : 'These accounts exist only in this browser. Choose one to fill in the form.')
  );
  if (accounts && list.dataset.signature !== signature) {
    list.dataset.signature = signature;
    list.innerHTML = '';
    accounts.forEach((account, index) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'account-option';
      button.dataset.demoAccount = String(index);
      const name = document.createElement('span');
      name.className = 'account-option__name';
      name.textContent = t(account.name);
      const title = document.createElement('span');
      title.className = 'account-option__title';
      title.textContent = `${t(account.title)} • ${ltr(account.identifier)}`;
      button.append(name, title);
      list.append(button);
    });
  }
}

function renderVerification() {
  const result = state.verification;
  if (!result) {
    return;
  }
  const status = VERIFY_STATUS[result.status] || VERIFY_STATUS.invalid;
  const bannerClass = `banner ${status.banner}`;
  if (el['verify-banner'].className !== bannerClass) {
    el['verify-banner'].className = bannerClass;
  }
  setText(el['verify-banner-title'], t(status.title));
  setText(el['verify-banner-note'], t(status.note));
  setText(
    el['verify-method'],
    t(result.source === 'registry'
      ? 'Checked against the issuing registry on the Maatora server, which also confirms the certificate is still the current one.'
      : 'This check recomputes the SHA-256 digest from the certificate fields carried in the QR code. It runs in your browser and does not consult a central registry.')
  );

  el['verify-card'].hidden = !result.truck;
  if (!result.truck) {
    return;
  }
  const truck = result.truck;
  const record = result.record;
  setText(el['verify-serial'], truck.serial);
  setChip(el['verify-chip'], t(status.label), status.chip);
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

function renderLiveChip() {
  const alertInView = el.app.dataset.alert === 'true';
  setText(el['live-chip-text'], `${t(alertInView ? 'Alert' : 'Live')} • ${ltr(formatClock(new Date(), true))}`);
}

/* The everyday-words state of a shipment: safe, alert, pending or done. */
function shipmentState(truck) {
  if (truck.status === 'excursion' || !isInSpec(truck)) {
    return SHIPMENT_STATES.alert;
  }
  if (truck.baseStatus === 'standby') {
    return SHIPMENT_STATES.pending;
  }
  return truck.baseStatus === 'delivered' ? SHIPMENT_STATES.done : SHIPMENT_STATES.safe;
}

function shipmentLine(truck) {
  const kind = shipmentState(truck);
  if (kind === SHIPMENT_STATES.alert) {
    return t('Temperature problem • our team is on it');
  }
  if (kind === SHIPMENT_STATES.pending) {
    return t('Getting ready to leave');
  }
  if (kind === SHIPMENT_STATES.done) {
    return t('Delivered at {time}', { time: formatClock(new Date(truck.arrivedAt)) });
  }
  return t('On the road • arrives in {eta}', { eta: formatEta(truck.eta) });
}

const shipmentName = (truck) => t('{cargo} to {city}', { cargo: truck.cargoShort, city: truck.destinationCity });

function renderShipments() {
  const trucks = trucksOf('client');
  const problems = trucks.filter((truck) => shipmentState(truck) === SHIPMENT_STATES.alert).length;

  let title = t('No shipments yet');
  let sub = t('Shipments addressed to your organisation will appear here.');
  if (problems === 1) {
    title = t('One shipment needs attention');
  } else if (problems > 1) {
    title = t('{count} shipments need attention', { count: problems });
  } else if (trucks.length === 1) {
    title = t('Your shipment is safe');
  } else if (trucks.length > 1) {
    title = t('All {count} shipments are safe', { count: trucks.length });
  }
  if (trucks.length > 0) {
    sub = t('Tap a shipment to see its details.');
  }
  setText(el['shipments-title'], title);
  setText(el['shipments-sub'], sub);

  const list = el['shipment-list'];
  syncCards(list, trucks, 'shipment', createShipmentCard).forEach((card, index) => {
    const truck = trucks[index];
    const kind = shipmentState(truck);
    if (card.parentElement !== list) {
      list.append(card);
    }
    card.dataset.tone = kind.tone;
    card.setAttribute('aria-pressed', String(truck.id === state.clientTruckId));
    setAttribute(card.querySelector('use'), 'href', `#${kind.icon}`);
    setText(card.querySelector('[data-field="title"]'), shipmentName(truck));
    setText(card.querySelector('[data-field="line"]'), shipmentLine(truck));
    setText(card.querySelector('[data-field="temp"]'), formatTemp(truck.tempCurrent));
  });
}

/* "Arrives in about 42 minutes", in the words used on the client dashboard. */
function arrivalHeadline(truck) {
  if (truck.baseStatus === 'standby') {
    return t('Waiting to leave');
  }
  if (truck.baseStatus === 'delivered') {
    return t('Arrived at {time}', { time: formatClock(new Date(truck.arrivedAt)) });
  }
  return t('Arrives in {eta}', { eta: formatEta(truck.eta) });
}

/* The control room wording of the same fact, with a clock time. */
function arrivalText(truck) {
  if (truck.baseStatus === 'standby') {
    return t('Awaiting departure');
  }
  if (truck.baseStatus === 'delivered') {
    return t('Delivered at {time}', { time: formatClock(new Date(truck.arrivedAt)) });
  }
  return t('Expected {time} • {eta}', {
    time: formatClock(new Date(Date.now() + truck.eta * 60000)),
    eta: formatEta(truck.eta)
  });
}

function distanceText(truck, pattern) {
  const total = Math.round(truck.routeKm);
  if (truck.baseStatus === 'standby') {
    return t('The trip of {total} km has not started yet.', { total });
  }
  if (truck.baseStatus === 'delivered') {
    return t('The whole trip of {total} km is complete.', { total });
  }
  return t(pattern, { done: total - truck.remainingKm, total, left: truck.remainingKm });
}

function stepState(truck, index) {
  if (index < truck.routeStep) {
    return 'done';
  }
  return index === truck.routeStep ? 'current' : 'upcoming';
}

function renderClient() {
  const truck = clientTruck();
  if (!truck) {
    return;
  }
  const cert = truck.certificate;
  const certMeta = CERT_STATUS[cert.status];
  const kind = shipmentState(truck);
  const inExcursion = truck.status === 'excursion';
  const onStandby = truck.baseStatus === 'standby';
  const delivered = truck.baseStatus === 'delivered';
  const inSpec = isInSpec(truck);
  const range = { min: plainTemp(truck.tempMin), max: plainTemp(truck.tempMax) };

  /* The one-glance answer */
  el['status-hero'].dataset.tone = kind.tone;
  setAttribute(el['status-hero-icon'], 'href', `#${kind.icon}`);
  setText(el['status-name'], shipmentName(truck));
  setText(el['status-headline'], t(kind.headline));
  setText(el['status-text'], t(kind.text));

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
  setText(el['client-banner-title'], t(bannerTitle));
  setText(el['client-banner-note'], t(bannerNote));

  /* Temperature */
  let stateLabel = 'Temperature OK';
  if (!inSpec) {
    stateLabel = truck.tempCurrent > truck.tempMax ? 'Too Warm' : 'Too Cold';
  }
  el['cargo-card'].dataset.tone = inSpec ? 'safe' : 'alert';
  setText(el['cargo-temp'], formatTemp(truck.tempCurrent));
  setText(el['cargo-plain'], t('It should stay between {min} and {max}.', range));
  setChip(el['cargo-state'], t(stateLabel), inSpec ? 'chip--safe' : 'chip--alert chip--flash');
  setText(
    el['cargo-target'],
    t('Target {target} • Permitted {min} to {max}', { target: plainTemp(truck.tempTarget), ...range })
  );

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
    t('Current {temp}, permitted range {min} to {max}', { temp: plainTemp(truck.tempCurrent), ...range })
  );
  setText(el['meter-min'], formatTemp(truck.tempMin));
  setText(el['meter-max'], formatTemp(truck.tempMax));

  /* Arrival */
  let routeLabel = 'In Transit';
  if (onStandby) {
    routeLabel = 'Pre-Departure';
  } else if (delivered) {
    routeLabel = 'Delivered';
  } else if (truck.routeStep === 2) {
    routeLabel = 'At Inspection Hub';
  }
  setChip(el['route-chip'], t(routeLabel), delivered ? 'chip--neutral' : 'chip--ice');
  setText(el['arrival-headline'], arrivalHeadline(truck));
  setText(el['arrival-place'], t('at {place}, {city}', { place: truck.destination, city: truck.destinationCity }));
  el['arrival-progress'].style.setProperty('--fill', `${Math.round(truck.progress * 100)}%`);
  setText(el['arrival-distance'], distanceText(truck, '{done} of {total} km done • {left} km to go'));
  let corridor = t('{corridor} • ETA: {eta} Mins', { corridor: truck.corridor, eta: truck.eta });
  if (onStandby) {
    corridor = t('{corridor} • Departure Pending', { corridor: truck.corridor });
  } else if (delivered) {
    corridor = `${t(truck.corridor)} • ${t('Delivered')}`;
  }
  setText(el['cargo-corridor'], corridor);

  all('.stepper__step', el['route-stepper']).forEach((step, index) => {
    step.dataset.state = stepState(truck, index);
    setText(step.querySelector('.stepper__label'), t(ROUTE_STEPS[index]).replace('-', '‑'));
    if (index === truck.routeStep) {
      step.setAttribute('aria-current', 'step');
    } else {
      step.removeAttribute('aria-current');
    }
  });

  /* Shipment details */
  setText(el['cargo-consignment'], ltr(truck.consignmentId));
  setText(el['cargo-type'], t(truck.cargo));
  setText(el['detail-quantity'], t('{count} pallets', { count: truck.pallets }));
  setText(el['detail-from'], t('{place}, {city}', { place: truck.origin, city: truck.originCity }));
  setText(el['detail-to'], t('{place}, {city}', { place: truck.destination, city: truck.destinationCity }));
  setText(el['detail-driver'], t(truck.operator));
  setText(el['detail-vehicle'], `${t(truck.vehicleClass)} • ${ltr(`#${truck.id}`)}`);
  setText(el['detail-departed'], truck.departedAt ? formatDateTime(new Date(truck.departedAt)) : t('Not yet'));

  /* Map and milestones */
  setText(el['journey-title'], shipmentName(truck));
  setText(el['journey-sub'], arrivalHeadline(truck));
  renderClientMap(truck);
  const stamps = [truck.departedAt, truck.hubPassedAt, truck.hubPassedAt, truck.arrivedAt];
  all('.timeline__step', el['journey-timeline']).forEach((step, index) => {
    const stateName = stepState(truck, index);
    step.dataset.state = stateName;
    let place = truck.corridor;
    if (index === 0) {
      place = truck.origin;
    } else if (index === 2) {
      place = 'Regional Inspection Hub Checkpoint';
    } else if (index === 3) {
      place = truck.destination;
    }
    let timeText = t('Awaiting departure');
    if (stateName === 'done') {
      timeText = stamps[index] ? t('Completed {time}', { time: formatClock(new Date(stamps[index])) }) : t('Completed');
    } else if (stateName === 'current') {
      timeText = t(onStandby ? 'Pre-cooling at origin dock' : 'In progress');
    } else if (truck.eta !== null) {
      const share = index === 3 ? 1 : 0.5;
      timeText = t('Expected {time}', { time: formatClock(new Date(Date.now() + truck.eta * share * 60000)) });
    }
    setText(step.querySelector('.timeline__label'), t(ROUTE_STEPS[index]));
    setText(step.querySelector('.timeline__place'), t(place));
    setText(step.querySelector('.timeline__time'), timeText);
  });
  setText(el['custody-consignor'], t(truck.consignor));
  setText(el['custody-consignee'], t(truck.consignee));
  setText(el['custody-operator'], t(truck.operator));

  /* Documents */
  const docPlain = {
    valid: 'This certificate proves your shipment stayed cold for the whole trip.',
    hold: 'The certificate is on hold while the temperature problem is being fixed.',
    revalidate: 'The certificate is being checked again and will be signed shortly.',
    'not-issued': 'The certificate will be issued once your shipment is on its way.'
  };
  const figures = certificateFigures(truck);
  setText(el['doc-plain'], t(docPlain[cert.status]));
  setText(el['doc-heading'], ltr(cert.serial));
  setChip(el['doc-status'], t(certMeta.label), certMeta.chip);
  setText(
    el['doc-validated'],
    cert.signedAt && cert.status === 'valid' ? formatDateTime(new Date(cert.signedAt)) : t(certMeta.label)
  );
  setText(el['doc-excursions'], excursionText(figures.excursions));
  setText(el['doc-door'], t('{count} Unauthorized Openings', { count: figures.doorOpenings }));
}

/* A valid certificate shows the figures it was signed with; otherwise the live log. */
function certificateFigures(truck) {
  const cert = truck.certificate;
  return cert.status === 'valid' && cert.record ? cert.record : truck.log;
}

function excursionText(count) {
  return count === 0
    ? t('0 (Zero Breaches Recorded)')
    : t('{count} (Breach Recorded, Under Review)', { count });
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

function healthSummary(truck) {
  const health = truck.health;
  if (health.faults > 0) {
    const label = health.faults === 1 ? t('1 Fault') : t('{count} Faults', { count: health.faults });
    return { label, tone: 'alert', chip: 'chip--alert chip--flash' };
  }
  if (health.warnings > 0) {
    return { label: t('{count} Attention', { count: health.warnings }), tone: 'ice', chip: 'chip--ice' };
  }
  return {
    label: t('{ok} / {total} Nominal', { ok: health.total, total: health.total }),
    tone: 'safe',
    chip: 'chip--safe'
  };
}

const needsAttention = (truck) => truck.status === 'excursion' || truck.health.faults > 0
  || truck.health.warnings > 0 || truck.openAlerts > 0;

const FLEET_FILTERS = {
  all: () => true,
  attention: needsAttention,
  moving: (truck) => truck.baseStatus === 'en-route',
  parked: (truck) => truck.baseStatus !== 'en-route'
};

function renderFleet() {
  const snapshot = state.views.admin;
  if (!snapshot) {
    return;
  }
  const trucks = snapshot.trucks;
  const moving = trucks.filter((truck) => truck.baseStatus === 'en-route').length;
  const standby = trucks.filter((truck) => truck.baseStatus === 'standby').length;
  const attention = trucks.filter(needsAttention).length;
  const openAlerts = openAlertCount();

  setText(
    el['fleet-summary'],
    t('{total} units monitored • {moving} on the road • {standby} on standby • {delivered} delivered', {
      total: trucks.length,
      moving,
      standby,
      delivered: trucks.length - moving - standby
    })
  );
  setText(el['tile-total'], String(trucks.length));
  setText(el['tile-moving'], String(moving));
  setText(el['tile-attention'], String(attention));
  setText(el['tile-alerts'], String(openAlerts));
  el['tile-attention-box'].dataset.tone = attention > 0 ? 'ice' : 'default';
  el['tile-alerts-box'].dataset.tone = openAlerts > 0 ? 'alert' : 'default';

  all('[data-filter]', el['fleet-filters']).forEach((button) => {
    button.setAttribute('aria-pressed', String(button.dataset.filter === state.fleetFilter));
  });

  const grid = el['fleet-grid'];
  const matches = FLEET_FILTERS[state.fleetFilter];
  let shown = 0;
  syncCards(grid, trucks, 'truck', createUnitCard).forEach((card, index) => {
    const truck = trucks[index];
    const meta = UNIT_STATUS[truck.status];
    const chiller = chillerState(truck);
    const health = healthSummary(truck);
    const visible = matches(truck);
    if (card.parentElement !== grid) {
      grid.append(card);
    }
    card.hidden = !visible;
    shown += visible ? 1 : 0;

    const tempNode = card.querySelector('[data-field="temp"]');
    const chillerNode = card.querySelector('[data-field="chiller"]');
    const healthNode = card.querySelector('[data-field="health"]');
    card.setAttribute('aria-pressed', String(truck.id === state.activeTruckId));
    card.dataset.status = truck.status;
    all('[data-label]', card).forEach((label) => setText(label, t(label.dataset.label)));
    setText(card.querySelector('[data-field="unit"]'), t('Unit {id}', { id: `#${truck.id}` }));
    setChip(card.querySelector('[data-field="status"]'), t(meta.label), meta.chip);
    setText(card.querySelector('[data-field="cargo"]'), `${t(truck.cargoShort)} • ${ltr(truck.consignmentId)}`);
    setText(tempNode, formatTemp(truck.tempCurrent));
    tempNode.dataset.tone = isInSpec(truck) ? 'default' : 'alert';
    setText(chillerNode, t(chiller.label));
    chillerNode.dataset.tone = chiller.tone;
    setText(card.querySelector('[data-field="uplink"]'), t('Online • {ping}', { ping: `${truck.uplinkPing}ms` }));
    setText(healthNode, health.label);
    healthNode.dataset.tone = health.tone;
  });
  el['fleet-empty'].hidden = shown > 0;
  setText(el['fleet-goto-label'], t('Open Unit {id}', { id: `#${state.activeTruckId}` }));

  /* Unit pickers on the Unit and Controls panels. */
  const signature = `${state.lang}|${trucks.map((truck) => truck.id).join(',')}`;
  all('[data-unit-select]').forEach((select) => {
    if (select.dataset.signature !== signature) {
      select.dataset.signature = signature;
      select.innerHTML = '';
      trucks.forEach((truck) => {
        const option = document.createElement('option');
        option.value = truck.id;
        option.textContent = `#${truck.id} • ${t(truck.cargoShort)}`;
        select.append(option);
      });
    }
    if (select.value !== state.activeTruckId) {
      select.value = state.activeTruckId;
    }
  });
}

function renderSparkline(truck) {
  const width = 320;
  const height = 84;
  const padY = 8;
  const values = truck.history;
  const points = values.length;
  const low = Math.min(truck.tempMin - 1.5, ...values);
  const high = Math.max(truck.tempMax + 1.5, ...values) + 0.5;
  const toY = (value) => padY + ((high - value) / (high - low)) * (height - padY * 2);
  const stepX = (width - 8) / Math.max(1, points - 1);

  const coordinates = values.map((value, index) => `${round1(index * stepX + 2)},${round1(toY(value))}`);
  el['spark-line'].setAttribute('points', coordinates.join(' '));

  const bandTop = toY(truck.tempMax);
  const bandBottom = toY(truck.tempMin);
  el['spark-band'].setAttribute('y', String(round1(bandTop)));
  el['spark-band'].setAttribute('height', String(round1(bandBottom - bandTop)));

  const setpointY = String(round1(toY(truck.tempTarget)));
  el['spark-setpoint'].setAttribute('y1', setpointY);
  el['spark-setpoint'].setAttribute('y2', setpointY);

  const last = coordinates[coordinates.length - 1].split(',');
  el['spark-dot'].setAttribute('cx', last[0]);
  el['spark-dot'].setAttribute('cy', last[1]);
}

function renderUnit() {
  const truck = activeTruck();
  if (!truck) {
    return;
  }
  const meta = UNIT_STATUS[truck.status];
  const inExcursion = truck.status === 'excursion';

  setText(el['diag-title'], t('Unit {id}', { id: `#${truck.id}` }));
  setText(el['diag-sub'], `${t(truck.vehicleClass)} • ${t(truck.cargoShort)}`);
  el['trace-card'].dataset.tone = isInSpec(truck) ? 'safe' : 'alert';
  setText(el['diag-temp'], formatTemp(truck.tempCurrent));
  setChip(el['diag-status'], t(meta.label), meta.chip);
  setText(
    el['diag-range'],
    t('Setpoint {target} • Permitted {min} to {max} • 60 s sampling', {
      target: plainTemp(truck.tempTarget),
      min: plainTemp(truck.tempMin),
      max: plainTemp(truck.tempMax)
    })
  );
  renderSparkline(truck);

  /* Hardware health */
  const health = healthSummary(truck);
  setChip(el['health-chip'], health.label, health.chip);
  Object.entries(truck.health.checks).forEach(([key, level]) => {
    const levelMeta = HEALTH_LEVELS[level];
    const stateNode = el[`state-${key}`];
    setText(stateNode, t(levelMeta.label));
    stateNode.dataset.tone = levelMeta.tone;
    el[`row-${key}`].dataset.tone = level === 'fault' ? 'alert' : 'default';
  });

  setText(el['diag-battery'], t('{percent} (Li-SOCl2 Cell, 3.6V)', { percent: `${truck.sensorBattery}%` }));
  el['bar-battery'].parentElement.style.setProperty('--fill', `${truck.sensorBattery}%`);
  setText(
    el['diag-uplink'],
    t('4G LTE / Satellite Failover (Ping: {ping} • {signal})', {
      ping: `${truck.uplinkPing}ms`,
      signal: `${truck.uplinkSignal} dBm`
    })
  );
  setText(
    el['diag-compressor'],
    inExcursion
      ? t('0 RPM (Compressor Fault, Inverter Trip)')
      : t('{rpm} RPM (Inverter Variable Frequency)', { rpm: truck.compressorRpm.toLocaleString('en-US') })
  );
  setText(el['diag-fuel'], t('{percent} Diesel Dedicated Auxiliary', { percent: `${truck.fuelPercent}%` }));
  el['bar-fuel'].parentElement.style.setProperty('--fill', `${truck.fuelPercent}%`);
  setText(
    el['diag-seal'],
    truck.log.doorOpenings === 0
      ? t('Electronic Seal {seal} [ENGAGED / ZERO BREACHES]', { seal: `#${truck.sealId}` })
      : t('Electronic Seal {seal} [ENGAGED / {count} BREACHES]', { seal: `#${truck.sealId}`, count: truck.log.doorOpenings })
  );
  setText(
    el['diag-calibration'],
    t(
      truck.health.checks.calibration === 'ok'
        ? '±0.1°C Reference Probe, Verified {days} Days Ago'
        : '±0.1°C Reference Probe, Verified {days} Days Ago (Due)',
      { days: truck.calibrationDays }
    )
  );
  setText(el['diag-firmware'], t('{version} (Signed Build)', { version: truck.firmware }));

  /* Trip */
  const percent = `${Math.round(truck.progress * 100)}%`;
  setChip(el['trip-chip'], t('{percent} complete', { percent }), 'chip--ice');
  el['trip-progress'].style.setProperty('--fill', percent);
  setText(el['trip-route'], t('{origin} to {destination}', { origin: truck.originCity, destination: truck.destinationCity }));
  setText(el['trip-corridor'], t(truck.corridor));
  setText(el['trip-distance'], distanceText(truck, '{done} of {total} km • {left} km to go'));
  setText(el['trip-speed'], truck.speedKmh > 0 ? t('{speed} km/h', { speed: truck.speedKmh }) : t('Stationary'));
  setText(el['trip-eta'], arrivalText(truck));
  setText(el['trip-departed'], truck.departedAt ? formatDateTime(new Date(truck.departedAt)) : t('Not yet'));
  setText(el['trip-operator'], t(truck.operator));
  setText(el['trip-vehicle'], t(truck.vehicleClass));

  /* Cargo and environment */
  setText(el['load-consignment'], ltr(truck.consignmentId));
  setText(el['load-cargo'], t(truck.cargo));
  setText(el['load-quantity'], t('{count} pallets', { count: truck.pallets }));
  setText(el['load-consignor'], t(truck.consignor));
  setText(el['load-consignee'], t(truck.consignee));
  setText(el['load-humidity'], ltr(`${truck.humidity}%`));
  setText(el['load-ambient'], formatTemp(truck.ambientTemp));
  setText(el['load-minmax'], `${formatTemp(truck.log.min)} / ${formatTemp(truck.log.max)}`);
}

function renderAlerts() {
  const snapshot = state.views.admin;
  if (!snapshot) {
    return;
  }
  const alerts = snapshot.alerts;
  const list = el['alert-list'];
  setText(
    el['alerts-summary'],
    t('{open} unacknowledged • {total} recorded', { open: openAlertCount(), total: alerts.length })
  );
  el['alerts-empty'].hidden = alerts.length > 0;

  syncCards(list, alerts, 'alert', createAlertCard).forEach((card, index) => {
    const alert = alerts[index];
    if (card.parentElement !== list) {
      list.prepend(card);
    }
    const field = (name) => card.querySelector(`[data-field="${name}"]`);
    const kind = ALERT_KINDS[alert.kind];
    const ended = Boolean(alert.endedAt);
    const acknowledged = Boolean(alert.acknowledgedAt);

    let stateName = 'acknowledged';
    let statusLabel = 'Acknowledged';
    let statusChip = 'chip--safe';
    if (!ended) {
      stateName = 'active';
      statusLabel = 'Active';
      statusChip = 'chip--alert chip--flash';
    } else if (!acknowledged) {
      stateName = 'open';
      statusLabel = 'Ended, Unacknowledged';
      statusChip = 'chip--alert';
    }
    card.dataset.state = stateName;

    setText(field('ref'), t('{alert} • Unit {id}', { alert: alert.id, id: `#${alert.truckId}` }));
    setText(field('title'), t(kind.title));
    setChip(field('status'), t(statusLabel), statusChip);
    setText(field('started-label'), t('Started'));
    setText(field('started'), formatDateTime(new Date(alert.startedAt)));
    setText(field('duration-label'), t('Duration'));
    setText(
      field('duration'),
      ended
        ? formatSpan(alert.endedAt - alert.startedAt)
        : t('Ongoing ({span})', { span: formatSpan(snapshot.time - alert.startedAt) })
    );
    setText(field('detail-label'), t(kind.detailLabel));
    setText(
      field('detail'),
      alert.kind === 'excursion'
        ? t('{peak} against a {limit} limit', { peak: plainTemp(alert.peak), limit: plainTemp(alert.limit) })
        : t('Satellite failover engaged, no samples lost')
    );
    setText(field('ack-label'), t('Acknowledgement'));
    setText(
      field('ack'),
      acknowledged
        ? t('{name}, {time}', { name: alert.acknowledgedBy, time: formatDateTime(new Date(alert.acknowledgedAt)) })
        : t('Pending')
    );

    const button = card.querySelector('[data-action="acknowledge-alert"]');
    button.hidden = acknowledged || !can('acknowledge');
    setText(button, t('Acknowledge'));
  });
}

function renderControls() {
  const snapshot = state.views.admin;
  const truck = activeTruck();
  if (!snapshot || !truck) {
    return;
  }
  const user = state.session.admin;
  const cert = truck.certificate;
  const certMeta = CERT_STATUS[cert.status];
  const drillTruck = snapshot.drillTruckId ? getTruck(snapshot.drillTruckId, 'admin') : null;
  const blockText = truck.signBlock ? t(truck.signBlock) : '';

  setText(el['controls-title'], t('Unit {id}', { id: `#${truck.id}` }));
  setText(
    el['controls-role'],
    user.permissions.length === 0
      ? t('Your role: {title}. You can view everything but cannot change anything.', { title: user.title })
      : t('Your role: {title}. You can: {can}.', {
        title: user.title,
        can: user.permissions.map((permission) => t(PERMISSION_LABELS[permission])).join(state.lang === 'ar' ? '، ' : ', ')
      })
  );

  el['seal-card'].dataset.tone = certMeta.tone;
  setText(el['seal-serial'], ltr(cert.serial));
  setChip(el['seal-status'], t(certMeta.label), certMeta.chip);
  setText(el['seal-note'], t(certMeta.note));
  const signed = cert.status === 'valid' && cert.signedAt;
  setText(el['seal-signed'], signed ? formatDateTime(new Date(cert.signedAt)) : t('Not signed'));
  setText(el['seal-signer'], signed ? t(cert.signedBy) : t('Signature pending'));
  setText(el['seal-hash'], hashLabel(cert));
  setText(el['seal-excursions'], excursionText(truck.log.excursions));

  const delivered = truck.baseStatus === 'delivered';
  el['btn-incident'].disabled = !can('drill') || Boolean(drillTruck) || delivered;
  el['btn-normalize'].disabled = !can('drill') || !drillTruck;
  el['btn-sign'].disabled = !can('sign') || Boolean(truck.signBlock);

  let hint = t('Trigger Incident simulates a compressor failure and a {delta} spike on Unit {id}.', {
    delta: `+${EXCURSION_DELTA_C.toFixed(1)}°C`,
    id: `#${truck.id}`
  });
  if (!can('drill') && !can('sign')) {
    hint = t('Your role does not allow this action.');
  } else if (drillTruck && drillTruck.id !== truck.id) {
    hint = t('A drill is active on Unit {id}. Normalize Sensor will close it.', { id: `#${drillTruck.id}` });
  } else if (drillTruck) {
    hint = t('Drill active on this unit.');
  } else if (delivered) {
    hint = t('Drills are not available once a unit has delivered.');
  } else if (!can('drill')) {
    hint = t('Your role cannot run drills.');
  } else if (!truck.signBlock && cert.status === 'revalidate') {
    hint = t('Telemetry is nominal. Issue / Sign Certificate to validate the log and restore the seal.');
  }
  const notes = [hint];
  if (can('sign') && blockText && !hint.includes(blockText)) {
    notes.push(blockText);
  } else if (!can('sign') && (can('drill'))) {
    notes.push(t('Your role cannot sign certificates.'));
  }
  setText(el['tools-hint'], notes.join(' '));

  /* Accounts, for roles allowed to see them. */
  const accounts = snapshot.accounts;
  el['accounts-card'].hidden = !accounts;
  if (accounts) {
    renderAccounts(accounts);
  }
}

function renderAccounts(accounts) {
  const list = el['accounts-list'];
  const signature = `${state.lang}|${accounts.map((account) => `${account.id}:${account.sessions}:${account.lastSignIn}`).join(',')}`;
  setText(el['accounts-count'], t('{count} accounts', { count: accounts.length }));
  if (list.dataset.signature === signature) {
    return;
  }
  list.dataset.signature = signature;
  list.innerHTML = '';
  accounts.forEach((account) => {
    const row = document.createElement('li');
    row.className = 'accounts__row';

    const body = document.createElement('div');
    const name = document.createElement('p');
    name.className = 'accounts__name';
    name.textContent = t(account.name);
    const meta = document.createElement('p');
    meta.className = 'accounts__meta';
    meta.textContent = `${t(account.portal === 'admin' ? 'Control room' : 'Client portal')} • ${t(account.title)} • ${ltr(account.identifier)}`;
    body.append(name, meta);

    const status = document.createElement('p');
    status.className = 'accounts__state';
    status.dataset.active = String(account.sessions > 0);
    if (account.sessions > 0) {
      status.textContent = t('Signed in now');
    } else if (account.lastSignIn) {
      status.textContent = t('Last sign-in {time}', { time: formatClock(new Date(account.lastSignIn)) });
    } else {
      status.textContent = t('Never signed in');
    }
    row.append(body, status);
    list.append(row);
  });
}

function hashLabel(cert) {
  if (cert.status !== 'valid') {
    return t(cert.status === 'hold' ? 'Withheld (Compliance Hold)' : 'Not issued');
  }
  return ltr(`SHA256: ${shortHash(cert.hash)}`);
}

function renderAuditLog() {
  const snapshot = state.views.admin;
  const list = el['audit-log'];
  if (!snapshot) {
    return;
  }
  const entries = snapshot.audit.slice(-AUDIT_LOG_VISIBLE).reverse();
  const signature = `${state.lang}|${snapshot.auditCount}`;
  setText(el['log-count'], t('{count} Entries', { count: snapshot.auditCount }));
  if (list.dataset.signature === signature) {
    return;
  }
  list.dataset.signature = signature;
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
    message.textContent = t(entry.source, entry.params);

    const meta = document.createElement('p');
    meta.className = 'audit__meta';
    meta.textContent = t('{seq} • {time} • chain {digest}', {
      seq: `#${pad2(entry.seq)}`,
      time: formatClock(new Date(entry.time), true),
      digest: entry.digest.slice(0, 12)
    });

    item.append(marker, message, meta);
    list.append(item);
  });
}

/* Draws the scannable code for a signed certificate, or the pending notice. */
function renderVerificationBlock(truck) {
  const link = el['cert-verify-link'];
  const url = verificationUrl(truck);
  const matrix = url ? qrEncode(url) : null;

  link.hidden = !matrix;
  el['cert-qr-pending'].hidden = Boolean(matrix);
  if (!matrix) {
    link.removeAttribute('href');
    return;
  }
  if (link.getAttribute('href') === url) {
    return;
  }
  const quietZone = 4;
  const extent = matrix.size + quietZone * 2;
  link.setAttribute('href', url);
  el['cert-qr-svg'].setAttribute('viewBox', `${-quietZone} ${-quietZone} ${extent} ${extent}`);
  el['cert-qr'].setAttribute('d', qrPath(matrix));
}

function renderCertificate() {
  const truck = viewTruck();
  if (!truck) {
    return;
  }
  const cert = truck.certificate;
  const certMeta = CERT_STATUS[cert.status];
  const figures = certificateFigures(truck);

  el.certificate.dataset.tone = certMeta.tone;
  setText(el['cert-serial'], ltr(cert.serial));
  setText(el['cert-consignor'], `${t(truck.consignor)} (${t(truck.consignorDept)})`);
  setText(el['cert-consignee'], `${t(truck.consignee)} (${t(truck.consigneeTerminal)})`);
  setText(el['cert-vehicle'], t('Unit {id} ({vehicle})', { id: `#${truck.id}`, vehicle: truck.vehicleClass }));
  setText(el['cert-operator'], t(truck.operator));
  setText(el['cert-cargo'], `${ltr(truck.consignmentId)} • ${t(truck.cargo)}`);
  setText(
    el['cert-setpoint'],
    t('{target} (Permissible Range: {min} to {max})', {
      target: plainTemp(truck.tempTarget),
      min: plainTemp(truck.tempMin),
      max: plainTemp(truck.tempMax)
    })
  );

  setText(
    el['cert-duration'],
    truck.baseStatus === 'standby' ? t('Not Commenced (Pre-Departure Conditioning)') : formatDuration(figures.transitMinutes)
  );
  setText(el['cert-minmax'], `${formatTemp(figures.min)} / ${formatTemp(figures.max)}`);
  setText(el['cert-excursions'], excursionText(figures.excursions));
  el['cert-excursions'].dataset.tone = figures.excursions === 0 ? 'default' : 'alert';
  setText(el['cert-door'], t('{count} Unauthorized Openings', { count: figures.doorOpenings }));
  setText(el['cert-seal'], t('{seal} (Engaged)', { seal: `#${truck.sealId}` }));

  setText(el['cert-stamp-title'], t(certMeta.stamp));
  let stampMeta = t('Certificate not in force');
  if (cert.status === 'valid' && cert.signedAt) {
    stampMeta = t('Signed {time} by {name}', { time: formatDateTime(new Date(cert.signedAt)), name: cert.signedBy });
  } else if (cert.status === 'hold') {
    stampMeta = t('Seal suspended pending corrective action and QA review');
  } else if (cert.status === 'revalidate') {
    stampMeta = t('Telemetry nominal, awaiting signature');
  }
  setText(el['cert-stamp-meta'], stampMeta);

  let tick = 'M17 24h14';
  if (cert.status === 'valid') {
    tick = 'M16.5 24.5l5 5 10-10.5';
  } else if (cert.status === 'hold') {
    tick = 'M24 15v11M24 31.5v.5';
  }
  el['cert-stamp-tick'].setAttribute('d', tick);

  setText(el['cert-hash'], hashLabel(cert));
  setText(el['cert-signer'], t(cert.status === 'valid' ? cert.signedBy : 'Signature pending'));
  renderVerificationBlock(truck);
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
      const alert = activeAlert(truck.id);
      if (alert) {
        alert.peak = Math.max(alert.peak, truck.tempCurrent);
      }
    } else {
      truck.compressorRpm = truck.compressorNominalRpm + Math.round(jitter(40));
    }
  });
  renderShell();
  renderClient();
  renderFleet();
  renderDiagnostics();
  renderAlerts();
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
      action(actionButton);
    }
  }
}

/* Called by the phone app for the system back button. Returns true when the
   page had something open to close. */
function handleBack() {
  if (state.certificateModalOpen) {
    closeCertificate();
    return true;
  }
  if (state.verification) {
    exitVerification();
    return true;
  }
  return false;
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
  const focusable = all('button:not([disabled]), a[href]', el.modal).filter((node) => !node.hidden);
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

  /* One earlier, already acknowledged event so the history is not empty. */
  const dropoutAt = loadedAt - 95 * 60000;
  state.alerts.push({
    id: 'ALT-0001',
    truckId: 'TRK-208',
    kind: 'uplink',
    startedAt: new Date(dropoutAt),
    endedAt: new Date(dropoutAt + 38000),
    peak: null,
    limit: null,
    acknowledgedAt: new Date(dropoutAt + 3 * 60000),
    acknowledgedBy: PERSONNEL.qaOfficer
  });
}

function seedAuditLog() {
  appendLog('info', 'Telemetry session opened. {count} units reporting on 60 second sampling.', {
    count: state.trucks.length
  });
  state.trucks.forEach((truck) => {
    appendLog('info', 'Electronic seal {seal} engaged on Unit {id}.', {
      seal: `#${truck.sealId}`,
      id: `#${truck.id}`
    });
  });
  state.trucks
    .filter((truck) => truck.certificate.status === 'valid')
    .forEach((truck) => {
      appendLog('sign', 'Certificate {serial} validated by {name}.', {
        serial: truck.certificate.serial,
        name: PERSONNEL.qaOfficer
      });
    });
}

function secondTick() {
  renderLiveChip();
  const now = Date.now();
  ['client', 'admin'].forEach((role) => {
    if (state.session[role] && now - state.lastActivityAt > IDLE_LIMIT_MS[role]) {
      signOut(role, true);
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
  restoreLanguage();

  buildStepper();
  buildTimeline();
  buildFleet();
  buildUnitPickers();
  collectStaticText();

  document.addEventListener('click', handleClick);
  document.addEventListener('keydown', handleKeydown);
  document.addEventListener('pointerdown', markActivity, { passive: true });
  document.addEventListener('keydown', markActivity);
  el['auth-form'].addEventListener('submit', (event) => {
    event.preventDefault();
    submitSignIn();
  });
  window.addEventListener('beforeprint', renderCertificate);
  window.addEventListener('hashchange', loadVerification);
  window.maatoraHandleBack = handleBack;

  applyLanguage();
  seedAuditLog();
  state.trucks.forEach((truck) => {
    refreshCertificateHash(truck);
  });
  loadVerification();

  window.setInterval(liveTick, LIVE_TICK_MS);
  window.setInterval(etaTick, ETA_TICK_MS);
  window.setInterval(secondTick, 1000);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
