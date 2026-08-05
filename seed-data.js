// Seed data extracted from the prototype — بيانات البذور
const PEOPLE=[{ar:"محمد يوسف",en:"Muhammad Yousaf"},{ar:"سارة العتيبي",en:"Sarah Al-Otaibi"},{ar:"خالد الشمري",en:"Khalid Al-Shammari"},{ar:"نورة القحطاني",en:"Noura Al-Qahtani"},{ar:"عبدالله الحربي",en:"Abdullah Al-Harbi"}];
const P=i=>PEOPLE[i];
let SN=0,XN=0;
const o=(code,ref,ta,te,da,de,to,by,dt,tm,risks)=>({kind:"obj",code,ref,t:{ar:ta,en:te},d:{ar:da,en:de},to:P(to),by:P(by),date:dt,time:tm,kids:risks});
const r=(code,ta,te,da,de,sev,to,by,dt,tm,st,rs)=>({kind:"risk",code,t:{ar:ta,en:te},d:{ar:da,en:de},sev,to:P(to),by:P(by),date:dt,time:tm,status:st,kids:rs||[]});
const s=(ta,te,da,de,to,by,dt,tm,st,ty,xs)=>({kind:"resp",code:"RS-"+String(++SN).padStart(2,"0"),t:{ar:ta,en:te},d:{ar:da,en:de},to:P(to),by:P(by),date:dt,time:tm,status:st,type:ty,kids:xs||[]});
const x=(ta,te,da,de,st,by,dt,tm)=>({kind:"res",code:"OC-"+String(++XN).padStart(2,"0"),t:{ar:ta,en:te},d:{ar:da,en:de},status:st,by:P(by),date:dt,time:tm,kids:[]});

const DATA=[
{id:"gov",num:"01",ar:"الحوكمة والقيادة",en:"Governance and Leadership",objectives:[
  o("O-01","[1.28]","التزام القيادة بثقافة الجودة","Leadership commitment to quality culture",
    "يجب أن يلتزم المكتب بثقافة تُظهر التزاماً بالجودة، وأن تتحمل القيادة المسؤولية النهائية عن نظام إدارة الجودة.",
    "The firm shall demonstrate a commitment to quality through its culture, with leadership assuming ultimate responsibility for the system.",0,0,"2026-01-12","09:15",[
    r("RI-1","غياب التزام القيادة عند القرارات","Leadership commitment not demonstrated",
      "لا تُظهر القيادة التزاماً واضحاً بالجودة عند اتخاذ القرارات التشغيلية والمالية.",
      "Leadership does not demonstrate a clear commitment to quality in operational and financial decisions.","high",0,0,"2026-01-14","10:20","open",[
      s("بيان التزام موقّع من الشريك","Signed quality commitment statement",
        "اعتماد بيان التزام بالجودة موقّع من الشريك المسؤول ويُعمّم على جميع المنسوبين سنوياً.",
        "Approve a quality commitment statement signed by the managing partner, circulated annually to all personnel.",0,1,"2026-01-20","11:05","done","prev",[
        x("تم التعميم على 38 منسوباً","Circulated to 38 personnel","عُمّم البيان وتم توثيق إقرار الاستلام من 38 منسوباً بنسبة 100%.","The statement was circulated with read-receipts documented from all 38 personnel.","effective",1,"2026-02-02","09:40")]),
      s("ربط تقييم الشركاء بمؤشرات الجودة","Quality KPIs in partner evaluation",
        "إدراج مؤشرات الجودة ضمن تقييم أداء الشركاء بنسبة لا تقل عن 30%.",
        "Include quality indicators in partner performance evaluation with a weight of at least 30%.",1,0,"2026-02-03","14:40","inprog","prev",[])]),
    r("RI-2","عدم وضوح المسؤوليات والصلاحيات","Responsibilities not clearly assigned",
      "الهيكل التنظيمي لا يحدد بوضوح المسؤوليات والصلاحيات المتعلقة بنظام إدارة الجودة.",
      "The organisational structure does not clearly assign responsibilities and authority for the system.","medium",2,0,"2026-01-15","13:05","monitored",[
      s("هيكل تنظيمي معتمد للجودة","Approved quality organisation chart",
        "إصدار هيكل تنظيمي معتمد يوضّح المسؤول النهائي والمسؤول التشغيلي عن النظام.",
        "Issue an approved chart identifying ultimate and operational responsibility for the system.",2,0,"2026-01-25","09:30","done","prev",[
        x("اعتُمد بمحضر الشركاء رقم 12","Approved in partners' minute 12","تم اعتماد الهيكل وتوثيق التعيينات في محضر مجلس الشركاء رقم 12 بتاريخ 2026-01-30.","The chart and appointments were approved in partners' board minute no. 12 dated 30 Jan 2026.","effective",0,"2026-01-30","12:10")])])]),
  o("O-02","[1.31]","كفاية الموارد المخصصة للنظام","Sufficient resources for the system",
    "يجب أن يخصص المكتب موارد مالية وبشرية كافية لتشغيل نظام إدارة الجودة والحفاظ عليه.",
    "The firm shall allocate sufficient financial and human resources to operate and maintain the system.",0,1,"2026-01-16","08:50",[
    r("RI-3","تغليب الاعتبارات التجارية","Commercial priorities override quality",
      "تُقدَّم الاعتبارات التجارية والمالية على متطلبات الجودة عند إعداد الموازنة السنوية.",
      "Commercial and financial considerations are prioritised over quality in the annual budget.","high",0,1,"2026-01-18","15:10","open",[
      s("بند موازنة مستقل للجودة","Ring-fenced quality budget line",
        "تخصيص بند مستقل في الموازنة لنظام إدارة الجودة يُعتمد من مجلس الشركاء.",
        "Ring-fence a separate quality management budget line approved by the partners' board.",0,1,"2026-02-10","10:00","inprog","prev",[])]),
    r("RI-4","نقص وقت المسؤول التشغيلي","Insufficient time for operational lead",
      "عدم كفاية الوقت المخصص للمسؤول التشغيلي لأداء مهام نظام إدارة الجودة.",
      "Insufficient time is allocated to the person with operational responsibility.","low",1,0,"2026-01-19","11:25","closed",[
      s("تخصيص 40% من ساعات المسؤول","Allocate 40% of lead's hours",
        "تحديد نسبة 40% من ساعات المسؤول التشغيلي لمهام الجودة ومتابعتها شهرياً.",
        "Allocate 40% of the operational lead's hours to quality tasks, monitored monthly.",1,0,"2026-02-01","12:15","done","mon",[
        x("المتوسط الفعلي 43% خلال Q1","Actual 43% in Q1","بلغ متوسط الساعات المخصصة فعلياً 43% خلال الربع الأول متجاوزاً المستهدف.","Actual allocated hours averaged 43% in Q1, exceeding the target.","effective",1,"2026-04-05","10:20")])])])]},

{id:"ethics",num:"02",ar:"المتطلبات الأخلاقية ذات الصلة",en:"Relevant Ethical Requirements",objectives:[
  o("O-39","[1.23]","الوفاء بالمتطلبات الأخلاقية والاستقلال","Fulfilling ethical and independence requirements",
    "يجب أن يفي المكتب ومنسوبوه بالمتطلبات الأخلاقية ذات الصلة، بما في ذلك متطلبات الاستقلال.",
    "The firm and its personnel shall fulfil relevant ethical requirements, including independence.",0,0,"2026-01-20","09:00",[
    r("RI-5","ضعف فهم قواعد السلوك","Ethical requirements not understood",
      "لا يفهم المكتب ومنسوبوه المتطلبات الأخلاقية أو قواعد السلوك، أو لا يُظهرون التزاماً بالسلوك الأخلاقي.",
      "The firm and its personnel do not understand the ethical requirements or code of conduct, or do not demonstrate commitment.","high",0,0,"2026-01-21","10:45","open",[
      s("تدريب سنوي إلزامي مع اختبار","Mandatory annual ethics training",
        "تنفيذ برنامج تدريبي سنوي إلزامي على قواعد السلوك المهني مع اختبار قياس فهم.",
        "Run a mandatory annual training programme on the code of conduct with a comprehension test.",3,0,"2026-02-05","09:20","done","prev",[
        x("إتمام 96% ومعدل نجاح 89%","96% completion, 89% pass rate","أتم البرنامج 96% من المنسوبين بمعدل نجاح 89%؛ أُعيد اختبار 4 حالات.","96% of personnel completed the programme with an 89% pass rate; 4 cases were re-tested.","partial",3,"2026-03-10","11:15")]),
      s("إقرار أخلاقي سنوي","Annual ethics declaration",
        "توقيع إقرار سنوي بالالتزام بالمتطلبات الأخلاقية من جميع المنسوبين.",
        "Obtain an annual ethics compliance declaration signed by all personnel.",1,0,"2026-02-06","16:30","inprog","det",[])]),
    r("RI-6","ضعف تعزيز القيم الأخلاقية","Ethics not reinforced to personnel",
      "المتطلبات والقيم الأخلاقية غير مبلّغة أو معززة بوضوح لدى المنسوبين.",
      "Ethical requirements and values are not clearly communicated and reinforced.","medium",1,0,"2026-01-22","14:10","monitored",[
      s("نشرة جودة ربع سنوية","Quarterly quality bulletin",
        "نشرة ربع سنوية للجودة تتضمن حالات عملية عن الاستقلال والسلوك المهني.",
        "Quarterly quality bulletin featuring practical cases on independence and conduct.",1,2,"2026-03-01","08:45","inprog","prev",[])]),
    r("RI-7","تهديدات الاستقلال من الخدمات غير التأكيدية","Independence threats from non-assurance services",
      "عدم رصد تهديدات الاستقلال الناشئة عن الخدمات غير التأكيدية المقدمة لعملاء المراجعة.",
      "Independence threats from non-assurance services to audit clients are not identified.","high",2,1,"2026-01-25","11:00","open",[
      s("سجل مركزي للخدمات غير التأكيدية","Central non-assurance services register",
        "سجل مركزي للخدمات غير التأكيدية يُعتمد مسبقاً من الشريك المسؤول عن الاستقلال.",
        "Central register of non-assurance services pre-approved by the independence partner.",2,1,"2026-02-12","13:20","late","det",[])])])]},

{id:"accept",num:"03",ar:"قبول واستمرار العلاقات مع العملاء والارتباطات",en:"Acceptance and Continuance",objectives:[
  o("O-12","[1.30]","سلامة أحكام القبول والاستمرار","Appropriate acceptance and continuance judgements",
    "يجب أن تكون أحكام المكتب بشأن قبول واستمرار العلاقات مع العملاء والارتباطات مناسبة.",
    "The firm's judgements about acceptance and continuance of client relationships and engagements shall be appropriate.",2,0,"2026-01-26","10:30",[
    r("RI-8","قصور معلومات نزاهة العميل","Insufficient client integrity information",
      "عدم كفاية المعلومات التي يحصل عليها المكتب عن نزاهة العميل وقيمه قبل القبول.",
      "The firm obtains insufficient information about client integrity and values before acceptance.","high",2,0,"2026-01-27","09:40","open",[
      s("نموذج قبول عميل إلزامي","Mandatory client acceptance form",
        "نموذج قبول عميل إلزامي يشمل فحص العناية الواجبة والعقوبات وغسل الأموال.",
        "Mandatory client acceptance form covering due diligence, sanctions and AML checks.",2,0,"2026-02-08","10:10","done","prev",[
        x("طُبّق على 14 عميلاً ورُفض عميلان","Applied to 14 clients, 2 declined","طُبّق النموذج على 14 عميلاً جديداً؛ رُفض عميلان لعدم اكتمال فحص النزاهة.","Applied to 14 new clients; 2 were declined due to incomplete integrity checks.","effective",2,"2026-04-12","14:00")])]),
    r("RI-9","قبول ارتباطات تتجاوز القدرة","Engagements beyond firm capacity",
      "قبول ارتباطات تتجاوز قدرة المكتب من حيث الكفاءات أو الموارد أو الوقت.",
      "Accepting engagements beyond the firm's competence, resources or available time.","medium",0,2,"2026-01-28","15:50","monitored",[
      s("فحص الطاقة الاستيعابية قبل التوقيع","Capacity check before signing",
        "تقييم توافر الموارد وربطه بجدول الطاقة الاستيعابية قبل توقيع خطاب الارتباط.",
        "Assess resource availability against the capacity schedule before signing the engagement letter.",0,2,"2026-02-15","11:35","inprog","prev",[])])])]},

{id:"perf",num:"04",ar:"أداء الارتباط",en:"Engagement Performance",objectives:[
  o("O-18","[1.30]","أداء الارتباطات وفق المعايير","Engagements performed to standards",
    "يجب أن تُؤدّى الارتباطات وفقاً للمعايير المهنية والمتطلبات النظامية، وأن تصدر التقارير المناسبة.",
    "Engagements shall be performed in accordance with professional standards and legal requirements, with appropriate reports issued.",3,0,"2026-02-01","08:20",[
    r("RI-10","ضعف الشك المهني في التقديرات","Insufficient scepticism over estimates",
      "عدم ممارسة الشك المهني الكافي في المجالات التي تنطوي على تقديرات محاسبية مهمة.",
      "Insufficient professional scepticism in areas involving significant accounting estimates.","high",3,0,"2026-02-02","09:55","open",[
      s("جلسة تخطيط إلزامية للفريق","Mandatory team planning discussion",
        "جلسة تخطيط إلزامية للفريق لمناقشة مخاطر التحريف الجوهري والتقديرات.",
        "Mandatory team planning discussion covering risks of material misstatement and estimates.",3,0,"2026-02-18","10:40","done","prev",[
        x("نُفذت في 11 من 12 ارتباطاً","Held in 11 of 12 engagements","عُقدت الجلسة وتم توثيقها في 11 من أصل 12 ارتباطاً؛ حالة واحدة قيد المعالجة.","Held and documented in 11 of 12 engagements; one case under remediation.","partial",3,"2026-05-02","09:15")]),
      s("مراجعة الشريك لأوراق التقديرات","Partner review of estimates papers",
        "مراجعة الشريك لأوراق عمل التقديرات قبل إصدار التقرير في جميع ارتباطات المصلحة العامة.",
        "Partner review of estimate working papers before report issuance for all PIE engagements.",0,3,"2026-02-19","14:05","inprog","det",[])]),
    r("RI-11","عدم توثيق الفروق في الرأي","Differences of opinion undocumented",
      "عدم توثيق الفروق في الرأي بين أعضاء الفريق وحلها قبل إصدار التقرير.",
      "Differences of opinion within the team are not documented and resolved before report issuance.","medium",0,3,"2026-02-03","13:30","monitored",[
      s("إجراء تصعيد وحل الفروق","Escalation procedure for differences",
        "إجراء معتمد لتصعيد وحل الفروق في الرأي مع توثيقها في ملف الارتباط.",
        "Documented escalation procedure for resolving differences within the engagement file.",0,3,"2026-02-22","09:10","inprog","prev",[])]),
    r("RI-12","تأخر تجميع ملف الارتباط","Late file assembly",
      "تأخر إتمام تجميع ملف الارتباط النهائي خلال المدة النظامية (60 يوماً).",
      "Final engagement file assembly is not completed within the required 60-day period.","low",4,3,"2026-02-05","16:15","closed",[
      s("تنبيه آلي قبل 15 يوماً","Automated 15-day deadline alert",
        "تنبيه آلي قبل 15 يوماً من انتهاء مهلة تجميع الملف مع تقرير متابعة أسبوعي.",
        "Automated alert 15 days before the file assembly deadline with a weekly follow-up report.",4,3,"2026-02-25","08:30","done","mon",[
        x("متوسط التجميع 41 يوماً","Average assembly 41 days","انخفض متوسط مدة التجميع من 58 إلى 41 يوماً دون أي تجاوز للمهلة.","Average assembly time fell from 58 to 41 days with no breaches.","effective",4,"2026-05-20","13:35")])])])]},

{id:"res",num:"05",ar:"الموارد",en:"Resources",objectives:[
  o("O-24","[1.32]","توفير وتطوير الموارد المناسبة","Obtaining and developing resources",
    "يجب أن يحصل المكتب على الموارد البشرية والتقنية والفكرية المناسبة وأن يخصصها ويحافظ عليها.",
    "The firm shall obtain, develop, allocate and maintain appropriate human, technological and intellectual resources.",1,0,"2026-02-08","09:45",[
    r("RI-13","نقص الكوادر في الذروة","Staff shortage in peak season",
      "نقص الكوادر المؤهلة في مواسم الذروة يؤدي إلى ضغط على جودة الأداء.",
      "Shortage of qualified staff in peak season places pressure on quality.","high",1,0,"2026-02-09","10:25","open",[
      s("خطة توظيف سنوية مبنية على الساعات","Recruitment plan based on forecast hours",
        "خطة توظيف واستقطاب سنوية مبنية على توقعات ساعات الارتباطات للموسم القادم.",
        "Annual recruitment plan built on forecast engagement hours for the coming season.",1,0,"2026-02-26","11:50","inprog","prev",[])]),
    r("RI-14","نقص ساعات التطوير المهني","CPD hours below requirement",
      "عدم كفاية ساعات التطوير المهني المستمر لأعضاء الفريق مقارنة بمتطلبات الهيئة.",
      "CPD hours fall short of the professional body's requirements.","medium",1,2,"2026-02-10","14:00","monitored",[
      s("لوحة متابعة ساعات التطوير","CPD tracking dashboard",
        "لوحة متابعة ساعات التطوير المهني لكل موظف تُراجع ربع سنوياً.",
        "CPD hours tracker per employee reviewed quarterly.",1,2,"2026-03-02","09:35","done","mon",[
        x("34 من 38 حققوا المستهدف","34 of 38 met the target","حقق 34 موظفاً المستهدف؛ 4 حالات على خطة تعويض حتى نهاية العام.","34 employees met the target; 4 are on a catch-up plan to year end.","partial",1,"2026-06-01","10:05")])]),
    r("RI-15","قِدَم الموارد التقنية","Outdated audit software",
      "الموارد التقنية (برنامج المراجعة) غير محدّثة بما يواكب المعايير الحديثة.",
      "Technological resources are not updated in line with current standards.","low",4,1,"2026-02-11","15:20","closed",[
      s("عقد صيانة وتحديث سنوي","Annual maintenance and update contract",
        "عقد صيانة سنوي يضمن تحديث قوالب المراجعة عند صدور أي تعديل على المعايير.",
        "Annual maintenance contract ensuring templates are updated whenever standards change.",4,1,"2026-03-05","13:00","done","prev",[])])])]},

{id:"info",num:"06",ar:"المعلومات والاتصال",en:"Information and Communication",objectives:[
  o("O-29","[1.33]","تبادل المعلومات الموثوقة في الوقت المناسب","Timely exchange of reliable information",
    "يجب أن يحصل المكتب على المعلومات ذات الصلة والموثوقة وأن يتبادلها داخلياً وخارجياً في الوقت المناسب.",
    "The firm shall obtain relevant, reliable information and exchange it internally and externally on a timely basis.",2,0,"2026-02-14","08:35",[
    r("RI-16","تأخر إبلاغ تغييرات السياسات","Policy changes communicated late",
      "عدم إبلاغ المنسوبين بالتغييرات في سياسات وإجراءات الجودة في الوقت المناسب.",
      "Personnel are not informed of changes in quality policies on a timely basis.","medium",2,0,"2026-02-15","09:50","open",[
      s("قناة إعلانات موحدة بإقرار استلام","Single channel with read-receipts",
        "قناة اتصال موحدة لإعلانات الجودة مع إقرار استلام إلكتروني من كل موظف.",
        "Single communication channel for quality announcements with electronic read-receipts.",2,0,"2026-03-04","10:15","inprog","prev",[])]),
    r("RI-17","غياب قناة إبلاغ آمنة","No secure whistle-blowing channel",
      "عدم وجود آلية آمنة للإبلاغ عن المخالفات دون الخوف من الانتقام.",
      "No secure whistle-blowing channel allowing reporting without fear of retaliation.","high",0,2,"2026-02-16","11:40","open",[
      s("قناة إبلاغ سرية وسياسة عدم انتقام","Confidential channel and non-retaliation policy",
        "قناة إبلاغ سرية مباشرة إلى الشريك المسؤول مع سياسة عدم انتقام معتمدة.",
        "Confidential reporting channel to the responsible partner with an approved non-retaliation policy.",0,2,"2026-03-08","14:25","late","det",[])])])]},

{id:"mon",num:"07",ar:"المراقبة والمعالجة",en:"Monitoring and Remediation",objectives:[
  o("O-33","[1.34]","أنشطة مراقبة توفر معلومات عن النظام","Monitoring activities over the system",
    "يجب أن يصمم المكتب أنشطة مراقبة توفر معلومات عن تصميم وتنفيذ وتشغيل نظام إدارة الجودة.",
    "The firm shall design monitoring activities providing information about the design, implementation and operation of the system.",4,0,"2026-02-20","09:05",[
    r("RI-18","قصور نطاق فحص الملفات","Inspection scope insufficient",
      "عدم كفاية نطاق وتوقيت فحوصات الملفات المكتملة لتغطية جميع الشركاء وأنواع الارتباطات.",
      "The scope and timing of completed file inspections do not cover all partners and engagement types.","high",4,0,"2026-02-21","10:35","open",[
      s("خطة فحص سنوية بدورة ثلاث سنوات","Three-year inspection cycle plan",
        "خطة فحص سنوية تضمن فحص ملف واحد على الأقل لكل شريك خلال دورة ثلاث سنوات.",
        "Annual inspection plan ensuring at least one file per partner within a three-year cycle.",4,0,"2026-03-10","11:20","inprog","mon",[])]),
    r("RI-19","ضعف تحليل السبب الجذري","Weak root cause analysis",
      "عدم تحليل السبب الجذري لأوجه القصور المحددة وتصنيفها بشكل مناسب.",
      "Root causes of identified deficiencies are not analysed and classified appropriately.","high",0,4,"2026-02-22","13:15","open",[
      s("منهجية موثقة لتحليل السبب الجذري","Documented root cause methodology",
        "منهجية موثقة لتحليل السبب الجذري تُطبق على كل قصور مصنّف كجوهري.",
        "Documented root cause analysis methodology applied to every significant deficiency.",0,4,"2026-03-12","09:45","late","det",[]),
      s("متابعة شهرية لخطط المعالجة","Monthly remediation follow-up",
        "متابعة شهرية لخطط المعالجة والتحقق من فاعليتها قبل الإقفال.",
        "Monthly follow-up on remediation plans and verification of effectiveness before closure.",4,0,"2026-03-13","15:05","inprog","mon",[])]),
    r("RI-20","تأخر التقييم السنوي للنظام","Late annual system evaluation",
      "تأخر التقييم السنوي لنظام إدارة الجودة عن الموعد النظامي.",
      "The annual evaluation of the system is not completed by the required date.","low",0,4,"2026-02-23","16:40","closed",[
      s("جدول زمني ملزم قبل 31 ديسمبر","Timetable binding to 31 December",
        "جدول زمني معتمد يلزم بإصدار استنتاج التقييم السنوي قبل 31 ديسمبر.",
        "Approved timetable requiring the annual evaluation conclusion before 31 December.",0,4,"2026-03-15","08:55","done","mon",[
        x("صدر الاستنتاج في 18 ديسمبر","Conclusion issued 18 December","صدر استنتاج التقييم السنوي بتاريخ 18 ديسمبر قبل الموعد بـ 13 يوماً.","The annual conclusion was issued on 18 December, 13 days ahead of the deadline.","effective",0,"2026-12-18","16:00")])])])]},

{id:"ra",num:"08",ar:"عملية تقييم المخاطر",en:"Risk Assessment Process",objectives:[
  o("O-36","[1.25]","تصميم عملية تقييم المخاطر","Designing the risk assessment process",
    "يجب أن يصمم المكتب عملية تقييم مخاطر لتحديد أهداف الجودة وتحديد وتقييم مخاطر الجودة وتصميم الاستجابات.",
    "The firm shall design a risk assessment process to establish quality objectives, identify and assess quality risks and design responses.",0,0,"2026-01-05","08:00",[
    r("RI-21","عدم تحديد أهداف إضافية","Additional objectives not established",
      "عدم تحديد أهداف جودة إضافية تعكس الظروف الخاصة بالمكتب وطبيعة ارتباطاته.",
      "Additional quality objectives reflecting the firm's circumstances are not established.","medium",0,0,"2026-01-06","09:30","monitored",[
      s("ورشة سنوية لمراجعة الأهداف","Annual objectives review workshop",
        "ورشة سنوية للشركاء لمراجعة الأهداف الإضافية بناءً على تغيّر طبيعة العملاء.",
        "Annual partner workshop to review additional objectives based on client base changes.",0,1,"2026-01-15","10:50","done","prev",[
        x("أُضيف هدفان جديدان","Two new objectives added","نتج عن الورشة إضافة هدفين متعلقين بالعملاء ذوي المصلحة العامة والتقنية.","The workshop added two objectives covering PIE clients and technology.","effective",0,"2026-01-16","12:30")])]),
    r("RI-22","عدم تحديث تقييم المخاطر","Risk assessment not updated",
      "عدم تحديث تقييم المخاطر عند حدوث تغييرات جوهرية في طبيعة وظروف المكتب.",
      "The risk assessment is not updated when significant changes occur.","high",0,1,"2026-01-08","11:15","open",[
      s("مراجعة نصف سنوية لسجل المخاطر","Semi-annual risk register review",
        "مراجعة نصف سنوية لسجل المخاطر عند أي تغيير في الهيكل أو العملاء أو الأنظمة.",
        "Semi-annual review of the risk register triggered by structural, client or regulatory changes.",0,1,"2026-01-28","14:35","inprog","det",[])])])]}
];

const USERS=[
 {p:0,role:{ar:"الشريك المسؤول عن نظام الجودة",en:"Partner — ultimate responsibility"},email:"m.yousaf@firm.sa",last:"2026-08-05 08:12",active:true},
 {p:1,role:{ar:"المسؤول التشغيلي عن الجودة",en:"Operational responsibility"},email:"s.alotaibi@firm.sa",last:"2026-08-04 16:40",active:true},
 {p:2,role:{ar:"مدير الامتثال والاستقلال",en:"Compliance & independence manager"},email:"k.alshammari@firm.sa",last:"2026-08-05 07:55",active:true},
 {p:3,role:{ar:"مدير ارتباط",en:"Engagement manager"},email:"n.alqahtani@firm.sa",last:"2026-08-03 13:05",active:true},
 {p:4,role:{ar:"مسؤول المراقبة والمعالجة",en:"Monitoring & remediation officer"},email:"a.alharbi@firm.sa",last:"2026-07-29 10:30",active:false}];
const FIRM={name:{ar:"مكتب الرياض للمحاسبة القانونية",en:"Riyadh Certified Public Accountants"},license:"CPA-4471",cr:"1010455872",
 city:{ar:"الرياض",en:"Riyadh"},country:{ar:"المملكة العربية السعودية",en:"Saudi Arabia"},phone:"+966 11 456 7890",partners:4,staff:38,engagements:126,
 scope:{ar:"مراجعة وفحص القوائم المالية وارتباطات التأكيد الأخرى",en:"Audits, reviews and other assurance engagements"},
 period:{ar:"1 يناير 2026 — 31 ديسمبر 2026",en:"1 Jan 2026 — 31 Dec 2026"},resp:0,opResp:1};

let MID=0;
const CHAT=[
 {id:++MID,by:1,txt:"الشريك اعتمد بيان الالتزام بالجودة، بنعمّمه بكرة على الجميع.",comp:"gov",code:"RI-1",date:"2026-07-20",time:"09:12"},
 {id:++MID,by:0,txt:"ممتاز. رجاءً توثيق إقرارات الاستلام لكل موظف قبل نهاية الأسبوع.",comp:"gov",code:"RI-1",date:"2026-07-20",time:"09:31"},
 {id:++MID,by:2,txt:"اجتماع لجنة الجودة الأحد الساعة 10 صباحاً لمناقشة الحوكمة.",comp:"gov",code:null,date:"2026-07-21",time:"11:05"},
 {id:++MID,by:3,txt:"التدريب على قواعد السلوك انتهى بنسبة 96%، باقي أربع حالات إعادة اختبار.",comp:"ethics",code:"RI-5",date:"2026-07-22",time:"14:40"},
 {id:++MID,by:2,txt:"سجل الخدمات غير التأكيدية متأخر، محتاج قرار الشريك المسؤول عن الاستقلال.",comp:"ethics",code:"RI-7",date:"2026-07-23",time:"08:55"},
 {id:++MID,by:0,txt:"خذ موافقتي مبدئياً وابدأ بالسجل، ونراجعه في اجتماع الاثنين.",comp:"ethics",code:"RI-7",date:"2026-07-23",time:"09:20"},
 {id:++MID,by:2,txt:"نموذج القبول طُبّق على 14 عميلاً جديداً ورُفض عميلان.",comp:"accept",code:"RI-8",date:"2026-07-25",time:"12:10"},
 {id:++MID,by:3,txt:"جلسة التخطيط تمت في 11 ارتباط من 12، الأخير مجدول الأسبوع القادم.",comp:"perf",code:"RI-10",date:"2026-07-27",time:"10:02"},
 {id:++MID,by:1,txt:"خطة التوظيف السنوية جاهزة للمراجعة على مستوى الهدف كامل.",comp:"res",code:"O-24",date:"2026-07-28",time:"16:25"},
 {id:++MID,by:4,txt:"منهجية تحليل السبب الجذري لسه ما اعتُمدت، الاستجابة متأخرة.",comp:"mon",code:"RI-19",date:"2026-07-30",time:"09:45"},
 {id:++MID,by:0,txt:"ارفع لي خطة معالجة خلال أسبوع، هذا بند حرج.",comp:"mon",code:"RI-19",date:"2026-07-30",time:"10:00"},
 {id:++MID,by:1,txt:"مراجعة سجل المخاطر النصف سنوية بتبدأ أول سبتمبر.",comp:"ra",code:"RI-22",date:"2026-08-01",time:"13:15"},
 {id:++MID,by:2,txt:"قناة الإبلاغ السرية جاهزة تقنياً، ناقص اعتماد سياسة عدم الانتقام.",comp:"info",code:"RI-17",date:"2026-08-03",time:"08:30"}
];
module.exports={PEOPLE,DATA,CHAT,USERS,FIRM};
