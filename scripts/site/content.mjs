// Content for the public website. Every claim here describes something the product does today (Phase 00 inventory)
// or is labelled as an add-on or an example. Edit copy here, then run `npm run build:site`.

export const SITE = {
  name: 'Super Pro AI Office Manager',
  short: 'Super Pro',
  tagline: 'Your office runs. You approve.',
  trialDays: 14
};

export const NAV = [
  { href: '/features', label: 'Features' },
  { href: '/for', label: 'Industries' },
  { href: '/receptionist', label: 'Receptionist' },
  { href: '/pricing', label: 'Pricing' },
  { href: '/help', label: 'Help' }
];

export const PLANS = [
  { id: 'starter', name: 'Starter', price: 49, users: 3, summary: 'For an owner and a small crew getting the office out of their head.', features: ['Customers, enquiries and jobs', 'Unified inbox and email centre', 'Invoices, payment links and tap-to-pay QR', 'AI drafts with your approval', 'Worker records and basic compliance', '3 business users'] },
  { id: 'operations', name: 'Operations', price: 99, users: 10, featured: true, summary: 'For teams that book, dispatch and get paid every day.', features: ['Everything in Starter', 'Full workforce compliance and job eligibility', 'Growth plan and social calendar', 'Profit per job, costs and overheads', '25% off usage add-on packs', '10 business users'] },
  { id: 'scale', name: 'Scale', price: 149, users: 25, summary: 'For multi-crew businesses that need fine-grained control.', features: ['Everything in Operations', 'Individual staff permissions', 'Higher AI and storage limits', '50% off usage add-on packs', 'Hiring workspace for owners', '25 business users'] }
];

export const DOMAINS = [
  {
    slug: 'customers', icon: 'briefcase', name: 'Customers and work',
    title: 'Every enquiry becomes a job, without retyping it',
    lede: 'Enquiries from calls, email and your website land in one place. Turn one into a quote, a booking and a job with the details carried across.',
    blocks: [
      ['One record per customer', 'Contact details, past jobs, before and after photos and every message sit on one page, so anyone you allow can pick up where you left off.'],
      ['Quotes that follow up for you', 'Draft a quote from the enquiry, send it with a payment link, and see when it is opened. Accepting it proposes a booking.'],
      ['Jobs your crew can run from a phone', 'Assigned workers see their jobs, addresses and notes, take photos on site and mark work complete. They never see prices unless you allow it.'],
      ['Stock that knows where it went', 'Record what each job used and it shows up in that job\'s profit.']
    ],
    approval: 'Sending a quote, confirming a booking and merging customer records always wait for a person.',
    faq: [['Can I import my customers?', 'Yes. Upload a spreadsheet or an export from another system and preview the import before anything is saved.'], ['Can workers see every customer?', 'No. Workers and contractors only see the jobs assigned to them. The customer list is for owners and the people you choose.']]
  },
  {
    slug: 'money', icon: 'wallet', name: 'Money',
    title: 'Invoice the moment the job is done, get paid on the spot',
    lede: 'Invoices, payment links, tap-to-pay QR codes and receipts, with profit per job worked out as you go.',
    blocks: [
      ['Pay links your customers trust', 'Take card payments through your own Stripe or PayPal account, or show bank transfer details. Super Pro never holds your money.'],
      ['Tap to pay on site', 'Show a QR code on your phone; the customer pays on theirs, and you send the receipt in one tap.'],
      ['Profit per job', 'Revenue, materials, labour and overheads come together on each job, so you can see which work is worth taking.'],
      ['Reminders without awkward calls', 'Overdue invoices get a polite reminder drafted for you to approve, with late fees applied once if you use them.']
    ],
    approval: 'Sending an invoice, refunding, and changing payment settings are owner decisions.',
    faq: [['Which payment providers work?', 'Stripe and PayPal for cards, plus bank transfer details. You connect your own accounts.'], ['Does it handle GST?', 'Invoices and the ledger record GST. A quarterly GST summary for your BAS is on the roadmap.']]
  },
  {
    slug: 'communications', icon: 'message', name: 'Communications',
    title: 'Calls, texts and email in one inbox, with replies drafted for you',
    lede: 'Every conversation with a customer is in one place. Super Pro drafts the reply; you read it, change it if you like, and send it.',
    blocks: [
      ['One inbox for every channel', 'Email, SMS, WhatsApp and call notes sit in one thread per customer, with delivery and read receipts where the provider gives them.'],
      ['An email centre with real control', 'Drafts, scheduled sends and sent mail are kept apart. Editing a draft resets its approval, so what goes out is exactly what was approved.'],
      ['Team chat that stays at work', 'Message your crew without sharing personal phone numbers, with sent and seen receipts.'],
      ['The AI receptionist add-on', 'Answers your business number, takes details and books from your availability. It is switched on per business once your number is set up.']
    ],
    approval: 'No message leaves the business until a person approves it.',
    faq: [['Will it send messages on its own?', 'No. Drafts wait in your approvals until you or someone you authorise approves them.'], ['Can I keep my business number?', 'Number setup and porting are arranged with you when the receptionist add-on is switched on.']]
  },
  {
    slug: 'growth', icon: 'megaphone', name: 'Content and growth',
    title: 'A month of posts drafted in your voice, published when you say',
    lede: 'A growth plan for your business, a 30-day content calendar and posts written for each platform. You approve every one.',
    blocks: [
      ['A plan made for your business', 'Tell it your services and area; it suggests what to post and when.'],
      ['Posts for each platform', 'Facebook and X posts can publish automatically once approved. For Instagram, TikTok and YouTube you get a ready-to-post reminder.'],
      ['Search visibility, checked', 'Check your public pages for search and AI-answer readiness and get a plain list of what to fix.'],
      ['Reuse what worked', 'Paste a post that did well and get versions for your other channels.']
    ],
    approval: 'Every post and every campaign waits for approval before it goes out.',
    faq: [['Can it send bulk email campaigns?', 'Not yet. Bulk sending stays off until consent records and one-click unsubscribe are in place, to keep you within spam law.']]
  },
  {
    slug: 'people', icon: 'users', name: 'People and compliance',
    title: 'Know who can legally work, before you book them',
    lede: 'Worker records with work rights, licences and expiry dates, so you can see who is eligible for a job before you offer it.',
    blocks: [
      ['Work rights recorded properly', 'Record VEVO check results and Fair Work requirements against each worker, with links to the official sources.'],
      ['Licences that remind you', 'Licence and document expiry dates are tracked so nothing lapses quietly.'],
      ['Invite workers to onboard themselves', 'Send a secure link; workers add their own details and documents.'],
      ['Permissions per person', 'Owners decide exactly what each staff member can see and do. Workers and contractors can never be given access to money or the customer list.']
    ],
    approval: 'Marking work rights as verified and changing permissions are owner decisions.',
    faq: [['Does Super Pro check VEVO for me?', 'You run the check on the government VEVO service and record the result in Super Pro, where it is kept with the worker\'s record.']]
  },
  {
    slug: 'ai', icon: 'spark', name: 'AI and approvals',
    title: 'An assistant that does the paperwork and asks before it acts',
    lede: 'Ask in plain words, by typing or speaking. Super Pro answers from your own records and prepares the work; you decide what happens.',
    blocks: [
      ['Ask about your business', 'Who owes you money, which jobs are short a worker, what is waiting on you today.'],
      ['Drafts, not surprises', 'Replies, quotes, invoices and posts are drafted and placed in your approvals queue.'],
      ['A record you can trust', 'Every approval and change is written to a tamper-evident activity log.'],
      ['Speaks your language', 'Ask in English or many other languages, by voice or text.']
    ],
    approval: 'Anything that sends, pays, publishes or deletes needs a person to approve it.',
    faq: [['Which AI does it use?', 'Super Pro uses leading AI providers through its own gateway. Your business data is only used to answer your requests.']]
  }
];

export const INDUSTRIES = [
  {
    slug: 'trades', icon: 'wrench', name: 'Trades',
    title: 'The office manager every tradie needs and never has time to hire',
    lede: 'Quotes at night, missed calls on the tools, chasing invoices on Friday. Super Pro takes the office off your hands and checks with you before anything goes out.',
    pains: ['Calls missed while you are up a ladder', 'Quotes written at the kitchen table at 10pm', 'Chasing invoices instead of doing paid work', 'Licences and white cards expiring without notice'],
    day: [['7:00', 'You open My day: three jobs, addresses and notes.'], ['10:20', 'A missed call becomes an enquiry with a reply drafted.'], ['12:30', 'You approve the reply and a quote from your phone.'], ['3:40', 'Job done, before and after photos saved, invoice drafted.'], ['3:45', 'The customer pays by QR on site.']]
  },
  {
    slug: 'clinics', icon: 'clinic', name: 'Allied health and clinics',
    title: 'Front-desk admin handled, so your team can stay with clients',
    lede: 'Bookings, reminders, payments and staff paperwork in one place. Clinical records stay in your clinical system; Super Pro runs the business side.',
    pains: ['Phones ringing during sessions', 'Rebooking and reminder messages by hand', 'Contractor paperwork and registrations to track', 'Invoices and receipts across several systems'],
    day: [['8:00', 'The day\'s bookings and who is working are on one screen.'], ['9:15', 'An enquiry from the website gets a reply drafted.'], ['11:00', 'A contractor\'s registration expiry reminder arrives.'], ['4:30', 'Payments taken and receipts sent.']]
  },
  {
    slug: 'retail', icon: 'store', name: 'Retail and showrooms',
    title: 'Customers, stock and staff, without the spreadsheet',
    lede: 'Keep customer enquiries, stock movements and rosters together, and keep your social channels busy without writing every post yourself.',
    pains: ['Enquiries across Instagram, email and phone', 'Stock counts that never match', 'Posting regularly with no time to write', 'Casual staff paperwork'],
    day: [['9:00', 'Overnight messages are sorted with replies drafted.'], ['11:30', 'This week\'s posts are ready for your approval.'], ['2:00', 'Stock used on an order is recorded against it.'], ['5:30', 'Today\'s takings and profit are on the dashboard.']]
  },
  {
    slug: 'agencies', icon: 'globe', name: 'Agencies and studios',
    title: 'Run client work and your own marketing from one place',
    lede: 'Enquiries, quotes, jobs and invoices for client work, plus a content engine for your own brand that never posts without approval.',
    pains: ['Scope and quotes rewritten for every lead', 'Your own marketing always comes last', 'Contractors with different access needs', 'Invoices chased at month end'],
    day: [['9:00', 'New briefs are in the inbox with a draft reply.'], ['10:30', 'A quote goes out with a payment link.'], ['1:00', 'A contractor sees only the project they are on.'], ['4:00', 'Your own weekly posts are approved in one go.']]
  },
  {
    slug: 'cleaning', icon: 'broom', name: 'Cleaning and property services',
    title: 'Rosters, recurring jobs and proof of work, sorted',
    lede: 'Recurring jobs, crew assignments and before and after photos for every clean, so disputes are rare and invoices go out on time.',
    pains: ['Crews changing at short notice', 'Customers asking for proof of work', 'Work rights to check for every new starter', 'Late payment on recurring jobs'],
    day: [['6:30', 'Crews see their jobs for the day on their phones.'], ['9:45', 'Before and after photos are saved to each job.'], ['12:00', 'A new starter onboards from a link, documents included.'], ['5:00', 'Invoices for today\'s cleans are drafted for approval.']]
  }
];

// Testimonials are rendered only from saas/content/testimonials.json and only when they are real, approved quotes.
// Example scenarios below are always labelled as examples and never attributed to a real person or business.
export const SCENARIOS = [
  { industry: 'trades', title: 'A plumber gets Friday afternoons back', body: 'Missed calls become enquiries with replies drafted; quotes go out from the van; invoices are paid by QR before leaving the job.' },
  { industry: 'cleaning', title: 'A cleaning company ends proof-of-work disputes', body: 'Every clean has before and after photos on the job record, and the invoice goes out with them attached.' },
  { industry: 'clinics', title: 'A physio clinic stops chasing paperwork', body: 'Contractor registrations and documents are tracked with reminders, and the front desk replies to web enquiries from drafts.' }
];

export const FAQ = [
  ['Is there a free trial?', 'Yes. Every plan starts with a 14-day free trial. Choose a plan when you are ready.'],
  ['Are prices in Australian dollars?', 'Yes. All prices are in AUD and exclude GST.'],
  ['Will the AI send things without asking?', 'No. Anything that sends, pays, publishes or deletes waits in your approvals until a person you authorise approves it.'],
  ['Who can see my data?', 'Only people in your business, limited by the permissions you set. Super Pro support can only look at limited summaries if you approve a time-limited request.'],
  ['Where is my data kept?', 'In encrypted cloud storage with continuous backups. You can export everything at any time.'],
  ['Can I cancel?', 'Yes, any time. Your records are kept and can be exported.']
];

export const HELP = [
  { id: 'start', name: 'Getting started', items: [['How do I start a trial?', 'Choose Start free trial, enter your business details and verify your email and mobile. A guided tour sets up the basics.'], ['Can I import from another system?', 'Yes. Import customers, workers and records from a spreadsheet or another system\'s export, with a preview before anything is saved.'], ['Can I use it on my phone?', 'Yes. Super Pro works in any modern browser and can be installed on your home screen like an app.']] },
  { id: 'approvals', name: 'AI and approvals', items: [['What needs approval?', 'Anything that leaves the business or cannot be undone: messages, quotes, invoices, posts, refunds and permission changes.'], ['Can I let a manager approve?', 'Yes. Owners can give approval rights to specific people.'], ['Can the AI be wrong?', 'Yes, which is why it drafts rather than acts. Every draft shows what it was based on.']] },
  { id: 'billing', name: 'Plans and billing', items: [['What do plans cost?', 'Starter A$49, Operations A$99 and Scale A$149 a month, plus GST.'], ['What are add-on packs?', 'Extra usage such as storage and AI requests. Operations saves 25% and Scale saves 50% on packs.'], ['How do I change plans?', 'From Plans and usage in your workspace, at any time.']] },
  { id: 'people', name: 'Staff and compliance', items: [['What can workers see?', 'Only the jobs assigned to them, without prices or the customer list.'], ['How are work rights recorded?', 'Record VEVO results and Fair Work requirements against each worker, with expiry reminders.']] },
  { id: 'security', name: 'Security and privacy', items: [['How is my account protected?', 'Passwords are never stored in readable form, two-step sign-in is available, and every important action is recorded in a tamper-evident log.'], ['Can I get my data out?', 'Yes. Owners can export their business data at any time.'], ['How do I report a problem?', 'Use Help and complaints on any page, or the contact form. Sensitive reports can be made confidentially.']] }
];

export const RECEPTIONIST_CALL = [
  ['ai', 'Good morning, you\'ve reached Harbour Plumbing. This is the virtual receptionist. How can I help?'],
  ['caller', 'Hi, the hot water system in our unit has stopped working.'],
  ['ai', 'I\'m sorry to hear that. Is any water leaking from the unit right now?'],
  ['caller', 'No, it\'s just cold.'],
  ['ai', 'Thanks. Can I take your name and the suburb?'],
  ['caller', 'Priya, in Fremantle.'],
  ['ai', 'Thanks, Priya. I can offer tomorrow at 8am or 1pm. Which suits you?'],
  ['caller', '8am please.'],
  ['ai', 'I\'ve requested 8am tomorrow. The team will confirm by text shortly. Is there anything else?'],
  ['note', 'Enquiry created, booking request waiting for the owner\'s approval, summary sent to the owner by text.']
];
