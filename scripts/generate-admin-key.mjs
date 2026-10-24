import crypto from 'node:crypto';

const key=crypto.randomBytes(48).toString('hex');
console.log('\nSuper Pro AI Office Manager secure admin key generated.\n');
console.log(key);
console.log('\nCopy this value into the root .env file as ADMIN_API_KEY=<value>.');
console.log('Keep it private. Do not paste it into screenshots, tickets, chat messages or browser code.\n');
