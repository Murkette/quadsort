const createApp = require('../server');
const open = require('../db');

// An app on a random port with a tiny client that keeps one cookie jar per "person".
async function serve(t, db = open(':memory:'), opts = {}) {
  const srv = createApp(db, opts).listen(0);
  t.after(() => srv.close());
  const url = `http://127.0.0.1:${srv.address().port}`;
  const person = () => {
    let cookie = '';
    const send = async (method, path, { json, form } = {}) => {
      const headers = cookie ? { cookie } : {};
      let body;
      if (json !== undefined) { headers['content-type'] = 'application/json'; body = JSON.stringify(json); }
      if (form) body = new URLSearchParams(form);
      const res = await fetch(url + path, { method, headers, body, redirect: 'manual' });
      const set = res.headers.get('set-cookie');
      if (set) cookie = set.split(';')[0].endsWith('=') ? '' : set.split(';')[0];
      return res;
    };
    return {
      get: (p) => send('GET', p), post: (p, json) => send('POST', p, { json }), put: (p, json) => send('PUT', p, { json }),
      del: (p) => send('DELETE', p), form: (p, form) => send('POST', p, { form }),
      signup: (o = {}) => send('POST', '/signup', { form: { display_name: 'Priya Makes Puzzles', username: 'priya', email: 'p@x.com', password: 'hunter2hunter2', ...o } }),
      get cookie() { return cookie; },
    };
  };
  return { url, db, person };
}

const good = () => ({
  title: 'Group Chat Chaos', description: 'Allegedly.', tags: ['food'],
  groups: [
    { level: 1, name: 'Cheeses', words: ['Brie', 'Feta', 'Edam', 'Halloumi'] },
    { level: 2, name: '___board', words: ['Surf', 'Key', 'Cup', 'Skate'] },
    { level: 3, name: 'Things that squeak', words: ['Mouse', 'Trainers', 'Door', 'Swing'] },
    { level: 4, name: 'Hiding an animal', words: ['Catastrophe', 'Pigment', 'Battery', 'Rational'] },
  ],
});

module.exports = { serve, good };
