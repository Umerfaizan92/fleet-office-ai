import { industryByCode } from './industry-registry.js';

export const WORKFORCE_OFFICIAL_SOURCES={
  vevo:{
    id:'vevo',
    name:'Home Affairs — VEVO for organisations',
    url:'https://immi.homeaffairs.gov.au/visa-conditions-subsite/Pages/vevo-for-organisations.aspx',
    note:'Registered organisations can check visa work entitlements with the visa holder’s permission. VEVO does not verify Australian citizenship.'
  },
  dvs:{
    id:'dvs',
    name:'IDMatch — Document Verification Service',
    url:'https://www.idmatch.gov.au/organisations',
    note:'DVS is available only to approved organisations under the applicable access/participation arrangements.'
  },
  waLicence:{
    id:'wa-occupational-licence',
    name:'WA Government — Online licence search',
    url:'https://www.wa.gov.au/organisation/service-delivery/online-licence-search',
    note:'Official WA search for many occupational licences issued by Building & Energy, Consumer Protection or WorkSafe.'
  },
  ndisScreen:{
    id:'ndis-worker-screening',
    name:'NDIS Commission — Worker Screening Database guidance',
    url:'https://www.ndiscommission.gov.au/portal-quick-reference-guides',
    note:'Authorised providers use the NDIS Commission portal/Worker Screening Database for applicable worker-screening checks.'
  },
  ahpra:{
    id:'ahpra-register',
    name:'Ahpra — Register of practitioners',
    url:'https://www.ahpra.gov.au/Registration/Registers-of-Practitioners.aspx',
    note:'Official public register for nationally regulated health practitioners.'
  },
  asqa:{
    id:'asqa-rto',
    name:'ASQA — National register / RTO information',
    url:'https://www.asqa.gov.au/rtos',
    note:'Official regulator information for registered training organisations.'
  },
  tpb:{
    id:'tpb-register',
    name:'Tax Practitioners Board',
    url:'https://www.tpb.gov.au/registrations',
    note:'Official registration information for tax and BAS practitioners.'
  },
  fairWork:{
    id:'fair-work',
    name:'Fair Work Ombudsman',
    url:'https://www.fairwork.gov.au/',
    note:'Workplace rights, employment conditions and employer obligations.'
  },
  workSafeWA:{
    id:'worksafe-wa',
    name:'WorkSafe WA',
    url:'https://www.worksafe.wa.gov.au/',
    note:'WA work health and safety information.'
  }
};

const INDUSTRY_SKILLS={
  agriculture_forestry_fishing:['Equipment operation','Biosecurity procedures','Animal handling','Chemical handling','Work health and safety','Record keeping'],
  mining_resources:['Site induction','Hazard identification','Plant/equipment operation','Permit-to-work awareness','Emergency procedures','Work health and safety'],
  manufacturing:['Production equipment operation','Quality inspection','Machine safety','Assembly/fabrication','Maintenance awareness','Traceability records'],
  utilities_waste:['Field safety','Asset inspection','Maintenance procedures','Hazard control','Environmental procedures','Incident reporting'],
  construction_trades:['Site safety','Trade-specific practical competency','Working at heights awareness','Tool/equipment competency','Hazard identification','Customer/site documentation'],
  wholesale_trade:['Order processing','Inventory handling','Supplier coordination','Dispatch documentation','Customer account service'],
  retail_ecommerce:['Customer service','Order fulfilment','Product knowledge','Returns handling','Inventory control','Digital commerce'],
  hospitality_food:['Food safety','Customer service','Allergen awareness','POS/order handling','Cleaning and hygiene','Shift operations'],
  transport_logistics:['Driver/fleet safety','Load handling','Dispatch coordination','Delivery evidence','Fatigue awareness','Vehicle inspection'],
  media_telecom:['Content production','Publishing workflow','Client communication','Digital asset handling','Privacy/security awareness'],
  finance_insurance:['Client identification','Controlled financial workflow','Record keeping','Privacy/confidentiality','Regulatory procedure awareness'],
  real_estate:['Client communication','Property inspection','CRM/lead handling','Authority/document handling','Privacy/confidentiality'],
  professional_services:['Client intake','Project delivery','Document control','Professional communication','Deadline management'],
  legal:['Client confidentiality','Matter administration','Document control','Deadline management','Conflict awareness'],
  accounting_tax:['Bookkeeping workflow','Client document handling','BAS/tax workflow awareness','Payroll processing','Confidentiality'],
  it_technology:['Technical support','Cybersecurity hygiene','Incident handling','Change management','Client systems documentation'],
  admin_support:['Administration','Customer communication','Scheduling','Document management','Data privacy awareness'],
  cleaning_facilities:['Chemical handling','Site safety','Cleaning procedures','Equipment operation','Completion evidence'],
  public_safety:['Case/task administration','Controlled records','Incident response','Governance procedures','Public communication'],
  education_training:['Learner support','Training delivery','Assessment administration','Safeguarding awareness','Record keeping'],
  childcare_early_learning:['Child safety','Supervision','Incident reporting','Family communication','Education/care documentation'],
  healthcare:['Clinical/admin privacy','Patient communication','Infection control awareness','Clinical documentation','Practitioner workflow'],
  nursing_midwifery:['Clinical documentation','Medication safety awareness','Infection control','Patient care','Escalation procedures'],
  allied_health:['Client assessment workflow','Clinical documentation','Privacy/confidentiality','Treatment/service delivery','Outcome tracking'],
  dental:['Infection control','Patient care','Clinical documentation','Sterilisation workflow','Privacy/confidentiality'],
  pharmacy:['Medication workflow','Customer/patient privacy','Controlled process awareness','Stock handling','Service documentation'],
  ndis:['Participant support','Incident reporting','Worker screening awareness','Service documentation','Safeguarding','Behaviour/support-plan awareness'],
  aged_care:['Client dignity and rights','Care documentation','Incident reporting','Infection control','Safeguarding','Service delivery'],
  veterinary:['Animal handling','Clinical/admin documentation','Infection control','Client communication','Medication workflow awareness'],
  arts_recreation_sport:['Session delivery','Participant safety','Customer/member service','Event operations','Equipment safety'],
  repair_automotive:['Workshop/mobile-job safety','Tool and equipment competency','Surface/repair preparation','Quality inspection','Vehicle protection','Completion evidence'],
  beauty_personal:['Client consultation','Hygiene/infection control','Service technique','Product safety','Client records'],
  other_services:['Customer service','Service delivery','Work health and safety','Record keeping','Quality control'],
  custom:['Customer service','Service delivery','Work health and safety','Record keeping','Quality control']
};

const ROLE_MATCHERS=[
  {test:/electric|electrical/i,skills:['Electrical trade competency','Electrical safety'],source:'waLicence'},
  {test:/plumb/i,skills:['Plumbing trade competency','Plumbing safety'],source:'waLicence'},
  {test:/gas/i,skills:['Gasfitting competency','Gas safety'],source:'waLicence'},
  {test:/build|carpent|roof|paint/i,skills:['Trade/site competency','Construction site safety'],source:'waLicence'},
  {test:/nurs|midwi|doctor|medical|physio|psych|podiatr|chiropr|optometr|dent/i,skills:['Current practitioner registration','Clinical scope competency'],source:'ahpra'},
  {test:/support worker|ndis|disability/i,skills:['Participant safeguarding','NDIS worker screening (where applicable)'],source:'ndisScreen'},
  {test:/tax agent|bas agent/i,skills:['Current practitioner registration','Tax/BAS service competency'],source:'tpb'},
  {test:/truck|driver|delivery|courier|freight/i,skills:['Vehicle/driver competency','Load and road safety'],source:null},
  {test:/polish|detail|metal|fabricat/i,skills:['Metal surface preparation','Machine polishing','Sanding and defect removal','Tool safety','Quality inspection'],source:null}
];

function cleanSkill(value){
  return String(value||'').replace(/\s+/g,' ').trim().slice(0,100);
}
function unique(items){
  const seen=new Set();
  return items.filter(item=>{const key=cleanSkill(item).toLowerCase();if(!key||seen.has(key))return false;seen.add(key);return true});
}
function serviceToSkill(value){
  const text=cleanSkill(value).replace(/\b(enquiries|customer enquiries|follow-up|coordination)\b/gi,'').replace(/\s+/g,' ').trim();
  if(!text)return null;
  return text.length>4?text:null;
}

export function workforceSkillSuggestions({industryCode='custom',jobTitle='',services=[],customSections=[]}={}){
  const industry=industryByCode(industryCode);
  const suggestions=[];
  for(const item of INDUSTRY_SKILLS[industry?.code]||INDUSTRY_SKILLS.custom)suggestions.push({name:item,source:'industry'});
  for(const item of industry?.specialties||[])suggestions.push({name:cleanSkill(item)+' competency',source:'industry_specialty'});
  for(const item of services||[]){const skill=serviceToSkill(item);if(skill)suggestions.push({name:skill,source:'business_service'})}
  for(const item of customSections||[]){const skill=serviceToSkill(item);if(skill)suggestions.push({name:skill,source:'workspace_custom'})}
  for(const matcher of ROLE_MATCHERS){
    if(matcher.test.test(jobTitle||''))for(const skill of matcher.skills)suggestions.unshift({name:skill,source:'job_title',official_source:matcher.source||null});
  }
  const ranked=unique(suggestions.map(x=>x.name)).map(name=>{
    const first=suggestions.find(x=>x.name.toLowerCase()===name.toLowerCase())||{};
    return {name,source:first.source||'industry',official_source:first.official_source||null};
  });
  return ranked.slice(0,24);
}

export function workStatusRequirements(workStatus='requires_review'){
  const common=[{
    code:'identity_evidence',category:'identity',label:'Identity evidence reviewed',
    verification_method:'authorised_review',source:'dvs',
    note:'Record the evidence used for identity review. DVS may only be used where the organisation has approved access.'
  }];
  if(workStatus==='australian_citizen'){
    return [...common,{
      code:'work_rights_citizen',category:'work_rights',label:'Australian citizenship/work-right evidence',
      verification_method:'authorised_review',source:'dvs',
      note:'VEVO cannot confirm Australian citizenship. Use appropriate citizenship/passport evidence and an authorised identity process.'
    }];
  }
  if(workStatus==='permanent_resident'){
    return [...common,{
      code:'work_rights_pr',category:'work_rights',label:'Permanent resident work-right evidence',
      verification_method:'official_portal_or_authorised_review',source:'vevo',
      note:'Where applicable, check current permanent visa/work entitlement through VEVO with the person’s permission.'
    }];
  }
  if(workStatus==='visa_holder'){
    return [...common,{
      code:'work_rights_visa',category:'work_rights',label:'Visa work entitlements and conditions',
      verification_method:'official_portal',source:'vevo',
      note:'Check current work entitlements, visa conditions and relevant expiry/recheck dates through VEVO with permission.'
    }];
  }
  return [...common,{
    code:'work_rights_review',category:'work_rights',label:'Work-right status requires authorised review',
    verification_method:'authorised_review',source:'vevo',
    note:'Do not schedule until an authorised reviewer confirms the person’s lawful work entitlement.'
  }];
}

export function industryComplianceSuggestions(industryCode='custom',roleTitle=''){
  const out=[];
  const add=(code,label,source,note)=>out.push({code,category:'industry',label,source,verification_method:'official_source_or_authorised_review',note});
  if(industryCode==='construction_trades'){
    add('industry_trade_licence','Trade/occupational licence or registration where the role requires it','waLicence','Check applicability for the exact occupation and work being performed.');
    add('industry_site_safety','Required site safety/competency evidence',null,'Set the exact site/role requirement before scheduling.');
  }
  if(['healthcare','nursing_midwifery','allied_health','dental','pharmacy'].includes(industryCode)){
    add('industry_practitioner_registration','Practitioner registration where the role is regulated','ahpra','Check the practitioner register and scope relevant to the service.');
  }
  if(industryCode==='ndis'){
    add('industry_ndis_screening','NDIS worker screening clearance where the role is risk-assessed','ndisScreen','Check applicability and clearance status through the authorised NDIS worker-screening workflow.');
  }
  if(industryCode==='education_training'){
    add('industry_training_credentials','Trainer/assessor or educator credentials where required','asqa','Confirm the qualification/role requirements that apply to the service.');
  }
  if(industryCode==='accounting_tax'){
    add('industry_tax_registration','TPB registration where services require registered tax/BAS practitioner status','tpb','Check the specific service and practitioner registration requirement.');
  }
  if(industryCode==='transport_logistics'){
    add('industry_driver_credentials','Driver/vehicle/operator credentials applicable to the assigned work',null,'Record the licence/authorisation required for the vehicle and task.');
  }
  if(industryCode==='repair_automotive'&&/electric|gas|licensed|regulated/i.test(roleTitle||'')){
    add('industry_occupational_licence','Occupational licence/registration applicable to the work','waLicence','Use the official register where the activity is licensed.');
  }
  return out;
}

export function officialSource(sourceId){
  return sourceId?WORKFORCE_OFFICIAL_SOURCES[sourceId]||null:null;
}
