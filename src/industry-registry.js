export const GENERAL_REGULATORY_SOURCES = [
  {id:'abr',name:'Australian Business Register / ABN Lookup',authority:'Australian Government',jurisdiction:'AU',url:'https://abr.business.gov.au/',tags:['identity','registration'],note:'ABN identity and public business-register information.'},
  {id:'asic',name:'ASIC business and company services',authority:'Australian Securities and Investments Commission',jurisdiction:'AU',url:'https://www.asic.gov.au/for-business-and-companies/',tags:['company','business-name','corporate'],note:'Company and business-name registration and company-officeholder obligations.'},
  {id:'ablis',name:'Australian Business Licence and Information Service',authority:'Australian, state, territory and local governments',jurisdiction:'AU',url:'https://ablis.business.gov.au/',tags:['licence','permit','approval','local'],note:'National licence, permit, approval and regulatory information service.'},
  {id:'ato-business',name:'ATO business obligations',authority:'Australian Taxation Office',jurisdiction:'AU',url:'https://www.ato.gov.au/businesses-and-organisations',tags:['tax','gst','payg','super'],note:'Business tax, GST, PAYG, super and reporting guidance.'},
  {id:'fair-work',name:'Fair Work workplace laws',authority:'Fair Work Ombudsman',jurisdiction:'AU',url:'https://www.fairwork.gov.au/about-us/workplace-laws',tags:['employment','award','workplace'],note:'Workplace-law, award and employer/employee updates.'},
  {id:'oaic-business',name:'OAIC privacy guidance for organisations',authority:'Office of the Australian Information Commissioner',jurisdiction:'AU',url:'https://www.oaic.gov.au/privacy/your-privacy-rights/your-personal-information',tags:['privacy','data'],note:'Privacy and personal-information guidance. Applicability depends on the organisation and circumstances.'}
];

export const INDUSTRY_REGISTRY = [
  {
    code:'general_service',
    label:'General service business',
    group:'General business',
    keywords:['service business','mobile service','appointments','consulting','customer service'],
    summary:'Flexible service-business workspace for enquiries, customers, bookings, jobs, staff, communications and approvals.',
    services:['Customer enquiries','Quotes & proposals','Bookings & scheduling','Service delivery','Customer follow-up','Reviews & referrals'],
    modules:['dashboard','onboarding','workforce','jobs','finance','assistant','video','integrations','governance','manual','billing'],
    documents:['Business registrations and licences relevant to the activity','Insurance and worker records where applicable','Customer terms, privacy and service records'],
    sources:[]
  },
  {
    code:'trades_construction',
    label:'Trades, construction & field services',
    group:'Trades & field services',
    keywords:['electrician','plumber','builder','construction','painting','gasfitting','trade','field service','polishing','fleet','truck'],
    summary:'Field-job, workforce, licence, quoting, scheduling, site evidence and profitability setup.',
    services:['Enquiries & quoting','Bookings & dispatch','On-site jobs','Recurring maintenance','Site evidence','Customer follow-up'],
    modules:['dashboard','onboarding','workforce','jobs','finance','assistant','integrations','governance','manual','billing'],
    documents:['Trade or contractor licences/registrations where required','Worker competency and safety records','Insurance','Site/job evidence'],
    sources:[
      {id:'wa-building-energy',name:'WA Building and Energy licensing and registration',authority:'Western Australian Government',jurisdiction:'WA',url:'https://www.wa.gov.au/organisation/service-delivery/building-and-energy-licensing-and-registration',tags:['electrical','plumbing','building','gas','painting'],note:'WA licensing and registration information for regulated building and energy occupations.'}
    ]
  },
  {
    code:'healthcare',
    label:'Healthcare & clinical practice',
    group:'Health',
    keywords:['doctor','medical','nurse','nursing','physio','psychologist','dentist','pharmacy','allied health','clinic'],
    summary:'Privacy-sensitive clinical/admin workspace with practitioner, workforce, appointment, communication and governance controls.',
    services:['Patient/client enquiries','Appointments','Practitioner scheduling','Document requests','Follow-up','Practice administration'],
    modules:['dashboard','onboarding','workforce','jobs','finance','assistant','integrations','governance','manual','billing'],
    documents:['Practitioner registration evidence where applicable','Professional indemnity and business insurance','Privacy/confidentiality procedures','Worker credential records'],
    sources:[
      {id:'ahpra',name:'Ahpra and National Boards',authority:'Australian Health Practitioner Regulation Agency',jurisdiction:'AU',url:'https://www.ahpra.gov.au/',tags:['health','practitioner','registration'],note:'National health-practitioner registration and regulatory information.'}
    ]
  },
  {
    code:'ndis',
    label:'NDIS provider',
    group:'Disability services',
    keywords:['ndis','disability support','support worker','sil','plan management','behaviour support'],
    summary:'Provider, participant-support, worker screening, incident/complaint, evidence and governance-oriented workspace.',
    services:['Participant enquiries','Service agreements','Worker scheduling','Support delivery records','Incident and complaint workflows','Provider administration'],
    modules:['dashboard','onboarding','workforce','jobs','finance','assistant','integrations','governance','manual','billing'],
    documents:['Provider registration evidence where registration applies','Worker-screening evidence for relevant roles','Audit/quality evidence where applicable','Incident and complaint records','Service agreements'],
    sources:[
      {id:'ndis-registration',name:'NDIS Commission provider registration',authority:'NDIS Quality and Safeguards Commission',jurisdiction:'AU',url:'https://www.ndiscommission.gov.au/provider-registration/about-registration',tags:['ndis','registration','audit'],note:'Registered-provider requirements and registration information.'},
      {id:'ndis-worker-screening',name:'NDIS worker screening',authority:'NDIS Quality and Safeguards Commission',jurisdiction:'AU',url:'https://www.ndiscommission.gov.au/workforce/worker-screening/worker-screening-registered-providers',tags:['ndis','worker','screening'],note:'Worker-screening responsibilities for registered providers and risk-assessed roles.'}
    ]
  },
  {
    code:'aged_care',
    label:'Aged care provider',
    group:'Aged care',
    keywords:['aged care','home care','residential care','older people','aged care provider'],
    summary:'Rights, governance, workforce, quality, incident, complaint and service-delivery focused workspace.',
    services:['Client enquiries','Care/service scheduling','Workforce coordination','Quality and safety records','Complaints and incidents','Provider administration'],
    modules:['dashboard','onboarding','workforce','jobs','finance','assistant','integrations','governance','manual','billing'],
    documents:['Provider registration evidence','Governance and quality records','Workforce credential records','Incident and complaint records','Service/care documentation'],
    sources:[
      {id:'aged-care-provider',name:'Aged Care Quality and Safety Commission provider requirements',authority:'Aged Care Quality and Safety Commission',jurisdiction:'AU',url:'https://www.agedcarequality.gov.au/provider-handbook/provider-requirements',tags:['aged-care','provider','quality','governance'],note:'Registered-provider obligations and provider requirements.'}
    ]
  },
  {
    code:'legal',
    label:'Legal practice',
    group:'Professional services',
    keywords:['lawyer','legal practice','solicitor','barrister','law firm'],
    summary:'Matter/client intake, confidential document, deadline, communication, billing and governance-oriented workspace.',
    services:['Client intake','Appointments','Matter tasks','Document requests','Deadline follow-up','Client communications'],
    modules:['dashboard','onboarding','workforce','jobs','finance','assistant','integrations','governance','manual','billing'],
    documents:['Practising certificate evidence where applicable','Professional insurance records','Client engagement and confidentiality records','Trust/accounting records where applicable'],
    sources:[
      {id:'lpbwa',name:'Legal Practice Board of Western Australia',authority:'Legal Practice Board of Western Australia',jurisdiction:'WA',url:'https://www.lpbwa.org.au/Practising-Certificates',tags:['legal','practising-certificate'],note:'WA practising-certificate and professional-practice information.'}
    ]
  },
  {
    code:'accounting_tax',
    label:'Accounting, bookkeeping & tax practice',
    group:'Professional services',
    keywords:['accountant','bookkeeper','tax agent','bas agent','tax practice','accounting'],
    summary:'Client, deadline, document, recurring-work, billing and controlled financial-workflow setup.',
    services:['Client onboarding','Document requests','Appointments','Recurring compliance tasks','Deadline follow-up','Practice administration'],
    modules:['dashboard','onboarding','workforce','jobs','finance','assistant','integrations','governance','manual','billing'],
    documents:['TPB registration evidence where the service requires registration','Professional indemnity insurance where required','Client authorities and engagement records','Staff competency/supervision records'],
    sources:[
      {id:'tpb',name:'Tax Practitioners Board',authority:'Tax Practitioners Board',jurisdiction:'AU',url:'https://www.tpb.gov.au/tax-practitioners',tags:['tax-agent','bas-agent','registration'],note:'Registration and obligations for tax and BAS practitioners.'}
    ]
  },
  {
    code:'real_estate',
    label:'Real estate & property services',
    group:'Property',
    keywords:['real estate','property management','agent','tenant','vendor','landlord','inspection'],
    summary:'Lead, property, inspection, client communication, document and campaign-oriented workspace.',
    services:['Lead qualification','Property enquiries','Inspections & appointments','Vendor/landlord communication','Buyer/tenant follow-up','Property task coordination'],
    modules:['dashboard','onboarding','workforce','jobs','finance','assistant','video','integrations','governance','manual','billing'],
    documents:['Agent/representative licence or registration where required','Property/client authorities and agreements','Trust/accounting records where applicable','Inspection and communication records'],
    sources:[
      {id:'ablis-property',name:'ABLIS property and real-estate licensing search',authority:'Australian, state, territory and local governments',jurisdiction:'AU',url:'https://ablis.business.gov.au/',tags:['property','real-estate','licence'],note:'Use the guided search for the business activity and location because licensing varies by jurisdiction.'}
    ]
  },
  {
    code:'it_technology',
    label:'IT, software & technology services',
    group:'Technology',
    keywords:['it services','software','saas','cyber','managed service','developer','technology','web development'],
    summary:'Client-project, support, subscription, security, incident, content and integration-oriented workspace.',
    services:['Lead intake','Project/service onboarding','Support requests','Recurring services','Incident handling','Client follow-up'],
    modules:['dashboard','onboarding','workforce','jobs','finance','assistant','video','integrations','governance','manual','billing'],
    documents:['Client contracts and service levels','Privacy/security procedures','Insurance where applicable','Incident and change records'],
    sources:[]
  },
  {
    code:'manufacturing',
    label:'Manufacturing & production',
    group:'Manufacturing',
    keywords:['manufacturing','factory','production','fabrication','wholesale','plant','machinery'],
    summary:'Order/job, workforce, supplier, quality, safety, maintenance and profitability-oriented workspace.',
    services:['Customer orders/enquiries','Production jobs','Supplier coordination','Quality checks','Maintenance scheduling','Dispatch/follow-up'],
    modules:['dashboard','onboarding','workforce','jobs','finance','assistant','integrations','governance','manual','billing'],
    documents:['Licences/permits relevant to the activity and location','WHS/safety and training records','Quality records','Supplier and product documentation'],
    sources:[]
  },
  {
    code:'transport_logistics',
    label:'Transport, logistics & fleet',
    group:'Transport',
    keywords:['transport','logistics','truck','fleet','courier','freight','delivery','warehouse'],
    summary:'Fleet/job scheduling, workforce, customer, safety, maintenance and operational-profit workspace.',
    services:['Bookings & dispatch','Fleet/job allocation','Customer communications','Maintenance coordination','Delivery/service evidence','Follow-up'],
    modules:['dashboard','onboarding','workforce','jobs','finance','assistant','integrations','governance','manual','billing'],
    documents:['Vehicle/operator/transport authorisations where applicable','Driver/workforce credentials','Safety and maintenance records','Customer/job evidence'],
    sources:[]
  },
  {
    code:'hospitality_food',
    label:'Hospitality, food & accommodation',
    group:'Hospitality',
    keywords:['restaurant','cafe','food','catering','hotel','accommodation','hospitality'],
    summary:'Booking/order, roster, supplier, food/service, customer and marketing workspace.',
    services:['Bookings/orders','Customer enquiries','Roster coordination','Supplier tasks','Service delivery','Reviews & marketing'],
    modules:['dashboard','onboarding','workforce','jobs','finance','assistant','video','integrations','governance','manual','billing'],
    documents:['Food/business licences and council approvals where applicable','Food-safety records','Worker records','Insurance'],
    sources:[]
  },
  {
    code:'education_childcare',
    label:'Education, training & childcare',
    group:'Education & care',
    keywords:['education','training','rto','childcare','early learning','tutor','school','course'],
    summary:'Enrolment/client, scheduling, staff credential, document, communication and governance-oriented workspace.',
    services:['Enquiries & enrolments','Appointments/classes','Staff scheduling','Document collection','Progress/follow-up','Administration'],
    modules:['dashboard','onboarding','workforce','jobs','finance','assistant','integrations','governance','manual','billing'],
    documents:['Provider/service approvals where applicable','Worker checks and qualifications','Policies and consent records','Incident/safety records'],
    sources:[]
  },
  {
    code:'cleaning_facilities',
    label:'Cleaning, facilities & property maintenance',
    group:'Field services',
    keywords:['cleaning','facilities','maintenance','commercial cleaning','property maintenance','gardening'],
    summary:'Site, recurring-job, workforce, evidence, quoting and customer communication workspace.',
    services:['Enquiries & quoting','Recurring schedules','Site jobs','Worker allocation','Completion evidence','Customer follow-up'],
    modules:['dashboard','onboarding','workforce','jobs','finance','assistant','integrations','governance','manual','billing'],
    documents:['Activity-specific licences/permits where applicable','Worker/safety records','Insurance','Site/service records'],
    sources:[]
  },
  {
    code:'custom',
    label:'Custom / other Australian business',
    group:'Custom',
    keywords:[],
    summary:'Start with the universal core and let AI propose services, sections and relevant regulatory sources for owner review.',
    services:['Customer enquiries','Operations','Follow-up'],
    modules:['dashboard','onboarding','workforce','jobs','finance','assistant','integrations','governance','manual','billing'],
    documents:['Use ABLIS and the relevant regulator to confirm licences, permits, approvals and professional obligations.'],
    sources:[]
  }
];

export function industryByCode(code){
  return INDUSTRY_REGISTRY.find(x=>x.code===code)||INDUSTRY_REGISTRY.find(x=>x.code==='custom');
}
export function industrySources(industry,state=''){
  const row=typeof industry==='string'?industryByCode(industry):industry;
  const all=[...GENERAL_REGULATORY_SOURCES,...(row?.sources||[])];
  const seen=new Set();
  return all.filter(x=>{
    if(seen.has(x.id))return false;
    if(x.jurisdiction&&x.jurisdiction!=='AU'&&state&&x.jurisdiction!==String(state).toUpperCase())return false;
    seen.add(x.id);return true;
  });
}
