// reset-password.js — reset a user's password directly against the SQLite DB.
// Safe to run while the server is up: login verifies the hash from the DB on
// each attempt, so no restart is needed. The new password is read from stdin
// with echo OFF, so it never appears in your shell history or on screen.
//
// Usage (run from the app root, e.g. ~/app):
//   node reset-password.js                      # lists admin/sub-admin emails
//   node reset-password.js admin@example.com    # prompts for a new password
//
// Honors TB_DATA the same way the server does (defaults to ./server/data).

const auth = require('./server/auth');

function readPassword(prompt) {
  return new Promise((resolve) => {
    const stdin = process.stdin;
    if (!stdin.isTTY) {                       // piped input: read one line plainly
      let buf = '';
      stdin.setEncoding('utf8');
      stdin.on('data', (d) => { buf += d; });
      stdin.on('end', () => resolve(buf.replace(/[\r\n]+$/, '')));
      return;
    }
    process.stdout.write(prompt);
    stdin.resume();
    stdin.setRawMode(true);
    let pw = '';
    const onData = (chunk) => {
      const ch = chunk.toString('utf8');
      if (ch === '\n' || ch === '\r' || ch === '') {   // Enter / Ctrl-D
        stdin.setRawMode(false); stdin.pause(); stdin.removeListener('data', onData);
        process.stdout.write('\n'); resolve(pw);
      } else if (ch === '') {                          // Ctrl-C
        process.stdout.write('\n'); process.exit(1);
      } else if (ch === '' || ch === '\b') {           // Backspace / Delete
        pw = pw.slice(0, -1);
      } else {
        pw += ch;
      }
    };
    stdin.on('data', onData);
  });
}

(async () => {
  const email = (process.argv[2] || '').toLowerCase().trim();

  if (!email) {
    const staff = auth.allUsers().filter((u) => u.role === 'admin' || u.role === 'subadmin');
    console.log('\nStaff accounts (pass one of these emails as an argument):\n');
    for (const u of staff) console.log('  ' + u.role.padEnd(8) + '  ' + u.email + '   (' + u.name + ')');
    console.log('\n  node reset-password.js <email>\n');
    process.exit(0);
  }

  const user = auth.findByEmail(email);
  if (!user) { console.error('No account found for "' + email + '".'); process.exit(1); }

  const pw = await readPassword('New password for ' + user.email + ' (' + user.role + '): ');
  if (!pw || pw.length < 4) { console.error('Password must be at least 4 characters. Nothing changed.'); process.exit(1); }

  const confirm = await readPassword('Confirm new password: ');
  if (pw !== confirm) { console.error('Passwords did not match. Nothing changed.'); process.exit(1); }

  auth.setPassword(user.id, pw);
  console.log('\n✓ Password updated for ' + user.email + '. You can log in now (no restart needed).');
  process.exit(0);
})();
