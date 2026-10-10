#!/usr/bin/env node
// Grant or remove admin rights:  node scripts/make-admin.js <username> [--remove]
// Uses DB_PATH like the server does. There is deliberately no way to do this from the website.
const open = require('../db');

const [name, flag] = process.argv.slice(2);
if (!name || name.startsWith('-')) {
  console.error('usage: node scripts/make-admin.js <username> [--remove]');
  process.exit(2);
}
const res = open().prepare('UPDATE users SET is_admin = ? WHERE username = ?').run(flag === '--remove' ? 0 : 1, name.toLowerCase());
if (!res.changes) { console.error(`no user called ${name}`); process.exit(1); }
console.log(`${name} is ${flag === '--remove' ? 'no longer' : 'now'} an admin`);
